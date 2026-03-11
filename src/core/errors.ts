/**
 * Custom error classes for il-folletto
 */

/**
 * Base error class for all il-folletto errors
 */
export class FollettoError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(message: string, code: string, recoverable: boolean = true) {
    super(message);
    this.name = "FollettoError";
    this.code = code;
    this.recoverable = recoverable;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
    };
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends FollettoError {
  readonly path?: string;

  constructor(message: string, path?: string) {
    super(message, "CONFIG_ERROR", true);
    this.name = "ConfigError";
    this.path = path;
  }
}

export class ConfigNotFoundError extends ConfigError {
  constructor(path: string) {
    super(`Configuration file not found: ${path}`, path);
    this.name = "ConfigNotFoundError";
  }
}

export class ConfigParseError extends ConfigError {
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, path?: string, line?: number, column?: number) {
    super(`Failed to parse configuration: ${message}`, path);
    this.name = "ConfigParseError";
    this.line = line;
    this.column = column;
  }
}

export class ConfigValidationError extends ConfigError {
  readonly issues: Array<{ path: string; message: string }>;

  constructor(issues: Array<{ path: string; message: string }>, path?: string) {
    const issueMessages = issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n");
    super(`Configuration validation failed:\n${issueMessages}`, path);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

/**
 * Rule-related errors
 */
export class RuleError extends FollettoError {
  readonly ruleName: string;

  constructor(message: string, ruleName: string) {
    super(message, "RULE_ERROR", true);
    this.name = "RuleError";
    this.ruleName = ruleName;
  }
}

export class RuleNotFoundError extends RuleError {
  constructor(ruleName: string) {
    super(`Rule not found: ${ruleName}`, ruleName);
    this.name = "RuleNotFoundError";
  }
}

export class InvalidPatternError extends RuleError {
  readonly pattern: string;

  constructor(pattern: string, ruleName: string, details?: string) {
    super(
      `Invalid pattern "${pattern}" in rule "${ruleName}"${details ? `: ${details}` : ""}`,
      ruleName
    );
    this.name = "InvalidPatternError";
    this.pattern = pattern;
  }
}

/**
 * File operation errors
 */
export class FileOperationError extends FollettoError {
  readonly filePath: string;
  readonly operation: "trash" | "delete" | "move" | "compress" | "scan" | "read";

  constructor(
    message: string,
    filePath: string,
    operation: "trash" | "delete" | "move" | "compress" | "scan" | "read"
  ) {
    super(message, "FILE_OPERATION_ERROR", true);
    this.name = "FileOperationError";
    this.filePath = filePath;
    this.operation = operation;
  }
}

export class PermissionError extends FileOperationError {
  constructor(filePath: string, operation: FileOperationError["operation"]) {
    super(`Permission denied: cannot ${operation} "${filePath}"`, filePath, operation);
    this.name = "PermissionError";
  }
}

export class FileNotFoundError extends FileOperationError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, filePath, "read");
    this.name = "FileNotFoundError";
  }
}

/**
 * Daemon-related errors
 */
export class DaemonError extends FollettoError {
  constructor(message: string, recoverable: boolean = true) {
    super(message, "DAEMON_ERROR", recoverable);
    this.name = "DaemonError";
  }
}

export class DaemonNotRunningError extends DaemonError {
  constructor() {
    super("Daemon is not running. Start it with: il-folletto daemon start", true);
    this.name = "DaemonNotRunningError";
  }
}

export class DaemonAlreadyRunningError extends DaemonError {
  readonly pid: number;

  constructor(pid: number) {
    super(`Daemon is already running (PID: ${pid})`, true);
    this.name = "DaemonAlreadyRunningError";
    this.pid = pid;
  }
}

export class ApiConnectionError extends DaemonError {
  readonly host: string;
  readonly port: number;

  constructor(host: string, port: number) {
    super(
      `Cannot connect to daemon API at ${host}:${port}. Is the daemon running?`,
      true
    );
    this.name = "ApiConnectionError";
    this.host = host;
    this.port = port;
  }
}

/**
 * Launchd-related errors
 */
export class LaunchdError extends FollettoError {
  constructor(message: string, recoverable: boolean = true) {
    super(message, "LAUNCHD_ERROR", recoverable);
    this.name = "LaunchdError";
  }
}

export class LaunchdNotInstalledError extends LaunchdError {
  constructor() {
    super("Launchd service not installed. Run: il-folletto daemon install", true);
    this.name = "LaunchdNotInstalledError";
  }
}

/**
 * Schedule-related errors
 */
export class ScheduleError extends FollettoError {
  readonly scheduleName: string;

  constructor(message: string, scheduleName: string) {
    super(message, "SCHEDULE_ERROR", true);
    this.name = "ScheduleError";
    this.scheduleName = scheduleName;
  }
}

export class InvalidCronError extends ScheduleError {
  readonly expression: string;

  constructor(expression: string, scheduleName: string) {
    super(
      `Invalid cron expression "${expression}" in schedule "${scheduleName}"`,
      scheduleName
    );
    this.name = "InvalidCronError";
    this.expression = expression;
  }
}

/**
 * Helper to wrap unknown errors
 */
export function wrapError(error: unknown, context?: string): FollettoError {
  if (error instanceof FollettoError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const fullMessage = context ? `${context}: ${message}` : message;

  // Check for common Node.js error codes
  if (error instanceof Error && "code" in error) {
    const code = (error as NodeJS.ErrnoException).code;
    const path = (error as NodeJS.ErrnoException).path;

    switch (code) {
      case "ENOENT":
        if (path) {
          return new FileNotFoundError(path);
        }
        break;
      case "EACCES":
      case "EPERM":
        if (path) {
          return new PermissionError(path, "read");
        }
        break;
      case "ECONNREFUSED":
        return new DaemonError("Connection refused - daemon may not be running", true);
    }
  }

  return new FollettoError(fullMessage, "UNKNOWN_ERROR", true);
}

/**
 * Format error for CLI output
 */
export function formatError(error: unknown): string {
  if (error instanceof ConfigValidationError) {
    return error.message;
  }

  if (error instanceof FollettoError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Check if an error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof FollettoError) {
    return error.recoverable;
  }
  return true;
}
