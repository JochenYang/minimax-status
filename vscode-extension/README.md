# MiniMax Status - VS Code 扩展

MiniMax coding-plan 使用状态监控 VS Code 扩展，在底部状态栏实时显示你的使用额度。

## 功能特性

- ✅ **实时状态栏显示** - 在 VS Code 底部状态栏显示当前使用状态
- ✅ **多信息展示** - 显示目录、模型、使用率、剩余次数、上下文窗口
- ✅ **智能颜色提示** - 根据使用率自动变色（绿色/黄色/红色）
- ✅ **可配置设置** - 支持自定义刷新间隔和显示选项
- ✅ **悬停提示** - 鼠标悬停查看详细信息

## 安装扩展

### 手动安装 VSIX 文件

目前扩展尚未发布到 VS Code 市场，请按以下步骤手动安装：

#### 方法一：下载最新 VSIX 文件

1. 访问 [GitHub Releases 页面](https://github.com/JochenYang/minimax-status/releases)
2. 下载最新的 `.vsix` 文件（例如：`minimax-status-vscode-1.0.0.vsix`）
3. 在 VS Code 中按 `Ctrl+Shift+P`
4. 输入 "Extensions: Install from VSIX..."
5. 选择下载的 `.vsix` 文件

#### 方法二：从源码构建

1. 克隆本仓库：`git clone https://github.com/JochenYang/minimax-status.git`
2. 进入扩展目录：`cd vscode-extension`
3. 安装依赖：`npm install`
4. 打包扩展：`npm run package`
5. 在 VS Code 中安装生成的 `.vsix` 文件

## 快速开始

### 1. 配置认证信息

安装后，你需要配置 MiniMax 的访问令牌：

1. 使用命令 "MiniMax Status: 配置向导" 打开设置界面
2. 或点击状态栏的"需要配置"按钮

#### 必需配置

- **MiniMax API Key**: 你的 API 访问令牌
- **MiniMax GroupID**: 你的组 ID

#### 可选配置

- **刷新间隔**: 默认 30 秒（建议 10-30 秒）
- **显示提示**: 默认开启（鼠标悬停显示详细信息）

### 2. 获取认证信息

#### 获取 API Key

1. 访问 [MiniMax 开放平台](https://platform.minimaxi.com/user-center/payment/coding-plan)
2. 登录你的账户
3. 进入 "Coding Plan" 页面
4. 创建或获取 API Key

#### 获取 GroupID

1. 在用户中心或账户信息页面
2. 复制你的 **GroupID**

### 3. 查看状态栏

配置完成后，VS Code 底部状态栏将显示：

```
⏰ MiniMax-M2 8%
```

### 4. 鼠标悬停查看详情

将鼠标悬停在状态栏上，可查看详细的使用信息：

- 当前模型
- 使用进度
- 剩余时间
- 上下文窗口大小

## 状态说明

### 颜色编码

- 🟢 **绿色（< 60%）**: 正常使用
- 🟡 **黄色（60-85%）**: 注意使用
- 🔴 **红色（≥ 85%）**: 接近限制

### 状态图标

- ✓ 正常状态
- ⚡ 注意使用
- ⚠ 危险状态（即将达到限制）

## 显示信息说明

| 显示项     | 示例         | 说明                   |
| ---------- | ------------ | ---------------------- |
| 📁 目录    | `my-project` | 当前工作目录           |
| 🤖 模型    | `MiniMax-M2` | 当前使用的模型         |
| 使用率     | `40%`        | 已使用额度百分比       |
| ↻ 剩余次数 | `2690/4500`  | 剩余次数 / 总次数      |
| 上下文窗口 | `200K`       | 当前模型的上下文大小   |
| ⏱ 剩余时间 | `35m`        | 距离额度重置的剩余时间 |

## 常见问题

### Q: 状态栏不显示？

**A**: 请检查：

1. 是否已正确配置 Token 和 GroupId
2. 扩展是否已激活（重启 VS Code）
3. 网络连接是否正常

### Q: 显示 "未配置" 或 "错误"？

**A**:

1. 检查 Token 是否正确（应以 `sk-` 开头）
2. 检查 GroupId 是否正确
3. 确认 MiniMax 账户有足够的额度

### Q: 状态更新不及时？

**A**:

1. 调整设置中的 "刷新间隔"（建议 10-30 秒）
2. 重启 VS Code
3. 手动触发：按 `Ctrl+Shift+P` → 输入 "MiniMax Status: Refresh"

### Q: 如何卸载扩展？

**A**:

1. 按 `Ctrl+Shift+X` 打开扩展商店
2. 找到 "MiniMax Status"
3. 点击 "卸载"

## 设置选项

### 完整设置列表

在 VS Code 设置中搜索 "MiniMax Status"：

- **minimaxStatus.token**: MiniMax 访问令牌
- **minimaxStatus.groupId**: MiniMax Group ID
- **minimaxStatus.refreshInterval**: 刷新间隔（秒，范围 5-300）
- **minimaxStatus.showTooltip**: 是否显示详细提示信息（布尔值）

## 相关链接

- [MiniMax 开放平台](https://platform.minimaxi.com/)

---

**注意**: 本扩展仅用于显示 MiniMax Claude Code 使用状态，不存储或传输任何用户数据。认证信息仅保存在本地 VS Code 设置中。
