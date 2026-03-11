#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  loadConfig,
  getConfigPaths,
  initConfig,
  getEnabledRules,
  getRulesByNames,
  validateConfig,
} from "./core/config.js";
import { scanRules } from "./core/scanner.js";
import { cleanRules, summarizeResults } from "./core/cleaner.js";
import { formatSize } from "./core/rule-engine.js";
import { isDaemonRunning, getHistory, getStats } from "./daemon/state.js";
import * as launchd from "./launchd/manager.js";
import type { ScanResult, CleanupResult } from "./core/types.js";
import {
  formatError,
  ConfigValidationError,
  ConfigParseError,
  RuleNotFoundError,
} from "./core/errors.js";

const program = new Command();

program
  .name("il-folletto")
  .description("macOS file cleaning daemon with complex pattern matching")
  .version("0.1.0");

// Config command
program
  .command("config")
  .description("Show or initialize configuration")
  .option("--init", "Initialize config with default template")
  .option("--path", "Show config file path")
  .option("--validate", "Validate the configuration file")
  .action(async (options) => {
    const paths = getConfigPaths();

    if (options.init) {
      const created = await initConfig();
      if (created) {
        console.log(chalk.green("✓ Config initialized at:"), paths.configFile);
      } else {
        console.log(chalk.yellow("Config already exists at:"), paths.configFile);
      }
      return;
    }

    if (options.path) {
      console.log(paths.configFile);
      return;
    }

    if (options.validate) {
      const spinner = ora("Validating configuration...").start();
      try {
        const config = await loadConfig();
        spinner.succeed("Configuration is valid");
        console.log(chalk.gray(`\n  Rules: ${config.rules.length}`));
        console.log(chalk.gray(`  Schedules: ${config.schedules.length}`));
        console.log(chalk.gray(`  Watchers: ${config.watchers.length}`));

        // Check for potential issues
        const warnings: string[] = [];

        // Check for disabled rules
        const disabledRules = config.rules.filter((r) => !r.enabled);
        if (disabledRules.length > 0) {
          warnings.push(`${disabledRules.length} rule(s) are disabled`);
        }

        // Check for schedules referencing non-existent rules
        for (const schedule of config.schedules) {
          for (const ruleName of schedule.rules) {
            if (ruleName !== "all" && !config.rules.find((r) => r.name === ruleName)) {
              warnings.push(`Schedule "${schedule.name}" references unknown rule "${ruleName}"`);
            }
          }
        }

        // Check for watchers referencing non-existent rules
        for (const watcher of config.watchers) {
          for (const ruleName of watcher.rules) {
            if (ruleName !== "all" && !config.rules.find((r) => r.name === ruleName)) {
              warnings.push(`Watcher for "${watcher.path}" references unknown rule "${ruleName}"`);
            }
          }
        }

        if (warnings.length > 0) {
          console.log(chalk.yellow("\nWarnings:"));
          for (const warning of warnings) {
            console.log(chalk.yellow(`  ⚠ ${warning}`));
          }
        }
      } catch (error) {
        spinner.fail("Configuration is invalid");
        if (error instanceof ConfigValidationError) {
          console.error(chalk.red("\n" + formatError(error)));
        } else if (error instanceof ConfigParseError) {
          console.error(chalk.red(`\nParse error: ${formatError(error)}`));
        } else {
          console.error(chalk.red(`\nError: ${formatError(error)}`));
        }
        process.exit(1);
      }
      return;
    }

    // Show all paths
    console.log(chalk.bold("Configuration paths:"));
    console.log(`  Config file: ${paths.configFile}`);
    console.log(`  State file:  ${paths.stateFile}`);
    console.log(`  Log dir:     ${paths.logDir}`);
  });

// TUI command
program
  .command("tui")
  .description("Launch interactive terminal UI")
  .action(async () => {
    try {
      const config = await loadConfig();
      const { runTUI } = await import("./tui/app.js");
      await runTUI(config);
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        console.error(chalk.red("Configuration Error:\n"));
        console.error(chalk.red(formatError(error)));
      } else {
        console.error(chalk.red(`Error: ${formatError(error)}`));
      }
      process.exit(1);
    }
  });

