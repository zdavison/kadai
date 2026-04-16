import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ParallelRunner } from "../types.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface ParallelOutputProps {
  runners: ParallelRunner[];
}

export function ParallelOutput({ runners }: ParallelOutputProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [, setTick] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % SPINNER_FRAMES.length;
      setTick((t) => (t + 1) % 2);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useInput((input, key) => {
    if (key.rightArrow || input === "l") {
      setActiveTab((t) => Math.min(t + 1, runners.length - 1));
    }
    if (key.leftArrow || input === "h") {
      setActiveTab((t) => Math.max(t - 1, 0));
    }
  });

  const active = runners[activeTab];
  if (!active) return null;

  return (
    <Box flexDirection="column">
      <Box gap={2} marginBottom={1}>
        {runners.map((runner, i) => {
          const isActive = i === activeTab;
          const spinner = SPINNER_FRAMES[frameRef.current] as string;
          const statusIcon =
            runner.status === "running"
              ? spinner
              : runner.status === "done"
                ? "✓"
                : "✗";
          const color =
            runner.status === "failed"
              ? "red"
              : runner.status === "done"
                ? "green"
                : isActive
                  ? "cyan"
                  : undefined;
          return (
            <Text key={runner.action.id} color={color} bold={isActive} underline={isActive}>
              {statusIcon}{" "}
              {runner.action.meta.emoji ? `${runner.action.meta.emoji} ` : ""}
              {runner.action.meta.name}
            </Text>
          );
        })}
      </Box>
      <Box flexDirection="column">
        {active.lines.slice(-40).map((line, i) => (
          <Text key={`${activeTab}-${i}`}>{line}</Text>
        ))}
        {active.status === "running" && active.lines.length === 0 && (
          <Text dimColor>waiting for output...</Text>
        )}
      </Box>
    </Box>
  );
}
