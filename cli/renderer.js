#!/usr/bin/env node

const chalk = require('chalk').default;

class Renderer {
  constructor() {
    this.RESET = '\x1b[0m';
    // 自动检测：如果环境变量设置了 MINIMAX_PLAIN_UI 或者是 NO_NERD_FONTS，则停用特殊图标
    this.useNerdFonts = !process.env.MINIMAX_PLAIN_UI && !process.env.NO_NERD_FONTS;
    
    // 图标配置
    this.icons = {
      arrow: this.useNerdFonts ? '\uE0B0' : '>',
      leftArrow: this.useNerdFonts ? '\uE0B0' : '>', // 改为顺向箭头，实现顺行感
      branch: this.useNerdFonts ? '\uE0A0' : '*'
    };
  }

  formatTokens(tokens) {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  }

  formatContextSize(size) {
    if (size >= 1000000) {
      return `${Math.round(size / 100000) / 10}M`;
    }
    if (size >= 1000) {
      return `${Math.round(size / 1000)}K`;
    }
    return `${size}`;
  }

  formatDuration(ms) {
    if (ms < 60000) {
      const secs = Math.round(ms / 1000);
      return secs < 1 ? '<1s' : `${secs}s`;
    }
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  truncatePath(path, maxLen = 20) {
    if (!path || path.length <= maxLen) return path;
    const parts = path.split(/[/\\]/);
    const filename = parts.pop() || path;
    if (filename.length >= maxLen) {
      return filename.slice(0, maxLen - 3) + '...';
    }
    return '.../' + filename;
  }

  truncateDesc(desc, maxLen = 40) {
    if (!desc || desc.length <= maxLen) return desc;
    return desc.slice(0, maxLen - 3) + '...';
  }

  getStatusColor(percentage) {
    if (percentage >= 85) return chalk.red;
    if (percentage >= 60) return chalk.yellow;
    return chalk.green;
  }

  renderSessionLine(data) {
    const {
      modelName, currentDir, usagePercentage, usage,
      remaining, expiry, contextUsage, contextSize, weekly, gitBranch
    } = data;

    const blocks = [];

    // Pure Powerline Data Blocks
    if (currentDir) {
      blocks.push({ text: ` ${currentDir} `, bg: '#2563EB', fg: '#FFFFFF' });
    }

    if (gitBranch && gitBranch.name) {
      let name = gitBranch.name;
      if (name.length > 20) name = name.substring(0, 10) + '…' + name.substring(name.length - 7);
      const star = gitBranch.hasChanges ? ' *' : '';
      blocks.push({ text: ` ${this.icons.branch} ${name}${star} `, bg: '#9333EA', fg: '#FFFFFF' });
    }

    if (modelName) {
      blocks.push({ text: ` ${modelName} `, bg: '#4C1D95', fg: '#FFFFFF' });
    }

    if (contextSize) {
      if (contextUsage) {
        const pct = Math.round((contextUsage / contextSize) * 100);
        blocks.push({ text: ` ${pct}% · ${this.formatTokens(contextUsage)} `, bg: '#0369A1', fg: '#FFFFFF' });
      } else {
        blocks.push({ text: ` ${this.formatContextSize(contextSize)} `, bg: '#0369A1', fg: '#FFFFFF' });
      }
    }

    // 5h 限额 block — 总是显示（即使 total=0 也要显示百分比 + 5h 前缀）
    // ⚠ 不再用 usage.total > 0 过滤（5h 限额数据对 general 模型 total=0 也要显示）
    if (usage && usage.percentage !== undefined && usage.percentage !== null) {
      let bg = '#065F46'; // safe (Emerald 800 - dark enough for white text)
      if (usagePercentage >= 95) bg = '#991B1B'; // danger (Red 800)
      else if (usagePercentage >= 75) bg = '#9A3412'; // warn (Orange 800)

      // total=0 时不显示 (X/Y) 段
      const usedTotalSuffix = usage.total > 0 ? ` (${usage.remaining}/${usage.total})` : '';
      let usageText = ` 5h ${usagePercentage}%${usedTotalSuffix} `;

      if (weekly) {
        if (weekly.unlimited) {
          usageText += `· W ∞ `;
        } else {
          usageText += `· W ${weekly.percentage}% `;
        }
      }
      blocks.push({ text: usageText, bg: bg, fg: '#FFFFFF' });
    }

    if (remaining) {
      const remainingText = remaining.hours > 0 ? `${remaining.hours}h${remaining.minutes}m` : `${remaining.minutes}m`;
      blocks.push({ text: ` ${remainingText} `, bg: '#92400E', fg: '#FFFFFF' });
    }

    if (expiry) {
      let bg = '#374151'; // Gray 700
      if (expiry.daysRemaining <= 7) bg = '#9A3412';
      if (expiry.daysRemaining <= 3) bg = '#991B1B';
      blocks.push({ text: ` 剩${expiry.daysRemaining}天 `, bg: bg, fg: '#FFFFFF' });
    }

    // Powerline arrow seamless integration
    let out = '';
    const arrow = this.icons.arrow;
    
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      // 顺行式起点：使用正向箭头 + 黑色前景色模拟内凹效果
      if (i === 0) {
        out += this.RESET + chalk.bgHex(b.bg).black(this.icons.leftArrow);
      }
      // 磁贴文字
      out += chalk.bgHex(b.bg).whiteBright(b.text);
      if (i < blocks.length - 1) {
        const nextB = blocks[i + 1];
        if (this.useNerdFonts) {
          out += chalk.bgHex(nextB.bg).hex(b.bg)(arrow);
        } else {
          out += chalk.bgHex(b.bg).whiteBright(arrow);
        }
      } else {
        out += chalk.hex(b.bg)(arrow);
      }
    }

    return out;
  }

