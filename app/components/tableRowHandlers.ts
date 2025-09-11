import type { NavigateFunction } from "@remix-run/react";

// Build standard navigation handlers for tables (click + keyboard activation)
export function buildRowNavHandlers(resource: string, navigate: NavigateFunction) {
  const go = (rec: any) => {
    if (rec?.id != null) navigate(`/${resource}/${rec.id}`);
  };
  return {
    onRowClick: go,
    onRowActivate: go,
  } as const;
}