// Dry-run command
program
  .command("dry-run [rules...]")
  .description("Preview what would be cleaned (no changes made)")
  .action(async (ruleNames: string[]) => {
    const spinner = ora("Loading configuration...").start();

    try {
      const config = await loadConfig();
      const rules =
        ruleNames.length > 0
          ? getRulesByNames(config, ruleNames)
          : getEnabledRules(config);

      if (rules.length === 0) {
        spinner.fail("No rules found or enabled");
        return;
      }

      spinner.text = `Scanning ${rules.length} rule(s)...`;
      const results = await scanRules(rules);
      spinner.stop();

      printScanResults(results);
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        spinner.fail("Configuration Error");
        console.error(chalk.red(formatError(error)));
      } else {
        spinner.fail(`Error: ${formatError(error)}`);
      }
      process.exit(1);
    }
  });

// Clean command
program
  .command("clean [rules...]")
  .description("Execute cleanup")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (ruleNames: string[], options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      const config = await loadConfig();
      const rules =
        ruleNames.length > 0
          ? getRulesByNames(config, ruleNames)
          : getEnabledRules(config);

      if (rules.length === 0) {
        spinner.fail("No rules found or enabled");
        return;
      }

      // First do a dry run
      spinner.text = `Scanning ${rules.length} rule(s)...`;
      const scanResults = await scanRules(rules);
      spinner.stop();

      const totalFiles = scanResults.reduce((sum, r) => sum + r.totalCount, 0);
      const totalSize = scanResults.reduce((sum, r) => sum + r.totalSize, 0);

      if (totalFiles === 0) {
        console.log(chalk.yellow("No files to clean."));
        return;
      }

      printScanResults(scanResults);

      // Confirm if not using --yes
      if (!options.yes) {
        const readline = await import("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            chalk.yellow(`\nProceed with cleanup? [y/N] `),
            resolve
          );
        });
        rl.close();

        if (answer.toLowerCase() !== "y") {
          console.log(chalk.gray("Cleanup cancelled."));
          return;
        }
      }

      // Execute cleanup
      spinner.start("Cleaning...");
      const cleanResults = await cleanRules(
        rules,
        config.global.defaultAction,
        config.global.dryRun,
        (progress) => {
          spinner.text = `[${progress.current}/${progress.total}] ${progress.action}: ${progress.currentFile}`;
        }
      );
      spinner.stop();

      printCleanupResults(cleanResults);
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        spinner.fail("Configuration Error");
        console.error(chalk.red(formatError(error)));
      } else {
        spinner.fail(`Error: ${formatError(error)}`);
      }
      process.exit(1);
    }
  });

// Rules command
program
  .command("rules")
  .description("List all configured rules")
  .action(async () => {
    try {
      const config = await loadConfig();

      if (config.rules.length === 0) {
        console.log(chalk.yellow("No rules configured."));
        console.log(`Run ${chalk.cyan("il-folletto config --init")} to create a default config.`);
        return;
      }

      console.log(chalk.bold("\nConfigured rules:\n"));

      for (const rule of config.rules) {
        const status = rule.enabled
          ? chalk.green("●")
          : chalk.gray("○");
        const action = chalk.cyan(rule.action ?? config.global.defaultAction);

        console.log(`${status} ${chalk.bold(rule.name)} [${action}]`);
        if (rule.description) {
          console.log(`  ${chalk.gray(rule.description)}`);
        }
        console.log(`  Paths: ${rule.paths.join(", ")}`);
        console.log(`  Patterns: ${rule.patterns.join(", ")}`);
        if (rule.conditions) {
          const conds = Object.entries(rule.conditions)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ");
          console.log(`  Conditions: ${conds}`);
        }
        console.log();
      }
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        console.error(chalk.red("Configuration Error:\n"));
        console.error(chalk.red(formatError(error)));
      } else {
        console.error(chalk.red(`Error: ${formatError(error)}`));
      }
      process.exit(1);
    }
  });

