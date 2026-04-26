const axios = require("axios");
const https = require("https");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk").default;
const { getContextWindowSize, getDefaultContextWindowSize } = require('./model-context-sizes');

// 创建 HTTPS Agent 配置
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 10000,
  servername: 'minimaxi.com'
});

class MinimaxAPI {
  constructor() {
    this.token = null;
    this.groupId = null;
    this.configPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      ".minimax-config.json"
    );
    this.cache = {
      data: null,
      timestamp: 0,
    };
    this.cacheTimeout = 8000; // 8秒缓存
    this.loadConfig();
  }

  loadConfig() {
    try {
      // 只从独立的 config 文件读取
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
        this.token = config.token;
        this.groupId = config.groupId;
      }
    } catch (error) {
      console.error("Failed to load config:", error.message);
    }
  }

  saveConfig() {
    try {
      // 保存到独立的 config 文件
      const config = {
        token: this.token,
        groupId: this.groupId,
      };
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error.message);
    }
  }

  setCredentials(token, groupId) {
    this.token = token;
    this.groupId = groupId;
    this.saveConfig();
  }

  async getUsageStatus(forceRefresh = false) {
    if (!this.token) {
      throw new Error(
        'Missing credentials. Please run "minimax-status auth <token>" first'
      );
    }

    // 检查缓存
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cache.data &&
      now - this.cache.timestamp < this.cacheTimeout
    ) {
      return this.cache.data;
    }

    try {
      const response = await axios.get(
        `https://www.minimaxi.com/v1/token_plan/remains`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          timeout: 10000, // 10秒超时
          httpsAgent, // 添加 HTTPS Agent 配置
        }
      );

      // 更新缓存
      this.cache.data = response.data;
      this.cache.timestamp = now;

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error(
          "Invalid token or unauthorized. Please check your credentials."
        );
      } else if (error.code === "ECONNABORTED") {
        throw new Error(
          "Request timeout. Please check your network connection."
        );
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        throw new Error(
          "Network error. Please check your internet connection."
        );
      }
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  async getSubscriptionDetails() {
    try {
      const response = await axios.get(
        `https://www.minimaxi.com/v1/api/openplatform/charge/combo/cycle_audio_resource_package`,
        {
          params: {
            biz_line: 2,
            cycle_type: 1,
            resource_package_type: 7,
          },
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          timeout: 10000,
          httpsAgent, // 添加 HTTPS Agent 配置
        }
      );

      return response.data;
    } catch (error) {
      // 如果订阅 API 失败，静默返回 null
      return null;
    }
  }

  /**
   * Get billing records from the account/amount API
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page (max 100)
   * @returns {Promise<Object>} Billing records response
   */
  async getBillingRecords(page = 1, limit = 100) {
    try {
      const response = await axios.get(
        `https://www.minimaxi.com/account/amount`,
        {
          params: {
            page: page,
            limit: limit,
            aggregate: false,
          },
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          timeout: 10000,
          httpsAgent,
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`账单 API 请求失败: ${error.message}`);
    }
  }

  /**
   * Fetch all billing records with pagination
   * @param {number} maxPages - Maximum number of pages to fetch (default 100)
   * @param {number} minStartTime - Optional: stop fetching when records are older than this time (ms)
   * @returns {Promise<Array>} All billing records
   */
  async getAllBillingRecords(maxPages = 100, minStartTime = 0) {
    const allRecords = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        const response = await this.getBillingRecords(page, 100);
        const records = response.charge_records || [];

        if (records.length === 0) {
          break;
        }

        allRecords.push(...records);

        // 如果传入了时间范围，检查是否需要继续获取
        if (minStartTime > 0) {
          const lastRecord = records[records.length - 1];
          const lastRecordTime = (lastRecord.created_at || 0) * 1000;
          if (lastRecordTime < minStartTime) {
            break;
          }
        }

        if (records.length < 100) {
          break;
        }
      } catch (error) {
        console.error(`Failed to fetch billing records page ${page}:`, error.message);
        break;
      }
    }

    return allRecords;
  }

  /**
   * Calculate usage statistics from billing records
   * @param {Array} records - Billing records from account/amount API
   * @param {number} planStartTime - Plan start time in milliseconds
   * @param {number} planEndTime - Plan end time in milliseconds
   * @returns {Object} Usage statistics
   */
  calculateUsageStats(records, planStartTime, planEndTime) {
    const now = Date.now();

    // 账单记录是秒级时间戳，需要统一转换为毫秒
    const planStartMs = planStartTime;
    const planEndMs = planEndTime;

    // 昨日（0点到现在）或者取最近一次账单的日期
    // 账单记录不是实时的，当日消耗要明天才显示，所以显示"昨日"
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const stats = {
      lastDayUsage: 0,
      weeklyUsage: 0,
      planTotalUsage: 0,
    };

    for (const record of records) {
      const tokens = parseInt(record.consume_token, 10) || 0;
      // 账单记录的 created_at 是秒级时间戳，转换为毫秒
      const createdAt = (record.created_at || 0) * 1000;

      // 昨日消耗（从昨日0点到现在）
      if (createdAt >= yesterdayStart && createdAt < todayStart) {
        stats.lastDayUsage += tokens;
      }

      // 近7天消耗
      if (createdAt >= weekAgo) {
        stats.weeklyUsage += tokens;
      }

      // 套餐期内总消耗
      if (createdAt >= planStartMs && createdAt <= planEndMs) {
        stats.planTotalUsage += tokens;
      }
    }

    return stats;
  }

  /**
   * Format number to human readable format (万, 亿)
   * @param {number} num - Number to format
   * @returns {string} Formatted string
   */
  formatNumber(num) {
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    }
    return num.toLocaleString("zh-CN");
  }

  // 清除缓存
  clearCache() {
    this.cache = {
      data: null,
      timestamp: 0,
    };
  }

  parseUsageData(apiData, subscriptionData) {
    if (!apiData.model_remains || apiData.model_remains.length === 0) {
      throw new Error("No usage data available");
    }

    const modelData = apiData.model_remains[0];
    const startTime = new Date(modelData.start_time);
    const endTime = new Date(modelData.end_time);

    // Calculate counts
    // 新接口 usage_count 是已使用次数（正确值）
    const usedCount = modelData.current_interval_usage_count;
    const remainingCount = modelData.current_interval_total_count - usedCount;

    // Calculate percentage - 基于已使用次数的百分比
    const usedPercentage = Math.round(
      (usedCount / modelData.current_interval_total_count) * 100
    );

    // Calculate remaining time in human-readable format
    const remainingMs = modelData.remains_time;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    // Calculate weekly usage data
    const weeklyUsed = modelData.current_weekly_usage_count;
    const weeklyTotal = modelData.current_weekly_total_count;
    const weeklyPercentage = weeklyTotal > 0 ? Math.floor((weeklyUsed / weeklyTotal) * 100) : 0;
    const weeklyRemainingMs = modelData.weekly_remains_time;
    const weeklyDays = Math.floor(weeklyRemainingMs / (1000 * 60 * 60 * 24));
    const weeklyHours = Math.floor((weeklyRemainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    // Parse subscription expiry date if available
    let expiryInfo = null;
    if (
      subscriptionData &&
      subscriptionData.current_subscribe &&
      subscriptionData.current_subscribe.current_subscribe_end_time
    ) {
      const expiryDate =
        subscriptionData.current_subscribe.current_subscribe_end_time;
      const expiry = new Date(expiryDate);
      const now = new Date();

      // Calculate days until expiry
      const timeDiff = expiry.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      expiryInfo = {
        date: expiryDate,
        daysRemaining: daysDiff,
        text:
          daysDiff > 0
            ? `还剩 ${daysDiff} 天`
            : daysDiff === 0
            ? "今天到期"
            : `已过期 ${Math.abs(daysDiff)} 天`,
      };
    }

    // 上下文窗口信息
    // 根据模型名称获取上下文窗口大小，回退到默认值
    const contextWindowSize =
      getContextWindowSize(modelData.model_name) || getDefaultContextWindowSize();
    const contextWindow = {
      total: contextWindowSize,
      used: 0,
      percentage: 0,
      totalFormatted: "200K",
      usedFormatted: "0K",
    };

    return {
      modelName: modelData.model_name,
      timeWindow: {
        start: startTime.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Shanghai",
          hour12: false,
        }),
        end: endTime.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Shanghai",
          hour12: false,
        }),
        timezone: "UTC+8",
      },
      remaining: {
        hours,
        minutes,
        text:
          hours > 0
            ? `${hours} 小时 ${minutes} 分钟后重置`
            : `${minutes} 分钟后重置`,
      },
      usage: {
        used: usedCount,
        remaining: remainingCount,
        total: modelData.current_interval_total_count,
        percentage: usedPercentage,
      },
      weekly: {
        used: weeklyUsed,
        total: weeklyTotal,
        percentage: weeklyPercentage,
        days: weeklyDays,
        hours: weeklyHours,
        unlimited: weeklyTotal === 0,
        text: weeklyDays > 0
          ? `${weeklyDays} 天 ${weeklyHours} 小时后重置`
          : `${weeklyHours} 小时后重置`,
      },
      contextWindow,
      expiry: expiryInfo,
    };
  }

  /**
   * Parse all models from API data
   * @param {Object} apiData - Raw API response
   * @returns {Array} Array of model usage data
   */
  parseAllModels(apiData) {
    if (!apiData.model_remains || apiData.model_remains.length === 0) {
      return [];
    }

    return apiData.model_remains.map(modelData => {
      const totalCount = modelData.current_interval_total_count;
      // 新接口 usage_count 是已使用次数（正确值）
      const usedCount = modelData.current_interval_usage_count;
      const remainingCount = totalCount - usedCount;
      const usedPercentage = totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0;

      // Weekly data
      const weeklyTotal = modelData.current_weekly_total_count || 0;
      const weeklyUsed = modelData.current_weekly_usage_count || 0;
      const weeklyRemainingCount = weeklyTotal - weeklyUsed;
      const weeklyPercentage = weeklyTotal > 0 ? Math.floor((weeklyUsed / weeklyTotal) * 100) : 0;

      return {
        name: modelData.model_name,
        used: usedCount,
        remaining: remainingCount,
        total: totalCount,
        percentage: usedPercentage,
        unlimited: weeklyTotal === 0,
        weeklyPercentage,
        weeklyTotal,
        weeklyRemainingCount,
      };
    });
  }
}

module.exports = MinimaxAPI;
