---
name: minimax-usage
version: 1.0.0
author: Jochen
description: 查询 MiniMax Claude Code 使用量和历史消耗统计
triggers:
  - 使用量
  - 消耗
  - 剩余
  - 额度
  - 账单
  - 历史
  - minimax
  - MiniMax
capabilities:
  - id: get-usage
    description: 获取当前使用量和剩余额度
  - id: get-history
    description: 获取历史消耗统计
---

# MiniMax 使用量查询

查询 MiniMax Claude Code 订阅的使用量和历史消耗记录。

## 功能

1. **当前使用量**：查看剩余额度、已用次数、使用百分比、重置时间
2. **周用量**：查看本周使用量、百分比、重置时间（每周日重置）
3. **历史消耗**：查看昨日消耗、近7天消耗、套餐总消耗

## 使用方式

### 方式一：使用 CLI 命令（推荐）

```bash
# 紧凑模式输出
minimax status --compact

# 完整模式输出（包含历史统计）
minimax status
```

### 方式二：使用 JSON 脚本（程序化调用）

```bash
node /path/to/openclaw/minimax-usage/scripts/get-usage.js
```

## 脚本输出格式

JSON 格式返回以下字段：

- `model`: 当前模型名称
- `timeWindow`: 时间窗口（开始时间、结束时间、时区）
- `remaining`: 剩余时间（小时、分钟、文本描述）
- `usage`: 使用量（已用、剩余、总数、百分比）
- `weekly`: 周用量（已用、总数、百分比、天数、小时、重置时间）
- `contextWindow`: 上下文窗口信息
- `expiry`: 到期信息（日期、剩余天数、文本）
- `stats`: 历史统计（昨日、近7天、套餐总消耗）

## 输出说明

- **剩余额度**：当前周期剩余的调用次数
- **使用百分比**：已使用次数占总次数的比例
- **重置时间**：当前周期重置的倒计时
- **周用量**：本周已用次数、百分比、重置倒计时（每周日重置）
- **昨日消耗**：昨日 0 点到现在的 token 消耗
- **近7天**：最近 7 天的 token 消耗总量
- **套餐总消耗**：当前订阅周期的 token 消耗总量

## 认证配置

如果 OpenClaw 运行在远程服务器上，需要通过环境变量传递认证信息：

```bash
# 在运行 OpenClaw 的服务器上设置环境变量
export MINIMAX_TOKEN="your_token_here"
```

或者在启动 OpenClaw 时传入：

```bash
MINIMAX_TOKEN=xxx openclaw
```

获取凭据方法：查看本地 `~/.minimax-config.json` 文件
