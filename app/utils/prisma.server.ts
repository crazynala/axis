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

// Create base client
const base = globalForPrisma.prismaBase || new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

// Helper to safely coerce to number
function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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
        compute(assembly: { qtyOrderedBreakdown: number[] | null | undefined }) {
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
      async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
      async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
      async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const results = await query(args);
        return await attachAssemblyComputedMany(results);
      },
      async create({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
      async update({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
      async upsert({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachAssemblyComputed(result);
      },
    },
    product: {
      async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachStockQty(result);
      },
      async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachStockQty(result);
      },
      async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const results = await query(args);
        return await attachStockQtyMany(results);
      },
      async create({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachStockQty(result);
      },
      async update({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachStockQty(result);
      },
      async upsert({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const result = await query(args);
        return await attachStockQty(result);
      },
    },
  },
});

async function computeProductStockQty(productId: number): Promise<number> {
  // Normalize movementType via TRIM+LOWER and handle ABS(quantity) for directional buckets.
  const inList = IN_TYPES.map((t) => `'${t}'`).join(",");
  const outList = OUT_TYPES.map((t) => `'${t}'`).join(",");

  // 1) Try movement-based inventory
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
    WHERE pml."productId" = $1
    `,
    productId
  )) as Array<{ qty: any; n: number }>;
  const movQty = toNumber(mov?.[0]?.qty ?? 0);
  const movN = mov?.[0]?.n ?? 0;
  if (movN > 0) return movQty;

  // 2) Fallback: sum of batch quantities when no movement lines exist
  const batch = (await base.$queryRaw`
    SELECT COALESCE(SUM(COALESCE(b.quantity,0)),0) AS qty
    FROM "Batch" b
    WHERE b."productId" = ${productId}
  `) as Array<{ qty: any }>;
  const batchQty = toNumber(batch?.[0]?.qty ?? 0);
  return batchQty;
}

async function attachStockQty<T extends { id?: number } | null>(product: T): Promise<T> {
  if (!product || !product.id) return product;
  const total = await computeProductStockQty(product.id);
  (product as any).c_stockQty = Math.round(total * 100) / 100;
  // If batches are already loaded on the product (via include), augment each with stockQty
  if (Array.isArray((product as any).batches)) {
    (product as any).batches = await attachBatchStockQtyMany((product as any).batches);
  }
  return product;
}

async function attachStockQtyMany<T extends Array<{ id?: number }>>(products: T): Promise<T> {
  // Optimize by grouping ids and doing a single grouped fetch when needed in the future.
  // For now, keep it simple and reuse per-row computation.
  return (await Promise.all(products.map((p) => attachStockQty(p)))) as T;
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

async function attachBatchStockQtyMany<T extends Array<MaybeBatch>>(batches: T): Promise<T> {
  return (await Promise.all(batches.map((b) => attachBatchStockQty(b)))) as T;
}

// ---- Assembly computed helpers ----
type MaybeAssembly = {
  id?: number | null;
  variantSetId?: number | null;
} | null;

function classifyActivityType(a: { name?: string | null; activityType?: string | null }, needle: "cut" | "make" | "pack") {
  const s = (a.activityType || a.name || "").toString().toLowerCase();
  return s.includes(needle);
}

function sumArrays(targetLen: number, arrays: Array<number[] | null | undefined>): number[] {
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
    for (const a of activities) len = Math.max(len, a.qtyBreakdown?.length || 0);
  }
  type Act = {
    qtyBreakdown: number[] | null;
    name?: string | null;
    activityType?: string | null;
  };
  const cutArrays = (activities as Act[]).filter((a: Act) => classifyActivityType(a, "cut")).map((a: Act) => a.qtyBreakdown);
  const makeArrays = (activities as Act[]).filter((a: Act) => classifyActivityType(a, "make")).map((a: Act) => a.qtyBreakdown);
  const packArrays = (activities as Act[]).filter((a: Act) => classifyActivityType(a, "pack")).map((a: Act) => a.qtyBreakdown);
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

async function attachAssemblyComputed<T extends MaybeAssembly>(assembly: T): Promise<T> {
  if (!assembly || !assembly.id) return assembly;
  const comp = await computeAssemblyBreakdowns(assembly.id as number, (assembly as any).variantSetId ?? null);
  Object.assign(assembly as any, comp);
  return assembly;
}

async function attachAssemblyComputedMany<T extends Array<MaybeAssembly>>(assemblies: T): Promise<T> {
  return (await Promise.all(assemblies.map((a) => attachAssemblyComputed(a)))) as T;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
