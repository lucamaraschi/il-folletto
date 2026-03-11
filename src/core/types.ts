import { z } from "zod";

// Duration string like "7d", "1h", "30m", "1w"
const DurationSchema = z.string().regex(/^\d+[smhdw]$/, {
  message: "Duration must be like '7d', '1h', '30m', '1w'",
});

// Size string like "100MB", "1GB", "500KB"
const SizeSchema = z.string().regex(/^\d+(\.\d+)?\s*(B|KB|MB|GB|TB)$/i, {
  message: "Size must be like '100MB', '1GB', '500KB'",
});

// Action types
export const ActionSchema = z.enum(["trash", "delete", "move", "compress"]);
export type Action = z.infer<typeof ActionSchema>;

// Log level
export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

// Conditions for matching files
export const ConditionsSchema = z
  .object({
    olderThan: DurationSchema.optional(),
    newerThan: DurationSchema.optional(),
    largerThan: SizeSchema.optional(),
    smallerThan: SizeSchema.optional(),
    modifiedBefore: z.string().datetime().optional(),
    modifiedAfter: z.string().datetime().optional(),
    accessedBefore: z.string().datetime().optional(),
    accessedAfter: z.string().datetime().optional(),
  })
  .strict();

export type Conditions = z.infer<typeof ConditionsSchema>;

// Target type for matching
export const TargetSchema = z.enum(["files", "directories", "all"]);
export type Target = z.infer<typeof TargetSchema>;

// A cleanup rule
export const RuleSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    enabled: z.boolean().default(true),
    action: ActionSchema.optional(), // Overrides global defaultAction
    moveTo: z.string().optional(), // Required if action is "move"
    target: TargetSchema.optional(), // What to match: files, directories, or all (default: files)
    paths: z.array(z.string()).min(1), // Directories to scan
    patterns: z.array(z.string()).min(1), // Glob or regex patterns
    conditions: ConditionsSchema.optional(),
    exceptions: z.array(z.string()).optional(), // Patterns to exclude
  })
  .strict()
  .refine(
    (rule) => {
      if (rule.action === "move" && !rule.moveTo) {
        return false;
      }
      return true;
    },
    { message: "moveTo is required when action is 'move'" }
  );

export type Rule = z.infer<typeof RuleSchema>;

// Schedule for automated cleanup
export const ScheduleSchema = z
  .object({
    name: z.string().min(1),
    enabled: z.boolean().default(true),
    cron: z.string(), // Cron expression
    rules: z.array(z.string()).min(1), // Rule names or "all"
  })
  .strict();

export type Schedule = z.infer<typeof ScheduleSchema>;

// File watcher configuration
export const WatcherSchema = z
  .object({
    path: z.string(),
    enabled: z.boolean().default(true),
    threshold: SizeSchema, // Trigger when directory exceeds this size
    rules: z.array(z.string()).min(1), // Rules to execute
    debounceMs: z.number().positive().default(5000), // Debounce time
  })
  .strict();

export type Watcher = z.infer<typeof WatcherSchema>;

// Global settings
export const GlobalSettingsSchema = z
  .object({
    dryRun: z.boolean().default(false),
    logLevel: LogLevelSchema.default("info"),
    defaultAction: ActionSchema.default("trash"),
    apiPort: z.number().positive().default(3847),
    apiHost: z.string().default("127.0.0.1"),
  })
  .strict();

export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>;

// Full configuration
export const ConfigSchema = z
  .object({
    version: z.literal(1),
    global: GlobalSettingsSchema.default({}),
    rules: z.array(RuleSchema).default([]),
    schedules: z.array(ScheduleSchema).default([]),
    watchers: z.array(WatcherSchema).default([]),
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;

// File info collected by scanner
export interface FileInfo {
  path: string;
  size: number;
  mtime: Date;
  atime: Date;
  ctime: Date;
  isDirectory: boolean;
}

// Result of a scan/cleanup operation
export interface ScanResult {
  rule: string;
  files: FileInfo[];
  totalSize: number;
  totalCount: number;
}

export interface CleanupResult {
  rule: string;
  action: Action;
  processed: number;
  failed: number;
  totalSize: number;
  errors: Array<{ path: string; error: string }>;
  duration: number;
}

// Daemon state
export interface DaemonState {
  pid: number;
  startedAt: Date;
  lastCleanup: Date | null;
  totalCleaned: number;
  history: CleanupResult[];
}

// API request/response types
export interface DryRunRequest {
  rules?: string[]; // Rule names, or empty for all
}

export interface CleanRequest {
  rules?: string[]; // Rule names, or empty for all
  force?: boolean; // Skip confirmation
}

export interface StatusResponse {
  running: boolean;
  uptime: number;
  lastCleanup: Date | null;
  nextScheduled: Date | null;
  totalCleaned: number;
}
