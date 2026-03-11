import { unlink, rename, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { createWriteStream, createReadStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import trash from "trash";
import type { Action, CleanupResult, Rule } from "./types.js";
import { scanRule } from "./scanner.js";
import { FileOperationError, PermissionError, wrapError } from "./errors.js";

export interface CleanupProgress {
  current: number;
  total: number;
  currentFile: string;
  action: Action;
}

export type ProgressCallback = (progress: CleanupProgress) => void;

/**
 * Move file to macOS Trash
 */
async function trashFile(filePath: string): Promise<void> {
  await trash(filePath);
}

/**
 * Permanently delete a file or directory
 */
async function deleteFile(filePath: string): Promise<void> {
  const stats = await stat(filePath);
  if (stats.isDirectory()) {
    await rm(filePath, { recursive: true });
  } else {
    await unlink(filePath);
  }
}

/**
 * Move file to a destination directory
 */
async function moveFile(filePath: string, destDir: string): Promise<void> {
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }

  const fileName = basename(filePath);
  let destPath = join(destDir, fileName);

  // Handle name conflicts
  let counter = 1;
  while (existsSync(destPath)) {
    const ext = fileName.lastIndexOf(".");
    if (ext > 0) {
      destPath = join(
        destDir,
        `${fileName.slice(0, ext)}_${counter}${fileName.slice(ext)}`
      );
    } else {
      destPath = join(destDir, `${fileName}_${counter}`);
    }
    counter++;
  }

  await rename(filePath, destPath);
}

/**
 * Compress file using gzip
 */
async function compressFile(filePath: string): Promise<void> {
  const destPath = `${filePath}.gz`;

  // Don't compress if already compressed
  if (filePath.endsWith(".gz")) {
    return;
  }

  await pipeline(
    createReadStream(filePath),
    createGzip(),
    createWriteStream(destPath)
  );

  // Remove original after successful compression
  await unlink(filePath);
}

/**
 * Execute an action on a file
 */
export async function executeAction(
  filePath: string,
  action: Action,
  moveTo?: string
): Promise<void> {
  try {
    switch (action) {
      case "trash":
        await trashFile(filePath);
        break;
      case "delete":
        await deleteFile(filePath);
        break;
      case "move":
        if (!moveTo) {
          throw new FileOperationError("moveTo is required for move action", filePath, "move");
        }
        await moveFile(filePath, moveTo);
        break;
      case "compress":
        await compressFile(filePath);
        break;
      default:
        throw new FileOperationError(`Unknown action: ${action}`, filePath, action as Action);
    }
  } catch (error) {
    // Check for permission errors
    if (error instanceof Error && "code" in error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        throw new PermissionError(filePath, action);
      }
    }
    // Re-throw if already a FollettoError
    if (error instanceof FileOperationError || error instanceof PermissionError) {
      throw error;
    }
    // Wrap unknown errors
    throw new FileOperationError(
      error instanceof Error ? error.message : String(error),
      filePath,
      action
    );
  }
}

/**
 * Clean files matching a rule
 */
export async function cleanRule(
  rule: Rule,
  globalAction: Action,
  dryRun: boolean = false,
  onProgress?: ProgressCallback
): Promise<CleanupResult> {
  const startTime = Date.now();
  const action = rule.action ?? globalAction;
  const errors: Array<{ path: string; error: string }> = [];
  let processed = 0;
  let totalSize = 0;

  // Scan for files matching the rule
  const scanResult = await scanRule(rule);
  const files = scanResult.files;

  if (dryRun) {
    return {
      rule: rule.name,
      action,
      processed: files.length,
      failed: 0,
      totalSize: scanResult.totalSize,
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: files.length,
        currentFile: file.path,
        action,
      });
    }

    try {
      await executeAction(file.path, action, rule.moveTo);
      processed++;
      totalSize += file.size;
    } catch (err) {
      const wrapped = wrapError(err, `Failed to ${action}`);
      errors.push({
        path: file.path,
        error: wrapped.message,
      });
    }
  }

  return {
    rule: rule.name,
    action,
    processed,
    failed: errors.length,
    totalSize,
    errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Clean multiple rules
 */
export async function cleanRules(
  rules: Rule[],
  globalAction: Action,
  dryRun: boolean = false,
  onProgress?: ProgressCallback
): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const result = await cleanRule(rule, globalAction, dryRun, onProgress);
    results.push(result);
  }

  return results;
}

/**
 * Summarize cleanup results
 */
export interface CleanupSummary {
  totalProcessed: number;
  totalFailed: number;
  totalSize: number;
  totalDuration: number;
  results: CleanupResult[];
}

export function summarizeResults(results: CleanupResult[]): CleanupSummary {
  return {
    totalProcessed: results.reduce((sum, r) => sum + r.processed, 0),
    totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
    totalSize: results.reduce((sum, r) => sum + r.totalSize, 0),
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
    results,
  };
}
