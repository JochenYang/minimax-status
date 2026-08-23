const vscode = require("vscode");
const MinimaxAPI = require("./api");

function getConfiguredLanguage() {
  const config = vscode.workspace.getConfiguration("minimaxStatus");
  const configuredLanguage = config.get("language");
  const inspected = config.inspect?.("language");
  const hasExplicitLanguage = [
    inspected?.globalValue,
    inspected?.workspaceValue,
    inspected?.workspaceFolderValue,
  ].some((value) => value !== undefined);

  if (hasExplicitLanguage && (configuredLanguage === "zh-CN" || configuredLanguage === "en-US")) {
    return configuredLanguage;
  }

  const vscodeLanguage = String(vscode.env?.language || "").toLowerCase();
  return vscodeLanguage.startsWith("zh") ? "zh-CN" : "en-US";
}

const ERROR_MESSAGES = {
  "zh-CN": {
    missingToken: "请在设置中配置国内 Token Plan Key。",
    missingOverseasToken: "请在设置中配置海外 Token Plan Key。",
    auth: "认证失败（错误码 {code}）。请确认使用对应区域的 Token Plan Key，而不是普通 API Key。",
    api: "MiniMax 接口返回错误{code}。",
    timeout: "请求超时，请检查网络连接。",
    network: "网络连接失败，请检查网络和服务区域。",
    noUsageData: "接口未返回可用的用量数据。",
    unknown: "获取 MiniMax 状态失败。",
  },
  "en-US": {
    missingToken: "Configure a domestic Token Plan key in Settings.",
    missingOverseasToken: "Configure an overseas Token Plan key in Settings.",
    auth: "Authentication failed (error {code}). Use the Token Plan key for the matching region, not a regular API key.",
    api: "The MiniMax API returned an error{code}.",
    timeout: "The request timed out. Check your network connection.",
    network: "The network request failed. Check your connection and service region.",
    noUsageData: "The API returned no usage data.",
    unknown: "Failed to fetch MiniMax status.",
  },
};

function getLocalizedErrorMessage(error, language) {
  const messages = ERROR_MESSAGES[language] || ERROR_MESSAGES["zh-CN"];
  const codeText = error?.statusCode ? ` (${error.statusCode})` : "";

  switch (error?.code) {
    case "missing-token":
      return messages.missingToken;
    case "missing-overseas-token":
      return messages.missingOverseasToken;
    case "auth":
      return messages.auth.replace("{code}", error.statusCode || "unknown");
    case "api":
      return messages.api.replace("{code}", codeText);
    case "timeout":
      return messages.timeout;
    case "network":
      return messages.network;
    case "no-usage-data":
      return messages.noUsageData;
    default:
      return messages.unknown;
  }
}

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

