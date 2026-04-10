const vscode = require("vscode");
const MinimaxAPI = require("./api");

// TreeView data provider for sidebar
class MinimaxStatusTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.usageData = null;
    this.usageStats = null;
    this.language = "zh-CN";
  }

  setData(usageData, usageStats, language) {
    this.usageData = usageData;
    this.usageStats = usageStats;
    this.language = language;
    this.refresh();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    const config = vscode.workspace.getConfiguration("minimaxStatus");
    this.language = config.get("language") || "zh-CN";

    // If element is provided, return its children (for nested items)
    if (element && element.children) {
      return element.children;
    }

    const items = [];

    // Token 消耗统计（可折叠组）
    if (this.usageStats && (this.usageStats.lastDayUsage > 0 || this.usageStats.weeklyUsage > 0 || this.usageStats.planTotalUsage > 0)) {
      const statsHeader = new vscode.TreeItem(
        this.language === "zh-CN" ? "Token 消耗统计" : "Token Usage Stats",
        vscode.TreeItemCollapsibleState.Expanded
      );
      statsHeader.iconPath = new vscode.ThemeIcon("graph");
      statsHeader.children = [];

      // 昨日消耗
      const yesterday = new vscode.TreeItem(
        `${this.language === "zh-CN" ? "昨日消耗" : "Yesterday"}: ${this.formatNum(this.usageStats.lastDayUsage)}`,
        vscode.TreeItemCollapsibleState.None
      );
      yesterday.iconPath = new vscode.ThemeIcon("calendar");
      statsHeader.children.push(yesterday);

      // 近7天消耗
      const weekly = new vscode.TreeItem(
        `${this.language === "zh-CN" ? "近7天消耗" : "Last 7 days"}: ${this.formatNum(this.usageStats.weeklyUsage)}`,
        vscode.TreeItemCollapsibleState.None
      );
      weekly.iconPath = new vscode.ThemeIcon("calendar");
      statsHeader.children.push(weekly);

      // 当月消耗
      const monthly = new vscode.TreeItem(
        `${this.language === "zh-CN" ? "当月消耗" : "This month"}: ${this.formatNum(this.usageStats.planTotalUsage)}`,
        vscode.TreeItemCollapsibleState.None
      );
      monthly.iconPath = new vscode.ThemeIcon("calendar");
      statsHeader.children.push(monthly);

      items.push(statsHeader);
    }

    // 插件设置
    const settingsItem = new vscode.TreeItem(
      this.language === "zh-CN" ? "插件设置" : "Settings",
      vscode.TreeItemCollapsibleState.None
    );
    settingsItem.command = {
      command: "minimaxStatus.setup",
      title: this.language === "zh-CN" ? "打开设置" : "Open Settings"
    };
    settingsItem.iconPath = new vscode.ThemeIcon("settings");
    items.push(settingsItem);

    // 使用教程
    const helpItem = new vscode.TreeItem(
      this.language === "zh-CN" ? "使用教程" : "Help",
      vscode.TreeItemCollapsibleState.None
    );
    helpItem.command = {
      command: "minimaxStatus.showHelp",
      title: this.language === "zh-CN" ? "查看使用教程" : "View Help"
    };
    helpItem.iconPath = new vscode.ThemeIcon("question");
    items.push(helpItem);

    return items;
  }

  formatNum(num) {
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    }
    return num.toLocaleString("zh-CN");
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }
}

