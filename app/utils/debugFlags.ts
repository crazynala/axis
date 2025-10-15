// SSR-safe debug flags utility with optional window integration.
// Use this from both server-rendered and client components.
// It avoids accessing window on the server and persists flags in localStorage on the client.

export type DebugFlagsMap = Record<string, boolean>;

const STORAGE_KEY = "__DEBUG_FLAGS__";

function hasWindow(): boolean {
  return typeof window !== "undefined" && !!window;
}

function loadStored(): DebugFlagsMap {
  if (!hasWindow()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DebugFlagsMap) : {};
  } catch {
    return {};
  }
}

function saveStored(map: DebugFlagsMap) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

let FLAGS: DebugFlagsMap = loadStored();

export function listDebug(): DebugFlagsMap {
  return { ...FLAGS };
}

export function getDebug(name: string): boolean {
  if (name in FLAGS) return !!FLAGS[name];
  if (hasWindow()) {
    const w = window as any;
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

// Client-only window helper (no-op on SSR)
if (hasWindow()) {
  const w = window as any;
  w.__DEBUG__ = w.__DEBUG__ || {};
  w.__DEBUG__.list = () => listDebug();
  w.__DEBUG__.get = (n: string) => getDebug(n);
  w.__DEBUG__.set = (n: string, v: boolean) => {
    setDebug(n, v);
    w.__DEBUG__.all = listDebug();
  };
  w.__DEBUG__.all = listDebug();
}
