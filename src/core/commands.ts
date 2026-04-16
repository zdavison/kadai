import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { enterFullscreen } from "./fullscreen.ts";
import { loadActions } from "./loader.ts";
import { saveLastAction, loadLastAction } from "./last-action.ts";
import { ensureKadaiResolvable } from "./shared-deps.ts";
import {
  loadCachedPlugins,
  loadPathPlugin,
  loadUserGlobalActions,
  syncPlugins,
} from "./plugins.ts";
import { resolveCommand } from "./runner.ts";
import type { ParallelRunner } from "../types.ts";

interface ListOptions {
  kadaiDir: string;
  all: boolean;
}

interface RunOptions {
  kadaiDir: string;
  actionId: string;
  cwd: string;
}

interface RunMultiOptions {
  kadaiDir: string;
  actionIds: string[];
  cwd: string;
}

async function loadAllActions(
  kadaiDir: string,
): Promise<{ actions: Awaited<ReturnType<typeof loadActions>>; config: Awaited<ReturnType<typeof loadConfig>> }> {
  const config = await loadConfig(kadaiDir);
  const actionsDir = join(kadaiDir, config.actionsDir ?? "actions");

  let actions = await loadActions(actionsDir);
  const globalActions = await loadUserGlobalActions();
  actions = [...actions, ...globalActions];

  if (config.plugins) {
    for (const source of config.plugins) {
      if ("path" in source) {
        const pathActions = await loadPathPlugin(kadaiDir, source);
        actions = [...actions, ...pathActions];
      }
    }
    const cachedActions = await loadCachedPlugins(kadaiDir, config.plugins);
    actions = [...actions, ...cachedActions];
  }

  return { actions, config };
}

export async function handleList(options: ListOptions): Promise<never> {
  const { kadaiDir, all } = options;
  const { actions, config: _config } = await loadAllActions(kadaiDir);

  const filtered = all ? actions : actions.filter((a) => !a.meta.hidden);

  const output = filtered.map((a) => ({
    id: a.id,
    name: a.meta.name,
    emoji: a.meta.emoji,
    description: a.meta.description,
    category: a.category,
    runtime: a.runtime,
    confirm: a.meta.confirm ?? false,
    fullscreen: a.meta.fullscreen ?? false,
    origin: a.origin,
  }));

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(0);
}

export async function handleRun(options: RunOptions): Promise<never> {
  const { kadaiDir, actionId, cwd } = options;
  const { actions, config } = await loadAllActions(kadaiDir);

  const action = actions.find((a) => a.id === actionId);
  if (!action) {
    process.stderr.write(`Error: action "${actionId}" not found\n`);
    process.exit(1);
  }

  await saveLastAction(kadaiDir, actionId);

  if (action.runtime === "ink") {
    // Ensure "kadai/ink", "kadai/react", etc. resolve from the project
    const cleanupKadai = ensureKadaiResolvable(join(cwd, "node_modules"));

    const mod = await import(action.filePath);
    if (typeof mod.default !== "function") {
      process.stderr.write(
        `Error: "${action.filePath}" does not export a default function component\n`,
      );
      process.exit(1);
    }

    const cleanupFullscreen = action.meta.fullscreen
      ? enterFullscreen()
      : undefined;

    const React = await import("react");
    const { render } = await import("ink");
    const instance = render(
      React.createElement(mod.default, {
        cwd,
        env: config.env ?? {},
        args: [],
        onExit: () => instance.unmount(),
      }),
    );
    await instance.waitUntilExit();
    cleanupFullscreen?.();
    cleanupKadai?.();
    process.exit(0);
  }

  const cmd = resolveCommand(action);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...(config.env ?? {}),
  };

  // Clean up stdin so the child process gets direct terminal access.
  // This is critical for programs like sudo that need raw terminal control.
  process.stdin.removeAllListeners();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  process.stdin.unref();

  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env,
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}

export async function handleRunSequential(options: RunMultiOptions): Promise<never> {
  const { kadaiDir, actionIds, cwd } = options;
  const { actions, config } = await loadAllActions(kadaiDir);

  for (const id of actionIds) {
    if (!actions.find((a) => a.id === id)) {
      process.stderr.write(`Error: action "${id}" not found\n`);
      process.exit(1);
    }
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...(config.env ?? {}),
  };

  // Detach from parent's stdin so each child gets direct terminal access
  process.stdin.removeAllListeners();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.unref();

  for (const id of actionIds) {
    const action = actions.find((a) => a.id === id)!;

    process.stdout.write(
      `\n${action.meta.emoji ? `${action.meta.emoji} ` : ""}${action.meta.name}\n\n`,
    );

    if (action.runtime === "ink") {
      const cleanupKadai = ensureKadaiResolvable(join(cwd, "node_modules"));
      const mod = await import(action.filePath);
      if (typeof mod.default !== "function") {
        process.stderr.write(
          `Error: "${action.filePath}" does not export a default function component\n`,
        );
        process.exit(1);
      }
      const React = await import("react");
      const { render } = await import("ink");
      const instance = render(
        React.createElement(mod.default, {
          cwd,
          env: config.env ?? {},
          args: [],
          onExit: () => instance.unmount(),
        }),
      );
      await instance.waitUntilExit();
      cleanupKadai?.();
      continue;
    }

    const cmd = resolveCommand(action);
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env,
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) process.exit(exitCode);
  }

  process.exit(0);
}

