# Install Command Design

**Date:** 2026-04-16  
**Status:** Approved

## Problem

`bunx kadai` works but requires bunx every time. `bun install -g kadai` installs to bun's global bin dir (`~/.bun/bin`), which breaks when nvm or bun is reinstalled. Users need a stable, PATH-safe way to install the `kadai` binary once.

## Goal

`bunx kadai install` compiles a self-contained native binary and places it at `~/.local/bin/kadai`. After that, users run `kadai` directly with no runtime dependency on bun or nvm.

## Architecture

Follows the existing `parseArgs → cli.tsx dispatch → commands.ts handler` pattern. No new files needed beyond the handler function.

### Changes

- **`src/core/args.ts`**: Add `{ type: "install" }` to `ParsedArgs`. Add `case "install"` to the `parseArgs` switch.
- **`src/cli.tsx`**: Add dispatch branch for `parsed.type === "install"` before the interactive TUI section. Does not require a `kadaiDir`.
- **`src/core/commands.ts`**: Add `handleInstall()`.

## `handleInstall()` Logic

```
outputDir  = os.homedir() + "/.local/bin"
outputPath = outputDir + "/kadai"
entryPoint = Bun.main   // dist/cli.js currently executing in bunx cache

1. Guard: if Bun.main is undefined, print error and exit 1
2. mkdir -p outputDir
3. bun build --compile <entryPoint> --outfile <outputPath>
4. Print: "Installed kadai to ~/.local/bin/kadai"
5. PATH check: split process.env.PATH on ":", resolve ~ in each entry
6. If outputDir not in PATH:
     Detect shell via process.env.SHELL
     bash/zsh → 'export PATH="$HOME/.local/bin:$PATH"' + restart shell note
     fish     → 'fish_add_path ~/.local/bin'
     other    → generic export line
```

## Error Handling

| Failure | Behaviour |
|---------|-----------|
| `mkdir` fails (permissions) | Print error message, exit 1 |
| `bun build --compile` fails | Forward stderr, exit 1 |
| `~/.local/bin/kadai` already exists | Overwrite silently — idempotent reinstall/upgrade |
| `Bun.main` undefined | Print "Cannot determine entry point", exit 1 |

## Success Output (example)

```
Installed kadai to ~/.local/bin/kadai

~/.local/bin is not in your PATH.
Add this to your ~/.zshrc and restart your shell:

  export PATH="$HOME/.local/bin:$PATH"
```

## Out of Scope

- Cross-compiling for other platforms at publish time
- Auto-adding to PATH (modifying shell rc files)
- `kadai update` command (reinstalling via `bunx kadai@latest install` is sufficient)
