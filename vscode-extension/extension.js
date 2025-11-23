const vscode = require('vscode');
const MinimaxAPI = require('./api');

// Activate function - entry point for the extension
function activate(context) {
    console.log('MiniMax Status 扩展已激活');

    const api = new MinimaxAPI(context);
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'minimaxStatus.refresh';
    statusBarItem.show();

    let intervalId;

    const updateStatus = async () => {
        try {
            const apiData = await api.getUsageStatus();
            const usageData = api.parseUsageData(apiData);
            updateStatusBar(statusBarItem, usageData);
        } catch (error) {
            console.error('获取状态失败:', error.message);
            statusBarItem.text = '$(warning) MiniMax';
            statusBarItem.tooltip = `错误: ${error.message}\n点击配置`;
            statusBarItem.color = new vscode.ThemeColor('errorForeground');
        }
    };

    const config = vscode.workspace.getConfiguration('minimaxStatus');
    const interval = config.get('refreshInterval', 30) * 1000;

    // Initial update
    updateStatus();

    // Set up interval
    intervalId = setInterval(updateStatus, interval);

    // Subscribe to configuration changes
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('minimaxStatus')) {
            api.refreshConfig();
            const newInterval = config.get('refreshInterval', 30) * 1000;
            clearInterval(intervalId);
            intervalId = setInterval(updateStatus, newInterval);
            updateStatus();
        }
    });

    // Subscribe to refresh command
    const refreshDisposable = vscode.commands.registerCommand('minimaxStatus.refresh', updateStatus);

    // Subscribe to setup command
    const setupDisposable = vscode.commands.registerCommand('minimaxStatus.setup', async () => {
        const panel = showSettingsWebView(context, api, updateStatus);
        context.subscriptions.push(panel);
    });

    // Add to subscriptions
    context.subscriptions.push(
        statusBarItem,
        configChangeDisposable,
        refreshDisposable,
        setupDisposable
    );

    // Show setup message if credentials are missing
    if (!api.token || !api.groupId) {
        statusBarItem.text = '⚙️ MiniMax: 需要配置';
        statusBarItem.color = new vscode.ThemeColor('warningForeground');
        statusBarItem.tooltip = 'MiniMax Status 需要配置 Token 和 GroupId\n点击立即配置';
        statusBarItem.command = 'minimaxStatus.setup'; // 关键修复：点击状态栏打开设置

        setTimeout(() => {
            vscode.window.showInformationMessage(
                '🎉 欢迎使用 MiniMax Status！\n\n需要配置您的访问令牌和组 ID 才能开始使用。',
                '立即配置',
                '稍后设置'
            ).then((selection) => {
                if (selection === '立即配置') {
                    vscode.commands.executeCommand('minimaxStatus.setup');
                }
            });
        }, 2000);
    }
}

