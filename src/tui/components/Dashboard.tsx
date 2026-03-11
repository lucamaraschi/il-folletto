import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { Config } from "../../core/types.js";
import { getStats, getHistory, isDaemonRunning } from "../../daemon/state.js";
import { getDiskUsage } from "../../core/scanner.js";
import { formatSize } from "../../core/rule-engine.js";

interface DashboardProps {
  config: Config;
}

export function Dashboard({ config }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [diskUsage, setDiskUsage] = useState<{
    total: number;
    used: number;
    free: number;
    usedPercent: number;
  } | null>(null);

  const stats = getStats();
  const history = getHistory(5);
  const daemonStatus = isDaemonRunning();

  useEffect(() => {
    getDiskUsage().then((usage) => {
      setDiskUsage(usage);
      setLoading(false);
    });
  }, []);

  const enabledRules = config.rules.filter((r) => r.enabled).length;
  const enabledSchedules = config.schedules.filter((s) => s.enabled).length;

  return (
    <Box flexDirection="column" gap={1}>
      {/* Status Row */}
      <Box gap={4}>
        <Box flexDirection="column">
          <Text bold>Daemon</Text>
          <Text color={daemonStatus.running ? "green" : "gray"}>
            {daemonStatus.running ? `● Running (PID ${daemonStatus.pid})` : "○ Stopped"}
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Rules</Text>
          <Text>
            {enabledRules}/{config.rules.length} enabled
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Schedules</Text>
          <Text>
            {enabledSchedules}/{config.schedules.length} enabled
          </Text>
        </Box>
      </Box>

      {/* Disk Usage */}
      <Box flexDirection="column">
        <Text bold>Disk Usage</Text>
        {loading ? (
          <Text>
            <Spinner type="dots" /> Loading...
          </Text>
        ) : diskUsage ? (
          <Box gap={2}>
            <Text>
              {formatSize(diskUsage.used)} / {formatSize(diskUsage.total)}
            </Text>
            <Text color={diskUsage.usedPercent > 90 ? "red" : diskUsage.usedPercent > 75 ? "yellow" : "green"}>
              ({diskUsage.usedPercent}% used)
            </Text>
            <DiskBar percent={diskUsage.usedPercent} width={30} />
          </Box>
        ) : (
          <Text color="gray">Unable to read disk usage</Text>
        )}
      </Box>

      {/* Statistics */}
      <Box flexDirection="column">
        <Text bold>Statistics</Text>
        <Box gap={4}>
          <Text>
            Total cleaned: <Text color="cyan">{stats.totalCleaned}</Text> files
          </Text>
          <Text>
            Space freed: <Text color="cyan">{formatSize(stats.totalSizeFreed)}</Text>
          </Text>
        </Box>
        {stats.lastCleanup && (
          <Text color="gray">
            Last cleanup: {new Date(stats.lastCleanup).toLocaleString()}
          </Text>
        )}
      </Box>

      {/* Recent History */}
      <Box flexDirection="column">
        <Text bold>Recent Activity</Text>
        {history.length === 0 ? (
          <Text color="gray">No cleanup history</Text>
        ) : (
          <Box flexDirection="column">
            {history.map((entry, i) => (
              <Box key={i} gap={2}>
                <Text color="gray">
                  {new Date(entry.timestamp).toLocaleString()}
                </Text>
                <Text color="cyan">{entry.rule}</Text>
                <Text>
                  {entry.filesProcessed} files ({formatSize(entry.sizeFreed)})
                </Text>
                <Text color="gray">[{entry.trigger}]</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Config Info */}
      <Box marginTop={1}>
        <Text color="gray">
          Config: ~/.config/il-folletto/config.yaml
        </Text>
      </Box>
    </Box>
  );
}

function DiskBar({ percent, width }: { percent: number; width: number }) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const color = percent > 90 ? "red" : percent > 75 ? "yellow" : "green";

  return (
    <Text>
      [
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color="gray">{"░".repeat(empty)}</Text>
      ]
    </Text>
  );
}
