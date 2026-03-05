#!/usr/bin/env bun
import type { BunPlugin } from "bun";
import { $ } from "bun";
import { SHARED_DEPS } from "./src/core/shared-deps.ts";

const stubDevtools: BunPlugin = {
  name: "stub-devtools",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core",
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default {}",
      loader: "js",
    }));
  },
};

// Shared UI deps (SHARED_DEPS) must stay external so that dynamically
// imported .tsx actions resolve the same module instances at runtime.
// Bundling them would create a second React copy, breaking hooks.
// MCP SDK is external for similar reasons (uses Node APIs that don't bundle).
const external = [
  ...SHARED_DEPS,
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/sdk/server/mcp.js",
  "@modelcontextprotocol/sdk/server/stdio.js",
];

// ── Main CLI bundle ──────────────────────────────────────────────────

const result = await Bun.build({
  entrypoints: ["./src/cli.tsx"],
  outdir: "./dist",
  target: "bun",
  minify: false,
  format: "esm",
  plugins: [stubDevtools],
  external,
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const outPath = "./dist/cli.js";
await $`chmod +x ${outPath}`;

// ── Re-export barrels for ink actions ────────────────────────────────
// These let TSX actions `import { Box } from "kadai/ink"` instead of
// `import { Box } from "ink"`, avoiding the need for a Bun plugin to
// redirect module resolution. Since these files live in kadai's package,
// their bare imports (e.g. "ink") resolve from kadai's own node_modules.

const exportsResult = await Bun.build({
  entrypoints: [
    "./src/exports/ink.ts",
    "./src/exports/ui.ts",
    "./src/exports/react.ts",
    "./src/exports/jsx-runtime.ts",
    "./src/exports/jsx-dev-runtime.ts",
  ],
  outdir: "./dist/exports",
  target: "bun",
  minify: false,
  format: "esm",
  // Keep the actual packages external — they resolve at runtime from
  // kadai's node_modules, ensuring a single instance of each.
  external: [
    ...SHARED_DEPS,
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
  ],
});

if (!exportsResult.success) {
  console.error("Exports build failed:");
  for (const log of exportsResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

// ── Types ────────────────────────────────────────────────────────────

const typesResult = await Bun.build({
  entrypoints: ["./src/types.ts"],
  outdir: "./dist",
  target: "bun",
  minify: false,
  format: "esm",
});

if (!typesResult.success) {
  console.error("Types build failed:");
  for (const log of typesResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Built dist/cli.js + exports");
