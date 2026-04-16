import { useInput } from "ink";
import type { Action, MenuItem, RunMode, Screen } from "../types.ts";

function nextSelectableIndex(
  items: MenuItem[],
  current: number,
  direction: 1 | -1,
): number {
  let next = current + direction;
  while (
    next >= 0 &&
    next < items.length &&
    items[next]?.type === "separator"
  ) {
    next += direction;
  }
  if (next < 0 || next >= items.length) return current;
  return next;
}

interface UseKeyboardOptions {
  stackRef: React.MutableRefObject<Screen[]>;
  actionsRef: React.MutableRefObject<Action[]>;
  searchActiveRef: React.MutableRefObject<boolean>;
  searchQueryRef: React.MutableRefObject<string>;
  selectedIndexRef: React.MutableRefObject<number>;
  runModeRef: React.MutableRefObject<RunMode>;
  setSearchActive: (active: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  setRunMode: (mode: RunMode) => void;
  resetSearch: () => void;
  pushScreen: (screen: Screen) => void;
  popScreen: () => void;
  exit: () => void;
  getMenuItems: (actions: Action[], path: string[]) => MenuItem[];
  computeFiltered: (items: MenuItem[], query: string) => MenuItem[];
  isActive?: boolean;
  onRunInteractive: (action: Action) => void;
  onRunMultiAction: (mode: "sequential" | "parallel", actions: Action[]) => void;
}

export function useKeyboard({
  stackRef,
  actionsRef,
  searchActiveRef,
  searchQueryRef,
  selectedIndexRef,
  runModeRef,
  setSearchActive,
  setSearchQuery,
  setSelectedIndex,
  setRunMode,
  resetSearch,
  pushScreen,
  popScreen,
  exit,
  getMenuItems,
  computeFiltered,
  isActive = true,
  onRunInteractive,
  onRunMultiAction,
}: UseKeyboardOptions) {
  useInput(
    (input, key) => {
      const screen = stackRef.current.at(-1) as Screen;

      if (screen.type !== "menu") return;

      // ── Search mode ──────────────────────────────────────────────
      if (searchActiveRef.current) {
        if (key.escape) {
          // Intentionally closes search only; run-mode queue/selection is preserved.
          // A second Escape (in normal mode) then clears run mode.
          resetSearch();
          return;
        }
        if (key.return) {
          selectCurrentItem(
            screen,
            actionsRef,
            searchQueryRef,
            selectedIndexRef,
            getMenuItems,
            computeFiltered,
            pushScreen,
            onRunInteractive,
          );
          return;
        }
        if (key.backspace || key.delete) {
          const newQuery = searchQueryRef.current.slice(0, -1);
          searchQueryRef.current = newQuery;
          selectedIndexRef.current = 0;
          setSearchQuery(newQuery);
          setSelectedIndex(0);
          return;
        }
        if (key.upArrow) {
          const allItems = getMenuItems(actionsRef.current, screen.path);
          const filtered = computeFiltered(allItems, searchQueryRef.current);
          const newIdx = nextSelectableIndex(filtered, selectedIndexRef.current, -1);
          selectedIndexRef.current = newIdx;
          setSelectedIndex(newIdx);
          return;
        }
        if (key.downArrow) {
          const allItems = getMenuItems(actionsRef.current, screen.path);
          const filtered = computeFiltered(allItems, searchQueryRef.current);
          const newIdx = nextSelectableIndex(filtered, selectedIndexRef.current, 1);
          selectedIndexRef.current = newIdx;
          setSelectedIndex(newIdx);
          return;
        }
        if (!key.ctrl && !key.meta && input) {
          const newQuery = searchQueryRef.current + input;
          searchQueryRef.current = newQuery;
          selectedIndexRef.current = 0;
          setSearchQuery(newQuery);
          setSelectedIndex(0);
        }
        return;
      }

      // ── Normal menu mode ─────────────────────────────────────────
      if (input === "/") {
        searchActiveRef.current = true;
        searchQueryRef.current = "";
        selectedIndexRef.current = 0;
        setSearchActive(true);
        setSearchQuery("");
        setSelectedIndex(0);
        return;
      }

      if (input === "q") {
        exit();
        return;
      }

      // Escape: clear run mode first; if already normal, pop screen
      if (key.escape) {
        if (runModeRef.current.type !== "normal") {
          const cleared: RunMode = { type: "normal" };
          runModeRef.current = cleared;
          setRunMode(cleared);
          return;
        }
        popScreen();
        return;
      }

      // Enter: execute multi-run if queued/selected, otherwise normal select
      if (key.return) {
        const mode = runModeRef.current;
        if (mode.type === "sequential" && mode.queue.length > 0) {
          onRunMultiAction("sequential", mode.queue);
          exit();
          return;
        }
        if (mode.type === "parallel" && mode.selected.size > 0) {
          const selectedActions = actionsRef.current.filter((a) =>
            (mode.selected as Set<string>).has(a.id),
          );
          onRunMultiAction("parallel", selectedActions);
          exit();
          return;
        }
        selectCurrentItem(
          screen,
          actionsRef,
          searchQueryRef,
          selectedIndexRef,
          getMenuItems,
          computeFiltered,
          pushScreen,
          onRunInteractive,
        );
        return;
      }

      if (key.upArrow || input === "k") {
        const allItems = getMenuItems(actionsRef.current, screen.path);
        const newIdx = nextSelectableIndex(allItems, selectedIndexRef.current, -1);
        selectedIndexRef.current = newIdx;
        setSelectedIndex(newIdx);
        return;
      }
      if (key.downArrow || input === "j") {
        const allItems = getMenuItems(actionsRef.current, screen.path);
        const newIdx = nextSelectableIndex(allItems, selectedIndexRef.current, 1);
        selectedIndexRef.current = newIdx;
        setSelectedIndex(newIdx);
        return;
      }

      // Right / l — enter category, or queue focused action for sequential run
      if (key.rightArrow || input === "l") {
        const item = getFocusedItem(
          screen, actionsRef, searchQueryRef, selectedIndexRef,
          getMenuItems, computeFiltered,
        );
        if (item?.type === "category") {
          pushScreen({ type: "menu", path: [...screen.path, item.value] });
          return;
        }
        if (runModeRef.current.type === "parallel") return;
        if (item?.type !== "action") return;
        const action = actionsRef.current.find((a) => a.id === item.value);
        if (!action) return;
        const prevQueue =
          runModeRef.current.type === "sequential"
            ? runModeRef.current.queue
            : [];
        if (prevQueue.some((a) => a.id === action.id)) return;
        const newMode: RunMode = {
          type: "sequential",
          queue: [...prevQueue, action],
        };
        runModeRef.current = newMode;
        setRunMode(newMode);
        return;
      }

      // Left / h — dequeue focused action from sequential queue, else navigate up
      if (key.leftArrow || input === "h") {
        if (runModeRef.current.type === "sequential") {
          const action = getFocusedAction(
            screen, actionsRef, searchQueryRef, selectedIndexRef,
            getMenuItems, computeFiltered,
          );
          if (action) {
            const queue = runModeRef.current.queue;
            const newQueue = queue.filter((a) => a.id !== action.id);
            if (newQueue.length !== queue.length) {
              const newMode: RunMode =
                newQueue.length === 0
                  ? { type: "normal" }
                  : { type: "sequential", queue: newQueue };
              runModeRef.current = newMode;
              setRunMode(newMode);
              return;
            }
          }
        }
        if (screen.path.length > 0) {
          popScreen();
        }
        return;
      }

      // Space — toggle focused action for parallel run
      if (input === " ") {
        if (runModeRef.current.type === "sequential") return;
        const action = getFocusedAction(
          screen, actionsRef, searchQueryRef, selectedIndexRef,
          getMenuItems, computeFiltered,
        );
        if (!action) return;
        const prevSelected =
          runModeRef.current.type === "parallel"
            ? new Set(runModeRef.current.selected)
            : new Set<string>();
        if (prevSelected.has(action.id)) {
          prevSelected.delete(action.id);
        } else {
          prevSelected.add(action.id);
        }
        const newMode: RunMode =
          prevSelected.size === 0
            ? { type: "normal" }
            : { type: "parallel", selected: prevSelected };
        runModeRef.current = newMode;
        setRunMode(newMode);
        return;
      }
    },
    { isActive },
  );
}

function getFocusedItem(
  screen: Screen & { type: "menu" },
  actionsRef: React.MutableRefObject<Action[]>,
  searchQueryRef: React.MutableRefObject<string>,
  selectedIndexRef: React.MutableRefObject<number>,
  getMenuItems: (actions: Action[], path: string[]) => MenuItem[],
  computeFiltered: (items: MenuItem[], query: string) => MenuItem[],
): MenuItem | null {
  const allItems = getMenuItems(actionsRef.current, screen.path);
  const filtered = computeFiltered(allItems, searchQueryRef.current);
  return filtered[selectedIndexRef.current] ?? null;
}

function getFocusedAction(
  screen: Screen & { type: "menu" },
  actionsRef: React.MutableRefObject<Action[]>,
  searchQueryRef: React.MutableRefObject<string>,
  selectedIndexRef: React.MutableRefObject<number>,
  getMenuItems: (actions: Action[], path: string[]) => MenuItem[],
  computeFiltered: (items: MenuItem[], query: string) => MenuItem[],
): Action | null {
  const item = getFocusedItem(
    screen, actionsRef, searchQueryRef, selectedIndexRef,
    getMenuItems, computeFiltered,
  );
  if (!item || item.type !== "action") return null;
  return actionsRef.current.find((a) => a.id === item.value) ?? null;
}

function selectCurrentItem(
  screen: Screen & { type: "menu" },
  actionsRef: React.MutableRefObject<Action[]>,
  searchQueryRef: React.MutableRefObject<string>,
  selectedIndexRef: React.MutableRefObject<number>,
  getMenuItems: (actions: Action[], path: string[]) => MenuItem[],
  computeFiltered: (items: MenuItem[], query: string) => MenuItem[],
  pushScreen: (screen: Screen) => void,
  onRunInteractive: (action: Action) => void,
) {
  const menuPath = screen.path;
  const allItems = getMenuItems(actionsRef.current, menuPath);
  const filtered = computeFiltered(allItems, searchQueryRef.current);
  const item = filtered[selectedIndexRef.current];
  if (!item || item.type === "separator") return;

  if (item.type === "category") {
    pushScreen({ type: "menu", path: [...menuPath, item.value] });
  } else {
    const action = actionsRef.current.find((a) => a.id === item.value);
    if (action?.meta.confirm) {
      pushScreen({ type: "confirm", actionId: item.value });
    } else if (action?.runtime === "ink") {
      pushScreen({ type: "ink-component", actionId: item.value });
    } else if (action) {
      onRunInteractive(action);
    }
  }
}