// Activate function - entry point for the extension
function activate(context) {
  try {
    const api = new MinimaxAPI(context);

    // Create TreeView for sidebar
    const treeProvider = new MinimaxStatusTreeProvider();
    const treeView = vscode.window.createTreeView("minimaxStatusView", {
      treeDataProvider: treeProvider
    });

    // Update tree view when configuration changes
    const configChangeDisposableForTree = vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration("minimaxStatus")) {
          treeProvider.refresh();
        }
      }
    );

    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.command = "minimaxStatus.refresh";
    statusBarItem.show();

    let intervalId;
    let billingCache = null;
    let billingCacheTime = 0;
    const BILLING_CACHE_DURATION = 30000; // 30 seconds cache for billing data

    const updateStatus = async () => {
      let language = "zh-CN";
      try {
        // Refresh API config to get latest settings
        api.refreshConfig();
        const config = vscode.workspace.getConfiguration("minimaxStatus");
        const overseasDisplay = config.get("overseasDisplay") || "none";
        language = config.get("language") || "zh-CN";

        // Get domestic data
        const [apiData, subscriptionData] = await Promise.all([
          api.getUsageStatus(),
          api.getSubscriptionDetails().catch(() => null)
        ]);
        const usageData = api.parseUsageData(apiData, subscriptionData);

        // Get overseas data if needed
        let overseasUsageData = null;
        let overseasApiData = null;
        if (overseasDisplay === 'overseas' || overseasDisplay === 'both') {
          try {
            overseasApiData = await api.getOverseasUsageStatus();
            overseasUsageData = api.parseUsageData(overseasApiData, null);
          } catch (overseasError) {
            console.error("Failed to fetch overseas data:", overseasError.message);
          }
        }

        // Fetch billing data for usage statistics (with caching)
        const nowDate = new Date();
        const now = nowDate.getTime();
        // 按自然月统计当月消耗
        const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1, 0, 0, 0, 0).getTime();
        if (!billingCache || now - billingCacheTime > BILLING_CACHE_DURATION) {
          try {
            const billingRecords = await api.getAllBillingRecords(100, monthStart);
            billingCache = billingRecords;
            billingCacheTime = now;
          } catch (billingError) {
            console.error("Failed to fetch billing data:", billingError.message);
            billingCache = [];
          }
        }

        // Calculate usage statistics
        let usageStats = {
          lastDayUsage: 0,
          weeklyUsage: 0,
          planTotalUsage: 0,
        };

        if (billingCache && billingCache.length > 0) {
          usageStats = api.calculateUsageStats(billingCache, monthStart, now);
        }

        updateStatusBar(statusBarItem, api, usageData, apiData, usageStats, overseasUsageData, overseasApiData, overseasDisplay, language);
        treeProvider.setData(usageData, usageStats, language);
      } catch (error) {
        console.error("获取状态失败:", error.message);
        const errorText = language === 'en-US' ? 'Error' : '错误';
        const clickConfig = language === 'en-US' ? 'Click to configure' : '点击配置';
        statusBarItem.text = "$(warning) MiniMax";
        statusBarItem.tooltip = `${errorText}: ${error.message}\n${clickConfig}`;
        statusBarItem.color = new vscode.ThemeColor("errorForeground");
      }
    };

    const config = vscode.workspace.getConfiguration("minimaxStatus");
    const interval = config.get("refreshInterval", 30) * 1000;

    // Initial update
    updateStatus();

    // Set up interval
    intervalId = setInterval(updateStatus, interval);

    // Subscribe to configuration changes
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration("minimaxStatus")) {
          api.refreshConfig();
          const newInterval = config.get("refreshInterval", 30) * 1000;
          clearInterval(intervalId);
          intervalId = setInterval(updateStatus, newInterval);
          updateStatus();
        }
      }
    );

    // Subscribe to refresh command
    const refreshDisposable = vscode.commands.registerCommand(
      "minimaxStatus.refresh",
      updateStatus
    );

    // Subscribe to setup command
    const setupDisposable = vscode.commands.registerCommand(
      "minimaxStatus.setup",
      async () => {
        const panel = await showSettingsWebView(context, api, updateStatus);
        context.subscriptions.push(panel);
      }
    );

    // Subscribe to help command
    const helpDisposable = vscode.commands.registerCommand(
      "minimaxStatus.showHelp",
      async () => {
        const panel = await showHelpWebView(context);
        context.subscriptions.push(panel);
      }
    );

    // Add to subscriptions
    context.subscriptions.push(
      statusBarItem,
      configChangeDisposable,
      configChangeDisposableForTree,
      refreshDisposable,
      setupDisposable,
      helpDisposable,
      treeView
    );

    // Always show status bar item
    if (!api.token) {
      statusBarItem.text = "MiniMax: 需要配置";
      statusBarItem.color = new vscode.ThemeColor("warningForeground");
      statusBarItem.tooltip =
        "MiniMax Status 需要配置 Token\n点击立即配置";
      statusBarItem.command = "minimaxStatus.setup";

      setTimeout(() => {
        vscode.window
          .showInformationMessage(
            "欢迎使用 MiniMax Status！\n\n需要配置您的访问令牌才能开始使用。",
            "立即配置",
            "稍后设置"
          )
          .then((selection) => {
            if (selection === "立即配置") {
              vscode.commands.executeCommand("minimaxStatus.setup");
            }
          });
      }, 2000);
    } else {
      // If configured but no data yet, show waiting message
      const loadingLang = config.get("language") || "zh-CN";
      const loadingText = loadingLang === 'en-US' ? 'Loading...' : '加载中...';
      const loadingTooltip = loadingLang === 'en-US' ? 'MiniMax Status\nFetching status...' : 'MiniMax Status\n正在获取状态...';
      statusBarItem.text = `⏳ MiniMax: ${loadingText}`;
      statusBarItem.color = new vscode.ThemeColor("statusBar.foreground");
      statusBarItem.tooltip = loadingTooltip;
      statusBarItem.command = "minimaxStatus.refresh";
    }
  } catch (error) {
    console.error("MiniMax Status 扩展激活失败:", error.message);
    vscode.window.showErrorMessage(
      "MiniMax Status 扩展激活失败: " + error.message
    );
  }
}

