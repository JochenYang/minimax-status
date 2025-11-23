const chalk = require('chalk').default;
const dayjs = require('dayjs');

class StatusBar {
  constructor(data) {
    this.data = data;
  }

  render() {
    const { modelName, timeWindow, remaining, usage } = this.data;

    // Calculate progress bar width
    const width = 30;
    const filled = Math.floor((usage.percentage / 100) * width);
    const empty = width - filled;

    // Create progress bar with colors based on usage percentage
    const progressBar = this.createProgressBar(filled, empty, usage.percentage);

    // Format output
    const lines = [
      chalk.bold.blue('┌─────────────────────────────────────────────────────────────┐'),
      `│ ${chalk.bold('MiniMax Claude Code 使用状态')}                        ${chalk.dim('│')}`,
      `│                                                             ${chalk.dim('│')}`,
      `│ ${chalk.cyan('当前模型:')} ${modelName.padEnd(35)} ${chalk.dim('│')}`,
      `│ ${chalk.cyan('时间窗口:')} ${timeWindow.start}-${timeWindow.end}(${timeWindow.timezone})${' '.repeat(25)} ${chalk.dim('│')}`,
      `│ ${chalk.cyan('剩余时间:')} ${remaining.text}${' '.repeat(30 - remaining.text.length)} ${chalk.dim('│')}`,
      `│                                                             ${chalk.dim('│')}`,
      `│ ${chalk.cyan('已用额度:')} ${progressBar} ${usage.percentage}% ${chalk.dim('│')}`,
      `│ ${chalk.dim('     剩余:')} ${usage.remaining}/${usage.total} 次调用`.padEnd(43) + chalk.dim('│'),
      `│                                                             ${chalk.dim('│')}`,
      this.getStatusLine(usage.percentage),
      chalk.bold.blue('└─────────────────────────────────────────────────────────────┘')
    ];

    return lines.join('\n');
  }

  createProgressBar(filled, empty, percentage) {
    // filled 是已使用部分，empty 是剩余部分
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
    const leftPadding = '│ ';
    const rightPadding = ' '.repeat(41 - status.length) + '│';

    let statusColor;
    switch (status) {
      case '✓ 正常':
        statusColor = chalk.green(status);
        break;
      case '⚠ 接近限制':
        statusColor = chalk.yellow(status);
        break;
      case '⚠ 即将到期':
        statusColor = chalk.red(status);
        break;
      default:
        statusColor = chalk.gray(status);
    }

    return `${leftPadding}${chalk.cyan('状态:')} ${statusColor}${rightPadding}`;
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
    const { usage, remaining, modelName } = this.data;
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

    return `${color('●')} ${modelName} ${usage.percentage}% ${chalk.dim(`(${usage.remaining}/${usage.total})`)} ${chalk.gray('•')} ${remaining.text} ${chalk.gray('•')} ${status}`;
  }
}

module.exports = StatusBar;
