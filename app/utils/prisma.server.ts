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
      qtyOrdered: {
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
  (product as any).stockQty = Math.round(total * 100) / 100;
  return product;
}

async function attachStockQtyMany<T extends Array<{ id?: number }>>(products: T): Promise<T> {
  // Optimize by grouping ids and doing a single grouped fetch when needed in the future.
  // For now, keep it simple and reuse per-row computation.
  return (await Promise.all(products.map((p) => attachStockQty(p)))) as T;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
