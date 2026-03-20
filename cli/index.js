#!/usr/bin/env node

// Force color output even in non-TTY environments (e.g., Claude Code statusline)
process.env.FORCE_COLOR = "1";

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
  .argument("[groupId]", "MiniMax 组 ID（已废弃，可不填）")
  .action((token, groupId) => {
    api.setCredentials(token, groupId || null);
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

      // 获取账单数据用于消耗统计
      let usageStats = null;
      try {
        const billingRecords = await api.getAllBillingRecords(10);
        if (billingRecords.length > 0) {
          // 计算套餐开始时间：到期时间往前推1个月
          let planStartTime = 0;
          if (subscriptionData &&
              subscriptionData.current_subscribe &&
              subscriptionData.current_subscribe.current_subscribe_end_time) {
            const expiryDateStr = subscriptionData.current_subscribe.current_subscribe_end_time;
            const [month, day, year] = expiryDateStr.split('/').map(Number);
            planStartTime = new Date(year, month - 2, day).getTime();
          }

          const now = Date.now();
          usageStats = api.calculateUsageStats(
            billingRecords,
            planStartTime > 0 ? planStartTime : 0,
            now
          );
        }
      } catch (billingError) {
        // 账单数据获取失败不影响主要功能
        console.error(chalk.gray(`消耗统计获取失败: ${billingError.message}`));
      }

      const statusBar = new StatusBar(usageData, usageStats, api);

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
      // 使用 Promise.race 添加超时，避免 Claude Code 场景下挂起
      const readStdin = async () => {
        const chunks = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString();
      };

      try {
        const stdinString = await Promise.race([
          readStdin(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('stdin timeout')), 1000))
        ]);

        if (stdinString.trim()) {
          try {
            stdinData = JSON.parse(stdinString);
          } catch (e) {
            // 静默忽略解析错误
          }
        }
      } catch (e) {
        // 超时或其他错误，静默继续
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
      let contextSize = 204800;

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
        // MiniMax 模型统一使用 208K context window
        contextSize = 204800;
      }

      let contextUsageTokens = null;
      if (stdinData && stdinData.transcript_path) {
        contextUsageTokens = await transcriptParser.findLatestUsage(stdinData.transcript_path);
      }

      const displayDir = currentDir || cliCurrentDir || "";

      let configCounts = { claudeMdCount: 0, rulesCount: 0, mcpCount: 0, hooksCount: 0 };
      // 优先使用 stdin 传入的 workspacePath，否则 fallback 到 process.cwd()
      const workspacePath = stdinData?.workspace?.current_directory || process.cwd();
      if (workspacePath) {
        try {
          // 添加超时防止挂起
          configCounts = await Promise.race([
            configCounter.count(workspacePath),
            new Promise((_, reject) => setTimeout(() => reject(new Error('config timeout')), 2000))
          ]);
        } catch (e) {
          // 超时或失败，保持默认值
        }
      }

      // 获取 git 分支信息
      // 优先使用 stdin 传入的 workspacePath，否则 fallback 到 process.cwd()
      const gitSearchPath = workspacePath || process.cwd();
      let gitBranch = null;
      if (gitSearchPath) {
        try {
          const branch = require('child_process').execSync(
            'git symbolic-ref --short HEAD',
            { cwd: gitSearchPath, encoding: 'utf8', timeout: 3000 }
          ).trim();
          if (branch) {
            gitBranch = { name: branch };

            // 获取 ahead/behind
            let hasUpstream = false;
            try {
              const revList = require('child_process').execSync(
                'git rev-list --left-right --count HEAD...@{upstream}',
                { cwd: gitSearchPath, encoding: 'utf8', timeout: 3000 }
              ).trim();
              if (revList) {
                hasUpstream = true;
                const [behind, ahead] = revList.split(/\s+/).map(n => parseInt(n) || 0);
                if (ahead > 0 || behind > 0) {
                  gitBranch.ahead = ahead;
                  gitBranch.behind = behind;
                }
              }
            } catch (e) {
              // 无 upstream 或获取失败，静默跳过
            }

            // 如果没有 upstream，尝试获取本地 commit 数作为提示
            if (!hasUpstream) {
              try {
                const localCommits = require('child_process').execSync(
                  'git rev-list --count HEAD',
                  { cwd: gitSearchPath, encoding: 'utf8', timeout: 3000 }
                ).trim();
                const commitCount = parseInt(localCommits) || 0;
                // 如果有本地 commits（大于1，因为初始commit算1个），标记有待推送
                if (commitCount > 1) {
                  gitBranch.ahead = -1; // -1 表示有未知数量的待推送
                }
              } catch (e) {
                // 获取失败，静默跳过
              }
            }

            // 检查未提交的更改
            try {
              const status = require('child_process').execSync(
                'git status --porcelain',
                { cwd: gitSearchPath, encoding: 'utf8', timeout: 3000 }
              ).trim();
              if (status) {
                gitBranch.hasChanges = true;
              }
            } catch (e) {
              // 获取失败，静默跳过
            }
          }
        } catch (e) {
          // 非 git 目录或获取失败，静默跳过
        }
      }

      // 使用 Claude Code 提供的 context_window（最准确）
      let contextUsageValue = contextUsageTokens;
      let contextSizeValue = contextSize;

      if (stdinData?.context_window) {
        const cw = stdinData.context_window;
        contextSizeValue = cw.context_window_size || contextSize;
      }

      const context = {
        modelName: displayModel,
        currentDir: displayDir,
        usagePercentage: percentage,
        usage,
        remaining,
        expiry,
        weekly: usageData.weekly,
        contextUsage: contextUsageValue,
        contextSize: contextSizeValue,
        configCounts,
        gitBranch,
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

      console.log(renderer.render(context));
    } catch (error) {
      console.log(`❌ MiniMax 错误: ${error.message}`);
    }
  });

