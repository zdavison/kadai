import { join } from "node:path";

const LAST_ACTION_FILE = ".last-action";

export async function saveLastAction(
  kadaiDir: string,
  actionId: string,
): Promise<void> {
  await Bun.write(join(kadaiDir, LAST_ACTION_FILE), actionId);
}

export async function loadLastAction(
  kadaiDir: string,
): Promise<string | null> {
  const file = Bun.file(join(kadaiDir, LAST_ACTION_FILE));
  if (!(await file.exists())) return null;
  const content = (await file.text()).trim();
  return content || null;
}