// Create settings webview
function showSettingsWebView(context, api, updateStatus) {
    const panel = vscode.window.createWebviewPanel(
        'minimaxSettings',
        'MiniMax Status 设置',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // Get current configuration
    const config = vscode.workspace.getConfiguration('minimaxStatus');
    const currentToken = config.get('token') || '';
    const currentGroupId = config.get('groupId') || '';
    const currentInterval = config.get('refreshInterval') || 30;
    const currentShowTooltip = config.get('showTooltip') ?? true;

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
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
                color: var(--vscode-editor-foreground);
            }
            input[type="text"], input[type="number"] {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--vscode-input-border, #6c6c6c);
                border-radius: 4px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-size: 14px;
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
            .error {
                color: var(--vscode-errorForeground);
                font-size: 12px;
                margin-top: 4px;
            }
            button {
                background-color: var(--vscode-button-background, #0e639c);
                color: var(--vscode-button-foreground, #ffffff);
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                margin-right: 10px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground, #1177bb);
            }
            .info-text {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin-top: 4px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔧 MiniMax Status 配置</h1>

            <div class="form-group">
                <label for="token">API Key</label>
                <input type="text" id="token" placeholder="请输入 API Key" value="${currentToken}">
                <div class="info-text">您的 MiniMax API 访问令牌</div>
                <div class="error" id="token-error"></div>
            </div>

            <div class="form-group">
                <label for="groupId">Group ID</label>
                <input type="text" id="groupId" placeholder="请输入 Group ID" value="${currentGroupId}">
                <div class="info-text">您的 MiniMax 组 ID</div>
                <div class="error" id="groupId-error"></div>
            </div>

            <div class="form-group">
                <label for="interval">刷新间隔（秒）</label>
                <input type="number" id="interval" min="5" max="300" value="${currentInterval}">
                <div class="info-text">自动刷新间隔，建议 10-30 秒</div>
            </div>

            <div class="form-group">
                <label class="checkbox-group">
                    <input type="checkbox" id="showTooltip" ${currentShowTooltip ? 'checked' : ''}>
                    <span>显示详细提示信息</span>
                </label>
            </div>

            <div style="margin-top: 30px;">
                <button onclick="saveSettings()">保存配置</button>
                <button onclick="cancelSettings()" style="background-color: var(--vscode-button-secondaryBackground, #6a737d);">取消</button>
            </div>

            <div style="margin-top: 30px; padding: 15px; background-color: var(--vscode-textBlockQuote-background, #2d2d30); border-radius: 4px;">
                <strong>如何获取认证信息？</strong><br><br>
                1. 访问 <a href="https://platform.minimaxi.com/user-center/payment/coding-plan" target="_blank">MiniMax 开放平台</a><br>
                2. 登录您的账户<br>
                3. 在用户中心复制您的 <strong>GroupID</strong><br>
                4. 在 Coding Plan 页面创建或获取 <strong>API Key</strong>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();

            function saveSettings() {
                const token = document.getElementById('token').value.trim();
                const groupId = document.getElementById('groupId').value.trim();
                const interval = parseInt(document.getElementById('interval').value);
                const showTooltip = document.getElementById('showTooltip').checked;

                // Clear previous errors
                document.getElementById('token-error').textContent = '';
                document.getElementById('groupId-error').textContent = '';

                // Validate inputs
                let hasError = false;

                if (!token) {
                    document.getElementById('token-error').textContent = '请输入 API Key';
                    hasError = true;
                }

                if (!groupId) {
                    document.getElementById('groupId-error').textContent = '请输入 Group ID';
                    hasError = true;
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
                    interval: interval,
                    showTooltip: showTooltip
                });
            }

            function cancelSettings() {
                vscode.postMessage({
                    command: 'cancelSettings'
                });
            }

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
        message => {
            switch (message.command) {
                case 'saveSettings':
                    // Update VSCode settings
                    const config = vscode.workspace.getConfiguration('minimaxStatus');

                    config.update('token', message.token, vscode.ConfigurationTarget.Global);
                    config.update('groupId', message.groupId, vscode.ConfigurationTarget.Global);
                    config.update('refreshInterval', message.interval, vscode.ConfigurationTarget.Global);
                    config.update('showTooltip', message.showTooltip, vscode.ConfigurationTarget.Global);

                    panel.dispose();

                    // Refresh status
                    updateStatus();

                    vscode.window.showInformationMessage('✅ 配置保存成功！');
                    break;

                case 'cancelSettings':
                    panel.dispose();
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    return panel;
}

function updateStatusBar(statusBarItem, data) {
    const { usage, modelName, remaining } = data;

    // 关键修复：设置状态栏命令为刷新
    statusBarItem.command = 'minimaxStatus.refresh';

    // Set status bar text with color
    const percentage = usage.percentage;
    if (percentage < 60) {
        statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
    } else if (percentage < 85) {
        statusBarItem.color = new vscode.ThemeColor('problemsWarningIcon.foreground');
    } else {
        statusBarItem.color = new vscode.ThemeColor('errorForeground');
    }

    statusBarItem.text = `$(clock) ${modelName} ${percentage}%`;

    // Build tooltip
    const tooltip = [
        `模型: ${modelName}`,
        `使用进度: ${usage.percentage}% (${usage.used}/${usage.total})`,
        `剩余时间: ${remaining.text}`,
        `时间窗口: ${data.timeWindow.start}-${data.timeWindow.end}(${data.timeWindow.timezone})`,
        '',
        '点击刷新状态'
    ].join('\n');

    statusBarItem.tooltip = tooltip;
}

function deactivate() {
    console.log('MiniMax Status 扩展已停用');
}

module.exports = {
    activate,
    deactivate
};
