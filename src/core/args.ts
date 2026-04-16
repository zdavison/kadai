export type ParsedArgs =
  | { type: "interactive" }
  | { type: "version" }
  | { type: "rerun" }
  | { type: "list"; all: boolean }
  | { type: "run"; actionId: string }
  | { type: "mcp" }
  | { type: "sync" }
  | { type: "install" }
  | { type: "error"; message: string };

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return { type: "interactive" };
  }

  const command = argv[0];

  if (command === "--version" || command === "-v") {
    return { type: "version" };
  }

  if (command === "--rerun" || command === "-r") {
    return { type: "rerun" };
  }

  switch (command) {
    case "list": {
      if (!argv.includes("--json")) {
        return { type: "error", message: "Usage: kadai list --json [--all]" };
      }
      const all = argv.includes("--all");
      return { type: "list", all };
    }

    case "run": {
      const actionId = argv[1];
      if (!actionId || actionId.startsWith("-")) {
        return {
          type: "error",
          message: "Usage: kadai run <action ID>",
        };
      }
      return { type: "run", actionId };
    }

    case "mcp":
      return { type: "mcp" };

    case "sync":
      return { type: "sync" };

    case "install":
      return { type: "install" };

    default:
      if (command.startsWith("-")) {
        return {
          type: "error",
          message: `Unknown flag: ${command}. Available commands: list, run, sync, mcp, install, --version, --rerun`,
        };
      }
      return { type: "run", actionId: command };
  }
}
