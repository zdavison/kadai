import { existsSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Dependencies that kadai shares with ink actions at runtime.
 *
 * These packages are re-exported from kadai's own package (e.g. "kadai/ink",
 * "kadai/react") so that TSX actions in any project can import them without
 * installing ink/react locally. The re-export barrels live in kadai's package
 * and resolve the bare imports from kadai's own node_modules.
 */
export const SHARED_DEPS = ["ink", "react", "@inkjs/ui"] as const;

/**
 * Registers a Bun plugin that resolves shared UI dependencies to kadai's own
 * copies. Kept as a fallback for actions using direct imports (e.g. `from "ink"`).
 * Must be called before any dynamic `import()` of action files.
 */
export function registerSharedDeps(): void {
  const escaped = SHARED_DEPS.map((d) =>
    d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const filter = new RegExp(`^(${escaped.join("|")})(/.*)?$`);

  Bun.plugin({
    name: "kadai-shared-deps",
    setup(build) {
      build.onResolve({ filter }, (args) => {
        try {
          // require.resolve from kadai's own context always finds kadai's
          // node_modules, regardless of where the importing file is located.
          return { path: require.resolve(args.path) };
        } catch {
          return undefined;
        }
      });
    },
  });
}

/**
 * Ensures the `kadai` package is resolvable from a project's node_modules.
 *
 * TSX actions import from "kadai/ink", "kadai/react", etc. For these to
 * resolve, kadai must be in the project's module resolution chain. When
 * kadai is run via `bunx` or from a global install, the project may not
 * have kadai in its node_modules.
 *
 * This creates a symlink: `<project>/node_modules/kadai → <kadai package root>`
 * The symlink is cleaned up on process exit.
 *
 * @returns cleanup function, or null if no symlink was needed
 */
export function ensureKadaiResolvable(projectNodeModules: string): (() => void) | null {
  const link = join(projectNodeModules, "kadai");

  // Already resolvable (e.g. kadai is a devDependency)
  if (existsSync(link)) return null;

  // Find kadai's package root (directory containing package.json)
  // import.meta.dir gives us the directory of the currently executing file.
  // In the built bundle, this is <kadai>/dist/. The package root is one level up.
  const kadaiRoot = dirname(import.meta.dir);

  // Sanity check: the package.json should exist
  if (!existsSync(join(kadaiRoot, "package.json"))) return null;

  try {
    if (!existsSync(projectNodeModules)) {
      mkdirSync(projectNodeModules, { recursive: true });
    }
    symlinkSync(kadaiRoot, link);
  } catch {
    return null;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      unlinkSync(link);
    } catch {
      // Best-effort
    }
  };

  process.on("exit", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  return cleanup;
}
