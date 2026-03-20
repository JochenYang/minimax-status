#!/usr/bin/env node

/**
 * MiniMax 使用量查询脚本
 * 独立运行，不依赖外部模块
 *
 * 使用方式：
 *   node get-usage.js
 *
 * 环境变量（服务器场景）：
 *   MINIMAX_TOKEN=xxx node get-usage.js
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

// ============ 配置 ============
const CONFIG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".minimax-config.json"
);

// ============ HTTP 请求封装 ============
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ============ MiniMax API ============
class MinimaxAPI {
  constructor() {
    this.token = null;
    this.loadConfig();
  }

  loadConfig() {
    // 1. 优先使用环境变量
    if (process.env.MINIMAX_TOKEN) {
      this.token = process.env.MINIMAX_TOKEN;
      return;
    }

    // 2. 回退到本地配置文件
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
        this.token = config.token;
      }
    } catch (e) {
      // 忽略错误
    }
  }

  async getUsageStatus() {
    if (!this.token) {
      throw new Error("Missing token. Set MINIMAX_TOKEN env var, or run 'minimax auth' locally");
    }

    const url = `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains`;
    const data = await request(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json"
      }
    });
    return data;
  }

  async getSubscriptionDetails() {
    if (!this.token) return null;

    const url = `https://www.minimaxi.com/v1/api/openplatform/charge/combo/cycle_audio_resource_package?biz_line=2&cycle_type=1&resource_package_type=7`;
    try {
      return await request(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json"
        }
      });
    } catch (e) {
      return null;
    }
  }

  async getBillingRecords(page = 1, limit = 100) {
    if (!this.token) {
      throw new Error("Missing token");
    }

    const url = `https://www.minimaxi.com/account/amount?page=${page}&limit=${limit}&aggregate=false`;
    return await request(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json"
      }
    });
  }

  async getAllBillingRecords(maxPages = 100, minStartTime = 0) {
    const allRecords = [];
    for (let page = 1; page <= maxPages; page++) {
      try {
        const response = await this.getBillingRecords(page, 100);
        const records = response.charge_records || [];
        if (records.length === 0) break;
        allRecords.push(...records);
        // 如果传入了时间范围，检查是否需要继续获取
        if (minStartTime > 0) {
          const lastRecord = records[records.length - 1];
          const lastRecordTime = (lastRecord.created_at || 0) * 1000;
          if (lastRecordTime < minStartTime) {
            break;
          }
        }
        if (records.length < 100) break;
      } catch (e) {
        break;
      }
    }
    return allRecords;
  }

  formatNumber(num) {
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    }
    return num.toLocaleString("zh-CN");
  }

  parseUsageData(apiData, subscriptionData) {
    if (!apiData.model_remains || apiData.model_remains.length === 0) {
      throw new Error("No usage data available");
    }

    const modelData = apiData.model_remains[0];
    const startTime = new Date(modelData.start_time);
    const endTime = new Date(modelData.end_time);

    const remainingCount = modelData.current_interval_usage_count;
    const usedCount = modelData.current_interval_total_count - remainingCount;
    const usedPercentage = Math.round((usedCount / modelData.current_interval_total_count) * 100);

    const remainingMs = modelData.remains_time;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    // 周用量
    const weeklyUsed = modelData.current_weekly_total_count - modelData.current_weekly_usage_count;
    const weeklyTotal = modelData.current_weekly_total_count;
    const weeklyPercentage = Math.floor((weeklyUsed / weeklyTotal) * 100);
    const weeklyRemainingMs = modelData.weekly_remains_time;
    const weeklyDays = Math.floor(weeklyRemainingMs / (1000 * 60 * 60 * 24));
    const weeklyHours = Math.floor((weeklyRemainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let expiryInfo = null;
    if (subscriptionData?.current_subscribe?.current_subscribe_end_time) {
      const expiryDate = subscriptionData.current_subscribe.current_subscribe_end_time;
      const expiry = new Date(expiryDate);
      const now = new Date();
      const daysDiff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 3600 * 24));
      expiryInfo = {
        date: expiryDate,
        daysRemaining: daysDiff,
        text: daysDiff > 0 ? `还剩 ${daysDiff} 天` : daysDiff === 0 ? "今天到期" : `已过期 ${Math.abs(daysDiff)} 天`
      };
    }

    return {
      modelName: modelData.model_name,
      timeWindow: {
        start: startTime.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai", hour12: false }),
        end: endTime.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai", hour12: false }),
        timezone: "UTC+8"
      },
      remaining: { hours, minutes, text: hours > 0 ? `${hours} 小时 ${minutes} 分钟后重置` : `${minutes} 分钟后重置` },
      usage: { used: usedCount, remaining: remainingCount, total: modelData.current_interval_total_count, percentage: usedPercentage },
      weekly: {
        used: weeklyUsed,
        total: weeklyTotal,
        percentage: weeklyPercentage,
        days: weeklyDays,
        hours: weeklyHours,
        text: weeklyDays > 0 ? `${weeklyDays} 天 ${weeklyHours} 小时后重置` : `${weeklyHours} 小时后重置`
      },
      contextWindow: { total: 200000, used: 0, percentage: 0, totalFormatted: "200K", usedFormatted: "0K" },
      expiry: expiryInfo
    };
  }

  calculateUsageStats(records, planStartTime, planEndTime) {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const stats = { lastDayUsage: 0, weeklyUsage: 0, planTotalUsage: 0 };

    for (const record of records) {
      const tokens = parseInt(record.consume_token, 10) || 0;
      const createdAt = (record.created_at || 0) * 1000;

      if (createdAt >= yesterdayStart && createdAt < todayStart) {
        stats.lastDayUsage += tokens;
      }
      if (createdAt >= weekAgo) {
        stats.weeklyUsage += tokens;
      }
      if (createdAt >= planStartTime && createdAt <= planEndTime) {
        stats.planTotalUsage += tokens;
      }
    }

    return stats;
  }
}

// ============ 主程序 ============
async function main() {
  const api = new MinimaxAPI();

  try {
    const [apiData, subscriptionData] = await Promise.all([
      api.getUsageStatus(),
      api.getSubscriptionDetails()
    ]);
    const usageData = api.parseUsageData(apiData, subscriptionData);

    let usageStats = null;
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime();
      const billingRecords = await api.getAllBillingRecords(100, monthStart);
      if (billingRecords.length > 0) {
        usageStats = api.calculateUsageStats(billingRecords, monthStart, now.getTime());
      }
    } catch (e) {
      // 忽略账单错误
    }

    const result = {
      model: usageData.modelName,
      timeWindow: usageData.timeWindow,
      remaining: usageData.remaining,
      usage: usageData.usage,
      weekly: usageData.weekly,
      contextWindow: usageData.contextWindow,
      expiry: usageData.expiry,
      stats: usageStats ? {
        lastDay: usageStats.lastDayUsage,
        lastDayFormatted: api.formatNumber(usageStats.lastDayUsage),
        weekly: usageStats.weeklyUsage,
        weeklyFormatted: api.formatNumber(usageStats.weeklyUsage),
        planTotal: usageStats.planTotalUsage,
        planTotalFormatted: api.formatNumber(usageStats.planTotalUsage)
      } : null
    };

    // 人类可读摘要
    const usagePct = usageData.usage.percentage;
    const weeklyPct = usageData.weekly.percentage;
    const usageBar = '█'.repeat(Math.floor(usagePct / 10)) + '░'.repeat(10 - Math.floor(usagePct / 10));
    const weeklyBar = '█'.repeat(Math.floor(weeklyPct / 10)) + '░'.repeat(10 - Math.floor(weeklyPct / 10));

    console.log(`\n[MiniMax Usage]`);
    console.log(`  Current:   [${usageBar}] ${usagePct}% (${usageData.usage.used}/${usageData.usage.total})`);
    console.log(`  Reset:     ${usageData.remaining.text}`);
    console.log(`  Weekly:    [${weeklyBar}] ${weeklyPct}% (${api.formatNumber(usageData.weekly.used)})`);
    console.log(`  W-Reset:   ${usageData.weekly.text}`);
    if (usageData.expiry) {
      console.log(`  Expiry:    ${usageData.expiry.text} (${usageData.expiry.date})`);
    }
    if (result.stats) {
      console.log(`\n[Token Stats]`);
      console.log(`  Yesterday: ${result.stats.lastDayFormatted}`);
      console.log(`  7-Days:   ${result.stats.weeklyFormatted}`);
      if (result.stats.planTotalFormatted !== '0') {
        console.log(`  This Month: ${result.stats.planTotalFormatted}`);
      }
    }
    console.log(`\n--- JSON ---`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`❌ 错误: ${error.message}`);
    process.exit(1);
  }
}

main();
