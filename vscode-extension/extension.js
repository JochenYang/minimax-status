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
        const [apiData, subscriptionData] = await Promise.all([
          api.getUsageStatus(),
          api.getSubscriptionDetails().catch(() => null) // Silent fail for subscription API
        ]);
        const usageData = api.parseUsageData(apiData, subscriptionData);

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

        // 计算套餐开始时间：从订阅到期时间往前推1个月
        let planStartTime = 0;
        if (subscriptionData &&
            subscriptionData.current_subscribe &&
            subscriptionData.current_subscribe.current_subscribe_end_time) {
          const expiryDateStr = subscriptionData.current_subscribe.current_subscribe_end_time;
          // 格式: MM/DD/YYYY -> Date
          const [month, day, year] = expiryDateStr.split('/').map(Number);
          const expiryDate = new Date(year, month - 1, day);
          // 套餐开始时间 = 到期时间 - 1个月
          planStartTime = new Date(year, month - 2, day).getTime();
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

        updateStatusBar(statusBarItem, usageData, usageStats, api);
      } catch (error) {
        console.error("获取状态失败:", error.message);
        statusBarItem.text = "$(warning) MiniMax";
        statusBarItem.tooltip = `错误: ${error.message}\n点击配置`;
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
  const modelOptions = availableModels.length > 0
    ? `<option value="">自动选择第一个模型</option>` +
      availableModels.map(m => `<option value="${m}" ${m === currentModelName ? 'selected' : ''}>${m}</option>`).join('')
    : `<option value="">请先配置 API Key 和 groupID</option>`;

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
            <h1>MiniMax 设置</h1>

            <!-- 国内账号卡片 -->
            <div class="card">
                <h2>国内账号</h2>
                <div class="form-group">
                    <label for="token">API Key</label>
                    <input type="text" id="token" placeholder="请输入国内 API Key" value="${currentToken}">
                    <div class="info-text">platform.minimaxi.com 的 API Key</div>
                    <div class="error" id="token-error"></div>
                </div>
                <div class="form-group">
                    <label for="groupId">GroupID</label>
                    <input type="text" id="groupId" placeholder="请输入 groupID" value="${currentGroupId}">
                    <div class="info-text">国内账号的 GroupID</div>
                    <div class="error" id="groupId-error"></div>
                </div>
            </div>

            <!-- 海外账号卡片 -->
            <div class="card">
                <h2>海外账号</h2>
                <div class="form-group">
                    <label for="overseasToken">API Key</label>
                    <input type="text" id="overseasToken" placeholder="请输入海外 API Key" value="${currentOverseasToken}">
                    <div class="info-text">api.minimax.io 的 API Key（用于显示海外用量）</div>
                    <div class="error" id="overseasToken-error"></div>
                </div>
                <div class="form-group">
                    <label for="overseasGroupId">GroupID</label>
                    <input type="text" id="overseasGroupId" placeholder="请输入 groupID" value="${currentOverseasGroupId}">
                    <div class="info-text">海外账号的 GroupID</div>
                    <div class="error" id="overseasGroupId-error"></div>
                </div>
            </div>

            <!-- 显示设置卡片 -->
            <div class="card">
                <h2>显示设置</h2>
                <div class="form-group">
                    <label for="interval">刷新间隔（秒）</label>
                    <input type="number" id="interval" min="5" max="300" value="${currentInterval}">
                    <div class="info-text">自动刷新间隔，建议 10-30 秒</div>
                </div>
                <div class="form-group">
                    <label for="modelName">模型选择</label>
                    <select id="modelName">
                        ${modelOptions}
                    </select>
                </div>
                <div class="form-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="showTooltip" ${
                          currentShowTooltip ? "checked" : ""
                        }>
                        <label for="showTooltip">显示详细提示信息</label>
                    </div>
                </div>
            </div>

            <!-- 海外用量卡片 -->
            <div class="card">
                <h2>海外用量</h2>
                <div class="form-group">
                    <label for="overseasDisplay">显示模式</label>
                    <select id="overseasDisplay">
                        <option value="none" ${currentOverseasDisplay === 'none' ? 'selected' : ''}>仅显示国内</option>
                        <option value="overseas" ${currentOverseasDisplay === 'overseas' ? 'selected' : ''}>仅显示海外</option>
                        <option value="both" ${currentOverseasDisplay === 'both' ? 'selected' : ''}>国内+海外并行</option>
                    </select>
                    <div class="info-text">选择是否显示海外版用量</div>
                </div>
            </div>

            <div class="button-group">
                <button id="saveBtn">保存</button>
                <button id="cancelBtn" class="secondary">取消</button>
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

                // Clear previous errors
                document.getElementById('token-error').textContent = '';
                document.getElementById('groupId-error').textContent = '';
                document.getElementById('overseasToken-error').textContent = '';
                document.getElementById('overseasGroupId-error').textContent = '';

                // Validate inputs
                let hasError = false;

                if (!token) {
                    document.getElementById('token-error').textContent = '请输入 API Key';
                    hasError = true;
                }

                if (!groupId) {
                    document.getElementById('groupId-error').textContent = '请输入 groupID';
                    hasError = true;
                }

                // Validate overseas credentials based on display mode
                if (overseasDisplay === 'overseas' || overseasDisplay === 'both') {
                    if (!overseasToken) {
                        document.getElementById('overseasToken-error').textContent = '请输入海外 API Key';
                        hasError = true;
                    }
                    if (!overseasGroupId) {
                        document.getElementById('overseasGroupId-error').textContent = '请输入海外 groupID';
                        hasError = true;
                    }
                }

                if (interval < 5 || interval > 300) {
                    alert('刷新间隔必须在 5-300 秒之间');
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
                    overseasDisplay: overseasDisplay
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

          panel.dispose();

          // Refresh status
          updateStatus();

          vscode.window.showInformationMessage("配置保存成功！");
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

function updateStatusBar(statusBarItem, data, usageStats, api) {
  const { usage, modelName, remaining, expiry, planTimeWindow } = data;
  const formatNumber = (num) => api.formatNumber(num);

  // 关键修复：设置状态栏命令为刷新
  statusBarItem.command = "minimaxStatus.refresh";

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

  // 状态栏只显示用量百分比，不显示消耗统计
  statusBarItem.text = `$(clock) ${modelName} ${percentage}%`;

  // Build tooltip
  const tooltip = [
    `模型: ${modelName}`,
    `使用进度: ${usage.percentage}% (${formatNumber(usage.used)}/${formatNumber(usage.total)})`,
    `剩余时间: ${remaining.text}`,
    `时间窗口: ${data.timeWindow.start}-${data.timeWindow.end}(${data.timeWindow.timezone})`,
    ``,
    `=== Token 消耗统计 ===`,
    `昨日消耗: ${formatNumber(usageStats.lastDayUsage)}`,
    `近7天消耗: ${formatNumber(usageStats.weeklyUsage)}`,
    `套餐总消耗: ${formatNumber(usageStats.planTotalUsage)}`,
  ];

  // Add expiry information if available
  if (expiry) {
    tooltip.push(`套餐到期: ${expiry.date} (${expiry.text})`);
  }

  tooltip.push("", "点击刷新状态");

  statusBarItem.tooltip = tooltip.join("\n");
}

function deactivate() {
  // Extension deactivated
}

module.exports = {
  activate,
  deactivate,
};
