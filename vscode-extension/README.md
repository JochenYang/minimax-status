# MiniMax Status

在 VS Code 状态栏实时显示 MiniMax Coding Plan 使用状态。

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)
[![Version](https://img.shields.io/badge/version-1.2.5-green?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **实时状态栏** | 显示剩余时间、当前用量百分比、周用量 |
| **智能颜色提示** | 使用率 60%/85% 分界变色（绿/黄/红） |
| **悬停详情** | 查看模型、用量、剩余时间、时间窗口 |
| **侧边栏入口** | 点击图标快速进入设置或查看帮助 |
| **双语支持** | 中文/英文界面 |

---

## 快速开始

### 1. 安装扩展

**方式一**：VS Code 扩展商店搜索 "MiniMax Status"

**方式二**：手动安装 `.vsix` 文件

### 2. 配置认证

1. 点击左侧边栏的 MiniMax 图标
2. 点击「插件设置」
3. 填写 **Group ID** 和 **API Key**

### 3. 获取认证信息

| 信息 | 获取位置 |
|------|----------|
| Group ID | 账户信息 / Your Profile |
| API Key | 套餐管理 → Coding Plan / Subscribe → Coding Plan |

### 4. 查看状态

配置完成后，状态栏显示：

**中文版：**
```
⏱ 25m 4% · 周 1%
```

**English:**
```
⏱ 25m 4% · W 1%
```

- `25m` - 距离重置的剩余时间
- `4%` - 当前窗口用量百分比
- `W` / `周` - 周用量百分比

---

## 界面预览

### 状态栏

```
⏱ 25m 4% · 周 1%   (中文版)
⏱ 25m 4% · W 1%   (English)
```

### Tooltip 详情

**中文版：**
```
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

**English:**
```
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

---

## 颜色编码

| 颜色 | 用量范围 | 状态 |
|------|----------|------|
| 🟢 绿色 | 0-59% | 正常使用 |
| 🟡 黄色 | 60-84% | 注意使用 |
| 🔴 红色 | 85%+ | 接近限额 |

---

## 常见问题

**Q: 状态栏不显示？**

请检查：
- 是否已正确配置 Group ID 和 API Key
- 扩展是否已激活（重启 VS Code）
- 网络连接是否正常

**Q: 显示 "需要配置"？**

1. 点击状态栏上的 "需要配置" 按钮
2. 或点击左侧边栏 MiniMax 图标 → 「插件设置」

---

## 相关链接

- [MiniMax 开放平台](https://platform.minimaxi.com/)
- [VS Code 市场](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)

---

> **隐私说明**：本扩展仅用于显示 MiniMax 使用状态，不存储或传输用户数据。认证信息保存在本地设置中。