// Helper to print scan results
function printScanResults(results: ScanResult[]): void {
  const totalFiles = results.reduce((sum, r) => sum + r.totalCount, 0);
  const totalSize = results.reduce((sum, r) => sum + r.totalSize, 0);

  console.log(chalk.bold("\nScan Results:\n"));

  for (const result of results) {
    if (result.totalCount === 0) {
      console.log(`${chalk.gray("○")} ${result.rule}: ${chalk.gray("no matches")}`);
    } else {
      console.log(
        `${chalk.green("●")} ${result.rule}: ${chalk.bold(result.totalCount)} files (${formatSize(result.totalSize)})`
      );

      // Show first few files
      const preview = result.files.slice(0, 5);
      for (const file of preview) {
        console.log(`  ${chalk.gray("→")} ${file.path} (${formatSize(file.size)})`);
      }
      if (result.files.length > 5) {
        console.log(chalk.gray(`  ... and ${result.files.length - 5} more files`));
      }
    }
    console.log();
  }

  console.log(chalk.bold("─".repeat(50)));
  console.log(
    `Total: ${chalk.bold(totalFiles)} files, ${chalk.bold(formatSize(totalSize))}`
  );
}

// Helper to print cleanup results
function printCleanupResults(results: CleanupResult[]): void {
  const summary = summarizeResults(results);

  console.log(chalk.bold("\nCleanup Complete:\n"));

  for (const result of results) {
    const status = result.failed === 0 ? chalk.green("✓") : chalk.yellow("!");
    console.log(
      `${status} ${result.rule}: ${result.processed} files (${formatSize(result.totalSize)}) [${result.action}]`
    );

    if (result.errors.length > 0) {
      for (const error of result.errors.slice(0, 3)) {
        console.log(chalk.red(`  ✗ ${error.path}: ${error.error}`));
      }
      if (result.errors.length > 3) {
        console.log(chalk.red(`  ... and ${result.errors.length - 3} more errors`));
      }
    }
  }

  console.log(chalk.bold("\n" + "─".repeat(50)));
  console.log(
    `Total: ${chalk.green(summary.totalProcessed)} cleaned, ` +
      `${summary.totalFailed > 0 ? chalk.red(summary.totalFailed + " failed") : chalk.gray("0 failed")}, ` +
      `${chalk.bold(formatSize(summary.totalSize))} freed`
  );
  console.log(`Duration: ${(summary.totalDuration / 1000).toFixed(1)}s`);
}

// Daemon command group
const daemon = program
  .command("daemon")
  .description("Manage the background daemon");

daemon
  .command("status")
  .description("Show daemon status")
  .action(() => {
    const launchdStatus = launchd.getStatus();
    const daemonStatus = isDaemonRunning();
    const stats = getStats();

    console.log(chalk.bold("\nDaemon Status:\n"));

    // Launchd status
    console.log(chalk.gray("launchd service:"));
    console.log(`  Installed: ${launchdStatus.installed ? chalk.green("yes") : chalk.gray("no")}`);
    console.log(`  Loaded:    ${launchdStatus.loaded ? chalk.green("yes") : chalk.gray("no")}`);
    console.log(`  Running:   ${launchdStatus.running ? chalk.green("yes") : chalk.gray("no")}`);
    if (launchdStatus.pid) {
      console.log(`  PID:       ${launchdStatus.pid}`);
    }
    console.log(`  Plist:     ${launchdStatus.plistPath}`);

    // Process status
    console.log(chalk.gray("\nProcess:"));
    console.log(`  Running:   ${daemonStatus.running ? chalk.green("yes") : chalk.gray("no")}`);
    if (daemonStatus.pid) {
      console.log(`  PID:       ${daemonStatus.pid}`);
    }

    // Stats
    console.log(chalk.gray("\nStatistics:"));
    console.log(`  Total cleaned: ${stats.totalCleaned} files`);
    console.log(`  Space freed:   ${formatSize(stats.totalSizeFreed)}`);
    if (stats.lastCleanup) {
      console.log(`  Last cleanup:  ${new Date(stats.lastCleanup).toLocaleString()}`);
    }
  });

daemon
  .command("install")
  .description("Install launchd service (auto-start on login)")
  .action(() => {
    const result = launchd.install();
    if (result.success) {
      console.log(chalk.green("✓"), result.message);
      console.log(chalk.gray("\nTo start the daemon, run:"));
      console.log(chalk.cyan("  il-folletto daemon start"));
    } else {
      console.log(chalk.red("✗"), result.message);
    }
  });