// Droid-statusline command - Droid 状态栏集成（从 session 文件读取数据）
program
  .command("droid-statusline")
  .description("Droid状态栏集成（从 session 文件读取数据，单次输出）")
  .argument("[sessionPath]", "Droid session 目录路径（可选，默认自动查找）")
  .action(async (sessionPath) => {
    const fs = require("fs");
    const path = require("path");

    // 查找 session 目录
    let targetSessionPath = sessionPath;
    const currentCwd = process.cwd().replace(/\\/g, "/");
    
    if (!targetSessionPath) {
      const sessionsDir = path.join(process.env.HOME || process.env.USERPROFILE, ".factory", "sessions");
      
      if (!fs.existsSync(sessionsDir)) {
        console.log("❌ 未找到 Droid sessions 目录");
        process.exit(1);
      }

      // 优先查找与当前工作目录匹配的 session
      const userDirs = fs.readdirSync(sessionsDir);
      let matchedSession = null;
      let latestSession = null;
      let latestStartTime = 0;

      for (const userDir of userDirs) {
        const userPath = path.join(sessionsDir, userDir);
        if (!fs.statSync(userPath).isDirectory()) continue;

        const sessions = fs.readdirSync(userPath);
        for (const session of sessions) {
          if (!session.endsWith(".jsonl")) continue;
          
          const jsonlPath = path.join(userPath, session);
          try {
            const content = fs.readFileSync(jsonlPath, "utf8");
            const firstLine = content.split("\n")[0];
            const entry = JSON.parse(firstLine);
            
            if (entry.cwd) {
              const sessionCwd = entry.cwd.replace(/\\/g, "/");
              // 优先匹配当前工作目录
              if (sessionCwd === currentCwd || currentCwd.includes(sessionCwd) || sessionCwd.includes(currentCwd)) {
                if (!matchedSession) {
                  matchedSession = userPath;
                }
              }
            }
            
            // 记录最新 session
            if (entry.timestamp) {
              const startTime = new Date(entry.timestamp).getTime();
              if (startTime > latestStartTime) {
                latestStartTime = startTime;
                latestSession = userPath;
              }
            }
          } catch (e) {
            // continue
          }
        }
      }

      // 优先使用匹配的 session，否则用最新的
      targetSessionPath = matchedSession || latestSession;

      if (!targetSessionPath) {
        console.log("❌ 未找到 Droid session");
        process.exit(1);
      }
    }

    // 读取 settings.json
    const settingsFiles = fs.readdirSync(targetSessionPath).filter(f => f.endsWith(".settings.json"));
    let settings = {};
    
    for (const sf of settingsFiles) {
      try {
        const content = fs.readFileSync(path.join(targetSessionPath, sf), "utf8");
        const parsed = JSON.parse(content);
        if (parsed.tokenUsage) {
          settings = parsed;
          break;
        }
      } catch (e) {
        // continue
      }
    }

    // 读取 jsonl 获取 cwd 和模型信息，以及实时 token 使用量
    let cwd = process.cwd();
    let jsonlTokens = null;
    const jsonlFiles = fs.readdirSync(targetSessionPath).filter(f => f.endsWith(".jsonl"));
    
    for (const jf of jsonlFiles) {
      try {
        const content = fs.readFileSync(path.join(targetSessionPath, jf), "utf8");
        const lines = content.split('\n').filter(l => l.trim());
        
        // 获取第一行获取 cwd
        if (lines.length > 0) {
          try {
            const firstEntry = JSON.parse(lines[0]);
            if (firstEntry.cwd) {
              cwd = firstEntry.cwd;
            }
          } catch (e) {}
        }
        
        // 从最后的消息中解析实时 token 使用量
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            // 查找 assistant 消息中的 usage
            if (entry.type === 'message' && entry.message?.role === 'assistant' && entry.message?.usage) {
              const u = entry.message.usage;
              jsonlTokens = {
                inputTokens: u.input_tokens || u.prompt_tokens || 0,
                outputTokens: u.output_tokens || u.completion_tokens || 0,
                cacheCreationTokens: u.cache_creation_input_tokens || u.cache_creation_prompt_tokens || 0,
                cacheReadTokens: u.cache_read_input_tokens || u.cache_read_prompt_tokens || 0,
                thinkingTokens: u.thinking_tokens || 0
              };
              break;
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        // continue
      }
    }

    const currentDir = cwd.split(/[/\\]/).pop();

    // 优先使用 jsonl 中的实时 token 使用量，否则用 settings 中的累计值
    const tokenUsage = (jsonlTokens && (jsonlTokens.inputTokens > 0 || jsonlTokens.outputTokens > 0)) 
      ? jsonlTokens 
      : (settings.tokenUsage || {});
    
    const inputTokens = tokenUsage.inputTokens || 0;
    const outputTokens = tokenUsage.outputTokens || 0;
    const cacheCreationTokens = tokenUsage.cacheCreationTokens || 0;
    const cacheReadTokens = tokenUsage.cacheReadTokens || 0;
    const thinkingTokens = tokenUsage.thinkingTokens || 0;
    
    // 实时上下文使用量（不包括累计的 cacheReadTokens）
    const contextTokens = inputTokens + outputTokens + cacheCreationTokens + thinkingTokens;
    // 累计 token（用于显示）
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens + thinkingTokens;

    // 获取模型信息
    const modelName = settings.model || "MiniMax-M2.5-highspeed";
    const modelDisplayName = modelName.replace(/^custom:/, "").replace(/-[0-9]+$/, "");

    // 获取 API 使用量
    let usageData = null;
    try {
      const [apiData, subscriptionData] = await Promise.all([
        api.getUsageStatus(),
        api.getSubscriptionDetails(),
      ]);
      usageData = api.parseUsageData(apiData, subscriptionData);
    } catch (e) {
      usageData = {
        usage: { percentage: 0, input: 0, output: 0, cached: 0, total: 0 },
        weekly: null,
        remaining: "未知",
        expiry: "未知",
        modelName: modelDisplayName
      };
    }

    const { usage, weekly, remaining, expiry } = usageData;

    // 获取 git 分支
    let gitBranch = null;
    try {
      const branch = require('child_process').execSync(
        'git symbolic-ref --short HEAD',
        { cwd: cwd, encoding: 'utf8', timeout: 3000 }
      ).trim();
      if (branch) {
        gitBranch = { name: branch };
        
        // 检查未提交的更改
        try {
          const status = require('child_process').execSync(
            'git status --porcelain',
            { cwd: cwd, encoding: 'utf8', timeout: 3000 }
          ).trim();
          if (status) {
            gitBranch.hasChanges = true;
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // 非 git 目录
    }

    // 计算上下文使用量（从 session 实时 token）
    // 使用实时 contextTokens 计算百分比
    const contextUsageValue = contextTokens;
    const contextSizeValue = 204800; // MiniMax M2 context window

    // 获取 Droid 全局配置统计（不是当前工作目录）
    const droidConfigDir = path.join(process.env.HOME || process.env.USERPROFILE, ".factory");
    let configCounts = { claudeMdCount: 0, rulesCount: 0, mcpCount: 0, hooksCount: 0, skillsCount: 0 };
    
    try {
      const agentsPath = path.join(droidConfigDir, "agents");
      const rulesPath = path.join(droidConfigDir, "rules");
      const skillsPath = path.join(droidConfigDir, "skills");
      const hooksPath = path.join(droidConfigDir, "hooks");
      const mcpPath = path.join(droidConfigDir, "mcp.json");

      if (fs.existsSync(agentsPath)) {
        configCounts.claudeMdCount = fs.readdirSync(agentsPath).filter(f => f.endsWith(".md")).length;
      }
      if (fs.existsSync(rulesPath)) {
        configCounts.rulesCount = fs.readdirSync(rulesPath).filter(f => f.endsWith(".md")).length;
      }
      if (fs.existsSync(skillsPath)) {
        configCounts.skillsCount = fs.readdirSync(skillsPath).filter(f => f.endsWith(".md")).length;
      }
      if (fs.existsSync(hooksPath)) {
        configCounts.hooksCount = fs.readdirSync(hooksPath).filter(f => f.endsWith(".ps1") || f.endsWith(".sh")).length;
      }
      if (fs.existsSync(mcpPath)) {
        try {
          const mcpData = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
          if (mcpData.mcpServers) {
            configCounts.mcpCount = Object.keys(mcpData.mcpServers).length;
          }
        } catch (e) {}
      }
    } catch (e) {
      // ignore errors
    }

    // 进度条渲染函数
    function getBarColor(p) {
      if (p >= 85) return chalk.red;
      if (p >= 60) return chalk.yellow;
      return chalk.green;
    }
    const coloredBar = (percent, width = 10) => {
      const filled = Math.round((percent / 100) * width);
      const empty = width - filled;
      const barColor = getBarColor(percent);
      return barColor('█'.repeat(filled) + '\x1b[2m' + '░'.repeat(empty) + '\x1b[0m');
    };

    // 简化输出：目录 | git分支 | 使用量(进度条) | 倒计时
    const parts = [];
    
    // 目录
    if (currentDir) {
      parts.push(`${chalk.cyan(currentDir)}`);
    }
    
    // Git 分支
    if (gitBranch && gitBranch.name) {
      const isMainBranch = gitBranch.name === 'main' || gitBranch.name === 'master';
      const branchColor = isMainBranch ? chalk.green : chalk.white;
      let branchStr = branchColor(gitBranch.name);
      if (gitBranch.hasChanges) {
        branchStr += chalk.red(' *');
      }
      parts.push(branchStr);
    }
    
    // 使用量 - 进度条风格 (显示次数)
    const usageBar = coloredBar(usage.percentage);
    const usageColor = usage.percentage >= 85 ? chalk.red : usage.percentage >= 60 ? chalk.yellow : chalk.green;
    let usageLine = `${chalk.yellow('Usage')} ${usageBar} ${usageColor(usage.percentage + '%')} (${usage.remaining}/${usage.total})`;
    // 周用量紧跟在 usage 后面
    if (weekly) {
      const weeklyColor = weekly.percentage >= 85 ? chalk.red : weekly.percentage >= 60 ? chalk.yellow : chalk.green;
      usageLine += ` ${chalk.gray('·')} ${chalk.blue('W')} ${weeklyColor(weekly.percentage + '%')}`;
    }
    parts.push(usageLine);
    
    // 倒计时
    const remainingText = remaining.hours > 0 
      ? `${remaining.hours}h${remaining.minutes}m` 
      : `${remaining.minutes}m`;
    parts.push(`${chalk.yellow('⏱')} ${remainingText}`);
    
    // 到期
    if (expiry) {
      const expiryColor = expiry.daysRemaining <= 3 ? chalk.red : expiry.daysRemaining <= 7 ? chalk.yellow : chalk.green;
      parts.push(`${expiryColor('到期 ' + expiry.daysRemaining + '天')}`);
    }
    
    console.log(parts.join(' │ '));
  });

// 模型上下文窗口大小（仅MiniMax模型）

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
