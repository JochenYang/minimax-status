const axios = require("axios");
const https = require("https");
const vscode = require("vscode");

// Add HTTPS Agent configuration
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 10000,
  servername: "minimaxi.com",
});

class MinimaxAPI {
  constructor(context) {
    this.context = context;
    this.token = null;
    this.groupId = null;
    this.loadConfig();
  }

  loadConfig() {
    const config = vscode.workspace.getConfiguration("minimaxStatus");
    this.token = config.get("token");
    this.groupId = config.get("groupId");
    this.selectedModelName = config.get("modelName");
  }

  async getUsageStatus() {
    if (!this.token || !this.groupId) {
      throw new Error("请在设置中配置 MiniMax 访问令牌和组 ID");
    }

    try {
      const response = await axios.get(
        `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains`,
        {
          params: { GroupId: this.groupId },
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          httpsAgent: httpsAgent, // Add HTTPS Agent configuration
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("无效的令牌或未授权。请检查您的凭据。");
      }
      throw new Error(`API 请求失败: ${error.message}`);
    }
  }

  async getOverseasUsageStatus() {
    if (!this.token || !this.groupId) {
      throw new Error("请在设置中配置 MiniMax 访问令牌和组 ID");
    }

    try {
      const response = await axios.get(
        `https://www.minimax.io/v1/api/openplatform/coding_plan/remains`,
        {
          params: { GroupId: this.groupId },
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("无效的令牌或未授权。请检查您的凭据。");
      }
      throw new Error(`海外 API 请求失败: ${error.message}`);
    }
  }

  async getSubscriptionDetails() {
    if (!this.token || !this.groupId) {
      throw new Error("请在设置中配置 MiniMax 访问令牌和组 ID");
    }

    try {
      const response = await axios.get(
        `https://www.minimaxi.com/v1/api/openplatform/charge/combo/cycle_audio_resource_package`,
        {
          params: {
            biz_line: 2,
            cycle_type: 1,
            resource_package_type: 7,
            GroupId: this.groupId,
          },
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          httpsAgent: httpsAgent, // Add HTTPS Agent configuration
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("无效的令牌或未授权。请检查您的凭据。");
      }
      throw new Error(`API 请求失败: ${error.message}`);
    }
  }

  /**
   * Get billing records from the account/amount API
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of records per page (max 100)
   * @returns {Promise<Object>} Billing records response
   */
  async getBillingRecords(page = 1, limit = 100) {
    if (!this.token || !this.groupId) {
      throw new Error("请在设置中配置 MiniMax 访问令牌和组 ID");
    }

    try {
      const response = await axios.get(
        `https://www.minimaxi.com/account/amount`,
        {
          params: {
            page: page,
            limit: limit,
            aggregate: false,
            GroupId: this.groupId,
          },
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          httpsAgent: httpsAgent,
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("无效的令牌或未授权。请检查您的凭据。");
      }
      throw new Error(`账单 API 请求失败: ${error.message}`);
    }
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
    // 套餐时间戳本身是毫秒级
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

      // 套餐期内总消耗（使用套餐的有效期时间范围）
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

  /**
   * Fetch all billing records with pagination
   * @param {number} maxPages - Maximum number of pages to fetch
   * @returns {Promise<Array>} All billing records
   */
  async getAllBillingRecords(maxPages = 100) {
    const allRecords = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        const response = await this.getBillingRecords(page, 100);
        const records = response.charge_records || [];

        if (records.length === 0) {
          break; // No more records
        }

        allRecords.push(...records);

        // If we got less than 100 records, this is the last page
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

  parseUsageData(apiData, subscriptionData) {
    if (!apiData.model_remains || apiData.model_remains.length === 0) {
      throw new Error("没有可用的使用数据");
    }

    // Parse all available models
    const allModels = apiData.model_remains.map((m) => ({
      name: m.model_name,
      startTime: new Date(m.start_time),
      endTime: new Date(m.end_time),
      usage: m.current_interval_total_count - m.current_interval_usage_count,
      total: m.current_interval_total_count,
      remainingMs: m.remains_time,
    }));

    // Select the model based on user selection or default to the first model
    let selectedModel;
    if (this.selectedModelName) {
      selectedModel = allModels.find((m) => m.name === this.selectedModelName);
      if (!selectedModel) {
        // If the selected model cannot be found, the first one is used.
        selectedModel = allModels[0];
      }
    } else {
      selectedModel = allModels[0];
    }

    const modelData =
      apiData.model_remains.find((m) => m.model_name === selectedModel.name) ||
      apiData.model_remains[0];
    const startTime = new Date(modelData.start_time);
    const endTime = new Date(modelData.end_time);

    // Calculate used percentage based on usage count
    const used =
      modelData.current_interval_total_count -
      modelData.current_interval_usage_count;
    const total = modelData.current_interval_total_count;
    const usedPercentage = Math.round((used / total) * 100);

    // Calculate remaining time
    const remainingMs = modelData.remains_time;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    // Parse subscription expiry date if available
    let expiryInfo = null;
    let planStartFormatted = null;
    let planEndFormatted = null;

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

      // 套餐有效期结束时间
      planEndFormatted = expiryDate;

      // 套餐有效期开始时间：取订阅开始时间或计算得出
      if (subscriptionData.current_subscribe.current_credit_reload_time) {
        planStartFormatted = subscriptionData.current_subscribe.current_credit_reload_time;
      } else {
        // 如果没有开始时间，显示"当前周期"
        planStartFormatted = "当前周期";
      }
    }

    return {
      modelName: modelData.model_name,
      allModels: allModels.map((m) => m.name),
      planTimeWindow: {
        start: modelData.start_time,
        end: modelData.end_time,
        startFormatted: planStartFormatted || startTime.toLocaleDateString("zh-CN"),
        endFormatted: planEndFormatted || endTime.toLocaleDateString("zh-CN"),
      },
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
        used:
          modelData.current_interval_total_count -
          modelData.current_interval_usage_count,
        total: modelData.current_interval_total_count,
        percentage: usedPercentage,
      },
      expiry: expiryInfo,
    };
  }

  refreshConfig() {
    this.loadConfig();
  }
}

module.exports = MinimaxAPI;