daemon
  .command("uninstall")
  .description("Uninstall launchd service")
  .action(() => {
    const result = launchd.uninstall();
    if (result.success) {
      console.log(chalk.green("✓"), result.message);
    } else {
      console.log(chalk.red("✗"), result.message);
    }
  });

daemon
  .command("start")
  .description("Start the daemon via launchd")
  .action(() => {
    const result = launchd.start();
    if (result.success) {
      console.log(chalk.green("✓"), result.message);
    } else {
      console.log(chalk.red("✗"), result.message);
    }
  });

daemon
  .command("stop")
  .description("Stop the daemon via launchd")
  .action(() => {
    const result = launchd.stop();
    if (result.success) {
      console.log(chalk.green("✓"), result.message);
    } else {
      console.log(chalk.red("✗"), result.message);
    }
  });

daemon
  .command("run")
  .description("Run daemon in foreground (for development)")
  .action(async () => {
    await launchd.runForeground();
  });

daemon
  .command("logs")
  .description("Show daemon logs")
  .option("-n, --lines <number>", "Number of lines to show", "50")
  .action(async (options) => {
    const { logDir } = getConfigPaths();
    const logFile = `${logDir}/daemon.log`;

    try {
      const { execSync } = await import("child_process");
      execSync(`tail -n ${options.lines} "${logFile}"`, { stdio: "inherit" });
    } catch {
      console.log(chalk.yellow("No log file found at:"), logFile);
    }
  });