// Create help webview
async function showHelpWebView(context) {
  const config = vscode.workspace.getConfiguration("minimaxStatus");
  const language = config.get("language") || "zh-CN";

  const panel = vscode.window.createWebviewPanel(
    "minimaxHelp",
    language === "zh-CN" ? "使用教程" : "Help",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const i18n = {
    "zh-CN": {
      title: "MiniMax Status 使用教程",
      step1Title: "第一步：获取 API Key",
      step1Content: "国内版：套餐管理 -> Token-Plan\n海外版：Subscribe -> Token-Plan\n\n点击「创建新的 API Key」",
      step2Title: "第二步：配置插件",
      step2Content: "1. 点击左侧边栏的 MiniMax 图标\n2. 点击「插件设置」按钮\n3. 填写 API Key\n4. 点击保存",
      step4Title: "使用说明",
      step4Content: "• 状态栏显示当前使用进度\n• 点击状态栏可刷新数据\n• 支持国内/海外账号切换",
    },
    "en-US": {
      title: "MiniMax Status Help",
      step1Title: "Step 1: Get API Key",
      step1Content: "Domestic: Subscription -> Token-Plan\nOverseas: Subscribe -> Token-Plan\n\nClick 'Create new API Key'",
      step2Title: "Step 2: Configure Plugin",
      step2Content: "1. Click MiniMax icon in sidebar\n2. Click Settings\n3. Enter API Key\n4. Click Save",
      step4Title: "Usage",
      step4Content: "• Status bar shows usage progress\n• Click status bar to refresh\n• Support domestic/overseas accounts",
    }
  };

  const t = i18n[language] || i18n["zh-CN"];

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${t.title}</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 20px;
                padding: 0;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
            }
            h1 {
                color: var(--vscode-editor-foreground);
                border-bottom: 2px solid var(--vscode-panel-border);
                padding-bottom: 10px;
                margin-bottom: 24px;
            }
            .step {
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            }
            .step h2 {
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 12px 0;
                color: var(--vscode-editor-foreground);
            }
            .step p {
                margin: 0;
                color: var(--vscode-foreground);
                line-height: 1.6;
                white-space: pre-line;
            }
            code {
                background: var(--vscode-editor-wordHighlightBackground);
                padding: 2px 6px;
                border-radius: 4px;
                font-family: monospace;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>${t.title}</h1>

            <div class="step">
                <h2>${t.step1Title}</h2>
                <p>${t.step1Content}</p>
            </div>

            <div class="step">
                <h2>${t.step2Title}</h2>
                <p>${t.step2Content}</p>
            </div>

            <div class="step">
                <h2>${t.step3Title || t.step4Title}</h2>
                <p>${t.step3Content || t.step4Content}</p>
            </div>
        </div>
    </body>
    </html>
  `;

  return panel;
}

// Create settings webview
async function showSettingsWebView(context, api, updateStatus) {
  const panel = vscode.window.createWebviewPanel(
    "minimaxSettings",
    "MiniMax Status 设置",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Get current configuration
  const config = vscode.workspace.getConfiguration("minimaxStatus");
  const currentToken = config.get("token") || "";
  const currentInterval = config.get("refreshInterval") || 30;
  const currentShowTooltip = config.get("showTooltip") ?? true;
  const currentModelName = config.get("modelName") || "";
  const currentOverseasDisplay = config.get("overseasDisplay") || "none";
  const currentOverseasToken = config.get("overseasToken") || "";
  const currentLanguage = config.get("language") || "zh-CN";

  // Language translations
  const i18n = {
    "zh-CN": {
      title: "MiniMax 设置",
      domesticTitle: "国内账号",
      overseasTitle: "海外账号",
      apiKey: "API Key",
      apiKeyPlaceholder: "请输入国内 API Key",
      apiKeyInfo: "platform.minimaxi.com 的 API Key",
      overseasApiKeyPlaceholder: "请输入海外 API Key",
      overseasApiKeyInfo: "platform.minimax.io 的 API Key（用于显示海外用量）",
      overseasGroupId: "GroupID",
      overseasGroupIdPlaceholder: "请输入 groupID",
      overseasGroupIdInfo: "海外账号的 GroupID",
      displayTitle: "显示设置",
      refreshInterval: "刷新间隔（秒）",
      refreshIntervalInfo: "自动刷新间隔，建议 10-30 秒",
      modelSelect: "模型选择",
      showTooltip: "显示详细提示信息",
      overseasTitle2: "海外用量",
      displayMode: "显示模式",
      displayModeInfo: "选择是否显示海外版用量",
      modeNone: "仅显示国内",
      modeOverseas: "仅显示海外",
      modeBoth: "国内+海外并行",
      save: "保存",
      cancel: "取消",
      apiKeyError: "请输入 API Key",
      overseasApiKeyError: "请输入海外 API Key",
      invalidInterval: "刷新间隔必须在 5-300 秒之间",
      modelAuto: "自动选择第一个模型",
      modelEmpty: "请先配置 API Key",
    },
    "en-US": {
      title: "MiniMax Settings",
      domesticTitle: "Domestic Account",
      overseasTitle: "Overseas Account",
      apiKey: "API Key",
      apiKeyPlaceholder: "Enter domestic API Key",
      apiKeyInfo: "platform.minimaxi.com API Key",
      overseasApiKeyPlaceholder: "Enter overseas API Key",
      overseasApiKeyInfo: "platform.minimax.io API Key (for overseas usage)",
      displayTitle: "Display Settings",
      refreshInterval: "Refresh Interval (seconds)",
      refreshIntervalInfo: "Auto-refresh interval, 10-30 seconds recommended",
      modelSelect: "Model",
      showTooltip: "Show detailed tooltip",
      overseasTitle2: "Overseas Usage",
      displayMode: "Display Mode",
      displayModeInfo: "Choose whether to display overseas usage",
      modeNone: "Domestic only",
      modeOverseas: "Overseas only",
      modeBoth: "Domestic + Overseas",
      save: "Save",
      cancel: "Cancel",
      apiKeyError: "API Key is required",
      overseasApiKeyError: "Overseas API Key is required",
      overseasGroupIdError: "Overseas GroupID is required",
      invalidInterval: "Refresh interval must be between 5-300 seconds",
      modelAuto: "Auto select first model",
      modelEmpty: "Please configure API Key first",
    }
  };

  const t = i18n[currentLanguage] || i18n["zh-CN"];

  // Fetch available models if token is configured
  let availableModels = [];
  if (currentToken) {
    try {
      const statusData = await api.getUsageStatus();
      const parsedData = api.parseUsageData(statusData, null);
      availableModels = parsedData.allModels || [];
    } catch (error) {
      // Silently fail, model selector will show default option
    }
  }

  // Create model options
  const t_for_model = i18n[currentLanguage] || i18n["zh-CN"];
  const modelOptions = availableModels.length > 0
    ? `<option value="">${t_for_model.modelAuto}</option>` +
      availableModels.map(m => `<option value="${m}" ${m === currentModelName ? 'selected' : ''}>${m}</option>`).join('')
    : `<option value="">${t_for_model.modelEmpty}</option>`;

  // Create HTML content
  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MiniMax Status 设置</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 20px;
                padding: 0;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
            }
            h1 {
                color: var(--vscode-editor-foreground);
                border-bottom: 2px solid var(--vscode-panel-border);
                padding-bottom: 10px;
                margin-bottom: 24px;
            }
            .card {
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 24px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.15);
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            }
            .card h2 {
                font-size: 14px;
                font-weight: 600;
                margin: 0 0 16px 0;
                color: var(--vscode-editorForeground);
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 8px;
            }
            .form-group {
                margin-bottom: 16px;
            }
            .form-group:last-child {
                margin-bottom: 0;
            }
            label {
                display: block;
                margin-bottom: 6px;
                font-weight: 600;
                color: var(--vscode-editor-foreground);
                font-size: 13px;
            }
            input[type="text"],
            input[type="number"],
            select {
                padding: 12px 16px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 6px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-size: 14px;
                width: 100%;
                box-sizing: border-box;
            }
            input[type="number"] {
                width: 120px;
            }
            .checkbox-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .checkbox-group label {
                margin-bottom: 0;
                font-weight: 400;
            }
            .error {
                color: var(--vscode-errorForeground);
                font-size: 12px;
                margin-top: 4px;
            }
            .info-text {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin-top: 4px;
            }
            .button-group {
                display: flex;
                gap: 12px;
                margin-top: 8px;
            }
            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            button.secondary {
                background-color: transparent;
                border: 1px solid var(--vscode-button-secondaryBackground);
            }
            button.secondary:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            select {
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23c5c5c5' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 12px center;
                padding-right: 36px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>${t.title}</h1>

            <!-- 国内账号卡片 -->
            <div class="card">
                <h2>${t.domesticTitle}</h2>
                <div class="form-group">
                    <label for="token">${t.apiKey}</label>
                    <input type="text" id="token" placeholder="${t.apiKeyPlaceholder}" value="${currentToken}">
                    <div class="info-text">${t.apiKeyInfo}</div>
                    <div class="error" id="token-error"></div>
                </div>
            </div>

            <!-- 海外账号卡片 -->
            <div class="card">
                <h2>${t.overseasTitle}</h2>
                <div class="form-group">
                    <label for="overseasToken">${t.apiKey}</label>
                    <input type="text" id="overseasToken" placeholder="${t.overseasApiKeyPlaceholder}" value="${currentOverseasToken}">
                    <div class="info-text">${t.overseasApiKeyInfo}</div>
                    <div class="error" id="overseasToken-error"></div>
                </div>
            </div>

            <!-- 显示设置卡片 -->
            <div class="card">
                <h2>${t.displayTitle}</h2>
                <div class="form-group">
                    <label for="interval">${t.refreshInterval}</label>
                    <input type="number" id="interval" min="5" max="300" value="${currentInterval}">
                    <div class="info-text">${t.refreshIntervalInfo}</div>
                </div>
                <div class="form-group">
                    <label for="modelName">${t.modelSelect}</label>
                    <select id="modelName">
                        ${modelOptions}
                    </select>
                </div>
                <div class="form-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="showTooltip" ${
                          currentShowTooltip ? "checked" : ""
                        }>
                        <label for="showTooltip">${t.showTooltip}</label>
                    </div>
                </div>
                <div class="form-group">
                    <label for="language">Language / 语言</label>
                    <select id="language">
                        <option value="zh-CN" ${currentLanguage === 'zh-CN' ? 'selected' : ''}>中文</option>
                        <option value="en-US" ${currentLanguage === 'en-US' ? 'selected' : ''}>English</option>
                    </select>
                </div>
            </div>

            <!-- 海外用量卡片 -->
            <div class="card">
                <h2>${t.overseasTitle2}</h2>
                <div class="form-group">
                    <label for="overseasDisplay">${t.displayMode}</label>
                    <select id="overseasDisplay">
                        <option value="none" ${currentOverseasDisplay === 'none' ? 'selected' : ''}>${t.modeNone}</option>
                        <option value="overseas" ${currentOverseasDisplay === 'overseas' ? 'selected' : ''}>${t.modeOverseas}</option>
                        <option value="both" ${currentOverseasDisplay === 'both' ? 'selected' : ''}>${t.modeBoth}</option>
                    </select>
                    <div class="info-text">${t.displayModeInfo}</div>
                </div>
            </div>

            <div class="button-group">
                <button id="saveBtn">${t.save}</button>
                <button id="cancelBtn" class="secondary">${t.cancel}</button>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();

            document.getElementById('saveBtn').addEventListener('click', () => {
                const token = document.getElementById('token').value.trim();
                const overseasToken = document.getElementById('overseasToken').value.trim();
                const interval = parseInt(document.getElementById('interval').value, 10);
                const showTooltip = document.getElementById('showTooltip').checked;
                const modelName = document.getElementById('modelName').value;
                const overseasDisplay = document.getElementById('overseasDisplay').value;
                const language = document.getElementById('language').value;

                // Clear previous errors
                document.getElementById('token-error').textContent = '';
                document.getElementById('overseasToken-error').textContent = '';

                // Validate inputs
                let hasError = false;

                if (!token) {
                    document.getElementById('token-error').textContent = t.apiKeyError;
                    hasError = true;
                }

                // Validate overseas credentials based on display mode
                if (overseasDisplay === 'overseas' || overseasDisplay === 'both') {
                    if (!overseasToken) {
                        document.getElementById('overseasToken-error').textContent = t.overseasApiKeyError;
                        hasError = true;
                    }
                }

                if (interval < 5 || interval > 300) {
                    alert(t.invalidInterval);
                    hasError = true;
                }

                if (hasError) {
                    return;
                }

                // Save settings
                vscode.postMessage({
                    command: 'saveSettings',
                    token: token,
                    overseasToken: overseasToken,
                    interval: interval,
                    showTooltip: showTooltip,
                    modelName: modelName,
                    overseasDisplay: overseasDisplay,
                    language: language
                });
            });

            document.getElementById('cancelBtn').addEventListener('click', () => {
                vscode.postMessage({
                    command: 'cancelSettings'
                });
            });

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'closePanel') {
                    panel.dispose();
                }
            });
        </script>
    </body>
    </html>
    `;

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.command) {
        case "saveSettings":
          // Update VSCode settings
          const config = vscode.workspace.getConfiguration("minimaxStatus");

          config.update(
            "token",
            message.token,
            vscode.ConfigurationTarget.Global
          );
          config.update(
            "refreshInterval",
            message.interval,
            vscode.ConfigurationTarget.Global
          );
          config.update(
            "showTooltip",
            message.showTooltip,
            vscode.ConfigurationTarget.Global
          );
          if (message.modelName !== undefined) {
            config.update(
              "modelName",
              message.modelName,
              vscode.ConfigurationTarget.Global
            );
          }
          if (message.overseasDisplay !== undefined) {
            config.update(
              "overseasDisplay",
              message.overseasDisplay,
              vscode.ConfigurationTarget.Global
            );
          }
          if (message.overseasToken !== undefined) {
            config.update(
              "overseasToken",
              message.overseasToken,
              vscode.ConfigurationTarget.Global
            );
          }
          if (message.language !== undefined) {
            config.update(
              "language",
              message.language,
              vscode.ConfigurationTarget.Global
            );
          }

          panel.dispose();

          // Refresh status
          updateStatus();

          const successMsg = currentLanguage === 'en-US' ? 'Settings saved!' : '配置保存成功！';
          vscode.window.showInformationMessage(successMsg);
          break;

        case "cancelSettings":
          panel.dispose();
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  return panel;
}

// Helper function to generate progress bar (VSCode tooltip compatible)
function formatProgressBar(percentage, width = 20) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ']';
}

