const chalk = require('chalk').default;
const dayjs = require('dayjs');
const { default: boxen } = require('boxen');
const { default: stringWidth } = require('string-width');

class StatusBar {
  constructor(data, usageStats = null, api = null, allModels = []) {
    this.data = data;
    this.usageStats = usageStats;
    this.api = api;
    this.allModels = allModels;
    this.totalWidth = 63; // 总宽度包括边框
    this.borderWidth = 4; // '│ ' (2) + ' │' (2) = 4
  }

  // 格式化数字
  formatNumber(num) {
    if (this.api) {
      return this.api.formatNumber(num);
    }
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    }
    return num.toLocaleString("zh-CN");
  }

  // 渲染消耗统计表格
  renderConsumptionStats() {
    if (!this.usageStats) {
      return '';
    }

    const lines = [];

    lines.push('');
    lines.push(chalk.bold('📊 Token 消耗统计'));

    // 计算表格宽度
    const leftWidth = 12; // "昨日消耗:  "
    const rightWidth = 15; // "1732.1万  "
    const padding = this.totalWidth - this.borderWidth - leftWidth - rightWidth;

    const pad = ' '.repeat(Math.max(0, padding));

    const formatLine = (label, value) => {
      return `│ ${chalk.cyan(label)}${pad}${this.formatNumber(value)}`;
    };

    lines.push(formatLine('昨日消耗: ', this.usageStats.lastDayUsage));
    lines.push(formatLine('近7天消耗: ', this.usageStats.weeklyUsage));
    lines.push(formatLine('当月消耗: ', this.usageStats.planTotalUsage));

    return lines.join('\n');
  }

  // 渲染所有模型额度区块
  renderAllModelsSection() {
    if (!this.allModels || this.allModels.length === 0) {
      return '';
    }

    const lines = [];
    lines.push('');
    lines.push(chalk.bold('📋 所有模型额度'));

    // 简化模型名称映射
    const shortName = (name) => {
      if (name.includes('MiniMax-M')) return 'MiniMax-M*';
      if (name.includes('speech')) return 'speech-hd';
      if (name.includes('Hailuo-2.3-Fast')) return 'Hailuo';
      if (name.includes('Hailuo-2.3')) return 'Hailuo-2.3';
      if (name.includes('Hailuo')) return 'Hailuo';
      if (name.includes('music')) return 'music';
      if (name.includes('image')) return 'image';
      return name.length > 15 ? name.substring(0, 12) + '...' : name;
    };

    // 获取状态颜色
    const getStatusColor = (percentage) => {
      if (percentage >= 85) return chalk.red;
      if (percentage >= 60) return chalk.yellow;
      return chalk.green;
    };

    // 显示状态
    const getStatusText = (percentage) => {
      if (percentage >= 85) return '⚠';
      if (percentage >= 60) return '⚡';
      return '✓';
    };

    // 每行显示一个模型
    for (const model of this.allModels) {
      const short = shortName(model.name);
      const color = getStatusColor(model.percentage);
      const status = getStatusText(model.percentage);
      const pct = `${model.percentage}%`;
      const usedTotal = `${model.used}/${model.total}`;

      lines.push(`  ${color(short.padEnd(15))} ${color(pct.padEnd(5))} ${color(usedTotal.padEnd(12))} ${color(status)}`);
    }

    return lines.join('\n');
  }

  // 辅助函数：填充内容到正确长度，处理 chalk 代码和中文字符
  padLine(leftContent, rightContent) {
    // 移除 chalk 代码以便计算
    const leftClean = leftContent.replace(/\x1b\[[0-9;]*m/g, '');
    const rightClean = rightContent.replace(/\x1b\[[0-9;]*m/g, '');

    // 计算视觉宽度（中文字符 = 2，英文字符 = 1）
    const leftLength = stringWidth(leftClean);
    const rightLength = stringWidth(rightClean);

    // 总宽度应为 63，边框为 3，所以内容区域为 60
    const contentAreaWidth = this.totalWidth - this.borderWidth; // 60
    const totalContentLength = leftLength + rightLength;
    const paddingNeeded = Math.max(0, contentAreaWidth - totalContentLength);
    const padding = ' '.repeat(paddingNeeded);

    return `│ ${leftContent}${padding}${rightContent}`;
  }

  render() {
    const { modelName, timeWindow, remaining, usage, weekly, expiry } = this.data;

    // Calculate progress bar width
    const width = 30;
    const filled = Math.floor((usage.percentage / 100) * width);
    const empty = width - filled;

    // Create progress bar with colors based on usage percentage
    const progressBar = this.createProgressBar(filled, empty, usage.percentage);

    // 构建内容行
    const contentLines = [];

    // 标题
    contentLines.push(chalk.bold('MiniMax Claude Code 使用状态'));

    contentLines.push('');

    // 模型名称
    contentLines.push(`${chalk.cyan('当前模型:')} ${modelName}`);

    // 时间窗口
    const timeWindowText = `${timeWindow.start}-${timeWindow.end}(${timeWindow.timezone})`;
    contentLines.push(`${chalk.cyan('时间窗口:')} ${timeWindowText}`);

    // 剩余时间
    contentLines.push(`${chalk.cyan('剩余时间:')} ${remaining.text}`);

    contentLines.push('');

    // 使用百分比与进度条
    contentLines.push(`${chalk.cyan('已用额度:')} ${progressBar} ${usage.percentage}%`);

    // 剩余次数
    contentLines.push(`${chalk.dim('     剩余:')} ${usage.remaining}/${usage.total} 次调用`);

    // 周用量（如果有数据）
    if (weekly) {
      contentLines.push('');
      if (weekly.unlimited) {
        // 不受限制
        contentLines.push(`${chalk.cyan('周限额:')} ${chalk.green('不受限制')}`);
      } else {
        // 有限制，显示具体数据
        const weeklyPercent = weekly.percentage;
        const weeklyColor = weeklyPercent >= 85 ? chalk.red : weeklyPercent >= 60 ? chalk.yellow : chalk.green;
        const weeklyProgress = this.createProgressBar(
          Math.floor((weeklyPercent / 100) * 15),
          15 - Math.floor((weeklyPercent / 100) * 15),
          weeklyPercent
        );
        contentLines.push(`${chalk.cyan('周限额:')} ${weeklyColor(weeklyProgress)} ${weeklyColor(weekly.percentage + '%')} (${weekly.used}/${weekly.total})`);
        contentLines.push(`${chalk.dim('     重置:')} ${weekly.text}`);
      }
    }

    // 添加到期行（如果可用）
    if (expiry) {
      const expiryText = `${expiry.date} (${expiry.text})`;
      contentLines.push(`${chalk.cyan('套餐到期:')} ${expiryText}`);
    }

    // 添加消耗统计（如果有数据）
    if (this.usageStats) {
      contentLines.push(this.renderConsumptionStats());
    }

    // 添加所有模型额度（如果有数据）
    if (this.allModels && this.allModels.length > 0) {
      contentLines.push(this.renderAllModelsSection());
    }

    contentLines.push('');

    // 状态行
    const status = this.getStatus(usage.percentage);
    const statusColor = this.getStatusColor(status);
    contentLines.push(`${chalk.cyan('状态:')} ${statusColor}`);

    // 使用 boxen 创建完美对齐的边框
    const boxenOptions = {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderColor: 'blue',
      borderStyle: 'single',
      dimBorder: true
    };

    return boxen(contentLines.join('\n'), boxenOptions);
  }

  createProgressBar(filled, empty, percentage) {
    const usedBar = '█'.repeat(filled);
    const remainingBar = '░'.repeat(empty);
    const bar = `${usedBar}${remainingBar}`;

    // 进度条颜色基于已使用百分比：使用越多越危险（红色）
    if (percentage >= 85) {
      return chalk.red(bar);
    } else if (percentage >= 60) {
      return chalk.yellow(bar);
    } else {
      return chalk.green(bar);
    }
  }

  getStatusLine(percentage) {
    const status = this.getStatus(percentage);
    const leftContent = `${chalk.cyan('状态:')} ${this.getStatusColor(status)}`;
    const rightContent = ' │';

    return this.padLine(leftContent, rightContent);
  }

  getStatusColor(status) {
    if (status === '⚡ 注意使用') {
      return chalk.yellow(status);
    } else if (status === '⚠ 即将用完') {
      return chalk.red(status);
    } else {
      return chalk.green(status);
    }
  }

  getStatus(percentage) {
    // 基于已使用百分比
    if (percentage >= 85) {
      return '⚠ 即将用完';
    } else if (percentage >= 60) {
      return '⚡ 注意使用';
    } else {
      return '✓ 正常使用';
    }
  }

  renderCompact() {
    const { usage, remaining, modelName, expiry } = this.data;
    const status = this.getStatus(usage.percentage);

    // 颜色基于已使用百分比：使用越多越危险
    let color;
    if (usage.percentage >= 85) {
      color = chalk.red;
    } else if (usage.percentage >= 60) {
      color = chalk.yellow;
    } else {
      color = chalk.green;
    }

    // 添加到期信息（如果可用）
    const expiryInfo = expiry ? ` ${chalk.gray('•')} 剩余: ${expiry.daysRemaining}天` : '';

    return `${color('●')} ${modelName} ${usage.percentage}% ${chalk.dim(`(${usage.remaining}/${usage.total})`)} ${chalk.gray('•')} ${remaining.text} ${chalk.gray('•')} ${status}${expiryInfo}`;
  }

  // 渲染所有模型的额度
  static renderAllModels(models) {
    if (!models || models.length === 0) {
      return '';
    }

    const lines = [];
    lines.push('');
    lines.push(chalk.bold('📋 所有模型额度'));

    // 表头
    lines.push(chalk.gray('─'.repeat(55)));
    lines.push(`│ ${chalk.cyan('模型').padEnd(30)} ${chalk.cyan('已用/总额').padEnd(15)} ${chalk.cyan('状态')}`);
    lines.push(chalk.gray('─'.repeat(55)));

    for (const model of models) {
      // 颜色基于百分比
      let color;
      if (model.percentage >= 85) {
        color = chalk.red;
      } else if (model.percentage >= 60) {
        color = chalk.yellow;
      } else {
        color = chalk.green;
      }

      const status = model.percentage >= 85 ? '⚠ 即将用完' : model.percentage >= 60 ? '⚡ 注意' : '✓ 正常';
      const name = model.name.length > 28 ? model.name.substring(0, 25) + '...' : model.name;

      lines.push(`│ ${name.padEnd(30)} ${color(`${model.used}/${model.total} (${model.percentage}%)`).padEnd(15)} ${color(status)}`);
    }

    lines.push(chalk.gray('─'.repeat(55)));
    return lines.join('\n');
  }
}

module.exports = StatusBar;
