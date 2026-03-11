import { loadConfig } from "../core/config.js";
import { formatSize } from "../core/rule-engine.js";
import { markDaemonStarted, markDaemonStopped } from "./state.js";
import { Scheduler } from "./scheduler.js";
import { DirectoryWatcher } from "./watcher.js";
import { ApiServer } from "./api.js";
import type { Config } from "../core/types.js";

export class Daemon {
  private config: Config | null = null;
  private scheduler: Scheduler | null = null;
  private watcher: DirectoryWatcher | null = null;
  private apiServer: ApiServer | null = null;
  private running: boolean = false;

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log("Daemon is already running");
      return;
    }

    console.log("Starting il-folletto daemon...");

    // Load configuration
    this.config = await loadConfig();
    console.log(`Loaded ${this.config.rules.length} rules`);

    // Create scheduler
    this.scheduler = new Scheduler(this.config, {
      onScheduleStart: (schedule) => {
        console.log(`[scheduler] Starting scheduled cleanup: ${schedule.name}`);
        this.apiServer?.broadcast({
          type: "schedule:start",
          schedule: schedule.name,
        });
      },
      onScheduleComplete: (schedule, results) => {
        const total = results.reduce((sum, r) => sum + r.processed, 0);
        const size = results.reduce((sum, r) => sum + r.totalSize, 0);
        console.log(
          `[scheduler] Completed ${schedule.name}: ${total} files (${formatSize(size)})`
        );
        this.apiServer?.broadcast({
          type: "schedule:complete",
          schedule: schedule.name,
          processed: total,
          sizeFreed: size,
        });
      },
      onScheduleError: (schedule, error) => {
        console.error(`[scheduler] Error in ${schedule.name}:`, error.message);
        this.apiServer?.broadcast({
          type: "schedule:error",
          schedule: schedule.name,
          error: error.message,
        });
      },
    });

    // Create watcher
    this.watcher = new DirectoryWatcher(this.config, {
      onThresholdExceeded: (watcherConfig, currentSize) => {
        console.log(
          `[watcher] Threshold exceeded for ${watcherConfig.path}: ${formatSize(currentSize)} > ${watcherConfig.threshold}`
        );
        this.apiServer?.broadcast({
          type: "watcher:threshold",
          path: watcherConfig.path,
          currentSize,
          threshold: watcherConfig.threshold,
        });
      },
      onCleanupStart: (watcherConfig) => {
        console.log(`[watcher] Starting cleanup for ${watcherConfig.path}`);
        this.apiServer?.broadcast({
          type: "watcher:cleanup:start",
          path: watcherConfig.path,
        });
      },
      onCleanupComplete: (watcherConfig, results) => {
        const total = results.reduce((sum, r) => sum + r.processed, 0);
        const size = results.reduce((sum, r) => sum + r.totalSize, 0);
        console.log(
          `[watcher] Completed cleanup for ${watcherConfig.path}: ${total} files (${formatSize(size)})`
        );
        this.apiServer?.broadcast({
          type: "watcher:cleanup:complete",
          path: watcherConfig.path,
          processed: total,
          sizeFreed: size,
        });
      },
      onCleanupError: (watcherConfig, error) => {
        console.error(`[watcher] Error for ${watcherConfig.path}:`, error.message);
        this.apiServer?.broadcast({
          type: "watcher:cleanup:error",
          path: watcherConfig.path,
          error: error.message,
        });
      },
    });

    // Create API server
    this.apiServer = new ApiServer(this.config, {
      host: this.config.global.apiHost,
      port: this.config.global.apiPort,
      scheduler: this.scheduler,
      watcher: this.watcher,
    });

    // Start components
    this.scheduler.start();
    this.watcher.start();
    await this.apiServer.start(this.config.global.apiHost, this.config.global.apiPort);

    // Mark daemon as started
    markDaemonStarted();
    this.running = true;

    // Setup signal handlers
    this.setupSignalHandlers();

    console.log(`Daemon started (PID: ${process.pid})`);
    console.log(`API available at http://${this.config.global.apiHost}:${this.config.global.apiPort}`);

    if (this.config.global.dryRun) {
      console.log("WARNING: Running in dry-run mode - no files will be deleted");
    }
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log("Stopping daemon...");

    // Stop components in reverse order
    if (this.apiServer) {
      await this.apiServer.stop();
    }

    if (this.watcher) {
      this.watcher.stop();
    }

    if (this.scheduler) {
      this.scheduler.stop();
    }

    // Mark daemon as stopped
    markDaemonStopped();
    this.running = false;

    console.log("Daemon stopped");
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down...`);
      await this.stop();
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGHUP", async () => {
      console.log("Received SIGHUP, reloading configuration...");
      await this.reload();
    });
  }

  /**
   * Reload configuration
   */
  async reload(): Promise<void> {
    console.log("Reloading configuration...");

    const newConfig = await loadConfig();
    this.config = newConfig;

    if (this.scheduler) {
      this.scheduler.updateConfig(newConfig);
    }

    if (this.watcher) {
      this.watcher.updateConfig(newConfig);
    }

    if (this.apiServer) {
      this.apiServer.updateConfig(newConfig);
    }

    console.log("Configuration reloaded");
  }

  /**
   * Check if daemon is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

/**
 * Run the daemon (entry point for daemon process)
 */
export async function runDaemon(): Promise<void> {
  const daemon = new Daemon();
  await daemon.start();

  // Keep process alive - use a promise that never resolves
  // This is more reliable than process.stdin.resume() when running as a daemon
  await new Promise(() => {
    // This promise intentionally never resolves
    // The process will exit via signal handlers
  });
}
