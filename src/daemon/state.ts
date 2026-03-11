import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { getConfigPaths, ensureConfigDir } from "../core/config.js";
import type { CleanupResult } from "../core/types.js";

export interface DaemonState {
  pid: number | null;
  startedAt: string | null;
  lastCleanup: string | null;
  totalCleaned: number;
  totalSizeFreed: number;
  history: CleanupHistoryEntry[];
}

export interface CleanupHistoryEntry {
  timestamp: string;
  rule: string;
  action: string;
  filesProcessed: number;
  filesFailed: number;
  sizeFreed: number;
  duration: number;
  trigger: "manual" | "scheduled" | "watcher";
}

const MAX_HISTORY_ENTRIES = 100;

function getDefaultState(): DaemonState {
  return {
    pid: null,
    startedAt: null,
    lastCleanup: null,
    totalCleaned: 0,
    totalSizeFreed: 0,
    history: [],
  };
}

/**
 * Load daemon state from disk
 */
export function loadState(): DaemonState {
  const { stateFile } = getConfigPaths();

  if (!existsSync(stateFile)) {
    return getDefaultState();
  }

  try {
    const content = readFileSync(stateFile, "utf-8");
    const state = JSON.parse(content) as DaemonState;
    return state;
  } catch {
    return getDefaultState();
  }
}

/**
 * Save daemon state to disk
 */
export function saveState(state: DaemonState): void {
  ensureConfigDir();
  const { stateFile } = getConfigPaths();
  writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Update state when daemon starts
 */
export function markDaemonStarted(): DaemonState {
  const state = loadState();
  state.pid = process.pid;
  state.startedAt = new Date().toISOString();
  saveState(state);
  return state;
}

/**
 * Update state when daemon stops
 */
export function markDaemonStopped(): void {
  const state = loadState();
  state.pid = null;
  state.startedAt = null;
  saveState(state);
}

/**
 * Check if daemon is running
 */
export function isDaemonRunning(): { running: boolean; pid: number | null } {
  const state = loadState();

  if (!state.pid) {
    return { running: false, pid: null };
  }

  // Check if process is actually running
  try {
    process.kill(state.pid, 0);
    return { running: true, pid: state.pid };
  } catch {
    // Process not running, clean up stale state
    state.pid = null;
    state.startedAt = null;
    saveState(state);
    return { running: false, pid: null };
  }
}

/**
 * Record a cleanup operation
 */
export function recordCleanup(
  results: CleanupResult[],
  trigger: CleanupHistoryEntry["trigger"]
): void {
  const state = loadState();
  const now = new Date().toISOString();

  for (const result of results) {
    const entry: CleanupHistoryEntry = {
      timestamp: now,
      rule: result.rule,
      action: result.action,
      filesProcessed: result.processed,
      filesFailed: result.failed,
      sizeFreed: result.totalSize,
      duration: result.duration,
      trigger,
    };

    state.history.unshift(entry);
    state.totalCleaned += result.processed;
    state.totalSizeFreed += result.totalSize;
  }

  // Trim history to max size
  if (state.history.length > MAX_HISTORY_ENTRIES) {
    state.history = state.history.slice(0, MAX_HISTORY_ENTRIES);
  }

  state.lastCleanup = now;
  saveState(state);
}

/**
 * Get daemon uptime in milliseconds
 */
export function getUptime(): number {
  const state = loadState();
  if (!state.startedAt) {
    return 0;
  }
  return Date.now() - new Date(state.startedAt).getTime();
}

/**
 * Get cleanup history
 */
export function getHistory(limit: number = 50): CleanupHistoryEntry[] {
  const state = loadState();
  return state.history.slice(0, limit);
}

/**
 * Get statistics
 */
export function getStats(): {
  totalCleaned: number;
  totalSizeFreed: number;
  lastCleanup: string | null;
  cleanupsByRule: Record<string, number>;
  cleanupsByTrigger: Record<string, number>;
} {
  const state = loadState();

  const cleanupsByRule: Record<string, number> = {};
  const cleanupsByTrigger: Record<string, number> = {};

  for (const entry of state.history) {
    cleanupsByRule[entry.rule] = (cleanupsByRule[entry.rule] ?? 0) + entry.filesProcessed;
    cleanupsByTrigger[entry.trigger] = (cleanupsByTrigger[entry.trigger] ?? 0) + entry.filesProcessed;
  }

  return {
    totalCleaned: state.totalCleaned,
    totalSizeFreed: state.totalSizeFreed,
    lastCleanup: state.lastCleanup,
    cleanupsByRule,
    cleanupsByTrigger,
  };
}
