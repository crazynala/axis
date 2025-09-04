import { parse } from "qs";

export type SortDir = "asc" | "desc";

export type TableParams = {
  page: number;
  perPage: number;
  sort?: string | null;
  dir?: SortDir | null;
  q?: string | null; // free-text search
  // filters as key:value where value can be string | number | boolean
  filters?: Record<string, any>;
};

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
  sort?: string | null;
  dir?: SortDir | null;
  q?: string | null;
};

export type TableConfig = {
  defaultSort?: { field: string; dir: SortDir };
  searchableFields?: string[]; // e.g., ["code", "name", "sku"]
  // Map URL filter keys to Prisma where clauses
  filterMappers?: Record<string, (value: any) => Record<string, any>>;
};

export function parseTableParams(reqUrl: string): TableParams {
  const url = new URL(reqUrl);
  // support flat and qs-style nested params
  const qsp = parse(url.search.slice(1));
  const get = (k: string) =>
    (url.searchParams.get(k) ?? (qsp as any)[k] ?? null) as string | null;
  const page = Math.max(1, Number(get("page") || 1));
  const perPage = Math.min(200, Math.max(5, Number(get("perPage") || 20)));
  const sort = get("sort");
  const dir = (get("dir") as SortDir | null) || null;
  const q = get("q");
  let filters: Record<string, any> = {};
  // collect unknown params as filters (simple, non-array)
  for (const [k, v] of url.searchParams.entries()) {
    if (["page", "perPage", "sort", "dir", "q", "view"].includes(k)) continue;
    filters[k] = v;
  }
  return { page, perPage, sort, dir, q, filters };
}

export function buildPrismaArgs<TWhere extends Record<string, any>>(
  params: TableParams,
  cfg: TableConfig
): { skip: number; take: number; orderBy?: any; where?: TWhere } {
  const { page, perPage, sort, dir, q, filters } = params;
  const skip = (page - 1) * perPage;
  const take = perPage;

  let orderBy: any | undefined;
  if (sort) orderBy = { [sort]: dir || "asc" };
  else if (cfg.defaultSort)
    orderBy = { [cfg.defaultSort.field]: cfg.defaultSort.dir };

  let where: any = {};
  if (q && cfg.searchableFields && cfg.searchableFields.length) {
    where.OR = cfg.searchableFields.map((f) => ({
      [f]: { contains: q, mode: "insensitive" },
    }));
  }
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value == null || value === "") continue;
      const mapper = cfg.filterMappers?.[key];
      if (mapper) {
        const clause = mapper(value);
        where = { ...where, ...clause };
      } else {
        // default equals filter
        where[key] =
          typeof value === "string" && value.includes(",")
            ? { in: value.split(",") }
            : value;
      }
    }
  }

  return { skip, take, orderBy, where } as any;
}

export function toSearchParams(p: Partial<TableParams>): URLSearchParams {
  const sp = new URLSearchParams();
  if (p.page) sp.set("page", String(p.page));
  if (p.perPage) sp.set("perPage", String(p.perPage));
  if (p.sort) sp.set("sort", p.sort);
  if (p.dir) sp.set("dir", p.dir);
  if (p.q) sp.set("q", p.q);
  if (p.filters) {
    for (const [k, v] of Object.entries(p.filters))
      if (v != null && v !== "") sp.set(k, String(v));
  }
  return sp;
}

export function mergeParams(
  base: TableParams,
  override: Partial<TableParams>
): TableParams {
  return {
    page: override.page ?? base.page,
    perPage: override.perPage ?? base.perPage,
    sort: override.sort ?? base.sort ?? null,
    dir: override.dir ?? base.dir ?? null,
    q: override.q ?? base.q ?? null,
    filters: { ...(base.filters || {}), ...(override.filters || {}) },
  };
}
