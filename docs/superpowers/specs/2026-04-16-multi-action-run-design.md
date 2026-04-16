# Multi-Action Run Design

Date: 2026-04-16

## Overview

Allow users to run multiple kadai actions either sequentially or in parallel, both from the CLI and from the interactive TUI.

**CLI syntax:**
- `kadai run build dev test` — run sequentially (short-circuit on failure)
- `kadai run build + dev + test` — run in parallel (tab UI, wait for all)

**TUI controls:**
- `→` / `l` — queue focused action for sequential run
- `←` / `h` — dequeue focused action
- `Space` — toggle focused action for parallel run
- `Enter` — execute queue/selection
- `Esc` — clear queue/selection, return to normal

## Section 1: Architecture

Five areas change:

1. **`src/core/args.ts`** — `run` parses multiple IDs and `+` separator. Single ID stays backward-compatible.
2. **`src/core/commands.ts`** — `handleRun` unchanged. New `handleRunSequential` and `handleRunParallel`.
3. **`src/app.tsx` + `src/hooks/useKeyboard`** — new `runMode` state, preview bar at bottom of menu.
4. **New `src/components/ParallelOutput.tsx`** — Ink tab UI for parallel execution output.
5. **`src/types.ts`** — no new types needed.

## Section 2: Menu UI Changes

`runMode` state added to `App`:

```ts
type RunMode =
  | { type: 'normal' }
  | { type: 'sequential'; queue: Action[] }
  | { type: 'parallel'; selected: Set<string> }
```

**Key bindings (menu screen only):**

| Key | Normal | Sequential | Parallel |
|-----|--------|------------|---------|
| `→` / `l` | Enter sequential, append action | Append action | No-op |
| `←` / `h` | No-op | Remove action from queue (revert to normal if empty) | No-op |
| `Space` | Enter parallel, toggle action | No-op | Toggle action (revert to normal if empty) |
| `Enter` | Run focused action (existing) | Execute queue | Execute selection |
| `Esc` | No-op | Clear, revert to normal | Clear, revert to normal |

**Preview bar** (shown below menu list when not in normal mode):

```
→ kadai run build dev
→ kadai run build + dev + test
```

## Section 3: Sequential Execution

`handleRunSequential({ kadaiDir, actionIds, cwd })`:

1. Load all actions once
2. Validate all IDs exist — fail fast before running anything
3. For each action:
   - Print `\n{emoji} {name}\n`
   - Spawn with inherited stdin/stdout/stderr
   - Non-zero exit: exit immediately with that code
   - Zero exit: print blank line separator, continue
4. Exit 0 when all complete

Ink actions supported — rendered same as `handleRun`.

## Section 4: Parallel Execution

`handleRunParallel({ kadaiDir, actionIds, cwd })`:

1. Validate all IDs exist upfront
2. **Ink actions not supported in parallel mode** — fail fast with a clear error
3. Spawn all simultaneously with piped stdout/stderr
4. Buffer output lines per action, track status (`running | done | failed`)
5. Render `ParallelOutput` Ink component:
   - Tab bar: `[🔨 build] [🚀 dev]` — active highlighted, spinner while running, ✓/✗ when done
   - Content area: scrollable output lines for active tab
   - `←`/`→` or `h`/`l` to switch tabs
6. Wait for all processes, then unmount
7. Exit 1 if any failed, 0 if all succeeded

## Section 5: CLI Parsing

`ParsedArgs` additions:

```ts
| { type: 'run-sequential'; actionIds: string[] }
| { type: 'run-parallel'; actionIds: string[] }
```

Existing `{ type: 'run'; actionId: string }` unchanged.

Parsing rules:
- No `+` tokens → sequential if multiple IDs, single if one ID
- All separators are `+` → parallel
- Mixed (some `+`, some not) → `Error: cannot mix sequential and parallel — use either spaces or '+' between action IDs`

`cli.tsx` routes `run-sequential` → `handleRunSequential`, `run-parallel` → `handleRunParallel`.
