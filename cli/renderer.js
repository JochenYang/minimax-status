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
      parts.push(`${chalk.blue('📁')} ${chalk.cyan(currentDir)}`);
    }

    parts.push(`${chalk.magenta('🤖')} ${chalk.magenta(modelName)}`);

    const usageColor = this.getStatusColor(usagePercentage);
    parts.push(`${usageColor(usagePercentage + '%')}`);

    parts.push(`${chalk.yellow('↻')} ${chalk.white(usage.remaining + '/' + usage.total)}`);

    if (contextUsage) {
      const contextPercent = Math.round((contextUsage / contextSize) * 100);
      const contextColor = this.getStatusColor(contextPercent);
      parts.push(`${contextColor('⚡')} ${contextColor(contextPercent + '%')}`);
      parts.push(`${chalk.white(this.formatTokens(contextUsage) + '/' + this.formatContextSize(contextSize))}`);
    } else {
      parts.push(`${chalk.gray(this.formatContextSize(contextSize))}`);
    }

    const remainingText = remaining.hours > 0
      ? `${remaining.hours}h${remaining.minutes}m`
      : `${remaining.minutes}m`;
    parts.push(`${chalk.gray('⏱')} ${chalk.white(remainingText)}`);

    if (configCounts.claudeMdCount > 0) {
      parts.push(`${chalk.dim(configCounts.claudeMdCount + ' CLAUDE.md')}`);
    }
    if (configCounts.rulesCount > 0) {
      parts.push(`${chalk.dim(configCounts.rulesCount + ' rules')}`);
    }
    if (configCounts.mcpCount > 0) {
      parts.push(`${chalk.dim(configCounts.mcpCount + ' MCPs')}`);
    }
    if (sessionDuration) {
      parts.push(`${chalk.dim('⏱ ' + sessionDuration)}`);
    }

    if (expiry) {
      parts.push(`${chalk.dim('到期: ' + expiry.daysRemaining + '天')}`);
    }

    return parts.join(' | ');
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
      parts.push(`${chalk.yellow('◐')} ${chalk.cyan(tool.name)}${target ? chalk.dim(': ' + target) : ''}`);
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
      parts.push(`${chalk.green('✓')} ${name} ${chalk.dim('×' + count)}`);
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
      const model = agent.model ? chalk.dim('[' + agent.model + ']') : '';
      const desc = agent.description ? chalk.dim(': ' + this.truncateDesc(agent.description)) : '';

      const now = Date.now();
      const start = agent.startTime?.getTime() || now;
      const end = agent.endTime?.getTime() || now;
      const elapsed = this.formatDuration(end - start);

      lines.push(`${statusIcon} ${type}${model}${desc} ${chalk.dim('(' + elapsed + ')')}`);
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
        return `${chalk.green('✓')} All todos complete ${chalk.dim('(' + completed + '/' + total + ')')}`;
      }
      return null;
    }

    const content = this.truncateDesc(inProgress.content, 50);
    const progress = chalk.dim('(' + completed + '/' + total + ')');

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
