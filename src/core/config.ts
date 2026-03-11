import { cosmiconfig } from "cosmiconfig";
import { parse as parseYaml } from "yaml";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { ZodError } from "zod";
import { ConfigSchema } from "./types.js";
import type { Config } from "./types.js";
import {
  ConfigParseError,
  ConfigValidationError,
  ConfigNotFoundError,
  RuleNotFoundError,
} from "./errors.js";

const CONFIG_NAME = "il-folletto";
const CONFIG_DIR = join(homedir(), ".config", CONFIG_NAME);
const CONFIG_FILE = join(CONFIG_DIR, "config.yaml");
const STATE_FILE = join(CONFIG_DIR, "state.json");
const LOG_DIR = join(CONFIG_DIR, "logs");

export interface ConfigPaths {
  configDir: string;
  configFile: string;
  stateFile: string;
  logDir: string;
}

export function getConfigPaths(): ConfigPaths {
  return {
    configDir: CONFIG_DIR,
    configFile: CONFIG_FILE,
    stateFile: STATE_FILE,
    logDir: LOG_DIR,
  };
}

/**
 * Expand ~ and environment variables in paths
 */
export function expandPath(path: string): string {
  // Expand ~
  if (path.startsWith("~/")) {
    path = join(homedir(), path.slice(2));
  } else if (path === "~") {
    path = homedir();
  }

  // Expand environment variables like $HOME or ${HOME}
  path = path.replace(/\$\{?(\w+)\}?/g, (_, name: string) => {
    return process.env[name] ?? "";
  });

  return path;
}

/**
 * Expand all paths in a config object
 */
function expandConfigPaths(config: Config): Config {
  return {
    ...config,
    rules: config.rules.map((rule) => ({
      ...rule,
      paths: rule.paths.map(expandPath),
      moveTo: rule.moveTo ? expandPath(rule.moveTo) : undefined,
      exceptions: rule.exceptions?.map(expandPath),
    })),
    watchers: config.watchers.map((watcher) => ({
      ...watcher,
      path: expandPath(watcher.path),
    })),
  };
}

/**
 * Load configuration using cosmiconfig
 */
export async function loadConfig(): Promise<Config> {
  const explorer = cosmiconfig(CONFIG_NAME, {
    searchPlaces: [
      "config.yaml",
      "config.yml",
      "config.json",
      `.${CONFIG_NAME}rc`,
      `.${CONFIG_NAME}rc.yaml`,
      `.${CONFIG_NAME}rc.yml`,
      `.${CONFIG_NAME}rc.json`,
    ],
    loaders: {
      ".yaml": (_filepath, content) => parseYaml(content),
      ".yml": (_filepath, content) => parseYaml(content),
    },
    searchStrategy: "global",
  });

  // First try the default config location
  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const rawConfig = parseYaml(content);
      const parsed = validateConfig(rawConfig, CONFIG_FILE);
      return expandConfigPaths(parsed);
    } catch (error) {
      if (error instanceof ConfigValidationError || error instanceof ConfigParseError) {
        throw error;
      }
      if (error instanceof Error && error.name === "YAMLParseError") {
        throw new ConfigParseError(error.message, CONFIG_FILE);
      }
      throw error;
    }
  }

  // Then search for config in other locations
  try {
    const result = await explorer.search();

    if (result?.config) {
      const parsed = validateConfig(result.config, result.filepath);
      return expandConfigPaths(parsed);
    }
  } catch (error) {
    if (error instanceof ConfigValidationError || error instanceof ConfigParseError) {
      throw error;
    }
    if (error instanceof Error && error.name === "YAMLParseError") {
      throw new ConfigParseError(error.message);
    }
    throw error;
  }

  // Return default config if none found
  const defaultConfig = ConfigSchema.parse({ version: 1 });
  return expandConfigPaths(defaultConfig);
}

/**
 * Save configuration to the default location
 */
export async function saveConfig(config: Config): Promise<void> {
  const { stringify } = await import("yaml");

  ensureConfigDir();
  const yaml = stringify(config, { indent: 2 });
  writeFileSync(CONFIG_FILE, yaml, "utf-8");
}

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Initialize config with default template if it doesn't exist
 */
export async function initConfig(): Promise<boolean> {
  if (existsSync(CONFIG_FILE)) {
    return false; // Already exists
  }

  ensureConfigDir();

  const defaultConfigPath = join(
    dirname(new URL(import.meta.url).pathname),
    "../../resources/default-config.yaml"
  );

  if (existsSync(defaultConfigPath)) {
    const content = readFileSync(defaultConfigPath, "utf-8");
    writeFileSync(CONFIG_FILE, content, "utf-8");
  } else {
    // Minimal default config
    const defaultConfig: Config = {
      version: 1,
      global: {
        dryRun: false,
        logLevel: "info",
        defaultAction: "trash",
        apiPort: 3847,
        apiHost: "127.0.0.1",
      },
      rules: [
        {
          name: "cache-cleanup",
          description: "Clean application caches older than 7 days",
          enabled: true,
          paths: ["~/Library/Caches"],
          patterns: ["**/*"],
          conditions: { olderThan: "7d" },
          exceptions: ["**/Homebrew/**"],
        },
      ],
      schedules: [],
      watchers: [],
    };
    await saveConfig(defaultConfig);
  }

  return true;
}

/**
 * Validate a config object
 */
export function validateConfig(config: unknown, path?: string): Config {
  try {
    return ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({
        path: issue.path.join(".") || "root",
        message: issue.message,
      }));
      throw new ConfigValidationError(issues, path);
    }
    throw error;
  }
}

/**
 * Get a rule by name (returns undefined if not found)
 */
export function getRule(config: Config, name: string): Config["rules"][number] | undefined {
  return config.rules.find((r) => r.name === name);
}

/**
 * Get a rule by name (throws if not found)
 */
export function getRequiredRule(config: Config, name: string): Config["rules"][number] {
  const rule = config.rules.find((r) => r.name === name);
  if (!rule) {
    throw new RuleNotFoundError(name);
  }
  return rule;
}

/**
 * Get all enabled rules
 */
export function getEnabledRules(config: Config): Config["rules"] {
  return config.rules.filter((r) => r.enabled);
}

/**
 * Get rules by names (or all if "all" is in the list)
 */
export function getRulesByNames(config: Config, names: string[]): Config["rules"] {
  if (names.includes("all")) {
    return getEnabledRules(config);
  }
  return config.rules.filter((r) => names.includes(r.name) && r.enabled);
}
