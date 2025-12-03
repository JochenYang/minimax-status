#!/usr/bin/env node

const { Command } = require("commander");
const chalk = require("chalk").default;
const ora = require("ora").default;
const MinimaxAPI = require("./api");
const StatusBar = require("./status");
const packageJson = require("../package.json");

const program = new Command();
const api = new MinimaxAPI();

program
  .name("minimax-status")
  .description("MiniMax Claude Code 使用状态监控工具")
  .version(packageJson.version);

// Auth command (设置认证凭据)
program
  .command("auth")
  .description("设置认证凭据")
  .argument("<token>", "MiniMax 访问令牌")
  .argument("<groupId>", "MiniMax 组 ID")
  .action((token, groupId) => {
    api.setCredentials(token, groupId);
    console.log(chalk.green("✓ 认证信息已保存"));
  });

// Health check command (检查配置和连接状态)
program
  .command("health")
  .description("检查配置和连接状态")
  .action(async () => {
    const spinner = ora("正在检查...").start();
    let checks = {
      config: false,
      token: false,
      groupId: false,
      api: false,
    };

    // 检查配置文件
    try {
      const configPath = require("path").join(
        process.env.HOME || process.env.USERPROFILE,
        ".minimax-config.json"
      );
      if (require("fs").existsSync(configPath)) {
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
    const allPassed = Object.values(checks).every((v) => v);
    if (allPassed) {
      console.log(chalk.green("✓ 所有检查通过，配置正常！"));
    } else {
      console.log(chalk.yellow("⚠ 发现问题，请检查上述错误信息"));
    }
  });

// Status command (显示当前使用状态)
program
  .command("status")
  .description("显示当前使用状态")
  .option("-c, --compact", "紧凑模式显示")
  .option("-w, --watch", "实时监控模式")
  .action(async (options) => {
    const spinner = ora("获取使用状态中...").start();

    try {
      const [apiData, subscriptionData] = await Promise.all([
        api.getUsageStatus(),
        api.getSubscriptionDetails(),
      ]);
      const usageData = api.parseUsageData(apiData, subscriptionData);
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

// List command (显示所有模型的使用状态)
program
  .command("list")
  .description("显示所有模型的使用状态")
  .action(async () => {
    const spinner = ora("获取使用状态中...").start();

    try {
      const [apiData, subscriptionData] = await Promise.all([
        api.getUsageStatus(),
        api.getSubscriptionDetails(),
      ]);
      const usageData = api.parseUsageData(apiData, subscriptionData);
      const statusBar = new StatusBar(usageData);

      spinner.succeed("状态获取成功");
      console.log("\n" + statusBar.render() + "\n");
    } catch (error) {
      spinner.fail(chalk.red("获取状态失败"));
      console.error(chalk.red(`错误: ${error.message}`));
      process.exit(1);
    }
  });

// StatusBar command (持续显示在终端底部)
program
  .command("bar")
  .description("在终端底部持续显示状态栏（类似 ccline）")
  .action(async () => {
    const TerminalStatusBar = require("./statusbar");
    const statusBar = new TerminalStatusBar();
    await statusBar.start();
  });

// 模型上下文窗口大小映射表（仅MiniMax模型）
const MODEL_CONTEXT_SIZES = {
  "minimax-m2": 200000,
  "minimax-m2-stable": 200000,
  "minimax-m1": 200000,
  "minimax-m1-stable": 200000,
};

// 解析转录文件
async function parseTranscriptUsage(transcriptPath) {
  const fs = require("fs").promises;
  const path = require("path");

  try {
    // 尝试从当前转录文件解析
    const usage = await tryParseTranscriptFile(transcriptPath);
    if (usage !== null) {
      return usage;
    }

    // 如果文件不存在，尝试从项目历史中查找
    try {
      await fs.access(transcriptPath);
    } catch {
      // 文件不存在，查找项目历史
      return await tryFindUsageFromProjectHistory(transcriptPath);
    }

    return null;
  } catch (error) {
    return null;
  }
}

// 尝试解析单个转录文件
async function tryParseTranscriptFile(transcriptPath) {
  const fs = require("fs").promises;

  try {
    const fileContent = await fs.readFile(transcriptPath, "utf8");
    const lines = fileContent
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    if (lines.length === 0) {
      return null;
    }

    // 检查最后一行是否是 summary
    const lastLine = lines[lines.length - 1].trim();
    const lastEntry = JSON.parse(lastLine);

    if (lastEntry.type === "summary" && lastEntry.leafUuid) {
      // 处理 summary 情况：通过 leafUuid 查找
      const projectDir = require("path").dirname(transcriptPath);
      return await findUsageByLeafUuid(lastEntry.leafUuid, projectDir);
    }

    // 正常情况：查找最后的 assistant 消息
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);
        if (
          entry.type === "assistant" &&
          entry.message &&
          entry.message.usage
        ) {
          return calculateUsageTokens(entry.message.usage);
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// 通过 leafUuid 查找 usage
async function findUsageByLeafUuid(leafUuid, projectDir) {
  const fs = require("fs").promises;
  const path = require("path");

  try {
    const entries = await fs.readdir(projectDir);

    for (const entry of entries) {
      const filePath = path.join(projectDir, entry);
      const stat = await fs.stat(filePath);

      if (stat.isFile() && path.extname(filePath) === ".jsonl") {
        const usage = await searchUuidInFile(filePath, leafUuid);
        if (usage !== null) {
          return usage;
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// 在文件中搜索指定的 UUID
async function searchUuidInFile(filePath, targetUuid) {
  const fs = require("fs").promises;

  try {
    const fileContent = await fs.readFile(filePath, "utf8");
    const lines = fileContent
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    // 查找目标 UUID 的消息
    for (const line of lines) {
      try {
        const entry = JSON.parse(line.trim());

        if (entry.uuid === targetUuid) {
          // 找到目标消息
          if (
            entry.type === "assistant" &&
            entry.message &&
            entry.message.usage
          ) {
            return calculateUsageTokens(entry.message.usage);
          } else if (entry.type === "user" && entry.parentUuid) {
            // 用户消息，需要查找父 assistant 消息
            return await findAssistantMessageByUuid(lines, entry.parentUuid);
          }
          break;
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// 通过 UUID 查找 assistant 消息
async function findAssistantMessageByUuid(lines, targetUuid) {
  for (const line of lines) {
    try {
      const entry = JSON.parse(line.trim());

      if (entry.uuid === targetUuid && entry.type === "assistant") {
        if (entry.message && entry.message.usage) {
          return calculateUsageTokens(entry.message.usage);
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// 从项目历史中查找最近的 usage
async function tryFindUsageFromProjectHistory(transcriptPath) {
  const fs = require("fs").promises;
  const path = require("path");

  try {
    const projectDir = path.dirname(transcriptPath);
    const entries = await fs.readdir(projectDir);

    // 收集所有 .jsonl 文件
    const sessionFiles = [];
    for (const entry of entries) {
      const filePath = path.join(projectDir, entry);
      const stat = await fs.stat(filePath);

      if (stat.isFile() && path.extname(filePath) === ".jsonl") {
        sessionFiles.push({
          path: filePath,
          mtime: stat.mtime,
        });
      }
    }

    if (sessionFiles.length === 0) {
      return null;
    }

    // 按修改时间排序（最新的在前）
    sessionFiles.sort((a, b) => b.mtime - a.mtime);

    // 尝试从最近的会话文件中查找
    for (const file of sessionFiles) {
      const usage = await tryParseTranscriptFile(file.path);
      if (usage !== null) {
        return usage;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// 计算token使用量（参考ccline的normalize逻辑）
function calculateUsageTokens(usage) {
  // 合并 input tokens (优先级: input_tokens > prompt_tokens)
  const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;

  // 合并 output tokens (优先级: output_tokens > completion_tokens)
  const outputTokens = usage.output_tokens || usage.completion_tokens || 0;

  // 合并 cache creation tokens (优先级: Anthropic > OpenAI)
  const cacheCreation =
    usage.cache_creation_input_tokens ||
    usage.cache_creation_prompt_tokens ||
    0;

  // 合并 cache read tokens (优先级: Anthropic > OpenAI > nested format)
  const cacheRead =
    usage.cache_read_input_tokens ||
    usage.cache_read_prompt_tokens ||
    usage.cached_tokens ||
    (usage.prompt_tokens_details &&
      usage.prompt_tokens_details.cached_tokens) ||
    0;

  // 计算上下文窗口使用的 tokens
  // 包括：input + output + cache_creation + cache_read
  const contextTokens = inputTokens + outputTokens + cacheCreation + cacheRead;

  // 如果有 context_tokens，优先使用
  if (contextTokens > 0) {
    return contextTokens;
  }

  // 如果有 total_tokens，使用它
  if (usage.total_tokens) {
    return usage.total_tokens;
  }

  // 最后的回退
  return 0;
}

// Statusline command - 单次输出模式（Claude Code自己控制刷新）
program
  .command("statusline")
  .description("Claude Code状态栏集成（从stdin读取数据，单次输出）")
  .action(async () => {
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

    // 获取CLI当前目录
    const cliCurrentDir = process.cwd().split(/[\\/]/).pop();

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
        // 正确的格式化：保留一位小数
        return `${Math.round(tokens / 100) / 10}k`;
      }
      return `${tokens}`;
    };

    try {
      // 获取使用状态
      const [apiData, subscriptionData] = await Promise.all([
        api.getUsageStatus(),
        api.getSubscriptionDetails(),
      ]);
      const usageData = api.parseUsageData(apiData, subscriptionData);

      // 构建状态信息
      const { usage, modelName, remaining, expiry } = usageData;
      const percentage = usage.percentage;

      // 从stdin数据获取Claude Code信息
      let displayModel = modelName;
      let currentDir = null;
      let modelId = null;
      let contextSize = 200000; // 默认值

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
          currentDir = stdinData.workspace.current_directory.split("/").pop();
        }
      } else {
        // 如果没有stdin，使用API返回的模型名作为ID
        modelId = modelName.toLowerCase().replace(/\s+/g, "-");
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
        contextUsageTokens = await parseTranscriptUsage(
          stdinData.transcript_path
        );
        if (contextUsageTokens) {
          contextUsagePercentage = Math.round(
            (contextUsageTokens / contextSize) * 100
          );
        }
      }

      const contextSizeText = formatContextSize(contextSize);

      // 状态图标（基于真实上下文使用情况，否则基于额度）
      const displayPercentage = contextUsagePercentage || percentage;
      const statusIcon =
        displayPercentage >= 85 ? "⚠" : displayPercentage >= 60 ? "⚡" : "✓";

      // 剩余时间文本
      const remainingText =
        remaining.hours > 0
          ? `${remaining.hours}h${remaining.minutes}m`
          : `${remaining.minutes}m`;

      // 构建带图标的状态行
      let statusLine = "";

      // 显示目录（优先使用Claude Code的目录，否则显示CLI当前目录）
      const displayDir = currentDir || cliCurrentDir || "";
      if (displayDir) {
        statusLine += `${chalk.blue("📁")} ${chalk.cyan(displayDir)} | `;
      }

      // 模型信息
      statusLine += `${chalk.magenta("🤖")} ${chalk.magenta(displayModel)} | `;

      // 账户使用额度百分比（根据使用率变色）
      const usageColor =
        percentage >= 85
          ? chalk.red
          : percentage >= 60
          ? chalk.yellow
          : chalk.green;
      statusLine += `${usageColor(percentage + "%")} | `;

      // 剩余次数
      statusLine += `${chalk.yellow("↻")} ${chalk.white(
        usage.remaining + "/" + usage.total
      )} | `;

      // 上下文使用情况（参考ccline：⚡ 百分比 · token数/总大小）
      if (contextUsageTokens) {
        const contextColor =
          displayPercentage >= 85
            ? chalk.red
            : displayPercentage >= 60
            ? chalk.yellow
            : chalk.green;
        statusLine += `${contextColor("⚡")} ${contextColor(
          displayPercentage + "%"
        )} ${chalk.gray("·")} ${chalk.white(
          formatTokens(contextUsageTokens) + "/" + contextSizeText
        )} | `;
      } else {
        // 没有转录数据时，显示上下文窗口大小
        statusLine += `${chalk.gray(contextSizeText)} | `;
      }

      // 剩余时间（去掉状态图标，避免重复显示）
      statusLine += `${chalk.gray("⏱")} ${chalk.white(remainingText)}`;

      // 套餐到期时间（如果可用）
      if (expiry) {
        statusLine += ` | ${chalk.gray("剩余:")} ${chalk.white(
          expiry.daysRemaining + "天"
        )}`;
      }

      // 单次输出后就退出
      console.log(statusLine);
    } catch (error) {
      // 输出错误状态（纯文本）
      console.log(`❌ MiniMax 错误: ${error.message}`);
    }
  });

function startWatching(api, statusBar) {
  let intervalId;

  const update = async () => {
    try {
      const apiData = await api.getUsageStatus();
      const usageData = api.parseUsageData(apiData);
      const newStatusBar = new StatusBar(usageData);

      // 清除之前的输出
      process.stdout.write("\x1Bc");

      console.log("\n" + newStatusBar.render() + "\n");
      console.log(chalk.gray(`最后更新: ${new Date().toLocaleTimeString()}`));
    } catch (error) {
      console.error(chalk.red(`更新失败: ${error.message}`));
    }
  };

  // 初始更新
  update();

  // 每10秒更新一次，以近实时更新
  intervalId = setInterval(update, 10000);

  // 处理Ctrl+C
  process.on("SIGINT", () => {
    clearInterval(intervalId);
    console.log(chalk.yellow("\n监控已停止"));
    process.exit(0);
  });
}

// 如果没有命令提供帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(1);
}

program.parse();
