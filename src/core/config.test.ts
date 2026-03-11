import { describe, it, expect } from "vitest";
import {
  expandPath,
  validateConfig,
  getRule,
  getRequiredRule,
  getEnabledRules,
  getRulesByNames,
} from "./config.js";
import { ConfigValidationError, RuleNotFoundError } from "./errors.js";
import type { Config } from "./types.js";
import { homedir } from "node:os";

describe("expandPath", () => {
  it("expands ~ to home directory", () => {
    expect(expandPath("~/test")).toBe(`${homedir()}/test`);
  });

  it("expands ~ alone to home directory", () => {
    expect(expandPath("~")).toBe(homedir());
  });

  it("expands environment variables with ${VAR}", () => {
    process.env.TEST_VAR = "test-value";
    expect(expandPath("${TEST_VAR}/path")).toBe("test-value/path");
    delete process.env.TEST_VAR;
  });

  it("expands environment variables with $VAR", () => {
    process.env.TEST_VAR = "test-value";
    expect(expandPath("$TEST_VAR/path")).toBe("test-value/path");
    delete process.env.TEST_VAR;
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandPath("/absolute/path")).toBe("/absolute/path");
  });

  it("replaces undefined env vars with empty string", () => {
    expect(expandPath("${UNDEFINED_VAR}/path")).toBe("/path");
  });
});

describe("validateConfig", () => {
  it("validates minimal config", () => {
    const config = validateConfig({ version: 1 });
    expect(config.version).toBe(1);
    expect(config.rules).toEqual([]);
  });

  it("validates config with rules", () => {
    const config = validateConfig({
      version: 1,
      rules: [
        {
          name: "test-rule",
          paths: ["/test"],
          patterns: ["**/*"],
        },
      ],
    });
    expect(config.rules).toHaveLength(1);
    expect(config.rules[0]!.name).toBe("test-rule");
  });

  it("throws ConfigValidationError on invalid config", () => {
    expect(() => validateConfig({ version: 2 })).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError on missing required fields", () => {
    expect(() =>
      validateConfig({
        version: 1,
        rules: [{ name: "test" }], // missing paths and patterns
      })
    ).toThrow(ConfigValidationError);
  });

  it("validates rule conditions", () => {
    const config = validateConfig({
      version: 1,
      rules: [
        {
          name: "test-rule",
          paths: ["/test"],
          patterns: ["**/*"],
          conditions: {
            olderThan: "7d",
            largerThan: "100MB",
          },
        },
      ],
    });
    expect(config.rules[0]!.conditions?.olderThan).toBe("7d");
    expect(config.rules[0]!.conditions?.largerThan).toBe("100MB");
  });

  it("validates schedules", () => {
    const config = validateConfig({
      version: 1,
      schedules: [
        {
          name: "hourly",
          cron: "0 * * * *",
          rules: ["test-rule"],
        },
      ],
    });
    expect(config.schedules).toHaveLength(1);
    expect(config.schedules[0]!.cron).toBe("0 * * * *");
  });

  it("validates watchers", () => {
    const config = validateConfig({
      version: 1,
      watchers: [
        {
          path: "/test",
          threshold: "10GB",
          rules: ["test-rule"],
        },
      ],
    });
    expect(config.watchers).toHaveLength(1);
    expect(config.watchers[0]!.threshold).toBe("10GB");
  });

  it("requires moveTo when action is move", () => {
    expect(() =>
      validateConfig({
        version: 1,
        rules: [
          {
            name: "test-rule",
            paths: ["/test"],
            patterns: ["**/*"],
            action: "move",
            // missing moveTo
          },
        ],
      })
    ).toThrow(ConfigValidationError);
  });
});

describe("getRule", () => {
  const config: Config = {
    version: 1,
    global: {
      dryRun: false,
      logLevel: "info",
      defaultAction: "trash",
      apiPort: 3847,
      apiHost: "127.0.0.1",
    },
    rules: [
      { name: "rule-1", enabled: true, paths: ["/test"], patterns: ["**/*"] },
      { name: "rule-2", enabled: false, paths: ["/test"], patterns: ["**/*"] },
    ],
    schedules: [],
    watchers: [],
  };

  it("returns rule by name", () => {
    const rule = getRule(config, "rule-1");
    expect(rule?.name).toBe("rule-1");
  });

  it("returns undefined for non-existent rule", () => {
    const rule = getRule(config, "non-existent");
    expect(rule).toBeUndefined();
  });
});

describe("getRequiredRule", () => {
  const config: Config = {
    version: 1,
    global: {
      dryRun: false,
      logLevel: "info",
      defaultAction: "trash",
      apiPort: 3847,
      apiHost: "127.0.0.1",
    },
    rules: [
      { name: "rule-1", enabled: true, paths: ["/test"], patterns: ["**/*"] },
    ],
    schedules: [],
    watchers: [],
  };

  it("returns rule by name", () => {
    const rule = getRequiredRule(config, "rule-1");
    expect(rule.name).toBe("rule-1");
  });

  it("throws RuleNotFoundError for non-existent rule", () => {
    expect(() => getRequiredRule(config, "non-existent")).toThrow(
      RuleNotFoundError
    );
  });
});

describe("getEnabledRules", () => {
  const config: Config = {
    version: 1,
    global: {
      dryRun: false,
      logLevel: "info",
      defaultAction: "trash",
      apiPort: 3847,
      apiHost: "127.0.0.1",
    },
    rules: [
      { name: "rule-1", enabled: true, paths: ["/test"], patterns: ["**/*"] },
      { name: "rule-2", enabled: false, paths: ["/test"], patterns: ["**/*"] },
      { name: "rule-3", enabled: true, paths: ["/test"], patterns: ["**/*"] },
    ],
    schedules: [],
    watchers: [],
  };

  it("returns only enabled rules", () => {
    const rules = getEnabledRules(config);
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.name)).toEqual(["rule-1", "rule-3"]);
  });
});

describe("getRulesByNames", () => {
  const config: Config = {
    version: 1,
    global: {
      dryRun: false,
      logLevel: "info",
      defaultAction: "trash",
      apiPort: 3847,
      apiHost: "127.0.0.1",
    },
    rules: [
      { name: "rule-1", enabled: true, paths: ["/test"], patterns: ["**/*"] },
      { name: "rule-2", enabled: false, paths: ["/test"], patterns: ["**/*"] },
      { name: "rule-3", enabled: true, paths: ["/test"], patterns: ["**/*"] },
    ],
    schedules: [],
    watchers: [],
  };

  it("returns rules by names", () => {
    const rules = getRulesByNames(config, ["rule-1", "rule-3"]);
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.name)).toEqual(["rule-1", "rule-3"]);
  });

  it("only returns enabled rules", () => {
    const rules = getRulesByNames(config, ["rule-1", "rule-2"]);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.name).toBe("rule-1");
  });

  it("returns all enabled rules when 'all' is specified", () => {
    const rules = getRulesByNames(config, ["all"]);
    expect(rules).toHaveLength(2);
  });

  it("returns empty array for non-existent names", () => {
    const rules = getRulesByNames(config, ["non-existent"]);
    expect(rules).toHaveLength(0);
  });
});
