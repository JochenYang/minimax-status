const axios = require('axios');
const vscode = require('vscode');

class MinimaxAPI {
  constructor(context) {
    this.context = context;
    this.token = null;
    this.groupId = null;
    this.loadConfig();
  }

  loadConfig() {
    const config = vscode.workspace.getConfiguration('minimaxStatus');
    this.token = config.get('token');
    this.groupId = config.get('groupId');
  }

  async getUsageStatus() {
    if (!this.token || !this.groupId) {
      throw new Error('请在设置中配置 MiniMax 访问令牌和组 ID');
    }

    try {
      const response = await axios.get(
        `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains`,
        {
          params: { GroupId: this.groupId },
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('无效的令牌或未授权。请检查您的凭据。');
      }
      throw new Error(`API 请求失败: ${error.message}`);
    }
  }

  async getSubscriptionDetails() {
    if (!this.token || !this.groupId) {
      throw new Error('请在设置中配置 MiniMax 访问令牌和组 ID');
    }

    try {
      const response = await axios.get(
        `https://www.minimaxi.com/v1/api/openplatform/charge/combo/cycle_audio_resource_package`,
        {
          params: {
            biz_line: 2,
            cycle_type: 1,
            resource_package_type: 7,
            GroupId: this.groupId
          },
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('无效的令牌或未授权。请检查您的凭据。');
      }
      throw new Error(`API 请求失败: ${error.message}`);
    }
  }

  parseUsageData(apiData, subscriptionData) {
    if (!apiData.model_remains || apiData.model_remains.length === 0) {
      throw new Error('没有可用的使用数据');
    }

    const modelData = apiData.model_remains[0];
    const startTime = new Date(modelData.start_time);
    const endTime = new Date(modelData.end_time);

    // Calculate used percentage based on usage count
    const used = modelData.current_interval_total_count - modelData.current_interval_usage_count;
    const total = modelData.current_interval_total_count;
    const usedPercentage = Math.round((used / total) * 100);

    // Calculate remaining time
    const remainingMs = modelData.remains_time;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    // Parse subscription expiry date if available
    let expiryInfo = null;
    if (subscriptionData && subscriptionData.current_subscribe && subscriptionData.current_subscribe.current_subscribe_end_time) {
      const expiryDate = subscriptionData.current_subscribe.current_subscribe_end_time;
      const expiry = new Date(expiryDate);
      const now = new Date();

      // Calculate days until expiry
      const timeDiff = expiry.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      expiryInfo = {
        date: expiryDate,
        daysRemaining: daysDiff,
        text: daysDiff > 0 ? `还剩 ${daysDiff} 天` : (daysDiff === 0 ? '今天到期' : `已过期 ${Math.abs(daysDiff)} 天`)
      };
    }

    return {
      modelName: modelData.model_name,
      timeWindow: {
        start: startTime.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Shanghai',
          hour12: false
        }),
        end: endTime.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Shanghai',
          hour12: false
        }),
        timezone: 'UTC+8'
      },
      remaining: {
        hours,
        minutes,
        text: hours > 0 ? `${hours} 小时 ${minutes} 分钟后重置` : `${minutes} 分钟后重置`
      },
      usage: {
        used: modelData.current_interval_total_count - modelData.current_interval_usage_count,
        total: modelData.current_interval_total_count,
        percentage: usedPercentage
      },
      expiry: expiryInfo
    };
  }

  refreshConfig() {
    this.loadConfig();
  }
}

module.exports = MinimaxAPI;
