import { PrismaClient } from "@prisma/client";

// Prevent creating too many Prisma Client instances during dev hot reloads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForPrisma = globalThis as any;

export const prisma: PrismaClient = globalForPrisma.prisma || new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
