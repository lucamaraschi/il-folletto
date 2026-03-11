import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { Config, ScanResult, CleanupResult } from "../../core/types.js";
import { scanRules } from "../../core/scanner.js";
import { cleanRules, summarizeResults } from "../../core/cleaner.js";
import { formatSize } from "../../core/rule-engine.js";

interface CleanupViewProps {
  config: Config;
}

type Phase = "select" | "scanning" | "preview" | "cleaning" | "done";

export function CleanupView({ config }: CleanupViewProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [selectedRules, setSelectedRules] = useState<Set<string>>(
    new Set(config.rules.filter((r) => r.enabled).map((r) => r.name))
  );
  const [cursorIndex, setCursorIndex] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [cleanupResults, setCleanupResults] = useState<CleanupResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, file: "" });

  const enabledRules = config.rules.filter((r) => r.enabled);

  useInput((input, key) => {
    if (phase === "select") {
      if (key.upArrow) {
        setCursorIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setCursorIndex((i) => Math.min(enabledRules.length - 1, i + 1));
      } else if (input === " ") {
        const ruleName = enabledRules[cursorIndex]?.name;
        if (ruleName) {
          setSelectedRules((prev) => {
            const next = new Set(prev);
            if (next.has(ruleName)) {
              next.delete(ruleName);
            } else {
              next.add(ruleName);
            }
            return next;
          });
        }
      } else if (input === "a") {
        // Select all
        setSelectedRules(new Set(enabledRules.map((r) => r.name)));
      } else if (input === "n") {
        // Select none
        setSelectedRules(new Set());
      } else if (key.return) {
        runScan();
      }
    } else if (phase === "preview") {
      if (input === "x") {
        runCleanup();
      } else if (input === "b" || key.escape) {
        setPhase("select");
        setScanResults([]);
      }
    } else if (phase === "done") {
      if (input === "b" || key.escape || key.return) {
        setPhase("select");
        setScanResults([]);
        setCleanupResults([]);
      }
    }
  });

  async function runScan() {
    setPhase("scanning");
    const rules = config.rules.filter((r) => selectedRules.has(r.name));
    const results = await scanRules(rules);
    setScanResults(results);
    setPhase("preview");
  }

  async function runCleanup() {
    setPhase("cleaning");
    const rules = config.rules.filter((r) => selectedRules.has(r.name));
    const results = await cleanRules(
      rules,
      config.global.defaultAction,
      false,
      (p) => {
        setProgress({
          current: p.current,
          total: p.total,
          file: p.currentFile.split("/").pop() || p.currentFile,
        });
      }
    );
    setCleanupResults(results);
    setPhase("done");
  }

  if (phase === "scanning") {
    return (
      <Box flexDirection="column">
        <Text>
          <Spinner type="dots" /> Scanning {selectedRules.size} rules...
        </Text>
      </Box>
    );
  }

  if (phase === "cleaning") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          <Spinner type="dots" /> Cleaning...
        </Text>
        <Text color="gray">
          [{progress.current}/{progress.total}] {progress.file}
        </Text>
        <ProgressBar current={progress.current} total={progress.total} width={40} />
      </Box>
    );
  }

  if (phase === "preview") {
    return <PreviewView results={scanResults} config={config} />;
  }

  if (phase === "done") {
    return <ResultsView results={cleanupResults} />;
  }

  // Select phase
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select Rules to Clean</Text>
        <Text color="gray"> ({selectedRules.size} selected)</Text>
      </Box>

      <Box flexDirection="column">
        {enabledRules.map((rule, i) => (
          <Box key={rule.name} gap={2}>
            <Text color={i === cursorIndex ? "cyan" : undefined}>
              {i === cursorIndex ? "▸" : " "}
            </Text>
            <Text color={selectedRules.has(rule.name) ? "green" : "gray"}>
              {selectedRules.has(rule.name) ? "☑" : "☐"}
            </Text>
            <Text
              bold={i === cursorIndex}
              color={i === cursorIndex ? "cyan" : undefined}
            >
              {rule.name}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">
          ↑/↓ navigate • Space toggle • a all • n none
        </Text>
        <Text color="gray">
          Enter run dry-run preview
        </Text>
      </Box>
    </Box>
  );
}

function PreviewView({ results, config }: { results: ScanResult[]; config: Config }) {
  const totalFiles = results.reduce((sum, r) => sum + r.totalCount, 0);
  const totalSize = results.reduce((sum, r) => sum + r.totalSize, 0);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Dry-Run Preview</Text>

      <Box flexDirection="column">
        {results.map((result) => (
          <Box key={result.rule} flexDirection="column">
            <Box gap={2}>
              <Text color={result.totalCount > 0 ? "green" : "gray"}>
                {result.totalCount > 0 ? "●" : "○"}
              </Text>
              <Text bold>{result.rule}</Text>
              <Text>
                {result.totalCount} files ({formatSize(result.totalSize)})
              </Text>
            </Box>
            {result.files.slice(0, 3).map((f, i) => (
              <Box key={i} marginLeft={4}>
                <Text color="gray">
                  {f.path.split("/").pop()} ({formatSize(f.size)})
                </Text>
              </Box>
            ))}
            {result.files.length > 3 && (
              <Box marginLeft={4}>
                <Text color="gray">
                  ... and {result.files.length - 3} more
                </Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text bold>
          Total: {totalFiles} files, {formatSize(totalSize)}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          x execute cleanup • b go back
        </Text>
      </Box>
    </Box>
  );
}

function ResultsView({ results }: { results: CleanupResult[] }) {
  const summary = summarizeResults(results);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="green">Cleanup Complete</Text>

      <Box flexDirection="column">
        {results.map((result) => (
          <Box key={result.rule} gap={2}>
            <Text color={result.failed === 0 ? "green" : "yellow"}>
              {result.failed === 0 ? "✓" : "!"}
            </Text>
            <Text>{result.rule}</Text>
            <Text>
              {result.processed} files ({formatSize(result.totalSize)})
            </Text>
            <Text color="gray">[{result.action}]</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>
          Total: {summary.totalProcessed} cleaned, {summary.totalFailed} failed
        </Text>
        <Text bold color="cyan">
          {formatSize(summary.totalSize)} freed
        </Text>
        <Text color="gray">
          Duration: {(summary.totalDuration / 1000).toFixed(1)}s
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Press Enter or b to continue</Text>
      </Box>
    </Box>
  );
}

function ProgressBar({ current, total, width }: { current: number; total: number; width: number }) {
  const percent = total > 0 ? current / total : 0;
  const filled = Math.round(percent * width);
  const empty = width - filled;

  return (
    <Text>
      [
      <Text color="cyan">{"█".repeat(filled)}</Text>
      <Text color="gray">{"░".repeat(empty)}</Text>
      ] {Math.round(percent * 100)}%
    </Text>
  );
}
