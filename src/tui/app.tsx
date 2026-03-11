import React, { useState } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import type { Config } from "../core/types.js";
import { Dashboard } from "./components/Dashboard.js";
import { RulesBrowser } from "./components/RulesBrowser.js";
import { CleanupView } from "./components/CleanupView.js";

type View = "dashboard" | "rules" | "cleanup" | "help";

interface AppProps {
  config: Config;
}

const VIEWS: { key: string; label: string; view: View }[] = [
  { key: "d", label: "Dashboard", view: "dashboard" },
  { key: "r", label: "Rules", view: "rules" },
  { key: "c", label: "Cleanup", view: "cleanup" },
  { key: "?", label: "Help", view: "help" },
];

function App({ config }: AppProps) {
  const { exit } = useApp();
  const [currentView, setCurrentView] = useState<View>("dashboard");

  useInput((input, key) => {
    // Quit on q or Ctrl+C
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    // Navigate views
    for (const v of VIEWS) {
      if (input === v.key) {
        setCurrentView(v.view);
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          il-folletto
        </Text>
        <Text color="gray"> - macOS file cleaner</Text>
      </Box>

      {/* Navigation */}
      <Box marginBottom={1} gap={2}>
        {VIEWS.map((v) => (
          <Text
            key={v.key}
            color={currentView === v.view ? "cyan" : "gray"}
            bold={currentView === v.view}
          >
            [{v.key}] {v.label}
          </Text>
        ))}
        <Text color="gray">[q] Quit</Text>
      </Box>

      {/* Separator */}
      <Box marginBottom={1}>
        <Text color="gray">{"─".repeat(60)}</Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flexGrow={1}>
        {currentView === "dashboard" && <Dashboard config={config} />}
        {currentView === "rules" && <RulesBrowser config={config} />}
        {currentView === "cleanup" && <CleanupView config={config} />}
        {currentView === "help" && <HelpView />}
      </Box>
    </Box>
  );
}

function HelpView() {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Keyboard Shortcuts</Text>
      <Box flexDirection="column" marginLeft={2}>
        <Text>
          <Text color="cyan">d</Text> - Dashboard view
        </Text>
        <Text>
          <Text color="cyan">r</Text> - Rules browser
        </Text>
        <Text>
          <Text color="cyan">c</Text> - Cleanup (dry-run & execute)
        </Text>
        <Text>
          <Text color="cyan">?</Text> - This help
        </Text>
        <Text>
          <Text color="cyan">q</Text> - Quit
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>In Rules View</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        <Text>
          <Text color="cyan">↑/↓</Text> - Navigate rules
        </Text>
        <Text>
          <Text color="cyan">Enter</Text> - View rule details
        </Text>
        <Text>
          <Text color="cyan">e</Text> - Toggle rule enabled/disabled
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>In Cleanup View</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        <Text>
          <Text color="cyan">Space</Text> - Toggle rule selection
        </Text>
        <Text>
          <Text color="cyan">Enter</Text> - Run dry-run preview
        </Text>
        <Text>
          <Text color="cyan">x</Text> - Execute cleanup
        </Text>
      </Box>
    </Box>
  );
}

export async function runTUI(config: Config): Promise<void> {
  const { waitUntilExit } = render(<App config={config} />);
  await waitUntilExit();
}
