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
const base =
  globalForPrisma.prismaBase || new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

// Extend with computed fields
export const prisma: PrismaClient = (base as any).$extends({
  result: {
    assembly: {
      qtyOrdered: {
        needs: { qtyOrderedBreakdown: true },
        compute(assembly: {
          qtyOrderedBreakdown: number[] | null | undefined;
        }) {
          return sumIntArray(assembly.qtyOrderedBreakdown);
        },
      },
    },
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
