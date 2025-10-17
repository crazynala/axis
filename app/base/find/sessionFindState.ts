import { useSessionStorage } from "@mantine/hooks";
import { useMemo } from "react";

export type StoredFindViewState =
  | { mode: "view"; view: string }
  | { mode: "find"; qs: string };

// Keys we do NOT persist as part of filter/find state
const EXCLUDE_KEYS = new Set(["page", "sort", "ids"]);

export function scopeFromBasePath(basePath: string) {
  if (!basePath) return "/";
  const path = basePath.split("?")[0] || "/";
  const parts = path.split("/").filter(Boolean);
  return parts.length ? `/${parts[0]}` : "/";
}

export function buildFindQueryString(sp: URLSearchParams) {
  const next = new URLSearchParams();
  // Persist advanced find blob if present
  const fr = sp.get("findReqs");
  if (fr) next.set("findReqs", fr);
  // Persist simple params (excluding pagination/sort/ids/view)
  sp.forEach((value, key) => {
    if (EXCLUDE_KEYS.has(key)) return;
    if (key === "view" || key === "findReqs") return; // view handled separately; findReqs already copied
    next.set(key, value);
  });
  // Sort keys for deterministic output
  const pairs = Array.from(next.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const s = new URLSearchParams(pairs as any).toString();
  return s;
}

export function buildHrefFromStored(
  basePath: string,
  s: StoredFindViewState | null | undefined
) {
  const base = scopeFromBasePath(basePath);
  if (!s) return base;
  if (s.mode === "find") {
    const qs = s.qs?.trim();
    return qs ? `${base}?${qs}` : base;
  }
  // mode === "view"
  const view = (s.view || "").trim();
  if (!view || view === "All") return base;
  const qs = new URLSearchParams([["view", view]]).toString();
  return `${base}?${qs}`;
}

export function useFindHref(basePath: string, options?: { scope?: string }) {
  const scope = options?.scope || scopeFromBasePath(basePath);
  const [stored] = useSessionStorage<StoredFindViewState | null>({
    key: `axis:find:${scope}`,
    defaultValue: null,
  });
  return useMemo(
    () => buildHrefFromStored(basePath, stored),
    [basePath, stored]
  );
}

export function useFindHrefAppender(options?: { scopeBase?: string }) {
  const base =
    options?.scopeBase ||
    (typeof window !== "undefined" ? window.location.pathname : "/");
  // We intentionally DO NOT capture the current scope's stored state, because
  // we want to append the state for the TARGET href's scope. We'll read from
  // sessionStorage at call time for the target scope (client-only). On the server,
  // we fall back to returning the base href without modification.
  return useMemo(() => {
    return (href: string) => appendFindStateToHref(href);
  }, [base]);
}

// Non-hook helper to append stored state for the target href's scope
export function appendFindStateToHref(href: string) {
  if (typeof window === "undefined") return href; // SSR: leave unchanged
  try {
    const scope = scopeFromBasePath(href);
    const key = `axis:find:${scope}`;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return href;
    const parsed = JSON.parse(raw) as StoredFindViewState | null;
    return buildHrefFromStored(href, parsed);
  } catch {
    return href;
  }
}
