import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@remix-run/react";

const STORAGE_PREFIX = "axis:nl:v1:"; // namespace for nav-location
const INDEX_SEARCH_SUFFIX = ":indexSearch"; // suffix for storing index search per module

export type RegisterOptions = {
  includeSearch?: boolean; // default true
  includeHash?: boolean; // default false
  // provide explicit module key; otherwise derived from pathname first segment
  moduleKey?: string | null;
  // optionally exclude some paths from being saved
  exclude?(pathname: string): boolean;
};

export function getModuleKeyFromPath(pathname: string): string | null {
  if (!pathname || pathname === "/") return null;
  const seg = pathname.split("/").filter(Boolean)[0] || null;
  if (!seg) return null;
  // Skip auth/admin/api-like roots that we don't want to track
  if (seg === "login" || seg === "forgot" || seg === "reset") return null;
  if (seg === "api") return null;
  return seg;
}

function storageKeyFor(moduleKey: string) {
  return `${STORAGE_PREFIX}${moduleKey}`;
}

export function setSavedNavLocation(moduleBasePath: string, href: string) {
  const mod = moduleBasePathToKey(moduleBasePath);
  if (!mod || typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKeyFor(mod), href);
  } catch {}
}

export function clearSavedNavLocation(moduleBasePath: string) {
  const mod = moduleBasePathToKey(moduleBasePath);
  if (!mod || typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKeyFor(mod));
  } catch {}
}

export function getSavedNavLocation(moduleBasePath: string): string | null {
  const mod = moduleBasePathToKey(moduleBasePath);
  if (!mod || typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(storageKeyFor(mod));
    if (!v) return null;
    // ensure it stays within the same module
    if (!v.startsWith(moduleBasePath)) {
      localStorage.removeItem(storageKeyFor(mod));
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function useNavHref(moduleBasePath: string, fallbackPath?: string) {
  const location = useLocation();
  const [href, setHref] = useState<string>(() => fallbackPath || moduleBasePath);

  useEffect(() => {
    // Update when storage changes in this tab or another tab
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(STORAGE_PREFIX)) return;
      const mod = moduleBasePathToKey(moduleBasePath);
      if (!mod) return;
      if (e.key !== storageKeyFor(mod)) return;
      setHref(
        getSavedNavLocation(moduleBasePath) || fallbackPath || moduleBasePath
      );
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [moduleBasePath, fallbackPath]);

  useEffect(() => {
    // Also refresh when route changes within current tab (e.g., user navigated within module)
    setHref(
      getSavedNavLocation(moduleBasePath) || fallbackPath || moduleBasePath
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return href;
}

export function useRegisterNavLocation(opts?: RegisterOptions) {
  const { includeSearch = true, includeHash = false } = opts || {};
  const location = useLocation();
  const moduleKey = useMemo(() => {
    if (opts?.moduleKey !== undefined) return opts.moduleKey;
    return getModuleKeyFromPath(location.pathname);
  }, [location.pathname, opts?.moduleKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!moduleKey) return;
    if (opts?.exclude?.(location.pathname)) return;

    const url = new URL(window.location.origin);
    url.pathname = location.pathname;
    if (includeSearch) url.search = location.search;
    if (includeHash) url.hash = location.hash;
    try {
      localStorage.setItem(
        storageKeyFor(moduleKey),
        `${url.pathname}${url.search}${url.hash}`
      );
    } catch {}
  }, [
    includeSearch,
    includeHash,
    location.pathname,
    location.search,
    location.hash,
    moduleKey,
    opts,
  ]);
}

function moduleBasePathToKey(moduleBasePath: string): string | null {
  if (!moduleBasePath.startsWith("/")) return null;
  const seg = moduleBasePath.split("/").filter(Boolean)[0];
  return seg || null;
}

export function getSavedIndexSearch(moduleBasePath: string): string | null {
  const mod = moduleBasePathToKey(moduleBasePath);
  if (!mod || typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(storageKeyFor(mod) + INDEX_SEARCH_SUFFIX);
    return v && v.startsWith("?") ? v : null;
  } catch {
    return null;
  }
}

// Persist and restore index-page search params per module. When landing on the index path without
// a query string, it will replace the URL with the saved query (if any). When a non-empty search
// is active on the index path, it will save the search for later restoration.
export function usePersistIndexSearch(moduleBasePath: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const modKey = moduleBasePathToKey(moduleBasePath);
  useEffect(() => {
    if (!modKey) return;
    const lastPathKey = `${STORAGE_PREFIX}lastPath`;
    const lastPath =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(lastPathKey)
        : null;
    if (location.pathname !== moduleBasePath) {
      try {
        window.sessionStorage.setItem(lastPathKey, location.pathname);
      } catch {}
      return;
    }
    const storageKey = storageKeyFor(modKey) + INDEX_SEARCH_SUFFIX;
    // If no search on load
    if (!location.search || location.search === "") {
      // If we just came from the same module, treat as user cleared filters: clear saved and do NOT restore
      const cameFromSameModule =
        !!lastPath && lastPath.startsWith(moduleBasePath);
      if (cameFromSameModule) {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      } else {
        // Came from outside module: restore saved one if present
        try {
          const saved = localStorage.getItem(storageKey);
          if (saved && saved.startsWith("?")) {
            // replace to avoid polluting history
            navigate(`${moduleBasePath}${saved}`, { replace: true });
          }
        } catch {}
      }
    } else {
      // Save non-empty search for this module index
      try {
        localStorage.setItem(storageKey, location.search);
      } catch {}
    }
    try {
      window.sessionStorage.setItem(lastPathKey, location.pathname);
    } catch {}
  }, [location.pathname, location.search, moduleBasePath, modKey, navigate]);
}
