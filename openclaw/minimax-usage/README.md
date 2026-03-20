# MiniMax 使用量查询

查询 MiniMax Claude Code 订阅的使用量和历史消耗统计。

## 安装

直接告诉 OpenClaw：
```
从 https://github.com/JochenYang/minimax-status/tree/main/openclaw/minimax-usage 安装 skill
```

或者直接说："安装 MiniMax 使用量 skill"，AI 会读取 README 和代码自动安装。

## 认证配置

### 方式一：环境变量（推荐服务器使用）

```bash
export MINIMAX_TOKEN="你的token"
```

### 方式二：本地配置文件

在运行 `minimax-status` 的机器上运行：

```bash
minimax auth <token>
```

获取凭据：
1. 访问 [MiniMax 开放平台](https://platform.minimaxi.com/user-center/payment/coding-plan)
2. 登录后进入控制台
3. Coding Plan 中获取 API Key

## 使用

直接对 OpenClaw 说：

- "查看 MiniMax 使用量"
- "我还有多少额度"
- "这个月消耗了多少"
- "MiniMax 账单"

## 输出示例

```json
{
  "model": "MiniMax-M2",
  "timeWindow": { "start": "20:00", "end": "00:00", "timezone": "UTC+8" },
  "remaining": { "hours": 3, "minutes": 29, "text": "3 小时 29 分钟后重置" },
  "usage": { "used": 53, "remaining": 4447, "total": 4500, "percentage": 1 },
  "weekly": {
    "used": 20,
    "total": 4500,
    "percentage": 0,
    "days": 3,
    "hours": 12,
    "text": "3 天 12 小时后重置"
  },
  "expiry": { "date": "03/26/2026", "daysRemaining": 21, "text": "还剩 21 天" },
  "stats": {
    "lastDay": "1.3亿",
    "weekly": "6.3亿",
    "planTotal": "6.8亿"
  }
}
```

## 字段说明

| 字段 | 说明 |
|------|------|
| model | 当前使用的模型 |
| remaining | 下次重置剩余时间 |
| usage | 使用次数（已用/剩余/总数） |
| weekly | 周用量（已用/总数/百分比/重置时间） |
| expiry | 订阅到期时间 |
| stats.lastDay | 昨日 token 消耗 |
| stats.weekly | 近7天 token 消耗 |
| stats.planTotal | 套餐周期总消耗 |

## 问题排查

如果返回 "Missing credentials"，请确认已配置环境变量：
```bash
echo $MINIMAX_TOKEN
```
