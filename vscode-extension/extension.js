const vscode = require("vscode");
const MinimaxAPI = require("./api");

// Activate function - entry point for the extension
function activate(context) {
  try {
    const api = new MinimaxAPI(context);

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
      try {
        // Refresh API config to get latest settings
        api.refreshConfig();
        const config = vscode.workspace.getConfiguration("minimaxStatus");
        const overseasDisplay = config.get("overseasDisplay") || "none";
        const language = config.get("language") || "zh-CN";

        // Get domestic data
        const [apiData, subscriptionData] = await Promise.all([
          api.getUsageStatus(),
          api.getSubscriptionDetails().catch(() => null)
        ]);
        const usageData = api.parseUsageData(apiData, subscriptionData);

        // Get overseas data if needed
        let overseasUsageData = null;
        if (overseasDisplay === 'overseas' || overseasDisplay === 'both') {
          try {
            const overseasApiData = await api.getOverseasUsageStatus();
            overseasUsageData = api.parseUsageData(overseasApiData, null);
          } catch (overseasError) {
            console.error("Failed to fetch overseas data:", overseasError.message);
          }
        }

        // Fetch billing data for usage statistics (with caching)
        const now = Date.now();
        if (!billingCache || now - billingCacheTime > BILLING_CACHE_DURATION) {
          try {
            const billingRecords = await api.getAllBillingRecords(10); // Fetch first 10 pages (1000 records)
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

        // 计算套餐开始时间：从订阅到期时间往前推31天
        let planStartTime = 0;
        if (subscriptionData &&
            subscriptionData.current_subscribe &&
            subscriptionData.current_subscribe.current_subscribe_end_time) {
          const expiryDateStr = subscriptionData.current_subscribe.current_subscribe_end_time;
          // 格式: MM/DD/YYYY -> Date
          const [month, day, year] = expiryDateStr.split('/').map(Number);
          const expiryDate = new Date(year, month - 1, day);
          // 套餐开始时间 = 到期时间 - 30天
          planStartTime = new Date(year, month - 1, day - 30).getTime();
        }

        if (billingCache && billingCache.length > 0) {
          // 从账单记录中计算时间范围
          let minTimestamp = Infinity;
          let maxTimestamp = 0;
          for (const record of billingCache) {
            const createdAt = (record.created_at || 0) * 1000;
            if (createdAt < minTimestamp) minTimestamp = createdAt;
            if (createdAt > maxTimestamp) maxTimestamp = createdAt;
          }

          usageStats = api.calculateUsageStats(
            billingCache,
            planStartTime > 0 ? planStartTime : minTimestamp, // 使用套餐开始时间
            now // 到当前时间
          );
        }

        updateStatusBar(statusBarItem, usageData, usageStats, overseasUsageData, overseasDisplay, language);
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

    // Add to subscriptions
    context.subscriptions.push(
      statusBarItem,
      configChangeDisposable,
      refreshDisposable,
      setupDisposable
    );

    // Always show status bar item
    if (!api.token || !api.groupId) {
      statusBarItem.text = "MiniMax: 需要配置";
      statusBarItem.color = new vscode.ThemeColor("warningForeground");
      statusBarItem.tooltip =
        "MiniMax Status 需要配置 Token 和 GroupId\n点击立即配置";
      statusBarItem.command = "minimaxStatus.setup";

      setTimeout(() => {
        vscode.window
          .showInformationMessage(
            "欢迎使用 MiniMax Status！\n\n需要配置您的访问令牌和group ID 才能开始使用。",
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
      statusBarItem.text = "⏳ MiniMax: 加载中...";
      statusBarItem.color = new vscode.ThemeColor("statusBar.foreground");
      statusBarItem.tooltip = "MiniMax Status\n正在获取状态...";
      statusBarItem.command = "minimaxStatus.refresh";
    }
  } catch (error) {
    console.error("MiniMax Status 扩展激活失败:", error.message);
    vscode.window.showErrorMessage(
      "MiniMax Status 扩展激活失败: " + error.message
    );
  }
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
  const currentGroupId = config.get("groupId") || "";
  const currentInterval = config.get("refreshInterval") || 30;
  const currentShowTooltip = config.get("showTooltip") ?? true;
  const currentModelName = config.get("modelName") || "";
  const currentOverseasDisplay = config.get("overseasDisplay") || "none";
  const currentOverseasToken = config.get("overseasToken") || "";
  const currentOverseasGroupId = config.get("overseasGroupId") || "";
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
      groupId: "GroupID",
      groupIdPlaceholder: "请输入 groupID",
      groupIdInfo: "国内账号的 GroupID",
      overseasApiKeyPlaceholder: "请输入海外 API Key",
      overseasApiKeyInfo: "platform.minimax.io 的 API Key（用于显示海外用量）",
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
      groupIdError: "请输入 groupID",
      overseasApiKeyError: "请输入海外 API Key",
      overseasGroupIdError: "请输入海外 groupID",
      invalidInterval: "刷新间隔必须在 5-300 秒之间",
      modelAuto: "自动选择第一个模型",
      modelEmpty: "请先配置 API Key 和 groupID",
    },
    "en-US": {
      title: "MiniMax Settings",
      domesticTitle: "Domestic Account",
      overseasTitle: "Overseas Account",
      apiKey: "API Key",
      apiKeyPlaceholder: "Enter domestic API Key",
      apiKeyInfo: "platform.minimaxi.com API Key",
      groupId: "GroupID",
      groupIdPlaceholder: "Enter groupID",
      groupIdInfo: "Domestic account GroupID",
      overseasApiKeyPlaceholder: "Enter overseas API Key",
      overseasApiKeyInfo: "platform.minimax.io API Key (for overseas usage)",
      overseasGroupIdPlaceholder: "Enter groupID",
      overseasGroupIdInfo: "Overseas account GroupID",
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
      groupIdError: "GroupID is required",
      overseasApiKeyError: "Overseas API Key is required",
      overseasGroupIdError: "Overseas GroupID is required",
      invalidInterval: "Refresh interval must be between 5-300 seconds",
      modelAuto: "Auto select first model",
      modelEmpty: "Please configure API Key and groupID first",
    }
  };

  const t = i18n[currentLanguage] || i18n["zh-CN"];

  // Fetch available models if token and groupId are configured
  let availableModels = [];
  if (currentToken && currentGroupId) {
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
                <div class="form-group">
                    <label for="groupId">${t.groupId}</label>
                    <input type="text" id="groupId" placeholder="${t.groupIdPlaceholder}" value="${currentGroupId}">
                    <div class="info-text">${t.groupIdInfo}</div>
                    <div class="error" id="groupId-error"></div>
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
                <div class="form-group">
                    <label for="overseasGroupId">${t.groupId}</label>
                    <input type="text" id="overseasGroupId" placeholder="${t.overseasGroupIdPlaceholder}" value="${currentOverseasGroupId}">
                    <div class="info-text">${t.overseasGroupIdInfo}</div>
                    <div class="error" id="overseasGroupId-error"></div>
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
                const groupId = document.getElementById('groupId').value.trim();
                const overseasToken = document.getElementById('overseasToken').value.trim();
                const overseasGroupId = document.getElementById('overseasGroupId').value.trim();
                const interval = parseInt(document.getElementById('interval').value, 10);
                const showTooltip = document.getElementById('showTooltip').checked;
                const modelName = document.getElementById('modelName').value;
                const overseasDisplay = document.getElementById('overseasDisplay').value;
                const language = document.getElementById('language').value;

                // Clear previous errors
                document.getElementById('token-error').textContent = '';
                document.getElementById('groupId-error').textContent = '';
                document.getElementById('overseasToken-error').textContent = '';
                document.getElementById('overseasGroupId-error').textContent = '';

                // Validate inputs
                let hasError = false;

                if (!token) {
                    document.getElementById('token-error').textContent = t.apiKeyError;
                    hasError = true;
                }

                if (!groupId) {
                    document.getElementById('groupId-error').textContent = t.groupIdError;
                    hasError = true;
                }

                // Validate overseas credentials based on display mode
                if (overseasDisplay === 'overseas' || overseasDisplay === 'both') {
                    if (!overseasToken) {
                        document.getElementById('overseasToken-error').textContent = t.overseasApiKeyError;
                        hasError = true;
                    }
                    if (!overseasGroupId) {
                        document.getElementById('overseasGroupId-error').textContent = t.overseasGroupIdError;
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
                    groupId: groupId,
                    overseasToken: overseasToken,
                    overseasGroupId: overseasGroupId,
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
            "groupId",
            message.groupId,
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
          if (message.overseasGroupId !== undefined) {
            config.update(
              "overseasGroupId",
              message.overseasGroupId,
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

function updateStatusBar(statusBarItem, data, usageStats, overseasData = null, displayMode = 'none', language = 'zh-CN') {
  // Status bar i18n
  const statusI18n = {
    "zh-CN": {
      domestic: "国内",
      overseas: "海外",
      model: "模型",
      usageProgress: "使用进度",
      remainingTime: "剩余时间",
      timeWindow: "时间窗口",
      billingStats: "=== Token 消耗统计 ===",
      yesterday: "昨日消耗",
      last7Days: "近7天消耗",
      totalUsage: "套餐总消耗",
      expiry: "套餐到期",
      clickToRefresh: "点击刷新状态",
    },
    "en-US": {
      domestic: "Domestic",
      overseas: "Overseas",
      model: "Model",
      usageProgress: "Usage",
      remainingTime: "Remaining",
      timeWindow: "Time Window",
      billingStats: "=== Token Usage Stats ===",
      yesterday: "Yesterday",
      last7Days: "Last 7 days",
      totalUsage: "Total usage",
      expiry: "Expires",
      clickToRefresh: "Click to refresh",
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

  // Helper to format number with language-appropriate units
  const formatNumberI18n = (num) => {
    if (language === 'en-US') {
      if (num >= 100000000) {
        return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "B";
      }
      if (num >= 10000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
      }
      return num.toLocaleString("en-US");
    }
    // Chinese format
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    }
    return num.toLocaleString("zh-CN");
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
    statusBarItem.text = `$(clock) ${modelName} ${percentage}%`;
  }

  // Build tooltip
  const tooltip = [];

  // Add domestic usage info
  tooltip.push(`[${t.domestic}]`);
  tooltip.push(`${t.model}: ${data.modelName}`);
  tooltip.push(`${t.usageProgress}: ${data.usage.percentage}% (${formatNumberI18n(data.usage.used)}/${formatNumberI18n(data.usage.total)})`);
  tooltip.push(`${t.remainingTime}: ${translateRemainingText(data.remaining.text)}`);
  tooltip.push(`${t.timeWindow}: ${data.timeWindow.start}-${data.timeWindow.end}(${data.timeWindow.timezone})`);

  // Add overseas usage info if available
  if (overseasData) {
    tooltip.push(``, `[${t.overseas}]`);
    tooltip.push(`${t.model}: ${overseasData.modelName}`);
    tooltip.push(`${t.usageProgress}: ${overseasData.usage.percentage}% (${formatNumberI18n(overseasData.usage.used)}/${formatNumberI18n(overseasData.usage.total)})`);
    tooltip.push(`${t.remainingTime}: ${translateRemainingText(overseasData.remaining.text)}`);
  }

  // Add billing stats if available
  if (usageStats.lastDayUsage > 0 || usageStats.weeklyUsage > 0) {
    tooltip.push(``, t.billingStats);
    tooltip.push(`${t.yesterday}: ${formatNumberI18n(usageStats.lastDayUsage)}`);
    tooltip.push(`${t.last7Days}: ${formatNumberI18n(usageStats.weeklyUsage)}`);
    tooltip.push(`${t.totalUsage}: ${formatNumberI18n(usageStats.planTotalUsage)}`);
  }

  // Add expiry information if available
  if (expiry) {
    tooltip.push(`${t.expiry}: ${expiry.date} (${translateExpiryText(expiry.text)})`);
  }

  tooltip.push("", t.clickToRefresh);

  statusBarItem.tooltip = tooltip.join("\n");
}

function deactivate() {
  // Extension deactivated
}

module.exports = {
  activate,
  deactivate,
};
