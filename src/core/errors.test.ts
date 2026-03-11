import { describe, it, expect } from "vitest";
import {
  FollettoError,
  ConfigError,
  ConfigValidationError,
  ConfigParseError,
  RuleError,
  RuleNotFoundError,
  FileOperationError,
  PermissionError,
  DaemonError,
  wrapError,
  formatError,
  isRecoverable,
} from "./errors.js";

describe("FollettoError", () => {
  it("creates error with message and code", () => {
    const error = new FollettoError("Test error", "TEST_CODE");
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.recoverable).toBe(true);
  });

  it("supports non-recoverable errors", () => {
    const error = new FollettoError("Fatal error", "FATAL", false);
    expect(error.recoverable).toBe(false);
  });

  it("serializes to JSON", () => {
    const error = new FollettoError("Test error", "TEST_CODE");
    const json = error.toJSON();
    expect(json).toEqual({
      name: "FollettoError",
      code: "TEST_CODE",
      message: "Test error",
      recoverable: true,
    });
  });
});

describe("ConfigValidationError", () => {
  it("formats validation issues", () => {
    const error = new ConfigValidationError([
      { path: "rules.0.name", message: "Required" },
      { path: "rules.0.paths", message: "Must have at least 1 item" },
    ]);
    expect(error.message).toContain("rules.0.name: Required");
    expect(error.message).toContain("rules.0.paths: Must have at least 1 item");
  });

  it("stores issues array", () => {
    const issues = [{ path: "version", message: "Expected 1" }];
    const error = new ConfigValidationError(issues, "/path/to/config.yaml");
    expect(error.issues).toEqual(issues);
    expect(error.path).toBe("/path/to/config.yaml");
  });
});

describe("RuleNotFoundError", () => {
  it("creates error with rule name", () => {
    const error = new RuleNotFoundError("my-rule");
    expect(error.message).toBe("Rule not found: my-rule");
    expect(error.ruleName).toBe("my-rule");
  });
});

describe("FileOperationError", () => {
  it("creates error with file path and operation", () => {
    const error = new FileOperationError(
      "Cannot delete file",
      "/path/to/file",
      "delete"
    );
    expect(error.message).toBe("Cannot delete file");
    expect(error.filePath).toBe("/path/to/file");
    expect(error.operation).toBe("delete");
  });
});

describe("PermissionError", () => {
  it("creates user-friendly message", () => {
    const error = new PermissionError("/path/to/file", "delete");
    expect(error.message).toBe('Permission denied: cannot delete "/path/to/file"');
  });
});

describe("wrapError", () => {
  it("returns FollettoError as-is", () => {
    const original = new ConfigError("Original error");
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it("wraps Error with context", () => {
    const original = new Error("Something failed");
    const wrapped = wrapError(original, "While doing X");
    expect(wrapped.message).toBe("While doing X: Something failed");
  });

  it("wraps string errors", () => {
    const wrapped = wrapError("String error");
    expect(wrapped.message).toBe("String error");
    expect(wrapped.code).toBe("UNKNOWN_ERROR");
  });

  it("converts ENOENT to FileNotFoundError", () => {
    const nodeError = Object.assign(new Error("ENOENT"), {
      code: "ENOENT",
      path: "/missing/file",
    });
    const wrapped = wrapError(nodeError);
    expect(wrapped.name).toBe("FileNotFoundError");
  });

  it("converts EACCES to PermissionError", () => {
    const nodeError = Object.assign(new Error("EACCES"), {
      code: "EACCES",
      path: "/protected/file",
    });
    const wrapped = wrapError(nodeError);
    expect(wrapped.name).toBe("PermissionError");
  });

  it("converts ECONNREFUSED to DaemonError", () => {
    const nodeError = Object.assign(new Error("ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const wrapped = wrapError(nodeError);
    expect(wrapped.name).toBe("DaemonError");
  });
});

describe("formatError", () => {
  it("formats FollettoError", () => {
    const error = new ConfigError("Config is invalid");
    expect(formatError(error)).toBe("Config is invalid");
  });

  it("formats ConfigValidationError with issues", () => {
    const error = new ConfigValidationError([
      { path: "version", message: "Expected 1" },
    ]);
    expect(formatError(error)).toContain("version: Expected 1");
  });

  it("formats regular Error", () => {
    const error = new Error("Regular error");
    expect(formatError(error)).toBe("Regular error");
  });

  it("formats string", () => {
    expect(formatError("String error")).toBe("String error");
  });
});

describe("isRecoverable", () => {
  it("returns true for recoverable FollettoError", () => {
    const error = new FollettoError("Recoverable", "TEST", true);
    expect(isRecoverable(error)).toBe(true);
  });

  it("returns false for non-recoverable FollettoError", () => {
    const error = new FollettoError("Fatal", "TEST", false);
    expect(isRecoverable(error)).toBe(false);
  });

  it("returns true for non-FollettoError", () => {
    expect(isRecoverable(new Error("Regular error"))).toBe(true);
    expect(isRecoverable("string")).toBe(true);
  });
});
