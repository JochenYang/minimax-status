# MiniMax StatusBar

[![npm version](https://img.shields.io/npm/v/minimax-status.svg)](https://www.npmjs.com/package/minimax-status)
[![npm downloads](https://img.shields.io/npm/dm/minimax-status.svg)](https://www.npmjs.com/package/minimax-status)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VSCode Extension](https://img.shields.io/badge/VSCode-MiniMax-blue?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode)

MiniMax Token-Plan 使用状态监控工具，支持 CLI 命令和 Claude Code 状态栏集成。

## 版本

| 插件 | 版本 | 安装方式 |
|------|------|----------|
| **CLI** | 1.2.2 | `npm install -g minimax-status` |
| **VSCode** | 1.4.0 | [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=JochenYang.minimax-status-vscode) 或 [下载 VSIX](https://github.com/JochenYang/minimax-status/releases) |

## 特性

- ✅ **实时状态监控**: 显示 MiniMax Token-Plan 使用额度、剩余次数、重置时间
- ✅ **套餐卡 Tooltip**（VSCode 1.4.0+）: 5h 限额 / 周限额 / 视频赠送 / Hailuo / music / image / speech 各自独立卡片，跟官网一致
- ✅ **上下文窗口跟踪**: 智能解析转录文件，准确显示当前会话的上下文使用量
- ✅ **多种显示模式**: 详细模式、紧凑模式、持续状态栏
- ✅ **Claude Code 集成**: 可在 Claude Code 底部状态栏显示
- ✅ **智能颜色编码**: 根据使用率自动切换颜色和图标
- ✅ **跨会话支持**: 自动从项目历史中查找上下文信息
- ✅ **简洁命令**: `minimax status` 查看状态
- ✅ **安全存储**: 凭据存储在独立的配置文件中

> **注意**: 1.4.0 起，MiniMax 官方更新了用量接口（`/v1/token_plan/remains` → `/v1/api/openplatform/coding_plan/remains`）。本工具同步切换。海外端（`minimax.io`）也同步切换。

## 快速开始

### 1. 安装

```bash
npm install -g minimax-status
```

### 2. 更新(如果已经安装)

```bash
npm update -g minimax-status
```

### 3. 配置认证

```bash
minimax auth <token>
```

配置信息将保存在 `~/.minimax-config.json` 文件中。

> 自 1.2.6 起，CLI 不再需要 GroupId 配置 — 用量接口从 token JWT 自动解析 group_id。

获取令牌:

1. 访问 [MiniMax 开放平台](https://platform.minimaxi.com/user-center/payment/coding-plan)
2. 登录并进入控制台
3. Coding Plan 中创建或获取 API Key

### 4. 查看状态

```bash
# 详细模式
minimax status

# 紧凑模式
minimax status --compact

# 持续监控模式
minimax status --watch

# 所有模型
minimax list
```

## VSCode 扩展

提供 VSCode 扩展版本，支持在 VSCode 底部状态栏显示使用状态。

### 安装方式

**方式一：从 VSCode 市场安装（推荐）**

1. 在 VSCode 中搜索 "MiniMax Status"
2. 点击安装

**方式二：下载 VSIX 文件**

1. 访问 [GitHub Releases](https://github.com/JochenYang/minimax-status/releases)
2. 下载最新的 `.vsix` 文件
3. 在 VSCode 中按 `Ctrl+Shift+P`
4. 输入 "Extensions: Install from VSIX..."
5. 选择下载的 VSIX 文件

**方式二：从源码构建**

```bash
git clone https://github.com/JochenYang/minimax-status.git
cd minimax-status/vscode-extension
npm install
npm run package
# 在 VSCode 中安装生成的 .vsix 文件
```

### 配置步骤

1. 安装扩展后，点击状态栏的 "MiniMax 未配置" 按钮
2. 或使用命令 "MiniMax Status: 配置向导"
3. 输入您的 API Key
4. 配置完成后，状态栏将显示实时使用状态

## Claude Code 集成

将 MiniMax 使用状态显示在 Claude Code 底部状态栏。

### 配置步骤

1. **安装和配置工具**:

   ```bash
   npm install -g minimax-status
   minimax auth <token>
   ```

2. **配置 Claude Code**:

   编辑 `~/.claude/settings.json`:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "minimax statusline"
     }
   }
   ```

3. **重启 Claude Code**

集成成功后，底部状态栏将显示:

```
cli  main *  MiniMax-M3[1M][1m]  25% · 249.5k  5h 41% · W 6%  2h59m  剩291天
```

显示格式：`目录 ❯ 分支 ❯ 模型 ❯ 上下文窗口% · token ❯ 5h限额% · 周限额% ❯ 5h倒计时 ❯ 到期天数`

**字段说明**:

| 字段 | 示例 | 含义 |
|------|------|------|
| 目录 | `cli` | 当前工作目录（短名） |
| 分支 | `main *` | Git 分支 + 未提交状态（`*`） |
| 模型 | `MiniMax-M3[1M][1m]` | 实时模型名（从 stdin 读） |
| 上下文 | `25% · 249.5k` | 上下文窗口使用 % + token 用量 |
| 5h 限额 | `5h 41% · W 6%` | 5h 限额百分比 + 周限额百分比 |
| 倒计时 | `2h59m` | 5h 限额下次重置倒计时 |
| 到期 | `剩291天` | 套餐到期剩余天数 |

> 自 1.2.2 起，5h 限额 block **总是显示**（即使 `total=0`），并加 `5h` 前缀区分上下文窗口。`total=0` 时不显示 `(X/Y)` 段。

**颜色说明**:

- **使用量**: ≥85%红色 | 60-85%黄色 | <60%绿色
- **到期时间**: ≤3天红色 | ≤7天黄色 | >7天绿色

### Git 分支显示说明

状态栏会显示当前 Git 分支信息：

```
my-app │ main * │ ...
```

**符号说明**:

| 符号 | 含义 |
|------|------|
| * | 有未提交的更改 |

**颜色规则**:

| 元素 | 颜色 | 说明 |
|------|------|------|
| 主分支 (main/master) | 绿色 | 默认/主分支 |
| 其他分支 | 白色 | 普通功能分支 |
| ⬆ 未推送 | 黄色 | 有待推送的 commit |
| ⬇ 未拉取 | 青色 | 有待拉取的 commit |
| • 未提交 | 红色 | 工作区有未提交的更改 |

### 上下文窗口显示说明

状态栏会智能显示当前会话的上下文窗口使用情况：

- **有转录数据时**: 显示 `百分比 · 已用 tokens`（蓝色块）
  - 例如: `25% · 249.5k` 表示已使用 249.5K tokens，占上下文窗口的 25%

- **无转录数据时**: 仅显示上下文窗口总容量
  - 例如: `205K` 表示当前模型的上下文窗口大小

> 自 1.2.2 起，5h 限额独立显示在 `5h 41%` block（带 `5h` 前缀区分上下文窗口百分比）。

**智能特性**:

- ✅ 自动解析 Claude Code 转录文件（transcript）
- ✅ 支持 Anthropic 和 OpenAI 两种 token 格式
- ✅ 正确计算缓存 tokens（cache creation + cache read）
- ✅ 跨会话查找：当前会话无数据时，自动从项目历史中查找
- ✅ 处理 summary 类型条目和 leafUuid 引用

**注意**: MiniMax 的配置独立存储在 `~/.minimax-config.json`，与 Claude Code 的配置分离。

## Droid 集成

将 MiniMax 使用状态显示在 Droid 底部状态栏。

### 配置步骤

1. **安装和配置工具**:

   ```bash
   npm install -g minimax-status
   minimax auth <token>
   ```

2. **配置 Droid**:

   编辑 `~/.factory/settings.json`:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "minimax droid-statusline"
     }
   }
   ```

3. **重启 Droid**

集成成功后，底部状态栏将显示:

```
cli  main *  MiniMax-M3[1M][1m]  25% · 249.5k  5h 41% · W 6%  2h59m  剩291天
```

显示格式：`目录 ❯ 分支 ❯ 模型 ❯ 上下文窗口% · token ❯ 5h限额% · 周限额% ❯ 5h倒计时 ❯ 到期天数`

**颜色说明**:

- **使用量**: ≥85%红色 | 60-85%黄色 | <60%绿色
- **到期时间**: ≤3天红色 | ≤7天黄色 | >7天绿色

## 显示示例

### 详细模式

```
┌──────────────────────────────────────────────────────┐
│ MiniMax Claude Code 使用状态                        │
│                                                      │
│ 剩余时间: 3 小时 17 分钟后重置                        │
│                                                      │
│ 已用额度: █████████░░░░░░░░░░░░░░░░░░ 33%          │
│                                                      │
│ 周限额: ░░░░░░░░░░░░░░░ 5%                            │
│      重置: 6 天 12 小时后重置                         │
│ 套餐到期: 03/19/2027 (还剩 291 天)                    │
│                                                      │
│ Token 消耗统计                                      │
│  昨日消耗: 766.3万                                  │
│  近7天消耗: 1039.9万                                │
│  当月消耗: 0                                         │
│                                                      │
│ 所有模型额度                                        │
│   general     33%   —             OK               │
│   video       0%   0/3           OK               │
│   ...                                            │
│                                                      │
│ 状态: 正常使用                                     │
└──────────────────────────────────────────────────────┘
```

> 自 1.2.2 起：移除"当前模型"和"时间窗口"行（冗余信息），去除 emoji（`📊` `📋` `✓` `⚡` `⛔`），`total=0` 时不显示 `(X/Y)` 段。

### 紧凑模式

```
general 33% 3h17m W 5% 剩291天
```

> 紧凑模式直接调用 `minimax status --compact`。字段顺序：`已用% 倒计时 周限额% 剩N天`。
```

### 持续状态栏模式

```
OK MiniMax 状态栏已启动
按 Ctrl+C 退出

[general 27% 1h26m W 5%
```

## 截图演示

### Claude Code 集成

![Claude Code StatusBar](./images/claude%20code.png)

### Droid 集成

![Droid StatusBar](./images/droid.png)

## 命令说明

| 命令                    | 描述                                        | 示例                        |
| --------------------- | ------------------------------------------- | ----------------------------- |
| `minimax auth`        | 设置认证凭据（只需要 token，不需要 groupId）     | `minimax auth <token>`         |
| `minimax status`      | 显示当前使用状态（支持 --compact、--watch） | `minimax status`                 |
| `minimax list`        | 列出所有模型用量                              | `minimax list`                    |
| `minimax health`      | 检查配置和连接状态                            | `minimax health`                  |
| `minimax bar`         | 终端底部持续状态栏                          | `minimax bar`                    |
| `minimax statusline`  | Claude Code 状态栏集成                      | 用于 Claude Code 配置            |
| `minimax droid-statusline` | Droid 状态栏集成                      | 用于 Droid 配置            |

## 状态说明

### 显示元素

| 元素   | 说明                               |
| ------ | ---------------------------------- |
| 目录   | 当前工作目录                       |
| 分支   | Git 分支名称（含未提交状态）       |
| 模型   | MiniMax 模型名称（实时）          |
| 上下文 | 上下文窗口使用 % + tokens          |
| 5h 限额 | 5h 限额使用 %（即使 total=0 也显示）|
| 周限额 | 周配额使用情况，∞ 表示无限制       |
| 倒计时 | 5h 限额重置倒计时                   |
| 到期   | 订阅到期时间（颜色动态变化）        |

### 颜色规则

| 场景          | 颜色 | 说明     |
| ------------- | ---- | -------- |
| 5h 限额 ≥85%  | 红色 | 危险状态 |
| 5h 限额 60-85% | 黄色 | 注意使用 |
| 5h 限额 <60%  | 绿色 | 正常使用 |
| 上下文 ≥85%   | 红色 | 危险状态 |
| 上下文 60-85% | 黄色 | 注意使用 |
| 上下文 <60%   | 绿色 | 正常使用 |
| 到期 ≤ 3天    | 红色 | 即将到期 |
| 到期 ≤ 7天    | 黄色 | 即将到期 |
| 到期 > 7天    | 绿色 | 订阅正常 |

## VSCode 扩展说明

自 1.4.0 起，VSCode 扩展 Tooltip 改用**套餐卡**布局（跟官网 platform.minimaxi.com/console/usage 一致），不再用统一表格。

### 套餐卡布局

每张套餐独立卡片：

```
MINIMAX · 配额面板            周期: 2026-06-01 — 2026-06-07
─────────────────────────────────────────

▍ 5h 限额  ·  4h 12m 后重置
▰▰▰░░░░░░░░░░░░░  18%

▍ 周限额  ·  6天 12h 后重置
▰░░░░░░░░░░░░░░░  3%

▍ 视频赠送  ·  13h 18m 后重置
░░░░░░░░░░░░░░░░  0%  0/3

─────────────────────────────────────────
Token 消耗
昨日消耗    近 7 天    当月消耗
766.3万     1039.9万   0
─────────────────────────────────────────
到期 291天 · 更新于 11:09:40 · 点击刷新
```

> **进度条字符** `▰` `▱` (U+25B0 / U+25B1)：在中文 fallback 字体（Microsoft YaHei）下渲染为斜方块纹理。在 Cascadia Code / Consolas 等宽字体下渲染为实心方块。

### 套餐卡字段

| 套餐 | 数据来源 | 示例 |
|------|----------|------|
| 5h 限额 | `general` 模型 `current_interval_*` | `▰▰▰░░░ 18%` |
| 周限额 | `general` 模型 `current_weekly_*` | `▰░░░░░ 3%` |
| 视频赠送 | `video` 模型 `current_interval_*` | `░░░░░░ 0% 0/3` |
| Hailuo | `Hailuo-*` 模型 | `▰▰░░░░░ 33% 1/3` |
| music | `music-*` 模型 | `░░░░░░ 0% 0/10` |
| image | `image-*` 模型 | `░░░░░░ 0% 0/20` |
| speech | `speech-*` 模型 | `░░░░░░ 0% 0/100` |

> **多模型数据过滤规则**：保留有 `remaining_percent` 数据的模型（即使 `total=0`）。`status != 1` 的模型视为废弃，不显示。

### 已知限制：积分余额不在 VSCode 中显示

MiniMax 官方积分余额接口（`/backend/account/token_plan_credit`）**仅支持 Cookie 鉴权**：

- ✅ 浏览器（带 Cookie）：能调通
- ❌ VSCode 扩展（纯后端 Bearer sk-cp-...）：401 not login

如需查看积分余额，请前往 [platform.minimaxi.com/console/usage](https://platform.minimaxi.com/console/usage)。本工具**未实现**积分余额的本地展示，**因为**让用户在 VSCode 设置里手动粘贴 Cookie 字符串得不偿失。

## 配置文件

### 默认位置

- 独立配置文件: `~/.minimax-config.json`

### 配置示例

```json
{
  "token": "your_access_token_here"
}
```

### Claude Code 配置

Claude Code 只需要配置状态栏命令：

```json
// ~/.claude/settings.json
{
  "statusLine": {
    "type": "command",
    "command": "minimax statusline"
  }
}
```

### 安全说明

凭据仅存储在本地，不会上传到任何服务器。

## 故障排除

### 命令未找到

```bash
# 确保已全局安装
npm install -g minimax-status

# 重新打开终端
```

### 认证失败

```bash
# 检查令牌
minimax status

# 重新设置认证
minimax auth <new_token>
```

### 状态栏不显示

1. 检查 Claude Code 配置
2. 重启 Claude Code
3. 手动测试: `minimax statusline`

## 开发

### 构建项目

```bash
git clone <repository>
cd minimax-status
npm install
```

### 测试

```bash
# 运行示例
node cli/example.js

# 测试 CLI 命令
node cli/index.js status
```

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 贡献

欢迎提交 Issue 和 Pull Request！

## 导航

| 客户端 | 路径 | 说明 |
|--------|------|------|
| **CLI** | [`cli/`](cli/) | 命令行工具，npm 全局包 |
| **VSCode** | [`vscode-extension/`](vscode-extension/) | VSCode 状态栏集成 |

---

## 相关链接

- [MiniMax 开放平台](https://platform.minimaxi.com/)

---

**注意**: 本工具仅用于监控 MiniMax Token-Plan 用量使用状态，不存储或传输任何用户数据。
