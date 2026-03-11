import { homedir } from "node:os";
import { join } from "node:path";
import { getConfigPaths } from "../core/config.js";

const LABEL = "com.il-folletto.daemon";

export interface PlistConfig {
  nodePath: string;
  scriptPath: string;
  logPath: string;
  errorLogPath: string;
}

/**
 * Get the launchd plist file path
 */
export function getPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

/**
 * Get the launchd label
 */
export function getLabel(): string {
  return LABEL;
}

/**
 * Generate launchd plist content
 */
export function generatePlist(config: PlistConfig): string {
  const { logDir } = getConfigPaths();

  const logPath = config.logPath || join(logDir, "daemon.log");
  const errorLogPath = config.errorLogPath || join(logDir, "daemon-error.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${config.nodePath}</string>
        <string>${config.scriptPath}</string>
        <string>daemon</string>
        <string>run</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${logPath}</string>

    <key>StandardErrorPath</key>
    <string>${errorLogPath}</string>

    <key>WorkingDirectory</key>
    <string>${homedir()}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>${homedir()}</string>
    </dict>

    <key>ProcessType</key>
    <string>Background</string>

    <key>LowPriorityIO</key>
    <true/>

    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
`;
}

/**
 * Get default plist config
 */
export function getDefaultPlistConfig(): PlistConfig {
  const { logDir } = getConfigPaths();

  // Try to find node path
  let nodePath = process.execPath;

  // Get the script path (built version)
  const scriptPath = join(process.cwd(), "dist", "index.js");

  return {
    nodePath,
    scriptPath,
    logPath: join(logDir, "daemon.log"),
    errorLogPath: join(logDir, "daemon-error.log"),
  };
}
