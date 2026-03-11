import { describe, it, expect } from "vitest";
import {
  parseSize,
  parseDuration,
  formatSize,
  matchesConditions,
  matchesPatterns,
  matchesRule,
  getRuleGlobPatterns,
  getRuleIgnorePatterns,
} from "./rule-engine.js";
import type { FileInfo, Rule } from "./types.js";

describe("parseSize", () => {
  it("parses bytes", () => {
    expect(parseSize("100B")).toBe(100);
  });

  it("parses kilobytes", () => {
    expect(parseSize("1KB")).toBe(1024);
    expect(parseSize("10KB")).toBe(10240);
  });

  it("parses megabytes", () => {
    expect(parseSize("1MB")).toBe(1024 * 1024);
    expect(parseSize("100MB")).toBe(100 * 1024 * 1024);
  });

  it("parses gigabytes", () => {
    expect(parseSize("1GB")).toBe(1024 * 1024 * 1024);
  });

  it("parses terabytes", () => {
    expect(parseSize("1TB")).toBe(1024 * 1024 * 1024 * 1024);
  });

  it("parses decimal values", () => {
    expect(parseSize("1.5MB")).toBe(Math.floor(1.5 * 1024 * 1024));
  });

  it("is case insensitive", () => {
    expect(parseSize("1mb")).toBe(1024 * 1024);
    expect(parseSize("1Mb")).toBe(1024 * 1024);
  });

  it("throws on invalid format", () => {
    expect(() => parseSize("invalid")).toThrow();
    expect(() => parseSize("100")).toThrow();
    expect(() => parseSize("MB")).toThrow();
  });
});

