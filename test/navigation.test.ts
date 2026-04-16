import { afterEach, describe, expect, test } from "bun:test";
import { type CLISession, fixturePath, Keys, spawnCLI } from "./harness";

describe("navigation", () => {
  let cli: CLISession;

  afterEach(() => {
    cli?.kill();
  });

  test("starts at root menu", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    // Root menu should show top-level items and categories
    await cli.waitForText("Hello World");
    await cli.waitForText("database");
  });

  test("entering a category shows its actions", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("database");
    // Navigate to database category and enter it
    cli.type("/");
    cli.type("database");
    cli.press(Keys.ENTER);
    // Should now show database actions
    await cli.waitForText("Reset Database");
    await cli.waitForText("Seed Data");
    await cli.waitForText("Run Migrations");
  });

  test("breadcrumbs show current navigation path", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("database");
    cli.type("/");
    cli.type("database");
    cli.press(Keys.ENTER);
    // Breadcrumbs should reflect the path
    await cli.waitForText("kadai");
    await cli.waitForText("database");
  });

  test("escape goes back to parent menu", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("database");
    // Enter database category
    cli.type("/");
    cli.type("database");
    cli.press(Keys.ENTER);
    await cli.waitForText("Reset Database");
    // Press escape to go back
    cli.press(Keys.ESCAPE);
    // Should be back at root with top-level items
    await cli.waitForText("Hello World");
    await cli.waitForText("Cleanup");
  });

  test("escape at root exits the app", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    cli.press(Keys.ESCAPE);
    const result = await cli.waitForExit();
    expect(result.exitCode).toBe(0);
  });

  test("q exits the app from anywhere", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    cli.type("q");
    const result = await cli.waitForExit();
    expect(result.exitCode).toBe(0);
  });

  test("selecting an action shows its output", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    cli.type("/");
    cli.type("Hello World");
    cli.press(Keys.ENTER);
    // Should switch to output screen
    await cli.waitForText("Hello from kadai!");
  });

  test("escape from output screen returns to menu", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    cli.type("/");
    cli.type("Hello World");
    cli.press(Keys.ENTER);
    await cli.waitForText("Hello from kadai!");
    // Press escape to go back to menu
    cli.press(Keys.ESCAPE);
    await cli.waitForText("Hello World");
    await cli.waitForText("Cleanup");
  });

  test("navigating nested categories works (2 levels)", async () => {
    cli = spawnCLI({ cwd: fixturePath("nested-repo") });
    await cli.waitForText("deploy");
    // Enter deploy
    cli.type("/");
    cli.type("deploy");
    cli.press(Keys.ENTER);
    await cli.waitForText("staging");
    // Enter staging
    cli.type("/");
    cli.type("staging");
    cli.press(Keys.ENTER);
    // Should show the regional deploy scripts
    await cli.waitForText("Deploy US East");
    await cli.waitForText("Deploy EU West");
  });

  test("j/k keys navigate the list", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    // j should move down, k should move up (vim-style navigation)
    cli.type("j");
    await Bun.sleep(100);
    cli.type("k");
    await Bun.sleep(100);
    // Menu should still be visible (navigation didn't break anything)
    const output = cli.getStrippedOutput();
    expect(output).toContain("Hello World");
  });

  test("arrow keys navigate the list", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    cli.press(Keys.DOWN);
    await Bun.sleep(100);
    cli.press(Keys.UP);
    await Bun.sleep(100);
    const output = cli.getStrippedOutput();
    expect(output).toContain("Hello World");
  });
});

describe("multi-run composition", () => {
  let cli: CLISession;

  afterEach(() => {
    cli?.kill();
  });

  test("right arrow queues focused action and indents it inline", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    // Move down past the database category to the first action
    cli.press(Keys.DOWN);
    await Bun.sleep(100);
    cli.press(Keys.RIGHT);
    await cli.waitForText("→ Cleanup");
  });

  test("right arrow on the same item twice does not duplicate it", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    cli.press(Keys.DOWN);
    await Bun.sleep(100);
    cli.press(Keys.RIGHT);
    await cli.waitForText("→ Cleanup");
    cli.press(Keys.RIGHT);
    await Bun.sleep(150);
    const out = cli.getStrippedOutput();
    const lastFrame = out.split("kadai\n").at(-1) ?? "";
    const matches = lastFrame.match(/→ Cleanup/g) ?? [];
    expect(matches.length).toBe(1);
  });

  test("escape clears the queue and removes the inline indent", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    cli.press(Keys.DOWN);
    await Bun.sleep(100);
    cli.press(Keys.RIGHT);
    await cli.waitForText("→ Cleanup");
    const lenBefore = cli.getStrippedOutput().length;
    cli.press(Keys.ESCAPE);
    await Bun.sleep(300);
    const newOut = cli.getStrippedOutput().slice(lenBefore);
    const lastFrame = newOut.split("kadai\n").at(-1) ?? "";
    expect(lastFrame).not.toContain("→ Cleanup");
  });

  test("right arrow on a category enters it so items can be queued cross-directory", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    // Queue the first top-level action
    cli.press(Keys.DOWN);
    await Bun.sleep(100);
    cli.press(Keys.RIGHT);
    await cli.waitForText("→ Cleanup");
    // Navigate back up to root, then into the database category via right arrow
    cli.press(Keys.UP);
    await Bun.sleep(50);
    cli.press(Keys.RIGHT);
    await cli.waitForText("Reset Database");
    // Queue one of the database actions
    cli.press(Keys.DOWN);
    await Bun.sleep(50);
    cli.press(Keys.RIGHT);
    // Bottom preview should now show both queued ids across directories
    await cli.waitForText("database/migrate");
    const out = cli.getStrippedOutput();
    const lastFrame = out.split("kadai > database\n").at(-1) ?? "";
    expect(lastFrame).toMatch(/cleanup.*→.*database\/migrate/);
  });

  test("space selects for parallel and shows + separator in preview", async () => {
    cli = spawnCLI({ cwd: fixturePath("basic-repo") });
    await cli.waitForText("Hello World");
    // Move down past the database category to the first action
    cli.press(Keys.DOWN);
    await Bun.sleep(100);
    cli.press(" ");
    await cli.waitForText("∥");
    cli.press(Keys.DOWN);
    cli.press(" ");
    await cli.waitForText("+");
  });
});
