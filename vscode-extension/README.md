# MiniMax Status

在 VS Code 状态栏实时显示 MiniMax Token-Plan 使用状态。

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)
[![Version](https://img.shields.io/badge/version-1.5.2-green?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)

MiniMax Status 支持国内版与国际版账号，并提供中文/英文界面。完整中文说明和 English documentation 均保留在本文档中。

---

## English documentation

Display MiniMax Token Plan usage, remaining quota, and reset countdown in the VS Code status bar.

### Features

| Feature | Description |
|------|------|
| **Live status bar** | Shows the reset countdown, current usage percentage, and weekly usage |
| **Color hints** | Changes color at the 60% and 85% usage thresholds |
| **Detailed tooltip** | Shows model, quota cards, token usage, reset windows, and expiry |
| **Sidebar entry** | Open Settings or Help from the MiniMax activity bar icon |
| **Domestic and overseas accounts** | Supports the domestic and international MiniMax services |
| **Bilingual UI** | Chinese and English interface |

### Quick start

#### 1. Install the extension

Install **MiniMax Status** from the VS Code Marketplace, or install a downloaded `.vsix` file from the Extensions view menu.

#### 2. Configure credentials

1. Click the MiniMax icon in the Activity Bar.
2. Open **Settings**.
3. Enter the Token Plan key for the service region you want to query.
4. Save the settings and click the status bar item to refresh.

The settings field is labelled **API Key**, but it must contain a Token Plan key. A regular pay-as-you-go API key cannot be used for this usage endpoint.

#### 3. Choose the service region

| Region | Usage endpoint | Credential |
|------|------|------|
| Domestic | `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains` | Domestic Token Plan key from [platform.minimaxi.com](https://platform.minimaxi.com/) |
| Overseas | `https://www.minimax.io/v1/api/openplatform/coding_plan/remains` | Overseas Token Plan key from [platform.minimax.io](https://platform.minimax.io/) |

In **Overseas Usage** settings:

- **Domestic only**: requires the domestic key.
- **Overseas only**: requires only the overseas key; the domestic key may be empty.
- **Domestic + Overseas**: requires both keys and displays both regions.

Keys are region-specific. If the extension reports an authentication or region error, check both the key type and the selected region.

#### 4. View the status

After configuration, the status bar shows the remaining time and quota percentage:

```text
⏱ 25m 4% · W 1%
```

- `25m`: time remaining before the quota resets
- `4%`: current quota percentage shown by the extension
- `W 1%`: weekly quota percentage

### Interface examples

#### Status bar

```text
⏱ 25m 4% · W 1%   (English)
⏱ 25m 4% · 周 1%  (中文)
```

Click the status bar item to refresh the data.

#### Tooltip details

The tooltip can include 5-hour and weekly quota cards, video/Hailuo/music/image/speech quotas when returned by the API, model usage, token statistics, subscription expiry, and the last refresh time.

Example English tooltip:

```text
[Domestic]
Model: MiniMax-M2.7
Usage: 4% (169/4,500)
Remaining: 15 min until reset
Time Window: 15:00–20:00 (UTC+8)

Weekly: 1% (1,860/157,500)
Weekly Reset: 4d 4h until reset

=== Token Usage Stats ===
Yesterday: 83.40M
Last 7 days: 578.79M
This month: 2.14B
Expires: 03/26/2026 (8 days remaining)

Click to refresh
```

Example Chinese tooltip:

```text
[国内]
模型: MiniMax-M2.7
使用进度: 4% (169/4,500)
剩余时间: 15 分钟后重置
时间窗口: 15:00–20:00 (UTC+8)

周用量: 1% (1,860/157,500)
周重置: 4 天 4 小时后重置

=== Token 消耗统计 ===
昨日消耗: 0.83亿
近7天消耗: 5.79亿
当月消耗: 21.42亿
到期: 03/26/2026 (还剩 8 天)

点击刷新状态
```

### Color coding

| Color | Usage range | Meaning |
|------|----------|------|
| 🟢 Green | 0–59% | Normal usage |
| 🟡 Yellow | 60–84% | Pay attention to usage |
| 🔴 Red | 85%+ | Close to the limit |

### Commands

- `MiniMax Status: Configure` — open the settings panel
- `MiniMax Status: Refresh` — refresh MiniMax usage status

### Language

The extension supports `zh-CN` and `en-US`. If no language is explicitly configured, it follows the VS Code display language. You can change it in **Settings → MiniMax Status → Language**.

### Troubleshooting

**The status bar does not appear**

- Confirm that the extension is installed and enabled.
- Confirm that the correct Token Plan key is configured.
- Restart VS Code and check the **Output** panel for MiniMax Status messages.
- Check the network connection and the selected service region.

**Authentication or region error**

1. Confirm that the credential is a Token Plan key, not a regular API key.
2. Confirm that a domestic key is used with the domestic service and an overseas key with the overseas service.
3. If using Overseas only, leave the domestic key empty and select the matching display mode.
4. Save the settings and refresh the status bar.

**The model list cannot be loaded**

Check the key, region, network, and the MiniMax API response. The extension now distinguishes missing credentials from API authentication errors.

### Privacy

Credentials are stored in VS Code settings and are sent only to the selected MiniMax service endpoint to retrieve usage data. Do not share a key or commit it to a repository.

### Links

- [MiniMax Open Platform](https://platform.minimaxi.com/)
- [MiniMax International Platform](https://platform.minimax.io/)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)
- [Repository](https://github.com/JochenYang/minimax-status)

---

## 中文说明

### 功能特性

| 功能 | 说明 |
|------|------|
| **实时状态栏** | 显示剩余时间、当前用量百分比、周用量 |
| **智能颜色提示** | 使用率 60%/85% 分界变色（绿/黄/红） |
| **悬停详情** | 查看模型、用量、剩余时间、时间窗口 |
| **侧边栏入口** | 点击图标快速进入设置或查看帮助 |
| **国内/海外账号** | 支持国内版和国际版 MiniMax 服务 |
| **双语支持** | 中文/英文界面 |

### 快速开始

#### 1. 安装扩展

**方式一**：VS Code 扩展商店搜索 “MiniMax Status”。

**方式二**：手动安装 `.vsix` 文件。

#### 2. 配置认证

1. 点击左侧边栏的 MiniMax 图标。
2. 点击「插件设置」。
3. 填写对应区域的 **Token Plan Key**。设置页字段仍显示为 **API Key**，但必须使用 Token Plan Key。
4. 点击保存，然后点击状态栏刷新。

#### 3. 获取认证信息

| 信息 | 获取位置 |
|------|----------|
| 国内版 Token Plan Key | [platform.minimaxi.com](https://platform.minimaxi.com/) → 套餐管理 → Token-Plan |
| 国际版 Token Plan Key | [platform.minimax.io](https://platform.minimax.io/) → Subscribe → Token-Plan |

国内版和国际版域名不同，接口也分别使用：

- 国内版：`https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains`
- 国际版：`https://www.minimax.io/v1/api/openplatform/coding_plan/remains`

请勿将普通按量 API Key 当作 Token Plan Key 使用，也不要混用不同区域的 Key。

#### 4. 查看状态

配置完成后，状态栏显示：

**中文版：**

```text
⏱ 25m 4% · 周 1%
```

**English：**

```text
⏱ 25m 4% · W 1%
```

- `25m`：距离重置的剩余时间
- `4%`：当前配额百分比
- `W` / `周`：周用量百分比

### 界面预览

#### 状态栏

```text
⏱ 25m 4% · 周 1%  (中文版)
⏱ 25m 4% · W 1%   (English)
```

点击状态栏项目可以刷新状态。

#### Tooltip 详情

**中文版：**

```text
[国内]
模型: MiniMax-M2.7
使用进度: 4% (169/4,500)
剩余时间: 15 分钟后重置
时间窗口: 15:00–20:00 (UTC+8)

周用量: 1% (1,860/157,500)
周重置: 4 天 4 小时后重置

=== Token 消耗统计 ===
昨日消耗: 0.83亿
近7天消耗: 5.79亿
当月消耗: 21.42亿
到期: 03/26/2026 (还剩 8 天)

点击刷新状态
```

**English：**

```text
[Domestic]
Model: MiniMax-M2.7
Usage: 4% (169/4,500)
Remaining: 15 min until reset
Time Window: 15:00–20:00 (UTC+8)

Weekly: 1% (1,860/157,500)
Weekly Reset: 4d 4h until reset

=== Token Usage Stats ===
Yesterday: 83.40M
Last 7 days: 578.79M
This month: 2.14B
Expires: 03/26/2026 (8 days remaining)

Click to refresh
```

### 国内/海外显示模式

在「海外用量」中可以选择：

- **仅显示国内**：需要国内版 Key。
- **仅显示海外**：只需要海外版 Key，国内版 Key 可以留空。
- **国内 + 海外**：需要同时配置两个区域的 Key。

### 颜色编码

| 颜色 | 用量范围 | 状态 |
|------|----------|------|
| 🟢 绿色 | 0–59% | 正常使用 |
| 🟡 黄色 | 60–84% | 注意使用 |
| 🔴 红色 | 85%+ | 接近限额 |

### 常见问题

**Q: 状态栏不显示？**

请检查：

- 是否已正确配置对应区域的 Token Plan Key
- 扩展是否已激活（必要时重启 VS Code）
- 网络连接和服务区域是否正常
- VS Code 的 **输出** 面板中是否有 MiniMax Status 错误

**Q: 显示“需要配置”？**

1. 点击状态栏上的“需要配置”按钮。
2. 或点击左侧边栏 MiniMax 图标 →「插件设置」。
3. 如果使用纯海外模式，请选择“仅显示海外”并填写海外 Key，国内 Key 可以留空。

**Q: 显示认证或区域错误？**

请确认使用的是对应区域的 Token Plan Key，而不是普通 API Key；国内 Key 和国际版 Key 不能互换。

### 相关链接

- [MiniMax 国内开放平台](https://platform.minimaxi.com/)
- [MiniMax 国际开放平台](https://platform.minimax.io/)
- [VS Code 市场](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)
- [项目仓库](https://github.com/JochenYang/minimax-status)

---

> **隐私说明**：本扩展仅用于显示 MiniMax 使用状态。认证信息保存在本地 VS Code 设置中，仅发送到所选区域的 MiniMax 用量接口，不会提交到本项目或其他服务。请勿分享 API Key，也不要将其提交到代码仓库。

MIT License.
