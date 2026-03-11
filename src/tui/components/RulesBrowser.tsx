import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Config, Rule } from "../../core/types.js";

interface RulesBrowserProps {
  config: Config;
}

export function RulesBrowser({ config }: RulesBrowserProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const rules = config.rules;

  useInput((input, key) => {
    if (showDetails) {
      if (input === "b" || key.escape) {
        setShowDetails(false);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(rules.length - 1, i + 1));
    } else if (key.return) {
      setShowDetails(true);
    }
  });

  if (showDetails && rules[selectedIndex]) {
    return <RuleDetails rule={rules[selectedIndex]} config={config} />;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Rules</Text>
        <Text color="gray"> ({rules.length} total)</Text>
      </Box>

      <Box flexDirection="column">
        {rules.map((rule, i) => (
          <Box key={rule.name} gap={2}>
            <Text color={i === selectedIndex ? "cyan" : undefined}>
              {i === selectedIndex ? "▸" : " "}
            </Text>
            <Text color={rule.enabled ? "green" : "gray"}>
              {rule.enabled ? "●" : "○"}
            </Text>
            <Text
              bold={i === selectedIndex}
              color={i === selectedIndex ? "cyan" : undefined}
            >
              {rule.name}
            </Text>
            <Text color="gray">
              [{rule.action ?? config.global.defaultAction}]
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          ↑/↓ navigate • Enter view details • b back
        </Text>
      </Box>
    </Box>
  );
}

function RuleDetails({ rule, config }: { rule: Rule; config: Config }) {
  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2}>
        <Text bold color="cyan">{rule.name}</Text>
        <Text color={rule.enabled ? "green" : "gray"}>
          {rule.enabled ? "enabled" : "disabled"}
        </Text>
      </Box>

      {rule.description && (
        <Text color="gray">{rule.description}</Text>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Action</Text>
        <Box marginLeft={2}>
          <Text>
            {rule.action ?? config.global.defaultAction}
            {rule.moveTo && <Text color="gray"> → {rule.moveTo}</Text>}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text bold>Target</Text>
        <Box marginLeft={2}>
          <Text>{rule.target ?? "files"}</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text bold>Paths</Text>
        {rule.paths.map((p, i) => (
          <Box key={i} marginLeft={2}>
            <Text color="yellow">{p}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column">
        <Text bold>Patterns</Text>
        {rule.patterns.map((p, i) => (
          <Box key={i} marginLeft={2}>
            <Text>{p}</Text>
          </Box>
        ))}
      </Box>

      {rule.conditions && (
        <Box flexDirection="column">
          <Text bold>Conditions</Text>
          {Object.entries(rule.conditions).map(([k, v]) => (
            <Box key={k} marginLeft={2}>
              <Text>
                {k}: <Text color="cyan">{v}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {rule.exceptions && rule.exceptions.length > 0 && (
        <Box flexDirection="column">
          <Text bold>Exceptions</Text>
          {rule.exceptions.map((e, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="red">{e}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">Press b or Esc to go back</Text>
      </Box>
    </Box>
  );
}