  renderToolsLine(tools) {
    if (!tools || tools.length === 0) {
      return null;
    }

    const parts = [];
    const runningTools = tools.filter(t => t.status === 'running');
    const completedTools = tools.filter(t => t.status === 'completed' || t.status === 'error');

    for (const tool of runningTools.slice(-2)) {
      const target = tool.target ? this.truncatePath(tool.target) : '';
      parts.push(`${chalk.yellow('◐')} ${chalk.cyan(tool.name)}${target ? chalk.cyan(': ' + target) : ''}`);
    }

    const toolCounts = new Map();
    for (const tool of completedTools) {
      const count = toolCounts.get(tool.name) || 0;
      toolCounts.set(tool.name, count + 1);
    }

    const sortedTools = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    for (const [name, count] of sortedTools) {
      parts.push(`${chalk.green('✓')} ${name} ${chalk.green('×' + count)}`);
    }

    if (parts.length === 0) {
      return null;
    }

    return parts.join(' | ');
  }

  renderAgentsLine(agents) {
    if (!agents || agents.length === 0) {
      return null;
    }

    const runningAgents = agents.filter(a => a.status === 'running');
    const recentCompleted = agents
      .filter(a => a.status === 'completed')
      .slice(-2);

    const toShow = [...runningAgents, ...recentCompleted].slice(-3);

    if (toShow.length === 0) {
      return null;
    }

    const lines = [];
    for (const agent of toShow) {
      const statusIcon = agent.status === 'running' ? chalk.yellow('◐') : chalk.green('✓');
      const type = chalk.magenta(agent.type);
      const model = agent.model ? chalk.cyan('[' + agent.model + ']') : '';
      const desc = agent.description ? chalk.white(': ' + this.truncateDesc(agent.description)) : '';

      const now = Date.now();
      const start = agent.startTime?.getTime() || now;
      const end = agent.endTime?.getTime() || now;
      const elapsed = this.formatDuration(end - start);

      lines.push(`${statusIcon} ${type}${model}${desc} ${chalk.yellow('(' + elapsed + ')')}`);
    }

    return lines.join('\n');
  }

  renderTodosLine(todos) {
    if (!todos || todos.length === 0) {
      return null;
    }

    const inProgress = todos.find(t => t.status === 'in_progress');
    const completed = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;

    if (!inProgress) {
      if (completed === total && total > 0) {
        return `${chalk.green('✓')} All todos complete ${chalk.green('(' + completed + '/' + total + ')')}`;
      }
      return null;
    }

    const content = this.truncateDesc(inProgress.content, 50);
    const progress = chalk.white('(' + completed + '/' + total + ')');

    return `${chalk.yellow('▸')} ${content} ${progress}`;
  }

  render(context) {
    const lines = [];

    const sessionLine = this.renderSessionLine(context);
    if (sessionLine) {
      lines.push(sessionLine);
    }

    const toolsLine = this.renderToolsLine(context.tools);
    if (toolsLine) {
      lines.push(toolsLine);
    }

    const agentsLine = this.renderAgentsLine(context.agents);
    if (agentsLine) {
      lines.push(agentsLine);
    }

    const todosLine = this.renderTodosLine(context.todos);
    if (todosLine) {
      lines.push(todosLine);
    }

    return lines.join('\n');
  }
}

module.exports = Renderer;
