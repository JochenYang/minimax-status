# MiniMax StatusBar

[![npm version](https://img.shields.io/npm/v/minimax-status.svg)](https://www.npmjs.com/package/minimax-status)
[![npm downloads](https://img.shields.io/npm/dm/minimax-status.svg)](https://www.npmjs.com/package/minimax-status)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VSCode Extension](https://img.shields.io/badge/VSCode-MiniMax-blue?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)

MiniMax Token-Plan 用量监控工具，支持 CLI 和 Claude Code / Droid 状态栏集成。

## 版本

| 插件       | 版本  | 安装方式                                                                                                   |
|------------|-------|------------------------------------------------------------------------------------------------------------|
| **CLI**    | 1.2.6 | `npm install -g minimax-status`                                                                            |
| **VSCode** | 1.5.2 | [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode) |

## 特性

- ✅ **套餐卡显示**（VSCode Tooltip）— 5h 限额 / 周限额 / 视频赠送 / Hailuo / music / image / speech 各自独立卡片，跟官网 platform.minimaxi.com/console/usage 一致
- ✅ **剩余%语义**（VSCode 1.5.0+ / CLI 1.2.5+）— 所有显示都按"剩余%"，避免歧义（剩得多绿、剩得少红）
- ✅ **Claude Code / Droid 集成** — 状态栏实时显示用量，powerline 风格
- ✅ **CLI 多种模式** — 详细 / 紧凑 / 持续监控
- ✅ **上下文窗口跟踪** — Claude Code 实时上下文用量
- ✅ **Token 消耗统计** — 昨日 / 近 7 天 / 当月

> 自 VSCode 1.5.0 / CLI 1.2.5 起，所有用量数据按"剩余%"显示，跟 MiniMax 官方 platform.minimaxi.com/console/usage 平台一致。

## 快速开始

### 1. 安装

```bash
npm install -g minimax-status
```

### 2. 更新（已安装用户）

```bash
npm update -g minimax-status
```

### 3. 配置认证

```bash
minimax auth <token>
```

配置信息保存在 `~/.minimax-config.json`。自 1.2.6 起 CLI 不需要 GroupId（用量接口从 token JWT 自动解析）。

获取令牌：访问 [MiniMax 开放平台](https://platform.minimaxi.com/console/plan) → 套餐详情 → 创建或获取复制 API Key。

### 4. 查看状态

```bash
minimax status                # 详细模式
minimax status --compact      # 紧凑模式
minimax status --watch        # 持续监控
minimax list                  # 所有模型
minimax health                # 配置和连接检查
```

## Claude Code 集成

编辑 `~/.claude/settings.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "minimax statusline"
  }
}
```

重启 Claude Code 后，状态栏会显示：

```
cli  main *  MiniMax-M3[1M]  25% · 249.5k  5h 41% · W 94%  2h59m  剩291天
```

字段说明：

| 字段               | 示例                                | 含义                                                      |
|--------------------|-------------------------------------|-----------------------------------------------------------|
| 目录 / 分支 / 模型 | `cli` / `main *` / `MiniMax-M3[1M]` | 工作目录 / Git 分支 / 实时模型                            |
| 上下文             | `25% · 249.5k`                      | 当前会话上下文使用 % + token 数                           |
| 5h 剩余            | `5h 41% · W 94%`                    | 5h 限额剩余 % + 周限额剩余 %（绿色 = 充裕，红色 = 即将用完） |
| 倒计时             | `2h59m`                             | 5h 限额重置倒计时                                         |
| 到期               | `剩291天`                           | 套餐到期剩余天数                                          |

## Droid 集成

跟 Claude Code 一样，编辑 `~/.factory/settings.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "minimax droid-statusline"
  }
}
```

## VSCode 扩展

### 安装

- 扩展市场搜索 "MiniMax Status" 一键安装
- 或下载 `.vsix`：[GitHub Releases](https://github.com/JochenYang/minimax-status/releases)

### Tooltip 套餐卡布局

VSCode 扩展 hover 时显示套餐卡（每套餐独立卡片）：

```
MINIMAX · 配额面板            周期: 2026-06-01 — 2026-06-07

▍ 5h 剩余  ·  4h 12m 后重置
▰▰▰░░░░░░░░░░░░░  18%

▍ 周剩余  ·  6天 12h 后重置
▰░░░░░░░░░░░░░░░  94%

▍ 视频赠送  ·  13h 18m 后重置
░░░░░░░░░░░░░░░░  100%  3/3 剩余

─────────
Token 消耗
昨日消耗    近 7 天    当月消耗
766.3万     1039.9万   0
─────────
到期 291天 · 更新于 11:09:40 · 点击刷新
```

字段说明：

- **套餐标签**（行 1）：套餐名 + `X/Y 剩余`（总配额和剩余次数）+ 重置时间
- **进度条 + 百分比**（行 2）：按"剩余%"显示（剩 ≥60% 绿、剩 30-60% 橙、剩 <30% 红）
- 套餐类型：5h 限额 / 周限额 / 视频赠送 / Hailuo / music / image / speech

### VSCode 状态栏

`5h 5% · 周剩 94% · 剩291天` — 5h 已用% + 周剩余% + 套餐到期天数。

## CLI 显示示例

### 详细模式

```
┌──────────────────────────────────────────────────────┐
│ MiniMax Claude Code 使用状态                        │
│                                                      │
│ 剩余时间: 4 小时 48 分钟后重置                        │
│                                                      │
│ 5h 剩余: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 97%          │
│                                                      │
│ 周剩余: ░░░░░░░░░░░░░░░ 100% · 5天 23小时后重置      │
│                                                      │
│ 套餐到期: 03/19/2027 (还剩 290 天)                    │
│                                                      │
│ Token 消耗统计                                      │
│  昨日消耗: 0                                         │
│  近7天消耗: 1039.9万                                │
│  当月消耗: 0                                         │
│                                                      │
│ 所有模型额度                                        │
│   general     98%   —             OK               │
│   video       100%  3/3           OK               │
│                                                      │
│ 状态: 正常使用                                     │
└──────────────────────────────────────────────────────┘
```

- 5h 限额 / 周限额 全部按"剩余%"显示（跟平台官网一致）
- 视频赠送等小额度套餐：`3/3 剩余`（剩余 3 / 总额 3）

### 紧凑模式

```
general 98% 4h48m W 100% 剩290天
```

### 持续监控

```
OK MiniMax 状态栏已启动
按 Ctrl+C 退出

general 27% 1h26m W 5%
```

## 命令说明

| 命令                       | 描述                                           |
|----------------------------|------------------------------------------------|
| `minimax auth <token>`     | 设置认证凭据（只需要 token）                     |
| `minimax status`           | 显示详细使用状态（支持 `--compact` / `--watch`） |
| `minimax list`             | 列出所有模型用量                               |
| `minimax health`           | 检查配置和连接（配置文件、Token、API 连接）        |
| `minimax bar`              | 终端底部持续状态栏                             |
| `minimax statusline`       | Claude Code 状态栏集成                         |
| `minimax droid-statusline` | Droid 状态栏集成                               |

## 颜色规则

CLI 端按"剩余%"判断颜色（剩 ≥60% 绿、剩 30-60% 橙、剩 <30% 红），跟 platform.minimaxi.com/console/usage 平台一致。

VSCode 状态栏按"已用%"判断（已用 <60% 绿、<85% 橙、≥85% 红），符合"用得少=充裕"直觉。

## 已知限制

**积分余额（充值/赠送）**不在本工具中显示。MiniMax 官方积分接口（`/backend/account/token_plan_credit`）仅支持 Cookie 鉴权，纯后端工具（VSCode 扩展 / CLI）无法调用。如需查看请前往 [platform.minimaxi.com](https://platform.minimaxi.com/console/usage)。

## 故障排除

**状态栏不显示**：检查 Claude Code / Droid 配置 → 重启 → 手动测试 `minimax statusline`

**认证失败**：`minimax status` 看错误信息 → `minimax auth <new_token>` 重新设置

**命令未找到**：`npm install -g minimax-status` 重装

## 许可证

MIT - 详见 [LICENSE](LICENSE) 文件
