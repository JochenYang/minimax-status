#!/usr/bin/env node

const chalk = require('chalk').default;

class Renderer {
  constructor() {
    this.RESET = '\x1b[0m';
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
      modelName,
      currentDir,
      usagePercentage,
      usage,
      remaining,
      expiry,
      contextUsage,
      contextSize,
      configCounts,
      sessionDuration,
    } = data;

    const parts = [];

    if (currentDir) {
      parts.push(`${chalk.cyan(currentDir)}`);
    }

    // Git 分支显示
    if (data.gitBranch && data.gitBranch.name) {
      const { name, ahead, behind, hasChanges } = data.gitBranch;

      // 主分支(main/master)用绿色，其他分支用白色
      const isMainBranch = name === 'main' || name === 'master';
      const branchColor = isMainBranch ? chalk.green : chalk.white;

      // 构建分支显示字符串
      let branchStr = branchColor(name);

      // 未提交更改用 * 标记
      if (hasChanges) {
        branchStr += chalk.red(' *');
      }

      parts.push(branchStr);
    }

    // 模型
    parts.push(`${chalk.magenta(modelName)}`);

    // 上下文窗口
    if (contextUsage !== null && contextUsage !== undefined) {
      const contextPercent = Math.round((contextUsage / contextSize) * 100);
      const contextColor = this.getStatusColor(contextPercent);
      parts.push(`${contextColor(contextPercent + '%')} ${contextColor('·')} ${contextColor(this.formatTokens(contextUsage) + ' tokens')}`);
    } else {
      parts.push(chalk.cyan(this.formatContextSize(contextSize)));
    }

    // 使用量 - 进度条风格
    const usageColor = this.getStatusColor(usagePercentage);
    const filled = Math.round((usagePercentage / 100) * 10);
    const empty = 10 - filled;
    const usageBar = usageColor('█'.repeat(filled) + '\x1b[2m' + '░'.repeat(empty) + '\x1b[0m');
    parts.push(`${chalk.yellow('Usage')} ${usageBar} ${usageColor(usagePercentage + '%')} (${usage.remaining}/${usage.total})`);

    // 倒计时 - 保留图标
    const remainingText = remaining.hours > 0
      ? `${remaining.hours}h${remaining.minutes}m`
      : `${remaining.minutes}m`;
    parts.push(`${chalk.yellow('⏱')} ${remainingText}`);

    // 到期 - 保留图标
    if (expiry) {
      const expiryColor = expiry.daysRemaining <= 3 ? chalk.red : expiry.daysRemaining <= 7 ? chalk.yellow : chalk.green;
      parts.push(`${expiryColor('到期 ' + expiry.daysRemaining + '天')}`);
    }

    return parts.join(' │ ');
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