// Web command
program
  .command("web")
  .description("Launch the web UI")
  .option("-p, --port <number>", "Port for web UI", "3848")
  .option("--no-open", "Don't open browser automatically")
  .action(async (options) => {
    const spinner = ora("Starting web UI...").start();

    try {
      // Check if daemon is running
      const daemonStatus = isDaemonRunning();
      if (!daemonStatus.running) {
        spinner.text = "Starting daemon...";
        const result = launchd.start();
        if (!result.success) {
          // Try to run daemon in background
          spinner.text = "Starting daemon in foreground mode...";
          const { spawn } = await import("child_process");
          const daemon = spawn(process.execPath, [process.argv[1]!, "daemon", "run"], {
            detached: true,
            stdio: "ignore",
          });
          daemon.unref();
          // Wait a bit for daemon to start
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      spinner.text = "Starting web server...";

      // Start Vite dev server
      const { spawn } = await import("child_process");
      const { fileURLToPath } = await import("url");
      const { dirname, join } = await import("path");

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const webDir = join(__dirname, "..", "web");

      const vite = spawn("npm", ["run", "dev", "--", "--port", options.port], {
        cwd: webDir,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      vite.stdout?.on("data", async (data: Buffer) => {
        const output = data.toString();
        if (output.includes("Local:") || output.includes("ready")) {
          spinner.succeed(`Web UI running at http://localhost:${options.port}`);

          if (options.open !== false) {
            const { exec } = await import("child_process");
            exec(`open http://localhost:${options.port}`);
          }
        }
      });

      vite.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        // Ignore common vite warnings
        if (!output.includes("WARN") && output.trim()) {
          console.error(chalk.yellow(output));
        }
      });

      vite.on("error", (error) => {
        spinner.fail(`Failed to start web server: ${error.message}`);
        console.log(chalk.gray("\nMake sure you've installed web dependencies:"));
        console.log(chalk.cyan("  cd web && npm install"));
        process.exit(1);
      });

      // Handle Ctrl+C
      process.on("SIGINT", () => {
        vite.kill();
        process.exit(0);
      });
    } catch (error) {
      spinner.fail(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  });

// History command
program
  .command("history")
  .description("Show cleanup history")
  .option("-n, --limit <number>", "Number of entries to show", "20")
  .action((options) => {
    const history = getHistory(parseInt(options.limit, 10));

    if (history.length === 0) {
      console.log(chalk.yellow("No cleanup history."));
      return;
    }

    console.log(chalk.bold("\nCleanup History:\n"));

    for (const entry of history) {
      const date = new Date(entry.timestamp).toLocaleString();
      const trigger = chalk.gray(`[${entry.trigger}]`);
      const result = `${entry.filesProcessed} files (${formatSize(entry.sizeFreed)})`;

      console.log(`${chalk.cyan(date)} ${trigger}`);
      console.log(`  ${entry.rule} → ${result}`);
      if (entry.filesFailed > 0) {
        console.log(chalk.red(`  ${entry.filesFailed} failed`));
      }
    }
  });

// Stats command
program
  .command("stats")
  .description("Show cleanup statistics")
  .action(() => {
    const stats = getStats();

    console.log(chalk.bold("\nCleanup Statistics:\n"));

    console.log(`Total files cleaned: ${chalk.bold(stats.totalCleaned)}`);
    console.log(`Total space freed:   ${chalk.bold(formatSize(stats.totalSizeFreed))}`);

    if (stats.lastCleanup) {
      console.log(`Last cleanup:        ${new Date(stats.lastCleanup).toLocaleString()}`);
    }

    if (Object.keys(stats.cleanupsByRule).length > 0) {
      console.log(chalk.gray("\nBy rule:"));
      for (const [rule, count] of Object.entries(stats.cleanupsByRule)) {
        console.log(`  ${rule}: ${count} files`);
      }
    }

    if (Object.keys(stats.cleanupsByTrigger).length > 0) {
      console.log(chalk.gray("\nBy trigger:"));
      for (const [trigger, count] of Object.entries(stats.cleanupsByTrigger)) {
        console.log(`  ${trigger}: ${count} files`);
      }
    }
  });

// Add rule wizard
program
  .command("add-rule")
  .description("Interactive wizard to create a new rule")
  .action(async () => {
    const readline = await import("readline");
    const { loadConfig, saveConfig } = await import("./core/config.js");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (question: string, defaultValue?: string): Promise<string> => {
      const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
      return new Promise((resolve) => {
        rl.question(chalk.cyan(prompt), (answer) => {
          resolve(answer.trim() || defaultValue || "");
        });
      });
    };

    const askYesNo = async (question: string, defaultYes: boolean = true): Promise<boolean> => {
      const hint = defaultYes ? "[Y/n]" : "[y/N]";
      const answer = await ask(`${question} ${hint}`);
      if (!answer) return defaultYes;
      return answer.toLowerCase().startsWith("y");
    };

    console.log(chalk.bold("\n🧹 Il-Folletto Rule Wizard\n"));
    console.log(chalk.gray("Create a new cleanup rule interactively.\n"));

    try {
      // Load current config
      const config = await loadConfig();

      // Rule name
      let name = "";
      while (!name) {
        name = await ask("Rule name (e.g., downloads-cleanup)");
        if (!name) {
          console.log(chalk.red("  Rule name is required"));
        } else if (config.rules.find((r) => r.name === name)) {
          console.log(chalk.red(`  Rule "${name}" already exists`));
          name = "";
        }
      }

      // Description
      const description = await ask("Description (optional)");

      // Paths
      console.log(chalk.gray("\nPaths to scan (use ~ for home directory)"));
      const pathsInput = await ask("Paths (comma-separated)", "~/Downloads");
      const paths = pathsInput.split(",").map((p) => p.trim()).filter(Boolean);

      if (paths.length === 0) {
        console.log(chalk.red("  At least one path is required"));
        rl.close();
        return;
      }

      // Patterns
      console.log(chalk.gray("\nPatterns to match (glob or regex)"));
      console.log(chalk.gray("  Examples: *.log, **/*.tmp, /\\.DS_Store$/"));
      const patternsInput = await ask("Patterns (comma-separated)", "**/*");
      const patterns = patternsInput.split(",").map((p) => p.trim()).filter(Boolean);

      if (patterns.length === 0) {
        console.log(chalk.red("  At least one pattern is required"));
        rl.close();
        return;
      }

      // Action
      console.log(chalk.gray("\nAction to perform:"));
      console.log(chalk.gray("  1. trash  - Move to macOS Trash"));
      console.log(chalk.gray("  2. delete - Permanently delete"));
      console.log(chalk.gray("  3. move   - Move to another directory"));
      console.log(chalk.gray("  4. compress - Compress with gzip"));
      const actionInput = await ask("Action (1-4 or name)", "trash");
      const actionMap: Record<string, string> = { "1": "trash", "2": "delete", "3": "move", "4": "compress" };
      const action = (actionMap[actionInput] || actionInput) as "trash" | "delete" | "move" | "compress";

      let moveTo: string | undefined;
      if (action === "move") {
        moveTo = await ask("Move to directory");
        if (!moveTo) {
          console.log(chalk.red("  Destination directory is required for move action"));
          rl.close();
          return;
        }
      }

      // Target
      console.log(chalk.gray("\nWhat to clean:"));
      console.log(chalk.gray("  1. files       - Only files"));
      console.log(chalk.gray("  2. directories - Only directories"));
      console.log(chalk.gray("  3. all         - Both files and directories"));
      const targetInput = await ask("Target (1-3 or name)", "files");
      const targetMap: Record<string, string> = { "1": "files", "2": "directories", "3": "all" };
      const target = (targetMap[targetInput] || targetInput) as "files" | "directories" | "all";

      // Conditions
      const addConditions = await askYesNo("Add conditions (age, size)?", true);
      const conditions: Record<string, string> = {};

      if (addConditions) {
        console.log(chalk.gray("\nConditions (press Enter to skip):"));
        console.log(chalk.gray("  Duration format: 7d, 1h, 30m, 1w"));
        console.log(chalk.gray("  Size format: 100MB, 1GB, 500KB"));

        const olderThan = await ask("  Older than (e.g., 7d)");
        if (olderThan) conditions.olderThan = olderThan;

        const newerThan = await ask("  Newer than (e.g., 1d)");
        if (newerThan) conditions.newerThan = newerThan;

        const largerThan = await ask("  Larger than (e.g., 100MB)");
        if (largerThan) conditions.largerThan = largerThan;

        const smallerThan = await ask("  Smaller than (e.g., 1KB)");
        if (smallerThan) conditions.smallerThan = smallerThan;
      }

      // Exceptions
      const addExceptions = await askYesNo("Add exceptions (patterns to exclude)?", false);
      let exceptions: string[] | undefined;

      if (addExceptions) {
        console.log(chalk.gray("\nException patterns (comma-separated):"));
        const exceptionsInput = await ask("  Exceptions");
        exceptions = exceptionsInput.split(",").map((p) => p.trim()).filter(Boolean);
        if (exceptions.length === 0) exceptions = undefined;
      }

      // Build rule
      const newRule: {
        name: string;
        description?: string;
        enabled: boolean;
        action: "trash" | "delete" | "move" | "compress";
        moveTo?: string;
        target: "files" | "directories" | "all";
        paths: string[];
        patterns: string[];
        conditions?: Record<string, string>;
        exceptions?: string[];
      } = {
        name,
        enabled: true,
        action,
        target,
        paths,
        patterns,
      };

      if (description) newRule.description = description;
      if (moveTo) newRule.moveTo = moveTo;
      if (Object.keys(conditions).length > 0) newRule.conditions = conditions;
      if (exceptions) newRule.exceptions = exceptions;

      // Show summary
      console.log(chalk.bold("\n📋 Rule Summary:\n"));
      console.log(chalk.cyan(`  Name:        ${name}`));
      if (description) console.log(chalk.gray(`  Description: ${description}`));
      console.log(`  Action:      ${action}${moveTo ? ` → ${moveTo}` : ""}`);
      console.log(`  Target:      ${target}`);
      console.log(`  Paths:       ${paths.join(", ")}`);
      console.log(`  Patterns:    ${patterns.join(", ")}`);
      if (Object.keys(conditions).length > 0) {
        console.log(`  Conditions:  ${Object.entries(conditions).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      }
      if (exceptions) {
        console.log(`  Exceptions:  ${exceptions.join(", ")}`);
      }

      // Confirm
      const confirm = await askYesNo("\nSave this rule?", true);

      if (confirm) {
        config.rules.push(newRule as typeof config.rules[number]);
        await saveConfig(config);
        console.log(chalk.green(`\n✓ Rule "${name}" has been saved!`));
        console.log(chalk.gray(`\nTest it with: ${chalk.cyan(`il-folletto dry-run ${name}`)}`));
      } else {
        console.log(chalk.yellow("\nRule not saved."));
      }

      rl.close();
    } catch (error) {
      rl.close();
      console.error(chalk.red(`\nError: ${formatError(error)}`));
      process.exit(1);
    }
  });

program.parse();
