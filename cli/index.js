#!/usr/bin/env node

const { Command } = require("commander");
const chalk = require("chalk").default;
const ora = require("ora").default;
const MinimaxAPI = require("./api");
const StatusBar = require("./status");
const TranscriptParser = require("./transcript-parser");
const ConfigCounter = require("./config-counter");
const Renderer = require("./renderer");
const packageJson = require("../package.json");

const program = new Command();
const api = new MinimaxAPI();
const transcriptParser = new TranscriptParser();
const configCounter = new ConfigCounter();
const renderer = new Renderer();

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
  .description("在终端底部持续显示状态栏")
  .action(async () => {
    const TerminalStatusBar = require("./statusbar");
    const statusBar = new TerminalStatusBar();
    await statusBar.start();
  });

// Statusline command - 单次输出模式（Claude Code自己控制刷新）
program
  .command("statusline")
  .description("Claude Code状态栏集成（从stdin读取数据，单次输出）")
  .action(async () => {
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
        }
      }
    }

    const cliCurrentDir = process.cwd().split(/[/\\]/).pop();

    try {
      const [apiData, subscriptionData] = await Promise.all([
        api.getUsageStatus(),
        api.getSubscriptionDetails(),
      ]);
      const usageData = api.parseUsageData(apiData, subscriptionData);

      const { usage, modelName, remaining, expiry } = usageData;
      const percentage = usage.percentage;

      let displayModel = modelName;
      let currentDir = null;
      let modelId = null;
      let contextSize = 200000;

      if (stdinData) {
        if (stdinData.model && stdinData.model.display_name) {
          displayModel = stdinData.model.display_name;
          modelId = stdinData.model.id;
        } else if (stdinData.model && stdinData.model.id) {
          displayModel = stdinData.model.id;
          modelId = stdinData.model.id;
        }

        if (stdinData.workspace && stdinData.workspace.current_directory) {
          currentDir = stdinData.workspace.current_directory.split("/").pop();
        }
      } else {
        modelId = modelName.toLowerCase().replace(/\s+/g, "-");
      }

      if (modelId) {
        const modelKey = modelId.toLowerCase();
        for (const [key, value] of Object.entries(MODEL_CONTEXT_SIZES)) {
          if (modelKey.includes(key.toLowerCase())) {
            contextSize = value;
            break;
          }
        }
      }

      let contextUsageTokens = null;
      if (stdinData && stdinData.transcript_path) {
        contextUsageTokens = await transcriptParser.findLatestUsage(stdinData.transcript_path);
      }

      const displayDir = currentDir || cliCurrentDir || "";

      let configCounts = { claudeMdCount: 0, rulesCount: 0, mcpCount: 0, hooksCount: 0 };
      const workspacePath = stdinData?.workspace?.current_directory;
      if (workspacePath && typeof workspacePath === 'string') {
        configCounts = await configCounter.count(workspacePath);
      }

      let sessionDuration = null;
      if (stdinData && stdinData.transcript_path) {
        const transcript = await transcriptParser.parse(stdinData.transcript_path);
        if (transcript.sessionStart) {
          sessionDuration = formatSessionDuration(transcript.sessionStart);
        }
      }

      const context = {
        modelName: displayModel,
        currentDir: displayDir,
        usagePercentage: percentage,
        usage,
        remaining,
        expiry,
        contextUsage: contextUsageTokens,
        contextSize,
        configCounts,
        sessionDuration,
        tools: [],
        agents: [],
        todos: [],
      };

      if (stdinData && stdinData.transcript_path) {
        const transcript = await transcriptParser.parse(stdinData.transcript_path);
        context.tools = transcript.tools;
        context.agents = transcript.agents;
        context.todos = transcript.todos;
      }

      const output = renderer.render(context);
      console.log(output);
    } catch (error) {
      console.log(`❌ MiniMax 错误: ${error.message}`);
    }
  });

// 模型上下文窗口大小映射表（仅MiniMax模型）
const MODEL_CONTEXT_SIZES = {
  "minimax-m2": 200000,
  "minimax-m2-stable": 200000,
  "minimax-m1": 200000,
  "minimax-m1-stable": 200000,
};

function formatSessionDuration(sessionStart) {
  if (!sessionStart) return null;

  const ms = Date.now() - sessionStart.getTime();
  const mins = Math.floor(ms / 60000);

  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

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
