import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ParallelRunner } from "../types.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface ParallelOutputProps {
  runners: ParallelRunner[];
  onDone?: () => void;
}

export function ParallelOutput({ runners, onDone }: ParallelOutputProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [, setTick] = useState(0);
  const frameRef = useRef(0);
  const calledDone = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % SPINNER_FRAMES.length;
      setTick((t) => (t + 1) % 2);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // No dep array: runners is mutated in place (React can't detect field changes),
  // so we rely on the 100ms spinner interval's re-renders to poll for completion.
  useEffect(() => {
    if (!calledDone.current && runners.length > 0 && runners.every((r) => r.status !== "running")) {
      calledDone.current = true;
      onDone?.();
    }
  });

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
          <Text key={`out-${i}`}>{line}</Text>
        ))}
        {active.stderrLines.slice(-10).map((line, i) => (
          <Text key={`err-${i}`} color="red">{line}</Text>
        ))}
        {active.status === "running" && active.lines.length === 0 && active.stderrLines.length === 0 && (
          <Text dimColor>waiting for output...</Text>
        )}
      </Box>
    </Box>
  );
}
