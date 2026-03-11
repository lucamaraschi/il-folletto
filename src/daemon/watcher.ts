import chokidar, { type FSWatcher } from "chokidar";
import type { Config, Watcher as WatcherConfig, CleanupResult } from "../core/types.js";
import { expandPath, getRulesByNames } from "../core/config.js";
import { getDirectorySize } from "../core/scanner.js";
import { cleanRules } from "../core/cleaner.js";
import { parseSize } from "../core/rule-engine.js";
import { recordCleanup } from "./state.js";

export interface WatcherEvents {
  onThresholdExceeded?: (watcher: WatcherConfig, currentSize: number) => void;
  onCleanupStart?: (watcher: WatcherConfig) => void;
  onCleanupComplete?: (watcher: WatcherConfig, results: CleanupResult[]) => void;
  onCleanupError?: (watcher: WatcherConfig, error: Error) => void;
}

interface ActiveWatcher {
  config: WatcherConfig;
  fsWatcher: FSWatcher;
  debounceTimer: NodeJS.Timeout | null;
  lastCheck: Date | null;
  isProcessing: boolean;
}

export class DirectoryWatcher {
  private watchers: Map<string, ActiveWatcher> = new Map();
  private config: Config;
  private events: WatcherEvents;
  private running: boolean = false;

  constructor(config: Config, events: WatcherEvents = {}) {
    this.config = config;
    this.events = events;
  }

  /**
   * Start all enabled watchers
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const watcherConfig of this.config.watchers) {
      if (!watcherConfig.enabled) continue;
      this.addWatcher(watcherConfig);
    }
  }

  /**
   * Stop all watchers
   */
  stop(): void {
    this.running = false;
    for (const watcher of this.watchers.values()) {
      if (watcher.debounceTimer) {
        clearTimeout(watcher.debounceTimer);
      }
      watcher.fsWatcher.close();
    }
    this.watchers.clear();
  }

  /**
   * Add a watcher
   */
  addWatcher(watcherConfig: WatcherConfig): void {
    const expandedPath = expandPath(watcherConfig.path);
    const key = watcherConfig.path;

    if (this.watchers.has(key)) {
      this.removeWatcher(key);
    }

    const fsWatcher = chokidar.watch(expandedPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0, // Only watch the top-level directory for changes
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    const activeWatcher: ActiveWatcher = {
      config: watcherConfig,
      fsWatcher,
      debounceTimer: null,
      lastCheck: null,
      isProcessing: false,
    };

    // Handle file changes
    fsWatcher.on("add", () => this.handleChange(activeWatcher));
    fsWatcher.on("change", () => this.handleChange(activeWatcher));

    // Check immediately on start
    this.checkThreshold(activeWatcher);

    this.watchers.set(key, activeWatcher);
  }

  /**
   * Remove a watcher
   */
  removeWatcher(path: string): void {
    const watcher = this.watchers.get(path);
    if (watcher) {
      if (watcher.debounceTimer) {
        clearTimeout(watcher.debounceTimer);
      }
      watcher.fsWatcher.close();
      this.watchers.delete(path);
    }
  }

  /**
   * Handle file system change with debounce
   */
  private handleChange(watcher: ActiveWatcher): void {
    // Clear existing timer
    if (watcher.debounceTimer) {
      clearTimeout(watcher.debounceTimer);
    }

    // Set new timer
    watcher.debounceTimer = setTimeout(() => {
      this.checkThreshold(watcher);
    }, watcher.config.debounceMs);
  }

  /**
   * Check if directory exceeds threshold
   */
  private async checkThreshold(watcher: ActiveWatcher): Promise<void> {
    if (watcher.isProcessing) return;

    const expandedPath = expandPath(watcher.config.path);
    const threshold = parseSize(watcher.config.threshold);

    try {
      const currentSize = await getDirectorySize(expandedPath);
      watcher.lastCheck = new Date();

      if (currentSize > threshold) {
        this.events.onThresholdExceeded?.(watcher.config, currentSize);
        await this.executeCleanup(watcher);
      }
    } catch (error) {
      console.error(`Error checking threshold for ${watcher.config.path}:`, error);
    }
  }

  /**
   * Execute cleanup for a watcher
   */
  private async executeCleanup(watcher: ActiveWatcher): Promise<void> {
    if (watcher.isProcessing) return;
    watcher.isProcessing = true;

    this.events.onCleanupStart?.(watcher.config);

    try {
      const rules = getRulesByNames(this.config, watcher.config.rules);

      if (rules.length === 0) {
        console.warn(`No rules found for watcher ${watcher.config.path}`);
        return;
      }

      const results = await cleanRules(
        rules,
        this.config.global.defaultAction,
        this.config.global.dryRun
      );

      // Record the cleanup
      if (!this.config.global.dryRun) {
        recordCleanup(results, "watcher");
      }

      this.events.onCleanupComplete?.(watcher.config, results);
    } catch (error) {
      this.events.onCleanupError?.(watcher.config, error as Error);
    } finally {
      watcher.isProcessing = false;
    }
  }

  /**
   * Get all watchers status
   */
  getStatus(): Array<{
    path: string;
    enabled: boolean;
    threshold: string;
    rules: string[];
    lastCheck: Date | null;
    isProcessing: boolean;
  }> {
    const result: Array<{
      path: string;
      enabled: boolean;
      threshold: string;
      rules: string[];
      lastCheck: Date | null;
      isProcessing: boolean;
    }> = [];

    // Include all watchers from config
    for (const watcherConfig of this.config.watchers) {
      const active = this.watchers.get(watcherConfig.path);
      result.push({
        path: watcherConfig.path,
        enabled: watcherConfig.enabled,
        threshold: watcherConfig.threshold,
        rules: watcherConfig.rules,
        lastCheck: active?.lastCheck ?? null,
        isProcessing: active?.isProcessing ?? false,
      });
    }

    return result;
  }

  /**
   * Manually trigger a watcher check
   */
  async triggerCheck(path: string): Promise<void> {
    const watcher = this.watchers.get(path);
    if (watcher) {
      await this.checkThreshold(watcher);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Config): void {
    this.config = config;

    // Restart if running
    if (this.running) {
      this.stop();
      this.start();
    }
  }
}
