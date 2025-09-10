import { PrismaClient } from "@prisma/client";

// Prevent creating too many Prisma Client instances during dev hot reloads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForPrisma = globalThis as any;

function sumIntArray(arr: number[] | null | undefined): number {
  if (!Array.isArray(arr)) return 0;
  let total = 0;
  for (const n of arr) {
    if (typeof n === "number" && Number.isFinite(n)) total += n | 0; // coerce to int
  }
  return total;
}

// Create base client (keep global error logging enabled)
const base =
  globalForPrisma.prismaBase || new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

// --- Import-time log suppression (scope-based) ---
let importLogDepth = 0;
type PrismaLogEvent = { level: string; message?: string } & Record<string, any>;
base.$on("error", (e: PrismaLogEvent) => {
  if (importLogDepth > 0) {
    // Swallow per-row Prisma errors during bulk imports; importers aggregate their own summaries.
    return;
  }
  // Otherwise let Prisma print as normal (this handler currently no-ops to defer to default stderr output)
});

export async function runImporter<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  importLogDepth++;
  try {
    return await fn();
  } finally {
    importLogDepth--;
  }
}

// Export the base client (no extensions) for lightweight queries where
// computed attachments are not needed, to avoid unnecessary fan-out work.
export const prismaBase: PrismaClient = base;

// Helper to safely coerce to number
function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Small concurrency limiter for async maps
async function mapLimit<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length) as U[];
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () =>
      (async function run() {
        while (true) {
          const i = next++;
          if (i >= items.length) break;
          results[i] = await mapper(items[i], i);
        }
      })()
  );
  await Promise.all(workers);
  return results;
}

// Movement type classification (initial guess; will evolve with data)
// Includes generic synonyms plus observed labels from your data
const IN_TYPES = [
  "in",
  "receive",
  "purchase",
  "adjust_in",
  "return_in",
  "return",
  "transfer_in",
  // observed
  "po (receive)",
  "shipping (in)",
  "amendment",
];
const OUT_TYPES = [
  "out",
  "issue",
  "consume",
  "ship",
  "sale",
  "deliver",
  "adjust_out",
  "transfer_out",
  // observed
  "shipping (out)",
  "po (return)",
  "assembly",
  "expense",
];