// TreeView data provider for sidebar
class MinimaxStatusTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.usageData = null;
    this.usageStats = null;
    this.language = getConfiguredLanguage();
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
    this.language = getConfiguredLanguage();

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
    if (this.language === "en-US") {
      if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1).replace(/\.0$/, "") + "B";
      }
      if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
      }
      if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
      }
      return num.toLocaleString("en-US");
    }
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
    let isUpdating = false;
    let billingCache = null;
    let billingCacheTime = 0;
    const BILLING_CACHE_DURATION = 30000; // 30 seconds cache for billing data

    const updateStatus = async () => {
      if (isUpdating) return;
      isUpdating = true;
      let language = getConfiguredLanguage();
      try {
        // Refresh API config to get latest settings
        api.refreshConfig();
        const config = vscode.workspace.getConfiguration("minimaxStatus");
        const overseasDisplay = config.get("overseasDisplay") || "none";
        language = getConfiguredLanguage();

        // Get domestic data
        const [apiData, subscriptionData] = await Promise.all([
          api.getUsageStatus(),
          api.getSubscriptionDetails().catch(() => null)
        ]);
        const usageData = api.parseUsageData(apiData, subscriptionData);

        // (积分余额接口 cookie-only，vscode 端 Bearer 永远 401 — 已移除 getCreditsBalance)

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
        console.error("MiniMax Status update failed:", error.details || error.message);
        const errorText = language === 'en-US' ? 'Error' : '错误';
        const clickConfig = api.token
          ? (language === 'en-US' ? 'Check API key and region' : '检查 API Key 和区域')
          : (language === 'en-US' ? 'Click to configure' : '点击配置');
        statusBarItem.text = "$(warning) MiniMax";
        statusBarItem.tooltip = `${errorText}: ${getLocalizedErrorMessage(error, language)}\n${clickConfig}`;
        statusBarItem.color = new vscode.ThemeColor("errorForeground");
      } finally {
        isUpdating = false;
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
      treeView,
      new vscode.Disposable(() => clearInterval(intervalId))
    );

    // Always show status bar item
    if (!api.token) {
      const initialLanguage = getConfiguredLanguage();
      const isEnglish = initialLanguage === "en-US";
      const configureAction = isEnglish ? "Configure now" : "立即配置";
      const laterAction = isEnglish ? "Later" : "稍后设置";
      statusBarItem.text = isEnglish ? "MiniMax: Configure" : "MiniMax: 需要配置";
      statusBarItem.color = new vscode.ThemeColor("warningForeground");
      statusBarItem.tooltip = isEnglish
        ? "MiniMax Status requires a Token Plan key\nClick to configure"
        : "MiniMax Status 需要配置 Token\n点击立即配置";
      statusBarItem.command = "minimaxStatus.setup";

      setTimeout(() => {
        vscode.window
          .showInformationMessage(
            isEnglish
              ? "Welcome to MiniMax Status!\n\nConfigure a Token Plan key to get started."
              : "欢迎使用 MiniMax Status！\n\n需要配置您的访问令牌才能开始使用。",
            configureAction,
            laterAction
          )
          .then((selection) => {
            if (selection === configureAction) {
              vscode.commands.executeCommand("minimaxStatus.setup");
            }
          });
      }, 2000);
    } else {
      // If configured but no data yet, show waiting message
      const loadingLang = getConfiguredLanguage();
      const loadingText = loadingLang === 'en-US' ? 'Loading...' : '加载中...';
      const loadingTooltip = loadingLang === 'en-US' ? 'MiniMax Status\nFetching status...' : 'MiniMax Status\n正在获取状态...';
      statusBarItem.text = `⏳ MiniMax: ${loadingText}`;
      statusBarItem.color = new vscode.ThemeColor("statusBar.foreground");
      statusBarItem.tooltip = loadingTooltip;
      statusBarItem.command = "minimaxStatus.refresh";
    }
  } catch (error) {
    const language = getConfiguredLanguage();
    const errorText = language === "en-US" ? "MiniMax Status activation failed" : "MiniMax Status 扩展激活失败";
    console.error(`${errorText}:`, error.details || error.message);
    vscode.window.showErrorMessage(
      `${errorText}: ${getLocalizedErrorMessage(error, language)}`
    );
  }
}

