import { execSync, spawn } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getPlistPath, getLabel, generatePlist, getDefaultPlistConfig } from "./plist.js";
import { ensureConfigDir } from "../core/config.js";

export interface LaunchdStatus {
  installed: boolean;
  loaded: boolean;
  running: boolean;
  pid: number | null;
  label: string;
  plistPath: string;
}

/**
 * Get launchd service status
 */
export function getStatus(): LaunchdStatus {
  const plistPath = getPlistPath();
  const label = getLabel();
  const installed = existsSync(plistPath);

  let loaded = false;
  let running = false;
  let pid: number | null = null;

  if (installed) {
    try {
      const output = execSync(`launchctl list | grep ${label}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (output.includes(label)) {
        loaded = true;

        // Parse PID from output (format: "PID\tStatus\tLabel")
        const parts = output.trim().split("\t");
        if (parts[0] && parts[0] !== "-") {
          pid = parseInt(parts[0], 10);
          running = !isNaN(pid);
        }
      }
    } catch {
      // Service not in launchctl list
    }
  }

  return {
    installed,
    loaded,
    running,
    pid,
    label,
    plistPath,
  };
}

/**
 * Install the launchd service
 */
export function install(): { success: boolean; message: string } {
  const plistPath = getPlistPath();
  const plistDir = dirname(plistPath);

  // Ensure directories exist
  ensureConfigDir();
  if (!existsSync(plistDir)) {
    mkdirSync(plistDir, { recursive: true });
  }

  // Generate plist
  const config = getDefaultPlistConfig();
  const plistContent = generatePlist(config);

  // Write plist file
  writeFileSync(plistPath, plistContent, "utf-8");

  return {
    success: true,
    message: `Service installed at ${plistPath}`,
  };
}

/**
 * Uninstall the launchd service
 */
export function uninstall(): { success: boolean; message: string } {
  const status = getStatus();

  // Stop and unload if running
  if (status.loaded) {
    stop();
  }

  // Remove plist file
  if (status.installed) {
    unlinkSync(status.plistPath);
  }

  return {
    success: true,
    message: "Service uninstalled",
  };
}

/**
 * Load and start the service
 */
export function start(): { success: boolean; message: string } {
  const status = getStatus();

  if (!status.installed) {
    return {
      success: false,
      message: "Service not installed. Run 'il-folletto daemon install' first.",
    };
  }

  if (status.running) {
    return {
      success: false,
      message: `Service already running (PID: ${status.pid})`,
    };
  }

  try {
    execSync(`launchctl load ${status.plistPath}`, {
      stdio: "inherit",
    });

    // Wait a moment and check status
    setTimeout(() => {
      const newStatus = getStatus();
      if (newStatus.running) {
        console.log(`Service started (PID: ${newStatus.pid})`);
      }
    }, 500);

    return {
      success: true,
      message: "Service started",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to start service: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Stop and unload the service
 */
export function stop(): { success: boolean; message: string } {
  const status = getStatus();

  if (!status.loaded) {
    return {
      success: false,
      message: "Service not loaded",
    };
  }

  try {
    execSync(`launchctl unload ${status.plistPath}`, {
      stdio: "inherit",
    });

    return {
      success: true,
      message: "Service stopped",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to stop service: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Restart the service
 */
export function restart(): { success: boolean; message: string } {
  const status = getStatus();

  if (status.loaded) {
    stop();
  }

  // Small delay between stop and start
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(start());
    }, 500);
  }) as unknown as { success: boolean; message: string };
}

/**
 * Run daemon in foreground (for development/testing)
 */
export async function runForeground(): Promise<void> {
  const { runDaemon } = await import("../daemon/index.js");
  await runDaemon();
}