// Extend with computed fields and query augmentation
export const prisma: PrismaClient = (base as any).$extends({
  result: {
    assembly: {
      c_qtyOrdered: {
        needs: { qtyOrderedBreakdown: true },
        compute(assembly: {
          qtyOrderedBreakdown: number[] | null | undefined;
        }) {
          return sumIntArray(assembly.qtyOrderedBreakdown);
        },
      },
    },
    // Note: we do not declare a computed field for product.stockQty here,
    // because its value comes from an async aggregation. We attach it in the
    // query extension below to avoid overriding it with a static compute.
  },
  query: {
    assembly: {
      async findUnique({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
      async findFirst({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
      async findMany({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const results = await query(args);
        return await attachAssemblyComputedMany(results);
      },
      async create({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
      async update({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
      async upsert({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
    },
    product: {
      async findUnique({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const result = await query(args);
        const withQty = await attachStockQty(result);
        return await attachProductAggregates(withQty);
      },
      async findFirst({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const result = await query(args);
        const withQty = await attachStockQty(result);
        return await attachProductAggregates(withQty);
      },
      async findMany({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        const results = await query(args);
        return await attachStockQtyMany(results);
      },
      async create({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        // Ensure SKU uniqueness globally by suffixing -dup, -dup2, ... when needed
        if (args?.data) {
          const desired: string | null = args.data.sku ?? null;
          const idHint: number | undefined = args.data.id;
          args.data.sku = await getUniqueSku(desired, idHint ?? null);
        }
        try {
          const result = await query(args);
          const withQty = await attachStockQty(result);
          return await attachProductAggregates(withQty);
        } catch (err: any) {
          // Handle rare race: retry once on unique violation for sku
          if (
            err?.code === "P2002" &&
            Array.isArray(err?.meta?.target) &&
            err.meta.target.includes("sku")
          ) {
            if (args?.data) {
              const desired: string | null = args.data.sku ?? null;
              const idHint: number | undefined = args.data.id;
              args.data.sku = await getUniqueSku(desired, idHint ?? null);
            }
            const result = await query(args);
            const withQty = await attachStockQty(result);
            return await attachProductAggregates(withQty);
          }
          throw err;
        }
      },
      async update({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        if (args?.data) {
          const desired: string | null = args.data.sku ?? null;
          const idHint: number | undefined = args?.where?.id ?? undefined;
          args.data.sku = await getUniqueSku(desired, idHint ?? null);
        }
        try {
          const result = await query(args);
          const withQty = await attachStockQty(result);
          return await attachProductAggregates(withQty);
        } catch (err: any) {
          if (
            err?.code === "P2002" &&
            Array.isArray(err?.meta?.target) &&
            err.meta.target.includes("sku")
          ) {
            if (args?.data) {
              const desired: string | null = args.data.sku ?? null;
              const idHint: number | undefined = args?.where?.id ?? undefined;
              args.data.sku = await getUniqueSku(desired, idHint ?? null);
            }
            const result = await query(args);
            const withQty = await attachStockQty(result);
            return await attachProductAggregates(withQty);
          }
          throw err;
        }
      },
      async upsert({
        args,
        query,
      }: {
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        if (args?.create) {
          const desired: string | null = args.create.sku ?? null;
          const idHint: number | undefined = args.create.id;
          args.create.sku = await getUniqueSku(desired, idHint ?? null);
        }
        if (args?.update) {
          const desired: string | null = args.update.sku ?? null;
          const idHint: number | undefined = args?.where?.id ?? undefined;
          args.update.sku = await getUniqueSku(desired, idHint ?? null);
        }
        try {
          const result = await query(args);
          const withQty = await attachStockQty(result);
          return await attachProductAggregates(withQty);
        } catch (err: any) {
          if (
            err?.code === "P2002" &&
            Array.isArray(err?.meta?.target) &&
            err.meta.target.includes("sku")
          ) {
            if (args?.update) {
              const desired: string | null = args.update.sku ?? null;
              const idHint: number | undefined = args?.where?.id ?? undefined;
              args.update.sku = await getUniqueSku(desired, idHint ?? null);
            }
            if (args?.create) {
              const desired: string | null = args.create.sku ?? null;
              const idHint: number | undefined = args.create.id;
              args.create.sku = await getUniqueSku(desired, idHint ?? null);
            }
            const result = await query(args);
            const withQty = await attachStockQty(result);
            return await attachProductAggregates(withQty);
          }
          throw err;
        }
      },
    },
  },
});

async function computeProductStockQty(productId: number): Promise<number> {
  // 1) Movement-based: sum ProductMovement.quantity for this product, ignoring transfers (net zero overall stock)
  // Treat IN_TYPES as positive (absolute value), OUT_TYPES as negative (absolute value), others as signed quantity.
  const inList = IN_TYPES.map((t) => `'${t}'`).join(",");
  const outList = OUT_TYPES.map((t) => `'${t}'`).join(",");
  const rows = (await base.$queryRawUnsafe(
    `
    SELECT (
      COALESCE(SUM(CASE WHEN lower(trim(COALESCE(pm."movementType",''))) IN (${inList}, ${outList}) THEN (COALESCE(pm.quantity,0)) ELSE 0 END),0)
    ) AS qty,
    COUNT(*)::int AS n
    FROM "ProductMovement" pm
    WHERE pm."productId" = $1 AND lower(trim(COALESCE(pm."movementType",''))) <> 'transfer'
    `,
    productId
  )) as Array<{ qty: any; n: number }>;
  const movQty = toNumber(rows?.[0]?.qty ?? 0);
  const movN = rows?.[0]?.n ?? 0;
  if (movN > 0) return movQty;

  // 2) Fallback: sum of batch quantities when no movements (excluding transfers) exist
  const batch = (await base.$queryRaw`
    SELECT COALESCE(SUM(COALESCE(b.quantity,0)),0) AS qty
    FROM "Batch" b
    WHERE b."productId" = ${productId}
  `) as Array<{ qty: any }>;
  return toNumber(batch?.[0]?.qty ?? 0);
}

async function attachStockQty<T extends { id?: number } | null>(
  product: T
): Promise<T> {
  if (!product || !product.id) return product;
  const total = await computeProductStockQty(product.id);
  (product as any).c_stockQty = Math.round(total * 100) / 100;
  // If batches are already loaded on the product (via include), augment each with stockQty
  if (Array.isArray((product as any).batches)) {
    (product as any).batches = await attachBatchStockQtyMany(
      (product as any).batches
    );
  }
  return product;
}

async function attachStockQtyMany<T extends Array<{ id?: number }>>(
  products: T
): Promise<T> {
  // Limit concurrency to avoid exhausting the DB connection pool.
  const out = await mapLimit(products as any[], 6, (p) => attachStockQty(p));
  return out as T;
}

// ---- Batch stock helpers ----
async function computeBatchStockQty(batchId: number): Promise<number> {
  const inList = IN_TYPES.map((t) => `'${t}'`).join(",");
  const outList = OUT_TYPES.map((t) => `'${t}'`).join(",");
  // Movement-based qty for this batch
  const mov = (await base.$queryRawUnsafe(
    `
    SELECT (
      COALESCE(SUM(CASE WHEN lower(trim(COALESCE(pm."movementType", ''))) IN (${inList}) THEN COALESCE(ABS(pml.quantity),0) ELSE 0 END),0)
       -
       COALESCE(SUM(CASE WHEN lower(trim(COALESCE(pm."movementType", ''))) IN (${outList}) THEN COALESCE(ABS(pml.quantity),0) ELSE 0 END),0)
       +
       COALESCE(SUM(CASE WHEN lower(trim(COALESCE(pm."movementType", ''))) NOT IN (${inList}, ${outList}) THEN COALESCE(pml.quantity,0) ELSE 0 END),0)
    ) AS qty,
    COUNT(*)::int AS n
    FROM "ProductMovementLine" pml
    JOIN "ProductMovement" pm ON pm.id = pml."movementId"
    WHERE pml."batchId" = $1
    `,
    batchId
  )) as Array<{ qty: any; n: number }>;
  const movQty = toNumber(mov?.[0]?.qty ?? 0);
  const movN = mov?.[0]?.n ?? 0;
  if (movN > 0) return movQty;
  // Fallback to batch.quantity field when no movement lines exist for this batch
  const row = (await base.$queryRaw`
    SELECT COALESCE(b.quantity,0) AS qty FROM "Batch" b WHERE b.id = ${batchId}
  `) as Array<{ qty: any }>;
  return toNumber(row?.[0]?.qty ?? 0);
}

type MaybeBatch = { id?: number | null } | null;

async function attachBatchStockQty<T extends MaybeBatch>(batch: T): Promise<T> {
  if (!batch || !batch.id) return batch;
  const total = await computeBatchStockQty(batch.id as number);
  (batch as any).c_stockQty = Math.round(total * 100) / 100;
  return batch;
}

async function attachBatchStockQtyMany<T extends Array<MaybeBatch>>(
  batches: T
): Promise<T> {
  const out = await mapLimit(batches as any[], 8, (b) =>
    attachBatchStockQty(b)
  );
  return out as T;
}

// ---- Product aggregates: byLocation and byBatch ----
async function computeProductByLocation(
  productId: number
): Promise<
  Array<{ location_id: number | null; location_name: string; qty: number }>
> {
  // Movement-header based aggregation:
  // - For movementType = 'transfer': add ABS(qty) to locationInId and subtract ABS(qty) from locationOutId.
  // - For all other movement types (including null/unknown): add qty (signed as stored) to each non-null locationInId/locationOutId.
  const rows = (await base.$queryRawUnsafe(
    `
    WITH pm_rows AS (
      SELECT 
        pm.id,
        lower(trim(COALESCE(pm."movementType", ''))) AS mt,
        pm."locationInId"  AS loc_in,
        pm."locationOutId" AS loc_out,
        COALESCE(pm.quantity,0) AS qty
      FROM "ProductMovement" pm
      WHERE pm."productId" = $1
    ), exploded AS (
      -- Transfers: split with +/- ABS(qty)
      SELECT loc_in  AS location_id, ABS(qty)  AS qty FROM pm_rows WHERE mt = 'transfer' AND loc_in  IS NOT NULL
      UNION ALL
      SELECT loc_out AS location_id, -ABS(qty) AS qty FROM pm_rows WHERE mt = 'transfer' AND loc_out IS NOT NULL
      UNION ALL
      -- Non-transfers: use stored signed qty for each present location side
      SELECT loc_in  AS location_id, qty AS qty FROM pm_rows WHERE mt <> 'transfer' AND loc_in  IS NOT NULL
      UNION ALL
      SELECT loc_out AS location_id, qty AS qty FROM pm_rows WHERE mt <> 'transfer' AND loc_out IS NOT NULL
    )
    SELECT e.location_id, COALESCE(l.name,'') AS location_name, COALESCE(SUM(e.qty),0) AS qty
    FROM exploded e
    LEFT JOIN "Location" l ON l.id = e.location_id
    GROUP BY e.location_id, l.name
    ORDER BY l.name NULLS LAST, e.location_id
    `,
    productId
  )) as Array<{ location_id: number | null; location_name: string; qty: any }>;
  return rows.map((r) => ({
    location_id: r.location_id ?? null,
    location_name: (r.location_name as any) ?? "",
    qty: Math.round(100 * Number(r.qty ?? 0)) / 100,
  }));
}

async function computeProductByBatch(productId: number): Promise<
  Array<{
    batch_id: number;
    code_mill: string;
    code_sartor: string;
    batch_name: string;
    received_at: Date | null;
    location_id: number | null;
    location_name: string;
    qty: number;
  }>
> {
  const inList = IN_TYPES.map((t) => `'${t}'`).join(",");
  const outList = OUT_TYPES.map((t) => `'${t}'`).join(",");
  const rows = (await base.$queryRawUnsafe(
    `
    WITH typed AS (
      SELECT
        pml."batchId" AS bid,
        COALESCE((pml.quantity),0) AS qty          
      FROM "ProductMovementLine" pml
      JOIN "ProductMovement" pm ON pm.id = pml."movementId"
      WHERE pml."productId" = $1
    )
    SELECT 
      b.id AS batch_id,
      COALESCE(b."codeMill", '') AS code_mill,
      COALESCE(b."codeSartor", '') AS code_sartor,
      COALESCE(b.name, '') AS batch_name,
      b."receivedAt"     AS received_at,
      b."locationId"     AS location_id,
      COALESCE(l.name,'') AS location_name,
      COALESCE(SUM(t.qty),0) AS qty
    FROM "Batch" b
    LEFT JOIN typed t ON t.bid = b.id
    LEFT JOIN "Location" l ON l.id = b."locationId"
    WHERE b."productId" = $1
    GROUP BY b.id, b."codeMill", b."codeSartor", b.name, b."receivedAt", b."locationId", l.name
    ORDER BY b."receivedAt" DESC NULLS LAST, b.id DESC
    `,
    productId
  )) as Array<{
    batch_id: number;
    code_mill: string;
    code_sartor: string;
    batch_name: string;
    received_at: Date | null;
    location_id: number | null;
    location_name: string;
    qty: any;
  }>;
  return rows.map((r) => ({
    ...r,
    qty: Math.round(100 * Number(r.qty ?? 0)) / 100,
  }));
}

// Debug helper: inspect by-location contributions and compare strategies
export async function debugProductByLocation(productId: number) {
  const pm = (await base.$queryRawUnsafe(
    `
    SELECT 
      pm.id,
      lower(trim(COALESCE(pm."movementType", ''))) AS mt,
      pm."locationInId"  AS loc_in,
      pm."locationOutId" AS loc_out,
      COALESCE(pm.quantity,0) AS qty
    FROM "ProductMovement" pm
    WHERE pm."productId" = $1
    ORDER BY pm.id
    `,
    productId
  )) as Array<{
    id: number;
    mt: string | null;
    loc_in: number | null;
    loc_out: number | null;
    qty: any;
  }>;
  const current = await computeProductByLocation(productId);
  // Build contributions from PM rows (transfers use ABS split; non-transfers use signed qty)
  const contrib: Array<{
    kind: string;
    movement_id: number;
    lid: number | null;
    qty: number;
    mt: string | null;
  }> = [];
  for (const r of pm) {
    const q = toNumber(r.qty);
    const absq = Math.abs(q);
    const mt = (r.mt || "").toLowerCase();
    if (mt === "transfer") {
      if (r.loc_out != null)
        contrib.push({
          kind: "transfer_out",
          movement_id: r.id,
          lid: r.loc_out,
          qty: -absq,
          mt,
        });
      if (r.loc_in != null)
        contrib.push({
          kind: "transfer_in",
          movement_id: r.id,
          lid: r.loc_in,
          qty: +absq,
          mt,
        });
      continue;
    }
    if (r.loc_in != null)
      contrib.push({
        kind: "in",
        movement_id: r.id,
        lid: r.loc_in,
        qty: +q, // preserve sign for non-transfers
        mt,
      });
    if (r.loc_out != null)
      contrib.push({
        kind: "out",
        movement_id: r.id,
        lid: r.loc_out,
        qty: -q, // subtract signed qty for non-transfers
        mt,
      });
    if (r.loc_in == null && r.loc_out == null) {
      // orphan; include zeroed row for visibility
      contrib.push({
        kind: "orphan",
        movement_id: r.id,
        lid: null,
        qty: 0,
        mt,
      });
    }
  }
  // Compare: align with computeProductByLocation rules
  const compareMap = new Map<number | null, number>();
  for (const r of pm) {
    const q = toNumber(r.qty);
    const absq = Math.abs(q);
    const mt = (r.mt || "").toLowerCase();
    if (mt === "transfer") {
      if (r.loc_out != null)
        compareMap.set(r.loc_out, (compareMap.get(r.loc_out) ?? 0) - absq);
      if (r.loc_in != null)
        compareMap.set(r.loc_in, (compareMap.get(r.loc_in) ?? 0) + absq);
    } else {
      if (r.loc_out != null)
        compareMap.set(r.loc_out, (compareMap.get(r.loc_out) ?? 0) - q);
      if (r.loc_in != null)
        compareMap.set(r.loc_in, (compareMap.get(r.loc_in) ?? 0) + q);
    }
  }
  const compare = Array.from(compareMap.entries()).map(([lid, qty]) => ({
    lid,
    qty: Math.round(qty * 100) / 100,
  }));
  // For UI: include pmOnly aliasing to current for now (header-only strategy)
  const pmOnly = current.map((r) => ({
    lid: r.location_id,
    name: r.location_name,
    qty: r.qty,
  }));
  return { pm, current, compare, pmOnly, contrib };
}

async function attachProductAggregates<T extends { id?: number } | null>(
  product: T
): Promise<T> {
  if (!product || !product.id) return product;
  const [byLoc, byBatch] = await Promise.all([
    computeProductByLocation(product.id),
    computeProductByBatch(product.id),
  ]);
  (product as any).c_byLocation = byLoc;
  (product as any).c_byBatch = byBatch;
  return product;
}

// ---- SKU uniqueness helper ----
async function getUniqueSku(
  desired: string | null,
  currentId: number | null
): Promise<string | null> {
  const skuBase = (desired || "").trim();
  if (!skuBase) return null;
  let candidate = skuBase;
  let n = 1;
  while (true) {
    const clash = await base.product.findFirst({ where: { sku: candidate } });
    if (!clash || (currentId != null && clash.id === currentId))
      return candidate;
    n += 1;
    candidate = n === 2 ? `${skuBase}-dup` : `${skuBase}-dup${n - 1}`;
  }
}

// ---- Assembly computed helpers ----
type MaybeAssembly = {
  id?: number | null;
  variantSetId?: number | null;
} | null;

function classifyActivityType(
  a: { name?: string | null; activityType?: string | null },
  needle: "cut" | "make" | "pack"
) {
  const s = (a.activityType || a.name || "").toString().toLowerCase();
  return s.includes(needle);
}

function sumArrays(
  targetLen: number,
  arrays: Array<number[] | null | undefined>
): number[] {
  const out = Array.from({ length: targetLen }, () => 0);
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    const m = Math.min(arr.length, targetLen);
    for (let i = 0; i < m; i++) {
      const v = arr[i];
      if (Number.isFinite(v)) out[i] += (v as number) | 0;
    }
  }
  return out;
}

async function computeAssemblyBreakdowns(
  assemblyId: number,
  variantSetId: number | null
): Promise<{
  c_qtyCut_Breakdown: number[];
  c_qtyMake_Breakdown: number[];
  c_qtyPack_Breakdown: number[];
  c_qtyCut: number;
  c_qtyMake: number;
  c_qtyPack: number;
  c_numVariants: number;
}> {
  const activities = await base.assemblyActivity.findMany({
    where: { assemblyId },
    select: { qtyBreakdown: true, name: true, activityType: true },
  });
  let len = 0;
  let c_numVariants = 0;
  if (variantSetId) {
    const vs = await base.variantSet.findUnique({
      where: { id: variantSetId },
      select: { variants: true },
    });
    const variants = (vs?.variants || []) as Array<string | null | undefined>;
    // Determine last populated label (non-empty after trim)
    for (let i = variants.length - 1; i >= 0; i--) {
      const lab = (variants[i] ?? "").toString().trim();
      if (lab) {
        c_numVariants = i + 1;
        break;
      }
    }
    // Respect number of variants available
    len = c_numVariants > 0 ? c_numVariants : variants.length || 0;
  }
  if (len === 0) {
    // derive from max breakdown length
    for (const a of activities)
      len = Math.max(len, a.qtyBreakdown?.length || 0);
  }
  type Act = {
    qtyBreakdown: number[] | null;
    name?: string | null;
    activityType?: string | null;
  };
  const cutArrays = (activities as Act[])
    .filter((a: Act) => classifyActivityType(a, "cut"))
    .map((a: Act) => a.qtyBreakdown);
  const makeArrays = (activities as Act[])
    .filter((a: Act) => classifyActivityType(a, "make"))
    .map((a: Act) => a.qtyBreakdown);
  const packArrays = (activities as Act[])
    .filter((a: Act) => classifyActivityType(a, "pack"))
    .map((a: Act) => a.qtyBreakdown);
  const c_qtyCut_Breakdown = sumArrays(len, cutArrays);
  const c_qtyMake_Breakdown = sumArrays(len, makeArrays);
  const c_qtyPack_Breakdown = sumArrays(len, packArrays);
  return {
    c_qtyCut_Breakdown,
    c_qtyMake_Breakdown,
    c_qtyPack_Breakdown,
    c_qtyCut: sumIntArray(c_qtyCut_Breakdown),
    c_qtyMake: sumIntArray(c_qtyMake_Breakdown),
    c_qtyPack: sumIntArray(c_qtyPack_Breakdown),
    c_numVariants,
  };
}

async function attachAssemblyComputed<T extends MaybeAssembly>(
  assembly: T
): Promise<T> {
  if (!assembly || !assembly.id) return assembly;
  const comp = await computeAssemblyBreakdowns(
    assembly.id as number,
    (assembly as any).variantSetId ?? null
  );
  Object.assign(assembly as any, comp);
  return assembly;
}

async function attachAssemblyComputedMany<T extends Array<MaybeAssembly>>(
  assemblies: T
): Promise<T> {
  return (await Promise.all(
    assemblies.map((a) => attachAssemblyComputed(a))
  )) as T;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