// Create help webview
// eslint-disable-next-line no-unused-vars
async function showHelpWebView(context) {
  const language = getConfiguredLanguage();

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
      step3Title: "第三步：配置海外账号（可选）",
      step3Content: "如果你有海外账号（platform.minimax.io）：\n1. 在设置页的「海外账号」卡片填写海外 API Key\n2. 在「海外用量」中选择显示模式\n\n纯海外用户可将国内 API Key 留空",
      step4Title: "使用说明",
      step4Content: "• 状态栏显示当前使用进度\n• 点击状态栏可刷新数据\n• 支持国内/海外账号切换",
    },
    "en-US": {
      title: "MiniMax Status Help",
      step1Title: "Step 1: Get API Key",
      step1Content: "Domestic: Subscription -> Token-Plan\nOverseas: Subscribe -> Token-Plan\n\nClick 'Create new API Key'",
      step2Title: "Step 2: Configure Plugin",
      step2Content: "1. Click MiniMax icon in sidebar\n2. Click Settings\n3. Enter API Key\n4. Click Save",
      step3Title: "Step 3: Configure Overseas (Optional)",
      step3Content: "If you have an overseas account (platform.minimax.io):\n1. Fill in Overseas API Key in the \"Overseas Account\" card\n2. Choose display mode in \"Overseas Usage\" section\n\nOverseas-only users can leave domestic API Key empty",
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
                <h2>${t.step3Title}</h2>
                <p>${t.step3Content}</p>
            </div>

            <div class="step">
                <h2>${t.step4Title}</h2>
                <p>${t.step4Content}</p>
            </div>
        </div>
    </body>
    </html>
  `;

  return panel;
}

// Create settings webview
async function showSettingsWebView(context, api, updateStatus) {
  // Get current configuration before creating the panel so its title and
  // document language match the selected extension language.
  const config = vscode.workspace.getConfiguration("minimaxStatus");
  const currentLanguage = getConfiguredLanguage();
  const panel = vscode.window.createWebviewPanel(
    "minimaxSettings",
    currentLanguage === "en-US" ? "MiniMax Status Settings" : "MiniMax Status 设置",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Get current configuration
  const currentToken = String(config.get("token") || "").trim();
  const currentInterval = config.get("refreshInterval") || 30;
  const currentShowTooltip = config.get("showTooltip") ?? true;
  const currentModelName = config.get("modelName") || "";
  const currentOverseasDisplay = config.get("overseasDisplay") || "none";
  const currentOverseasToken = String(config.get("overseasToken") || "").trim();

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
      modelEmpty: "请先配置 Token Plan API Key",
      modelLoadFailed: "模型列表加载失败，请检查 API Key、区域和网络",
      languageLabel: "语言",
      languageChinese: "中文",
      languageEnglish: "英文",
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
      invalidInterval: "Refresh interval must be between 5-300 seconds",
      modelAuto: "Auto select first model",
      modelEmpty: "Configure a Token Plan API key first",
      modelLoadFailed: "Unable to load models. Check the API key, region, and network.",
      languageLabel: "Language",
      languageChinese: "Chinese",
      languageEnglish: "English",
    }
  };

  const t = i18n[currentLanguage] || i18n["zh-CN"];

  // Fetch available models from the configured region. Pure overseas mode
  // must use the overseas token; otherwise the selector falsely reports that
  // no API key is configured.
  api.refreshConfig();
  let availableModels = [];
  let modelLoadFailed = false;
  const useOverseasModelApi = currentOverseasDisplay === "overseas" && !currentToken && currentOverseasToken;
  const hasModelCredential = Boolean(useOverseasModelApi ? currentOverseasToken : currentToken);
  if (hasModelCredential) {
    try {
      const statusData = useOverseasModelApi
        ? await api.getOverseasUsageStatus()
        : await api.getUsageStatus();
      const parsedData = api.parseUsageData(statusData, null);
      availableModels = parsedData.allModels || [];
    } catch (error) {
      modelLoadFailed = true;
      console.error("Failed to load model list:", error.message);
    }
  }

  // Create model options
  const t_for_model = i18n[currentLanguage] || i18n["zh-CN"];
  const modelOptions = availableModels.length > 0
    ? `<option value="">${t_for_model.modelAuto}</option>` +
      availableModels.map((modelName) => {
        const safeModelName = escapeHtml(modelName);
        const selected = modelName === currentModelName ? "selected" : "";
        return `<option value="${safeModelName}" ${selected}>${safeModelName}</option>`;
      }).join('')
    : `<option value="">${modelLoadFailed ? t_for_model.modelLoadFailed : t_for_model.modelEmpty}</option>`;

  // Create HTML content
  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="${currentLanguage}">
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
            input[type="password"],
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
                    <input type="password" id="token" placeholder="${t.apiKeyPlaceholder}" value="${escapeHtml(currentToken)}">
                    <div class="info-text">${t.apiKeyInfo}</div>
                    <div class="error" id="token-error"></div>
                </div>
            </div>

            <!-- 海外账号卡片 -->
            <div class="card">
                <h2>${t.overseasTitle}</h2>
                <div class="form-group">
                    <label for="overseasToken">${t.apiKey}</label>
                    <input type="password" id="overseasToken" placeholder="${t.overseasApiKeyPlaceholder}" value="${escapeHtml(currentOverseasToken)}">
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
                    <label for="language">${t.languageLabel}</label>
                    <select id="language">
                        <option value="zh-CN" ${currentLanguage === 'zh-CN' ? 'selected' : ''}>${t.languageChinese}</option>
                        <option value="en-US" ${currentLanguage === 'en-US' ? 'selected' : ''}>${t.languageEnglish}</option>
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
            const messages = ${JSON.stringify({
              apiKeyError: t.apiKeyError,
              overseasApiKeyError: t.overseasApiKeyError,
              invalidInterval: t.invalidInterval,
            })};

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

                // 仅在非纯海外模式下要求国内 Token
                if (overseasDisplay !== 'overseas' && !token) {
                    document.getElementById('token-error').textContent = messages.apiKeyError;
                    hasError = true;
                }

                // Validate overseas credentials based on display mode
                if (overseasDisplay === 'overseas' || overseasDisplay === 'both') {
                    if (!overseasToken) {
                        document.getElementById('overseasToken-error').textContent = messages.overseasApiKeyError;
                        hasError = true;
                    }
                }

                if (interval < 5 || interval > 300) {
                    alert(messages.invalidInterval);
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
                    vscode.postMessage({ command: 'cancelSettings' });
                }
            });
        </script>
    </body>
    </html>
    `;

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case "saveSettings": {
          // Update VSCode settings
          const config = vscode.workspace.getConfiguration("minimaxStatus");

          const updates = [
            config.update(
              "token",
              message.token,
              vscode.ConfigurationTarget.Global
            ),
            config.update(
              "refreshInterval",
              message.interval,
              vscode.ConfigurationTarget.Global
            ),
            config.update(
              "showTooltip",
              message.showTooltip,
              vscode.ConfigurationTarget.Global
            ),
          ];
          if (message.modelName !== undefined) {
            updates.push(config.update(
              "modelName",
              message.modelName,
              vscode.ConfigurationTarget.Global
            ));
          }
          if (message.overseasDisplay !== undefined) {
            updates.push(config.update(
              "overseasDisplay",
              message.overseasDisplay,
              vscode.ConfigurationTarget.Global
            ));
          }
          if (message.overseasToken !== undefined) {
            updates.push(config.update(
              "overseasToken",
              message.overseasToken,
              vscode.ConfigurationTarget.Global
            ));
          }
          if (message.language !== undefined) {
            updates.push(config.update(
              "language",
              message.language,
              vscode.ConfigurationTarget.Global
            ));
          }

          await Promise.all(updates);

          panel.dispose();

          // Refresh status
          await updateStatus();

          const successMsg = message.language === 'en-US' ? 'Settings saved!' : '配置保存成功！';
          vscode.window.showInformationMessage(successMsg);
          break;
        }

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
// eslint-disable-next-line no-unused-vars
function _formatProgressBar(percentage, width = 20) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ']';
}

