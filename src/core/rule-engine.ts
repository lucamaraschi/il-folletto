import micromatch from "micromatch";
import ms from "ms";
import type { Rule, Conditions, FileInfo } from "./types.js";

/**
 * Parse a size string like "100MB" to bytes
 */
export function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = parseFloat(match[1]!);
  const unit = match[2]!.toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]!);
}

/**
 * Parse a duration string like "7d" to milliseconds
 */
export function parseDuration(duration: string): number {
  // ms library handles common formats: "7d", "1h", "30m", "2w"
  const result = ms(duration);
  if (result === undefined) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  return result;
}

/**
 * Format bytes to human readable string
 */
export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Check if a file matches the given conditions
 */
export function matchesConditions(file: FileInfo, conditions: Conditions): boolean {
  const now = Date.now();

  // Age conditions (based on mtime)
  if (conditions.olderThan) {
    const threshold = now - parseDuration(conditions.olderThan);
    if (file.mtime.getTime() > threshold) {
      return false;
    }
  }

  if (conditions.newerThan) {
    const threshold = now - parseDuration(conditions.newerThan);
    if (file.mtime.getTime() < threshold) {
      return false;
    }
  }

  // Size conditions
  if (conditions.largerThan) {
    const threshold = parseSize(conditions.largerThan);
    if (file.size < threshold) {
      return false;
    }
  }

  if (conditions.smallerThan) {
    const threshold = parseSize(conditions.smallerThan);
    if (file.size > threshold) {
      return false;
    }
  }

  // Modification date conditions
  if (conditions.modifiedBefore) {
    const threshold = new Date(conditions.modifiedBefore).getTime();
    if (file.mtime.getTime() > threshold) {
      return false;
    }
  }

  if (conditions.modifiedAfter) {
    const threshold = new Date(conditions.modifiedAfter).getTime();
    if (file.mtime.getTime() < threshold) {
      return false;
    }
  }

  // Access date conditions
  if (conditions.accessedBefore) {
    const threshold = new Date(conditions.accessedBefore).getTime();
    if (file.atime.getTime() > threshold) {
      return false;
    }
  }

  if (conditions.accessedAfter) {
    const threshold = new Date(conditions.accessedAfter).getTime();
    if (file.atime.getTime() < threshold) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a path matches any of the patterns
 */
export function matchesPatterns(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Check if it's a regex pattern (starts and ends with /)
    if (pattern.startsWith("/") && pattern.endsWith("/")) {
      const regex = new RegExp(pattern.slice(1, -1));
      if (regex.test(filePath)) {
        return true;
      }
    } else {
      // Use micromatch for glob patterns
      if (micromatch.isMatch(filePath, pattern, { dot: true })) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a path matches any exception pattern
 */
export function matchesExceptions(filePath: string, exceptions: string[]): boolean {
  return matchesPatterns(filePath, exceptions);
}

/**
 * Check if a file matches a rule
 */
export function matchesRule(file: FileInfo, rule: Rule, basePath: string): boolean {
  // Get relative path from the base path for pattern matching
  const relativePath = file.path.startsWith(basePath)
    ? file.path.slice(basePath.length).replace(/^\//, "")
    : file.path;

  // Check if file matches any pattern
  if (!matchesPatterns(relativePath, rule.patterns)) {
    return false;
  }

  // Check if file matches any exception
  if (rule.exceptions && matchesExceptions(relativePath, rule.exceptions)) {
    return false;
  }

  // Check conditions
  if (rule.conditions && !matchesConditions(file, rule.conditions)) {
    return false;
  }

  return true;
}

/**
 * Get all glob patterns to use with fast-glob for a rule
 */
export function getRuleGlobPatterns(rule: Rule): string[] {
  const patterns: string[] = [];

  for (const basePath of rule.paths) {
    for (const pattern of rule.patterns) {
      // Skip regex patterns - they'll be checked in post-processing
      if (pattern.startsWith("/") && pattern.endsWith("/")) {
        // For regex patterns, just glob everything and filter later
        patterns.push(`${basePath}/**/*`);
      } else {
        // Combine base path with pattern
        if (pattern.startsWith("**/")) {
          patterns.push(`${basePath}/${pattern}`);
        } else if (pattern.startsWith("/")) {
          patterns.push(`${basePath}${pattern}`);
        } else {
          patterns.push(`${basePath}/**/${pattern}`);
        }
      }
    }
  }

  // Remove duplicates
  return [...new Set(patterns)];
}

/**
 * Get glob ignore patterns from rule exceptions
 */
export function getRuleIgnorePatterns(rule: Rule): string[] {
  if (!rule.exceptions) return [];

  const ignorePatterns: string[] = [];

  for (const exception of rule.exceptions) {
    // Only glob patterns can be used as ignore patterns
    // Regex patterns need post-processing
    if (!exception.startsWith("/") || !exception.endsWith("/")) {
      ignorePatterns.push(exception);
    }
  }

  return ignorePatterns;
}