describe("parseDuration", () => {
  it("parses seconds", () => {
    expect(parseDuration("30s")).toBe(30000);
  });

  it("parses minutes", () => {
    expect(parseDuration("5m")).toBe(5 * 60 * 1000);
  });

  it("parses hours", () => {
    expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000);
  });

  it("parses days", () => {
    expect(parseDuration("7d")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("parses weeks", () => {
    expect(parseDuration("1w")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("throws on invalid format", () => {
    expect(() => parseDuration("invalid")).toThrow();
  });
});

describe("formatSize", () => {
  it("formats bytes", () => {
    expect(formatSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("formats terabytes", () => {
    expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe("1.0 TB");
  });
});

describe("matchesConditions", () => {
  const now = Date.now();

  const createFileInfo = (overrides: Partial<FileInfo> = {}): FileInfo => ({
    path: "/test/file.txt",
    size: 1000,
    mtime: new Date(now - 86400000), // 1 day ago
    atime: new Date(now - 86400000),
    ctime: new Date(now - 86400000),
    isDirectory: false,
    ...overrides,
  });

  it("matches olderThan condition", () => {
    const file = createFileInfo({ mtime: new Date(now - 86400000 * 2) }); // 2 days ago
    expect(matchesConditions(file, { olderThan: "1d" })).toBe(true);
    expect(matchesConditions(file, { olderThan: "3d" })).toBe(false);
  });

  it("matches newerThan condition", () => {
    const file = createFileInfo({ mtime: new Date(now - 3600000) }); // 1 hour ago
    expect(matchesConditions(file, { newerThan: "2h" })).toBe(true);
    expect(matchesConditions(file, { newerThan: "30m" })).toBe(false);
  });

  it("matches largerThan condition", () => {
    const file = createFileInfo({ size: 1024 * 1024 * 10 }); // 10MB
    expect(matchesConditions(file, { largerThan: "5MB" })).toBe(true);
    expect(matchesConditions(file, { largerThan: "20MB" })).toBe(false);
  });

  it("matches smallerThan condition", () => {
    const file = createFileInfo({ size: 1024 * 1024 }); // 1MB
    expect(matchesConditions(file, { smallerThan: "5MB" })).toBe(true);
    expect(matchesConditions(file, { smallerThan: "500KB" })).toBe(false);
  });

  it("matches multiple conditions", () => {
    const file = createFileInfo({
      mtime: new Date(now - 86400000 * 3), // 3 days ago
      size: 1024 * 1024 * 5, // 5MB
    });
    expect(
      matchesConditions(file, { olderThan: "2d", largerThan: "1MB" })
    ).toBe(true);
    expect(
      matchesConditions(file, { olderThan: "7d", largerThan: "1MB" })
    ).toBe(false);
  });
});

describe("matchesPatterns", () => {
  it("matches glob patterns", () => {
    expect(matchesPatterns("file.log", ["*.log"])).toBe(true);
    expect(matchesPatterns("file.txt", ["*.log"])).toBe(false);
  });

  it("matches double-star patterns", () => {
    expect(matchesPatterns("dir/subdir/file.log", ["**/*.log"])).toBe(true);
  });

  it("matches regex patterns", () => {
    expect(matchesPatterns("file.log", ["/\\.log$/"])).toBe(true);
    expect(matchesPatterns("file.txt", ["/\\.log$/"])).toBe(false);
  });

  it("matches any pattern in array", () => {
    expect(matchesPatterns("file.log", ["*.txt", "*.log"])).toBe(true);
    expect(matchesPatterns("file.md", ["*.txt", "*.log"])).toBe(false);
  });

  it("matches dot files", () => {
    expect(matchesPatterns(".DS_Store", [".*"])).toBe(true);
  });
});

describe("matchesRule", () => {
  const now = Date.now();

  const createRule = (overrides: Partial<Rule> = {}): Rule => ({
    name: "test-rule",
    enabled: true,
    paths: ["/test"],
    patterns: ["**/*"],
    ...overrides,
  });

  const createFileInfo = (overrides: Partial<FileInfo> = {}): FileInfo => ({
    path: "/test/file.txt",
    size: 1000,
    mtime: new Date(now - 86400000),
    atime: new Date(now - 86400000),
    ctime: new Date(now - 86400000),
    isDirectory: false,
    ...overrides,
  });

  it("matches file with matching pattern", () => {
    const rule = createRule({ patterns: ["*.txt"] });
    const file = createFileInfo({ path: "/test/file.txt" });
    expect(matchesRule(file, rule, "/test")).toBe(true);
  });

  it("rejects file with non-matching pattern", () => {
    const rule = createRule({ patterns: ["*.log"] });
    const file = createFileInfo({ path: "/test/file.txt" });
    expect(matchesRule(file, rule, "/test")).toBe(false);
  });

  it("excludes files matching exceptions", () => {
    const rule = createRule({
      patterns: ["**/*"],
      exceptions: ["*.txt"],
    });
    const file = createFileInfo({ path: "/test/file.txt" });
    expect(matchesRule(file, rule, "/test")).toBe(false);
  });

  it("applies conditions", () => {
    const rule = createRule({
      patterns: ["**/*"],
      conditions: { olderThan: "7d" },
    });
    const recentFile = createFileInfo({
      path: "/test/file.txt",
      mtime: new Date(now - 86400000), // 1 day ago
    });
    const oldFile = createFileInfo({
      path: "/test/file.txt",
      mtime: new Date(now - 86400000 * 10), // 10 days ago
    });

    expect(matchesRule(recentFile, rule, "/test")).toBe(false);
    expect(matchesRule(oldFile, rule, "/test")).toBe(true);
  });
});

describe("getRuleGlobPatterns", () => {
  it("combines base paths with patterns", () => {
    const rule: Rule = {
      name: "test",
      enabled: true,
      paths: ["/test"],
      patterns: ["*.log"],
    };
    const patterns = getRuleGlobPatterns(rule);
    expect(patterns).toContain("/test/**/*.log");
  });

  it("handles double-star patterns", () => {
    const rule: Rule = {
      name: "test",
      enabled: true,
      paths: ["/test"],
      patterns: ["**/*.log"],
    };
    const patterns = getRuleGlobPatterns(rule);
    expect(patterns).toContain("/test/**/*.log");
  });

  it("handles regex patterns by globbing everything", () => {
    const rule: Rule = {
      name: "test",
      enabled: true,
      paths: ["/test"],
      patterns: ["/\\.log$/"],
    };
    const patterns = getRuleGlobPatterns(rule);
    expect(patterns).toContain("/test/**/*");
  });

  it("handles multiple paths", () => {
    const rule: Rule = {
      name: "test",
      enabled: true,
      paths: ["/path1", "/path2"],
      patterns: ["*.log"],
    };
    const patterns = getRuleGlobPatterns(rule);
    expect(patterns).toContain("/path1/**/*.log");
    expect(patterns).toContain("/path2/**/*.log");
  });
});

describe("getRuleIgnorePatterns", () => {
  it("returns glob exceptions", () => {
    const rule: Rule = {
      name: "test",
      enabled: true,
      paths: ["/test"],
      patterns: ["**/*"],
      exceptions: ["*.txt", "*.md"],
    };
    const ignorePatterns = getRuleIgnorePatterns(rule);
    expect(ignorePatterns).toContain("*.txt");
    expect(ignorePatterns).toContain("*.md");
  });

  it("excludes regex exceptions", () => {
    const rule: Rule = {
      name: "test",
      enabled: true,
      paths: ["/test"],
      patterns: ["**/*"],
      exceptions: ["*.txt", "/\\.log$/"],
    };
    const ignorePatterns = getRuleIgnorePatterns(rule);
    expect(ignorePatterns).toContain("*.txt");
    expect(ignorePatterns).not.toContain("/\\.log$/");
  });

  it("returns empty array when no exceptions", () => {
    const rule: Rule = {
      name: "test",
      enabled: true,
      paths: ["/test"],
      patterns: ["**/*"],
    };
    const ignorePatterns = getRuleIgnorePatterns(rule);
    expect(ignorePatterns).toEqual([]);
  });
});
