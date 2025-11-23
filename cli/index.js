#!/usr/bin/env node

const { Command } = require("commander");
const chalk = require("chalk").default;
const ora = require("ora").default;
const MinimaxAPI = require("./api");
const StatusBar = require("./status");

const program = new Command();
const api = new MinimaxAPI();

program
  .name("minimax-status")
  .description("MiniMax Claude Code 使用状态监控工具")
  .version("1.0.0");

// Auth command
program
  .command("auth")
  .description("设置认证凭据")
  .argument("<token>", "MiniMax 访问令牌")
  .argument("<groupId>", "MiniMax 组 ID")
  .action((token, groupId) => {
    api.setCredentials(token, groupId);
    console.log(chalk.green("✓ 认证信息已保存"));
  });

// Health check command
program
  .command("health")
  .description("检查配置和连接状态")
  .action(async () => {
    const spinner = ora("正在检查...").start();
    let checks = {
      config: false,
      token: false,
      groupId: false,
      api: false
    };

    // 检查配置文件
    try {
      const configPath = require('path').join(
        process.env.HOME || process.env.USERPROFILE,
        '.minimax-config.json'
      );
      if (require('fs').existsSync(configPath)) {
        checks.config = true;
      }
      spinner.succeed("配置文件检查");
    } catch (error) {
      spinner.fail("配置文件检查失败");
    }

    // 检查Token
    if (api.token) {
      checks.token = true;
      console.log(chalk.green("✓ Token: ") + chalk.gray("已配置"));
    } else {
      console.log(chalk.red("✗ Token: ") + chalk.gray("未配置"));
    }

    // 检查GroupID
    if (api.groupId) {
      checks.groupId = true;
      console.log(chalk.green("✓ GroupID: ") + chalk.gray("已配置"));
    } else {
      console.log(chalk.red("✗ GroupID: ") + chalk.gray("未配置"));
    }

    // 测试API连接
    if (checks.token && checks.groupId) {
      try {
        await api.getUsageStatus();
        checks.api = true;
        console.log(chalk.green("✓ API连接: ") + chalk.gray("正常"));
      } catch (error) {
        console.log(chalk.red("✗ API连接: ") + chalk.gray(error.message));
      }
    }

    // 总结
    console.log("\n" + chalk.bold("健康检查结果:"));
    const allPassed = Object.values(checks).every(v => v);
    if (allPassed) {
      console.log(chalk.green("✓ 所有检查通过，配置正常！"));
    } else {
      console.log(chalk.yellow("⚠ 发现问题，请检查上述错误信息"));
    }
  });

// Status command
program
  .command("status")
  .description("显示当前使用状态")
  .option("-c, --compact", "紧凑模式显示")
  .option("-w, --watch", "实时监控模式")
  .action(async (options) => {
    const spinner = ora("获取使用状态中...").start();

    try {
      const apiData = await api.getUsageStatus();
      const usageData = api.parseUsageData(apiData);
      const statusBar = new StatusBar(usageData);

      spinner.succeed("状态获取成功");

      if (options.compact) {
        console.log(statusBar.renderCompact());
      } else {
        console.log("\n" + statusBar.render() + "\n");
      }

      if (options.watch) {
        console.log(chalk.gray("监控中... 按 Ctrl+C 退出"));
        startWatching(api, statusBar);
      }
    } catch (error) {
      spinner.fail(chalk.red("获取状态失败"));
      console.error(chalk.red(`错误: ${error.message}`));
      process.exit(1);
    }
  });

// List command
program
  .command("list")
  .description("显示所有模型的使用状态")
  .action(async () => {
    const spinner = ora("获取使用状态中...").start();

    try {
      const apiData = await api.getUsageStatus();
      const usageData = api.parseUsageData(apiData);
      const statusBar = new StatusBar(usageData);

      spinner.succeed("状态获取成功");
      console.log("\n" + statusBar.render() + "\n");
    } catch (error) {
      spinner.fail(chalk.red("获取状态失败"));
      console.error(chalk.red(`错误: ${error.message}`));
      process.exit(1);
    }
  });

