// Lightweight client-side debug flags registry with persistence and window helpers
// Usage:
//   import { debugEnabled } from "~/utils/debugFlags.client";
//   const DEBUG = debugEnabled("costingsTable") || props.debug;
//   window.__DEBUG__.set("costingsTable", true) // enable at runtime

export type DebugFlagsMap = Record<string, boolean>;

const STORAGE_KEY = "__DEBUG_FLAGS__";

function safeWindow(): Window | undefined {
  return typeof window !== "undefined" ? window : undefined;
}

function loadStored(): DebugFlagsMap {
  const w = safeWindow();
  if (!w) return {};
  try {
    const raw = w.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DebugFlagsMap) : {};
  } catch {
    return {};
  }
}

function saveStored(map: DebugFlagsMap) {
  const w = safeWindow();
  if (!w) return;
  try {
    w.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

let FLAGS: DebugFlagsMap = loadStored();

export function listDebug(): DebugFlagsMap {
  return { ...FLAGS };
}

export function getDebug(name: string): boolean {
  const w = safeWindow() as any;
  // Priority: explicit flag -> window override (both SCREAMING and underscored) -> false
  if (name in FLAGS) return !!FLAGS[name];
  if (w) {
    // Support ad-hoc window toggles like window.COSTINGS_DEBUG or window.__COSTINGS_DEBUG__
    if (typeof w[name] === "boolean") return !!w[name];
    const u = `__${name}__`;
    if (typeof w[u] === "boolean") return !!w[u];
  }
  return false;
}

export function setDebug(name: string, value: boolean) {
  FLAGS = { ...FLAGS, [name]: !!value };
  saveStored(FLAGS);
}

export function debugEnabled(name: string): boolean {
  return getDebug(name);
}

// Attach a simple window helper for manual toggling and discovery
declare global {
  interface Window {
    __DEBUG__?: {
      list: () => DebugFlagsMap;
      get: (name: string) => boolean;
      set: (name: string, value: boolean) => void;
      all: DebugFlagsMap;
    };
  }
}

const w = safeWindow();
if (w) {
  w.__DEBUG__ = {
    list: () => listDebug(),
    get: (n: string) => getDebug(n),
    set: (n: string, v: boolean) => {
      setDebug(n, v);
      // keep a snapshot for quick inspection
      w.__DEBUG__!.all = listDebug();
    },
    all: listDebug(),
  };
}
