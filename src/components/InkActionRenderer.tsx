import { Box, Text } from "ink";
import { join } from "node:path";
import React, { useEffect, useState } from "react";
import { ensureKadaiResolvable } from "../core/shared-deps.ts";
import type { Action, InkActionProps } from "../types.ts";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; Component: React.ComponentType<InkActionProps> }
  | { status: "error"; message: string };

interface InkActionRendererProps {
  action: Action;
  cwd: string;
  env: Record<string, string>;
  onExit: () => void;
}

class InkActionErrorBoundary extends React.Component<
  { children: React.ReactNode; actionId: string },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; actionId: string }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <Box flexDirection="column">
          <Text color="red">
            Action "{this.props.actionId}" threw an error:
          </Text>
          <Text color="red">{this.state.error.message}</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}

export function InkActionRenderer({
  action,
  cwd,
  env,
  onExit,
}: InkActionRendererProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Ensure "kadai/ink", "kadai/react", etc. resolve from the project
        ensureKadaiResolvable(join(cwd, "node_modules"));

        const mod = await import(action.filePath);
        if (cancelled) return;

        if (typeof mod.default !== "function") {
          setState({
            status: "error",
            message: `"${action.filePath}" does not export a default function component`,
          });
          return;
        }

        setState({ status: "loaded", Component: mod.default });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : `Failed to load action`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [action.filePath]);

  if (state.status === "loading") {
    return <Text dimColor>Loading {action.meta.name}...</Text>;
  }

  if (state.status === "error") {
    return (
      <Box flexDirection="column">
        <Text color="red">{state.message}</Text>
        <Text dimColor>Press Ctrl+C to return to menu</Text>
      </Box>
    );
  }

  const { Component } = state;
  return (
    <InkActionErrorBoundary actionId={action.id}>
      <Component cwd={cwd} env={env} args={[]} onExit={onExit} />
    </InkActionErrorBoundary>
  );
}