// StatusBar command - 持续显示在终端底部
program
  .command("bar")
  .description("在终端底部持续显示状态栏（类似 ccline）")
  .action(async () => {
    const TerminalStatusBar = require("./statusbar");
    const statusBar = new TerminalStatusBar();
    await statusBar.start();
  });

// 上下文窗口大小映射表（仅MiniMax模型）
const MODEL_CONTEXT_SIZES = {
  "minimax-m2": 200000,
  "minimax-m2-stable": 200000,
  "minimax-m1": 200000,
  "minimax-m1-stable": 200000,
};

// 解析转录文件，借鉴ccline的实现
async function parseTranscriptUsage(transcriptPath) {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const fileContent = await fs.readFile(transcriptPath, 'utf8');
    const lines = fileContent.trim().split('\n');

    if (lines.length === 0) {
      return null;
    }

    // 解析最后一行JSON
    const lastLine = lines[lines.length - 1].trim();
    const lastEntry = JSON.parse(lastLine);

    // 如果是summary类型，查找usage
    if (lastEntry.type === 'summary' && lastEntry.leafUuid) {
      // 在所有行中查找对应的leafUuid
      for (let i = lines.length - 2; i >= 0; i--) {
        const entry = JSON.parse(lines[i].trim());
        if (entry.leafUuid === lastEntry.leafUuid) {
          if (entry.message && entry.message.usage) {
            return calculateUsageTokens(entry.message.usage);
          }
          break;
        }
      }
    }

    // 查找最新的assistant消息
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      const entry = JSON.parse(line);
      if (entry.type === 'assistant' && entry.message) {
        if (entry.message.usage) {
          return calculateUsageTokens(entry.message.usage);
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// 计算token使用量（参考ccline的normalize逻辑）
function calculateUsageTokens(usage) {
  // 根据不同格式计算display tokens
  if (usage.total_tokens) {
    return usage.total_tokens;
  } else if (usage.input_tokens && usage.output_tokens) {
    return usage.input_tokens + usage.output_tokens;
  } else if (usage.context_tokens) {
    return usage.context_tokens;
  } else if (usage.cache_creation_input_tokens && usage.cache_read_input_tokens) {
    return usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
  }
  return 0;
}

// Statusline command
program
  .command("statusline")
  .description("Claude Code状态栏集成（从stdin读取数据，输出单行状态）")
  .action(async () => {
    try {
      // 读取stdin数据（如果可用）
      let stdinData = null;
      if (!process.stdin.isTTY) {
        const chunks = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        const stdinString = Buffer.concat(chunks).toString();
        if (stdinString.trim()) {
          try {
            stdinData = JSON.parse(stdinString);
          } catch (e) {
            // 忽略JSON解析错误
          }
        }
      }

      // 获取使用状态
      const apiData = await api.getUsageStatus();
      const usageData = api.parseUsageData(apiData);

      // 构建状态信息
      const { usage, modelName, remaining } = usageData;
      const percentage = usage.percentage;

      // 从stdin数据获取Claude Code信息
      let displayModel = modelName;
      let currentDir = null;
      let modelId = null;
      let contextSize = 200000; // 默认值

      // 获取CLI当前目录
      const cliCurrentDir = process.cwd().split(/[\\/]/).pop();

      if (stdinData) {
        // Claude Code传递的模型信息
        if (stdinData.model && stdinData.model.display_name) {
          displayModel = stdinData.model.display_name;
          modelId = stdinData.model.id;
        } else if (stdinData.model && stdinData.model.id) {
          displayModel = stdinData.model.id;
          modelId = stdinData.model.id;
        }

        // 当前工作目录（从stdin获取）
        if (stdinData.workspace && stdinData.workspace.current_directory) {
          currentDir = stdinData.workspace.current_directory.split('/').pop();
        }
      } else {
        // 如果没有stdin，使用API返回的模型名作为ID
        modelId = modelName.toLowerCase().replace(/\s+/g, '-');
      }

      // 查找上下文窗口大小
      if (modelId) {
        const modelKey = modelId.toLowerCase();
        for (const [key, value] of Object.entries(MODEL_CONTEXT_SIZES)) {
          if (modelKey.includes(key.toLowerCase())) {
            contextSize = value;
            break;
          }
        }
      }

      // 尝试从转录文件获取真实token使用量（类似ccline）
      let contextUsageTokens = null;
      let contextUsagePercentage = null;
      if (stdinData && stdinData.transcript_path) {
        contextUsageTokens = await parseTranscriptUsage(stdinData.transcript_path);
        if (contextUsageTokens) {
          contextUsagePercentage = Math.round((contextUsageTokens / contextSize) * 100);
        }
      }

      const formatContextSize = (size) => {
        if (size >= 1000000) {
          return `${Math.round(size / 100000) / 10}M`;
        } else if (size >= 1000) {
          return `${Math.round(size / 1000)}K`;
        }
        return `${size}`;
      };

      const formatTokens = (tokens) => {
        if (tokens >= 1000000) {
          return `${Math.round(tokens / 100000) / 10}M`;
        } else if (tokens >= 1000) {
          return `${Math.round(tokens / 100) / 10}k`;
        }
        return `${tokens}`;
      };

      const contextSizeText = formatContextSize(contextSize);

      // 状态图标（基于真实上下文使用情况，否则基于额度）
      const displayPercentage = contextUsagePercentage || percentage;
      const statusIcon = displayPercentage >= 85 ? "⚠" : displayPercentage >= 60 ? "⚡" : "✓";

      // 剩余时间文本
      const remainingText =
        remaining.hours > 0
          ? `${remaining.hours}h${remaining.minutes}m`
          : `${remaining.minutes}m`;

      // 构建带图标的状态行
      let statusLine = '';

      // 显示目录（优先使用Claude Code的目录，否则显示CLI当前目录）
      const displayDir = currentDir || cliCurrentDir || '';
      if (displayDir) {
        statusLine += `${chalk.blue('📁')} ${chalk.cyan(displayDir)} | `;
      }

      // 模型信息
      statusLine += `${chalk.magenta('🤖')} ${chalk.magenta(displayModel)} | `;

      // 账户使用额度百分比（根据使用率变色）
      const usageColor = percentage >= 85 ? chalk.red : percentage >= 60 ? chalk.yellow : chalk.green;
      statusLine += `${usageColor(percentage + '%')} | `;

      // 剩余次数
      statusLine += `${chalk.yellow('↻')} ${chalk.white(usage.remaining + '/' + usage.total)} | `;

      // 上下文使用情况（参考ccline：⚡ 百分比 · token数/总大小）
      if (contextUsageTokens) {
        const contextColor = displayPercentage >= 85 ? chalk.red : displayPercentage >= 60 ? chalk.yellow : chalk.green;
        statusLine += `${contextColor('⚡')} ${contextColor(displayPercentage + '%')} ${chalk.gray('·')} ${chalk.white(formatTokens(contextUsageTokens) + '/' + contextSizeText)} | `;
      } else {
        // 没有转录数据时，显示上下文窗口大小
        statusLine += `${chalk.gray(contextSizeText)} | `;
      }

      // 剩余时间和状态图标
      const statusColor = displayPercentage >= 85 ? chalk.red : displayPercentage >= 60 ? chalk.yellow : chalk.green;
      statusLine += `${chalk.gray('⏱')} ${chalk.white(remainingText)} ${statusColor(statusIcon)}`;

      // 输出单行状态（带颜色）
      console.log(statusLine);
    } catch (error) {
      // 输出错误状态（纯文本）
      console.log(`❌ MiniMax 错误: ${error.message}`);
      process.exit(1);
    }
  });

function startWatching(api, statusBar) {
  let intervalId;

  const update = async () => {
    try {
      const apiData = await api.getUsageStatus();
      const usageData = api.parseUsageData(apiData);
      const newStatusBar = new StatusBar(usageData);

      // Clear previous output
      process.stdout.write("\x1Bc");

      console.log("\n" + newStatusBar.render() + "\n");
      console.log(chalk.gray(`最后更新: ${new Date().toLocaleTimeString()}`));
    } catch (error) {
      console.error(chalk.red(`更新失败: ${error.message}`));
    }
  };

  // Initial update
  update();

  // Update every 10 seconds for near real-time updates
  intervalId = setInterval(update, 10000);

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    clearInterval(intervalId);
    console.log(chalk.yellow("\n监控已停止"));
    process.exit(0);
  });
}

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(1);
}

program.parse();
