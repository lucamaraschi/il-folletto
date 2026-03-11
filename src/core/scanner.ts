import fg from "fast-glob";
import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Rule, FileInfo, ScanResult } from "./types.js";
import { expandPath } from "./config.js";
import {
  getRuleGlobPatterns,
  getRuleIgnorePatterns,
  matchesRule,
} from "./rule-engine.js";

/**
 * Get file info for a single path
 */
async function getFileInfo(filePath: string): Promise<FileInfo | null> {
  try {
    const stats = await stat(filePath);
    return {
      path: filePath,
      size: stats.size,
      mtime: stats.mtime,
      atime: stats.atime,
      ctime: stats.ctime,
      isDirectory: stats.isDirectory(),
    };
  } catch {
    // File might have been deleted or inaccessible
    return null;
  }
}

/**
 * Scan files matching a rule
 */
export async function scanRule(rule: Rule): Promise<ScanResult> {
  const files: FileInfo[] = [];
  let totalSize = 0;

  // Get glob patterns for this rule
  const patterns = getRuleGlobPatterns(rule);
  const ignorePatterns = getRuleIgnorePatterns(rule);

  // Expand paths
  const expandedPatterns = patterns.map(expandPath);

  // Check which base paths exist
  const existingPaths = rule.paths
    .map(expandPath)
    .filter((p) => {
      const basePath = p.replace(/\/\*\*.*$/, "").replace(/\*.*$/, "");
      return existsSync(basePath);
    });

  if (existingPaths.length === 0) {
    return {
      rule: rule.name,
      files: [],
      totalSize: 0,
      totalCount: 0,
    };
  }

  try {
    // Determine what to match based on target
    const target = rule.target ?? "files";
    const onlyFiles = target === "files";
    const onlyDirectories = target === "directories";

    // Use fast-glob to find matching entries
    const entries = await fg(expandedPatterns, {
      dot: true,
      onlyFiles,
      onlyDirectories,
      absolute: true,
      ignore: ignorePatterns,
      suppressErrors: true,
      followSymbolicLinks: false,
    });

    // Get file info and apply conditions
    for (const entry of entries) {
      const fileInfo = await getFileInfo(entry);
      if (!fileInfo) continue;

      // Determine which base path this file belongs to
      const basePath = rule.paths
        .map(expandPath)
        .find((p) => {
          const base = p.replace(/\/\*\*.*$/, "").replace(/\*.*$/, "");
          return entry.startsWith(base);
        });

      if (!basePath) continue;

      const basePathClean = basePath.replace(/\/\*\*.*$/, "").replace(/\*.*$/, "");

      // Apply rule matching (conditions, regex patterns, exceptions)
      if (matchesRule(fileInfo, rule, basePathClean)) {
        files.push(fileInfo);
        totalSize += fileInfo.size;
      }
    }
  } catch (error) {
    // Log error but don't fail completely
    console.error(`Error scanning for rule ${rule.name}:`, error);
  }

  return {
    rule: rule.name,
    files,
    totalSize,
    totalCount: files.length,
  };
}

/**
 * Scan multiple rules
 */
export async function scanRules(rules: Rule[]): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const result = await scanRule(rule);
    results.push(result);
  }

  return results;
}

/**
 * Calculate total directory size
 */
export async function getDirectorySize(dirPath: string): Promise<number> {
  const expandedPath = expandPath(dirPath);

  if (!existsSync(expandedPath)) {
    return 0;
  }

  try {
    const entries = await fg(`${expandedPath}/**/*`, {
      dot: true,
      onlyFiles: true,
      absolute: true,
      suppressErrors: true,
      followSymbolicLinks: false,
    });

    let totalSize = 0;
    for (const entry of entries) {
      const info = await getFileInfo(entry);
      if (info) {
        totalSize += info.size;
      }
    }

    return totalSize;
  } catch {
    return 0;
  }
}

/**
 * Get disk usage info
 */
export interface DiskUsage {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
}

export async function getDiskUsage(): Promise<DiskUsage | null> {
  try {
    const { execSync } = await import("node:child_process");
    const output = execSync("df -k /", { encoding: "utf-8" });
    const lines = output.trim().split("\n");
    if (lines.length < 2) return null;

    const parts = lines[1]!.split(/\s+/);
    if (parts.length < 4) return null;

    const total = parseInt(parts[1]!, 10) * 1024;
    const used = parseInt(parts[2]!, 10) * 1024;
    const free = parseInt(parts[3]!, 10) * 1024;

    return {
      total,
      used,
      free,
      usedPercent: Math.round((used / total) * 100),
    };
  } catch {
    return null;
  }
}