export async function handleRunParallel(
  options: RunMultiOptions,
): Promise<never> {
  const { kadaiDir, actionIds, cwd } = options;
  const { actions, config } = await loadAllActions(kadaiDir);

  for (const id of actionIds) {
    if (!actions.find((a) => a.id === id)) {
      process.stderr.write(`Error: action "${id}" not found\n`);
      process.exit(1);
    }
  }

  const selected = actionIds.map((id) => actions.find((a) => a.id === id)!);

  for (const action of selected) {
    if (action.runtime === "ink") {
      process.stderr.write(
        `Error: ink action "${action.id}" cannot be run in parallel mode\n`,
      );
      process.exit(1);
    }
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...(config.env ?? {}),
  };

  const runners: ParallelRunner[] = selected.map((action) => ({
    action,
    lines: [],
    stderrLines: [],
    status: "running",
  }));

  const collectStream = async (stream: ReadableStream<Uint8Array>, target: string[]) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        target.push(...parts);
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        process.stderr.write(`[warn] output collection error: ${e.message}\n`);
      }
    }
    if (buffer) target.push(buffer);
  };

  const procs = selected.map((action, i) => {
    const cmd = resolveCommand(action);
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: null,
      env,
    });
    const runner = runners[i]!; // i is always in bounds: procs and runners are built from the same selected array
    collectStream(proc.stdout, runner.lines);
    collectStream(proc.stderr, runner.stderrLines);
    return proc;
  });

  const React = await import("react");
  const { render } = await import("ink");
  const { Readable } = await import("node:stream");
  const { ParallelOutput } = await import(
    "../components/ParallelOutput.tsx"
  );

  // When stdin is not a TTY (e.g. in tests), Ink throws if useInput tries to
  // enable raw mode on process.stdin. Provide a fake TTY stream instead.
  let stdinForInk: NodeJS.ReadStream;
  if (process.stdin.isTTY) {
    stdinForInk = process.stdin;
  } else {
    class FakeTTYStream extends Readable {
      isTTY: true = true;
      override _read() {}
      setRawMode() { return this; }
      ref() { return this; }
      unref() { return this; }
    }
    stdinForInk = new FakeTTYStream() as unknown as NodeJS.ReadStream;
  }

  const instance = render(
    React.createElement(ParallelOutput, { runners, onDone: () => instance.unmount() }),
    { stdin: stdinForInk },
  );

  const exitCodes = await Promise.all(procs.map((p) => p.exited));

  exitCodes.forEach((code, i) => {
    runners[i]!.status = code === 0 ? "done" : "failed";
  });

  await instance.waitUntilExit();

  // After unmounting the Ink UI, print full output for each runner so that
  // all collected lines are visible in the terminal (and in test output).
  for (const runner of runners) {
    const icon = runner.status === "done" ? "✓" : "✗";
    process.stdout.write(
      `\n${icon} ${runner.action.meta.emoji ? `${runner.action.meta.emoji} ` : ""}${runner.action.meta.name}\n`,
    );
    if (runner.lines.length > 0) {
      process.stdout.write(`${runner.lines.join("\n")}\n`);
    }
    if (runner.stderrLines.length > 0) {
      process.stderr.write(`${runner.stderrLines.join("\n")}\n`);
    }
  }

  const anyFailed = exitCodes.some((c) => c !== 0);
  process.exit(anyFailed ? 1 : 0);
}

interface RerunOptions {
  kadaiDir: string;
  cwd: string;
}

export async function handleRerun(options: RerunOptions): Promise<never> {
  const { kadaiDir, cwd } = options;
  const actionId = await loadLastAction(kadaiDir);
  if (!actionId) {
    process.stderr.write(
      "No last action found. Run an action first before using --rerun.\n",
    );
    process.exit(1);
  }
  return handleRun({ kadaiDir, actionId, cwd });
}

interface SyncOptions {
  kadaiDir: string;
}

export async function handleSync(options: SyncOptions): Promise<never> {
  const { kadaiDir } = options;
  const config = await loadConfig(kadaiDir);

  if (!config.plugins || config.plugins.length === 0) {
    process.stdout.write("No plugins configured.\n");
    process.exit(0);
  }

  process.stdout.write("Syncing plugins...\n");

  const results: Array<{ name: string; status: "done" | "error" }> = [];

  await syncPlugins(kadaiDir, config.plugins, {
    onPluginStatus: (name, status) => {
      if (status === "syncing") {
        process.stdout.write(`  ⟳ ${name}\n`);
      } else if (status === "done") {
        results.push({ name, status: "done" });
      } else if (status === "error") {
        results.push({ name, status: "error" });
      }
    },
    onUpdate: () => {},
  });

  // Print summary
  process.stdout.write("\n");
  for (const r of results) {
    const icon = r.status === "done" ? "✓" : "✗";
    process.stdout.write(`  ${icon} ${r.name}\n`);
  }

  const failed = results.filter((r) => r.status === "error").length;
  if (failed > 0) {
    process.stdout.write(`\n${failed} plugin(s) failed to sync.\n`);
    process.exit(1);
  }

  process.stdout.write("\nAll plugins synced.\n");
  process.exit(0);
}
