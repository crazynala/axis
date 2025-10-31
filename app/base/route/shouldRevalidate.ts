// Generic helper to prevent heavy parent index loaders from revalidating
// during child/detail navigations or after non-GET mutations.
//
// Usage per module route (e.g., products.tsx):
//   import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
//   export const shouldRevalidate = makeModuleShouldRevalidate("/products", WATCH_KEYS);

export type ModuleShouldRevalidateOptions = {
  blockOnChild?: boolean; // default true: don't revalidate parent when navigating to children
  blockOnMutation?: boolean; // default true: don't revalidate parent after non-GET form submissions
};

export function makeModuleShouldRevalidate(
  basePath: string,
  watchKeys: string[] = [],
  options: ModuleShouldRevalidateOptions = {}
) {
  const { blockOnChild = true, blockOnMutation = true } = options;
  return function shouldRevalidate(args: any): boolean {
    const { currentUrl, nextUrl, formMethod, defaultShouldRevalidate } =
      args || ({} as any);
    const method = String(formMethod || "GET").toUpperCase();

    // 1) Block on mutations by default to preserve found-set and avoid expensive reloads
    if (blockOnMutation && method !== "GET") return false;

    // Only manage revalidation inside the module subtree
    const nextPath = String(nextUrl?.pathname || "");
    if (!nextPath.startsWith(basePath)) return defaultShouldRevalidate;

    const isBase = nextPath === basePath;
    const isChild = !isBase && nextPath.startsWith(basePath + "/");

    // 2) Block when staying within children of the module (detail pages)
    if (blockOnChild && isChild) return false;

    // 3) If landing on the base path, revalidate only when relevant search params change
    if (isBase && Array.isArray(watchKeys) && watchKeys.length > 0) {
      const curr = currentUrl?.searchParams as URLSearchParams | undefined;
      const next = nextUrl?.searchParams as URLSearchParams | undefined;
      if (curr && next) {
        for (const k of watchKeys) {
          if (curr.get(k) !== next.get(k)) return true;
        }
        return defaultShouldRevalidate;
      }
    }

    return defaultShouldRevalidate;
  };
}