// Helper function to get progress color based on percentage
function getProgressColor(percentage) {
  if (percentage < 60) {
    return new vscode.ThemeColor("charts.green");
  } else if (percentage < 85) {
    return new vscode.ThemeColor("charts.yellow");
  } else {
    return new vscode.ThemeColor("errorForeground");
  }
}

// Helper to get model category color (for tooltip display)
function getModelBarColor(model) {
  if (model.isTextModel) {
    return '#4A90E2'; // Blue for text model
  } else if (model.name.includes('music')) {
    return '#FFA726'; // Orange for music model
  } else if (model.name.includes('speech')) {
    return '#9E9E9E'; // Gray for speech model
  }
  return '#4A90E2'; // Default blue
}

function updateStatusBar(statusBarItem, api, data, apiData, usageStats, overseasData = null, overseasApiData = null, displayMode = 'none', language = 'zh-CN') {
  // Status bar i18n
  const statusI18n = {
    "zh-CN": {
      domestic: "国内",
      overseas: "海外",
      model: "模型",
      usageProgress: "使用进度",
      remainingTime: "剩余时间",
      timeWindow: "时间窗口",
      weeklyUsage: "周用量",
      weeklyReset: "周重置",
      billingStats: "=== Token 消耗统计 ===",
      yesterday: "昨日消耗",
      last7Days: "近7天消耗",
      totalUsage: "当月消耗",
      expiry: "套餐到期",
      clickToRefresh: "点击刷新状态",
      apiQuota: "API 配额",
      reset: "重置",
      used: "已用",
      unlimited: "不受限制",
      refresh: "刷新",
    },
    "en-US": {
      domestic: "Domestic",
      overseas: "Overseas",
      model: "Model",
      usageProgress: "Usage",
      remainingTime: "Remaining",
      timeWindow: "Time Window",
      weeklyUsage: "Weekly",
      weeklyReset: "Weekly Reset",
      billingStats: "=== Token Usage Stats ===",
      yesterday: "Yesterday",
      last7Days: "Last 7 days",
      totalUsage: "This month",
      expiry: "Expiry",
      clickToRefresh: "Click to refresh",
      apiQuota: "API QUOTA",
      reset: "Reset",
      used: "Used",
      unlimited: "Unlimited",
      refresh: "Refresh",
    }
  };

  const t = statusI18n[language] || statusI18n["zh-CN"];

  // Helper to translate remaining time text
  const translateRemainingText = (text) => {
    if (language === 'en-US') {
      return text
        .replace(/小时/, 'h')
        .replace(/分钟/, 'min')
        .replace(/后重置/, ' until reset');
    }
    return text;
  };

  // Helper to translate expiry text
  const translateExpiryText = (text) => {
    if (language === 'en-US') {
      return text
        .replace(/还剩 (\d+) 天/, '$1 days remaining')
        .replace(/今天到期/, 'expires today')
        .replace(/已过期 (\d+) 天/, 'expired $1 days ago');
    }
    return text;
  };

  // Helper to format number with units
  const formatNumberI18n = (num) => {
    // Chinese format uses 万/亿 for readability
    if (language === 'zh-CN') {
      if (num >= 100000000) {
        return (num / 100000000).toFixed(2).replace(/\.0$/, "") + "亿";
      }
      if (num >= 10000) {
        return (num / 10000).toFixed(2).replace(/\.0$/, "") + "万";
      }
      return num.toLocaleString("zh-CN");
    }
    // English format uses K/M/B with higher precision
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2).replace(/\.0$/, "") + "B";
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2).replace(/\.0$/, "") + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(2).replace(/\.0$/, "") + "K";
    }
    return num.toLocaleString("en-US");
  };

  // 关键修复：设置状态栏命令为刷新
  statusBarItem.command = "minimaxStatus.refresh";

  // Determine which data to display based on mode
  let displayData;
  if (displayMode === 'overseas' && overseasData) {
    displayData = overseasData;
  } else if (displayMode === 'both' && overseasData) {
    displayData = data;
  } else {
    displayData = data;
  }

  const { usage, modelName, remaining, expiry, planTimeWindow } = displayData;

  // Set status bar text with color
  const percentage = usage.percentage;
  if (percentage < 60) {
    statusBarItem.color = new vscode.ThemeColor("charts.green");
  } else if (percentage < 85) {
    statusBarItem.color = new vscode.ThemeColor(
      "charts.yellow"
    );
  } else {
    statusBarItem.color = new vscode.ThemeColor("errorForeground");
  }

  // Build status bar text based on display mode
  if (displayMode === 'both' && overseasData) {
    const domesticPercent = data.usage.percentage;
    const overseasPercent = overseasData.usage.percentage;
    statusBarItem.text = `$(clock) ${t.domestic}${domesticPercent}% / ${t.overseas}${overseasPercent}%`;
  } else {
    // 显示格式：剩余时间 百分比 · 周 百分比
    const remainingText = remaining.hours > 0 ? `${remaining.hours}h` : `${remaining.minutes}m`;
    const weeklyLabel = language === 'en-US' ? 'W' : '周';
    let weeklyText = '';
    if (data.weekly) {
      if (data.weekly.unlimited) {
        weeklyText = ` · ${weeklyLabel} ♾️`;
      } else {
        weeklyText = ` · ${weeklyLabel} ${data.weekly.percentage}%`;
      }
    }
    statusBarItem.text = `$(clock) ${remainingText} ${percentage}%${weeklyText}`;
  }

  // ── Build tooltip with table layout (panel-style) ──────────────────
  const allModelsData = api.parseAllModelsForTooltip(apiData);
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;

  const isEn = language === 'en-US';

  // Helper: format number with 万/亿 or K/M shorthand
  const formatNum = (num) => {
    if (isEn) {
      if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
      if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
      return num.toLocaleString("en-US");
    }
    if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    return num.toLocaleString("zh-CN");
  };

  // Helper: colored percentage span
  const pctSpan = (pct) => {
    const color = pct < 60 ? '#4ec9b0' : pct < 85 ? '#dcdcaa' : '#f44747';
    return `<span style="color:${color}"><strong>${pct}%</strong></span>`;
  };

  // ── Period header (use weekly period from API, not the 5h interval) ──
  let periodText = '';
  const fmt = (ts) => {
    if (!ts) return '';
    // API 返回的时间戳可能是秒级或毫秒级，统一处理
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  if (apiData.model_remains && apiData.model_remains.length > 0) {
    const firstModel = apiData.model_remains[0];
    periodText = `${fmt(firstModel.weekly_start_time)} — ${fmt(firstModel.weekly_end_time)}`;
  } else if (planTimeWindow) {
    periodText = `${fmt(planTimeWindow.start)} — ${fmt(planTimeWindow.end)}`;
  }

  let content = '';
  content += `**MINIMAX** &ensp; ${isEn ? 'Quota Panel' : '配额面板'}`;
  content += ` &emsp; ${isEn ? 'Period' : '周期'}：**${periodText}**\n\n`;
  content += `---\n\n`;

  // ── Model table (HTML for full-width control) ────────────────────
  const models = allModelsData.models || [];
  const colModel = isEn ? 'Model' : '模型';
  const colUsage = isEn ? 'Usage' : '用量';
  const colPct   = isEn ? '%' : '占比';
  const colWeek  = isEn ? 'Weekly' : '每周';
  const colReset = isEn ? 'Reset' : '重置';

  // Use HTML table with width=100% so columns spread across full tooltip width
  const thStyle = 'style="padding:2px 6px;font-weight:normal;opacity:0.7"';
  const tdStyle = 'style="padding:2px 6px"';
  content += `<table width="100%" cellspacing="0" cellpadding="0">\n`;
  content += `<tr>`;
  content += `<th align="left" ${thStyle}>${colModel}</th>`;
  content += `<th align="right" ${thStyle}>${colUsage}</th>`;
  content += `<th align="right" ${thStyle}>${colPct}</th>`;
  content += `<th align="right" ${thStyle}>${colWeek}</th>`;
  content += `<th align="right" ${thStyle}>${colReset}</th>`;
  content += `</tr>\n`;

  for (const m of models) {
    const used = m.usedCount;
    const total = m.totalCount;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;

    // Reset time
    const rh = m.remainingTime.hours;
    const rm = m.remainingTime.minutes;
    const resetText = `${rh}h ${rm}m`;

    // Weekly text
    let weeklyCell;
    if (m.weeklyUnlimited) {
      weeklyCell = '♾️';
    } else {
      weeklyCell = `${formatNum(m.weeklyUsed)}/${formatNum(m.weeklyTotal)}`;
    }

    // Shorten display name for table readability
    let displayName = m.name;
    if (displayName.includes('Hailuo-2.3-Fast-6s-768p')) displayName = 'Hailuo-Fast';
    else if (displayName.includes('Hailuo-2.3-6s-768p')) displayName = 'Hailuo-2.3';

    content += `<tr>`;
    content += `<td align="left" ${tdStyle}><strong>${displayName}</strong></td>`;
    content += `<td align="right" ${tdStyle}>${formatNum(used)}/${formatNum(total)}</td>`;
    content += `<td align="right" ${tdStyle}>${pctSpan(pct)}</td>`;
    content += `<td align="right" ${tdStyle}>${weeklyCell}</td>`;
    content += `<td align="right" ${tdStyle}>${resetText}</td>`;
    content += `</tr>\n`;
  }

  content += `</table>\n\n`;
  content += `---\n\n`;

  // ── Token Usage Stats (compact single-line in footer) ───────────
  if (usageStats && (usageStats.lastDayUsage > 0 || usageStats.weeklyUsage > 0 || usageStats.planTotalUsage > 0)) {
    const lblYesterday = isEn ? 'Yesterday' : '昨日';
    const lbl7d = isEn ? '7d' : '近7天';
    const lblMonth = isEn ? 'Month' : '当月';
    content += `<div align="right">Token：${lblYesterday} ${formatNum(usageStats.lastDayUsage)} · ${lbl7d} ${formatNum(usageStats.weeklyUsage)} · ${lblMonth} ${formatNum(usageStats.planTotalUsage)}</div>\n\n`;
  }

  // ── Footer (right-aligned) ───────────────────────────────────────
  const expiryText = expiry
    ? `${isEn ? 'Expiry' : '到期'}：${isEn ? translateExpiryText(expiry.text) : expiry.text}`
    : '';
  content += `<div align="right">${expiryText} · ${t.clickToRefresh}</div>`;

  md.appendMarkdown(content);
  statusBarItem.tooltip = md;
}

function deactivate() {
  // Extension deactivated
}

module.exports = {
  activate,
  deactivate,
};