// Helper function to get progress color based on percentage
// eslint-disable-next-line no-unused-vars
function _getProgressColor(percentage) {
  if (percentage < 60) {
    return new vscode.ThemeColor("charts.green");
  } else if (percentage < 85) {
    return new vscode.ThemeColor("charts.yellow");
  } else {
    return new vscode.ThemeColor("errorForeground");
  }
}

// Helper to get model category color (for tooltip display)
// eslint-disable-next-line no-unused-vars
function _getModelBarColor(model) {
  if (model.isTextModel) {
    return '#4A90E2'; // Blue for text model
  } else if (model.name.includes('music')) {
    return '#FFA726'; // Orange for music model
  } else if (model.name.includes('speech')) {
    return '#9E9E9E'; // Gray for speech model
  }
  return '#4A90E2'; // Default blue
}

// eslint-disable-next-line no-unused-vars
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
  // eslint-disable-next-line no-unused-vars
  const _translateRemainingText = (text) => {
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
  // eslint-disable-next-line no-unused-vars
  const _formatNumberI18n = (num) => {
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

  // eslint-disable-next-line no-unused-vars
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
    // 显示格式：剩余时间 百分比 · 周 百分比 · $(gift) 积分 数字
    const remainingText = remaining.hours > 0 ? `${remaining.hours}h` : `${remaining.minutes}m`;
    const weeklyLabel = language === 'en-US' ? 'W Rem' : '周剩';
    let weeklyText = '';
    if (data.weekly) {
      if (data.weekly.unlimited) {
        weeklyText = ` · ${weeklyLabel} ∞`;
      } else {
        // ⚠ 1.5.0：周字段显示"剩余%"（跟 tooltip 一致），所以反转 data.weekly.percentage
        // (data.weekly.percentage 当前是"已用%"，需要 100 - value 算"剩余%")
        const weeklyRemainingPct = 100 - data.weekly.percentage;
        weeklyText = ` · ${weeklyLabel} ${weeklyRemainingPct}%`;
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

  // ── Period header (use weekly period from API, not the 5h interval) ──
  // Use the user's local timezone so overseas users see intuitive dates.
  // For end timestamps, subtract 1s so that an exclusive boundary like
  // "next day 00:00:00" is displayed as the previous full day.
  let periodText = '';
  const fmt = (ts, isEnd = false) => {
    if (!ts) return '';
    let ms = ts < 1e12 ? ts * 1000 : ts;
    if (isEnd) ms -= 1000;
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(ms));
  };
  if (apiData.model_remains && apiData.model_remains.length > 0) {
    const firstModel = apiData.model_remains[0];
    periodText = `${fmt(firstModel.weekly_start_time)} — ${fmt(firstModel.weekly_end_time, true)}`;
  } else if (planTimeWindow) {
    periodText = `${fmt(planTimeWindow.start)} — ${fmt(planTimeWindow.end, true)}`;
  }

  let content = '';
  // Header: title left, period right (full-width table for proper alignment).
  // Markdown bold (**) is NOT parsed inside <td>, so use plain text and <strong>.
  const titleText = `MINIMAX · ${isEn ? 'Quota Panel' : '配额面板'}`;
  const periodLabel = isEn ? 'Period' : '周期';
  content += `<table width="100%" cellspacing="0" cellpadding="0"><tr>`;
  content += `<td align="left">${titleText}</td>`;
  content += `<td align="right">${periodLabel}：${periodText}</td>`;
  content += `</tr></table>\n\n`;
  content += `---\n\n`;

  // ── Model table (single-row per model, 5 columns) ──────────────
  // Group headers act as natural section dividers — no spacer rows
  // (VS Code tooltip strips padding/height styles, so bold group titles
  // are the cleanest way to separate categories without wasted vertical space).
  const models = allModelsData.models || [];

  // (Removed getGroupMeta / pctSpan / thStyle / tdStyle / groupStyle / colModel / colUsage / colPct / colWeek / colReset
  //  — all dead code from the old "model table" rendering that was replaced by per-card layout.)

  // ── Progress bar: U+25B0 (▰) / U+25B1 (▱) — these are "BLACK SQUARE" /
  // "WHITE SQUARE" from the Geometric Shapes block (designed for fallback
  // rendering in fonts that lack solid block glyphs). In Chinese fallback
  // fonts (Microsoft YaHei) they render as dense / sparse diagonal stripes,
  // which looks like a proper "diagonal-block" progress bar.
  const BAR_W = 16;
  const progressBar = (pct, color) => {
    if (pct == null || isNaN(pct)) pct = 0;
    const clamped = Math.max(0, Math.min(100, pct));
    const filled = Math.round((clamped / 100) * BAR_W);
    const empty = BAR_W - filled;
    return `<span style="color:${color}">▰</span>`.repeat(filled) +
           `<span style="opacity:0.3">▱</span>`.repeat(empty);
  };

  // ── Render one "package card" (5h / 周 / video / Hailuo / etc.) ──
  // Layout (2 rows):
  //   Row 1:  ▍ title  ·  X/Y 剩余  ·  reset-time   (X/Y 剩余 跟 title 同行，跟官网一致)
  //   Row 2:  [▰▰▰▰▱▱▱▱]  X%                          (只进度条 + 百分比)
  // ⚠ 1.5.0 语义修正：`pct` 参数现在是"剩余%"（不是"已用%"），跟官网一致。
  //   颜色按"剩余%"映射：剩 ≥60% 绿 / 剩 30-60% 黄 / 剩 <30% 红。
  //   "X/Y 剩余" 移到 Row 1（跟 title 同行），跟官网 platform.minimaxi.com/console/usage 平台一致。
  // X/Y 剩余 hidden entirely when total=0 (e.g. 5h 限额 has no
  // explicit total count from the API).
  const renderCard = (label, pct, remaining, total, resetText, accent = '#9cdcfe') => {
    // 按"剩余%"判断颜色：剩得多绿、剩得少红
    const pctColor = pct >= 60 ? '#3fb950' : pct >= 30 ? '#d29922' : '#f85149';
    // Row 1 副文本：X/Y 剩余（如果 total > 0），跟 title 同行
    const remainingText = total > 0 ? `<span style="opacity:0.7">${formatNum(remaining)}/${formatNum(total)} 剩余</span>` : '';
    return `<table width="100%" cellspacing="0" cellpadding="0">` +
      // Row 1: title + X/Y 剩余 + reset-time on the SAME line
      `<tr><td align="left" style="padding:6px 6px 2px 6px"><span style="color:${accent}">▍</span> <strong>${label}</strong> <span style="opacity:0.5">·</span> ${remainingText} <span style="opacity:0.5">·</span> <span style="opacity:0.7">${resetText}</span></td></tr>` +
      // Row 2: progress bar + percentage (no X/Y suffix anymore, moved to Row 1)
      `<tr><td align="left" style="padding:0px 6px 6px 6px;font-family:Consolas,Menlo,monospace">${progressBar(pct, pctColor)}&nbsp;&nbsp;<span style="color:${pctColor}"><strong>${pct}%</strong></span></td></tr>` +
      `</table>`;
  };

  // Find specific models by name pattern (for the "套餐" cards).
  const findModel = (predicate) => models.find(predicate);
  const generalModel = findModel(m => m.name === 'general');
  const videoModel   = findModel(m => m.name === 'video');
  const hailuoModels = models.filter(m => m.name.includes('Hailuo'));
  const musicModels  = models.filter(m => m.name.includes('music') || m.name.includes('lyrics'));
  const imageModels  = models.filter(m => m.name.includes('image'));
  const speechModels = models.filter(m => m.name.includes('speech'));

  // ── 套餐卡片 (5h 限额 / 周限额 / 视频赠送 / 多媒体) ──────────────
  // Each card mirrors the official platform's "5h 限额 / 周限额 / 视频赠送" tiles.
  // Skip cards where the model is not returned (套餐没开通 / 不在当前套餐里).
  const cardCount = (generalModel ? 1 : 0) + (videoModel ? 1 : 0) + hailuoModels.length + musicModels.length + imageModels.length + speechModels.length;
  const showCards = cardCount > 0;

  if (showCards) {
    if (generalModel) {
      const pct = generalModel.percentage;
      const used = generalModel.totalCount > 0 ? Math.round((generalModel.totalCount * pct) / 100) : 0;
      const rt = generalModel.remainingTime;
      const resetText = isEn
        ? `${rt.hours}h ${rt.minutes}m until reset`
        : `${rt.hours}h ${rt.minutes}m 后重置`;
      content += renderCard(isEn ? '5h Remaining' : '5h 剩余', pct, used, generalModel.totalCount, resetText, '#9cdcfe');
    }
    if (generalModel) {
      const wp = generalModel.weeklyPercentage;
      const wt = generalModel.weeklyTotal;
      const wUsed = wt > 0 ? Math.round((wt * wp) / 100) : 0;
      const wrt = generalModel.weeklyRemainingTime;
      const resetText = isEn
        ? `${wrt.days}d ${wrt.hours}h until reset`
        : `${wrt.days}天 ${wrt.hours}h 后重置`;
      content += renderCard(isEn ? 'Weekly Remaining' : '周剩余', wp, wUsed, wt, resetText, '#dcdcaa');
    }
    if (videoModel) {
      const pct = videoModel.percentage;
      const used = videoModel.totalCount > 0 ? Math.round((videoModel.totalCount * pct) / 100) : 0;
      const rt = videoModel.remainingTime;
      const resetText = isEn ? `${rt.hours}h ${rt.minutes}m` : `${rt.hours}h ${rt.minutes}m 后重置`;
      content += renderCard(isEn ? 'Video Bonus' : '视频赠送', pct, used, videoModel.totalCount, resetText, '#c586c0');
    }
    for (const h of hailuoModels) {
      const pct = h.percentage;
      const used = h.totalCount > 0 ? Math.round((h.totalCount * pct) / 100) : 0;
      const rt = h.remainingTime;
      const resetText = isEn ? `${rt.hours}h ${rt.minutes}m` : `${rt.hours}h ${rt.minutes}m 后重置`;
      const short = h.shortName || 'Hailuo';
      content += renderCard(short, pct, used, h.totalCount, resetText, '#4ec9b0');
    }
    for (const m of musicModels) {
      const pct = m.percentage;
      const used = m.totalCount > 0 ? Math.round((m.totalCount * pct) / 100) : 0;
      const rt = m.remainingTime;
      const resetText = isEn ? `${rt.hours}h ${rt.minutes}m` : `${rt.hours}h ${rt.minutes}m 后重置`;
      content += renderCard(m.shortName || 'music', pct, used, m.totalCount, resetText, '#ce9178');
    }
    for (const im of imageModels) {
      const pct = im.percentage;
      const used = im.totalCount > 0 ? Math.round((im.totalCount * pct) / 100) : 0;
      const rt = im.remainingTime;
      const resetText = isEn ? `${rt.hours}h ${rt.minutes}m` : `${rt.hours}h ${rt.minutes}m 后重置`;
      content += renderCard(im.shortName || 'image', pct, used, im.totalCount, resetText, '#b5cea8');
    }
    for (const s of speechModels) {
      const pct = s.percentage;
      const used = s.totalCount > 0 ? Math.round((s.totalCount * pct) / 100) : 0;
      const rt = s.remainingTime;
      const resetText = isEn ? `${rt.hours}h ${rt.minutes}m` : `${rt.hours}h ${rt.minutes}m 后重置`;
      content += renderCard(s.shortName || 'speech', pct, used, s.totalCount, resetText, '#dcdcaa');
    }
  }

  content += `\n\n---\n\n`;

  // ── Bottom 3-column Token stats: 昨日 / 近7天 / 当月 (real data from billing API) ──
  if (usageStats && (usageStats.lastDayUsage > 0 || usageStats.weeklyUsage > 0 || usageStats.planTotalUsage > 0)) {
    const lblYesterday = isEn ? 'Yesterday' : '昨日消耗';
    const lbl7d        = isEn ? 'Last 7 Days' : '近 7 天';
    const lblMonth     = isEn ? 'This Month' : '当月消耗';
    const unit         = 'tokens';

    const cellLabel = 'style="padding:2px 6px;opacity:0.6"';
    const cellValue = 'style="padding:2px 6px"';
    content += `<table width="100%" cellspacing="0" cellpadding="0">\n`;
    content += `<tr>`;
    content += `<td align="center" ${cellLabel}>${lblYesterday}</td>`;
    content += `<td align="center" ${cellLabel}>${lbl7d}</td>`;
    content += `<td align="center" ${cellLabel}>${lblMonth}</td>`;
    content += `</tr>\n<tr>`;
    content += `<td align="center" ${cellValue}><strong>${formatNum(usageStats.lastDayUsage)}</strong> ${unit}</td>`;
    content += `<td align="center" ${cellValue}><strong>${formatNum(usageStats.weeklyUsage)}</strong> ${unit}</td>`;
    content += `<td align="center" ${cellValue}><strong>${formatNum(usageStats.planTotalUsage)}</strong> ${unit}</td>`;
    content += `</tr>\n</table>\n\n`;
  }

  // ── Footer: expiry + updated time + refresh hint (right-aligned) ──
  // Use the user's local timezone for the "updated at" timestamp.
  const updatedAt = new Date().toLocaleTimeString(isEn ? 'en-US' : 'zh-CN', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const updatedLabel = isEn ? 'Updated' : '更新于';
  const expiryText = expiry
    ? `${isEn ? 'Expiry' : '到期'}：${isEn ? translateExpiryText(expiry.text) : expiry.text}`
    : '';
  const footerLine = [expiryText, `${updatedLabel} ${updatedAt}`, t.clickToRefresh].filter(Boolean).join(' · ');
  content += `<table width="100%" cellspacing="0" cellpadding="0"><tr>`;
  content += `<td align="right" style="opacity:0.55">${footerLine}</td>`;
  content += `</tr></table>`;

  md.appendMarkdown(content);
  statusBarItem.tooltip = md;
}

function deactivate() {
  // Extension deactivated
}

module.exports = {
  activate,
  deactivate,
  getLocalizedErrorMessage,
};
