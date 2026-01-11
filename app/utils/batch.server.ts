import type { Prisma } from "@prisma/client";

export async function ensureDestinationBatch(
  tx: Prisma.TransactionClient,
  opts: {
    productId: number;
    jobId: number | null;
    assemblyId: number | null;
    locationId: number;
    name: string;
  }
) {
  const existing = await tx.batch.findFirst({
    where: {
      productId: opts.productId,
      jobId: opts.jobId ?? undefined,
      assemblyId: opts.assemblyId ?? undefined,
      locationId: opts.locationId,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return tx.batch.create({
    data: {
      productId: opts.productId,
      jobId: opts.jobId ?? undefined,
      assemblyId: opts.assemblyId ?? undefined,
      locationId: opts.locationId,
      name: opts.name,
    },
  });
}

export async function findAssemblyStockBatch(
  tx: Prisma.TransactionClient,
  opts: {
    productId: number;
    jobId: number | null;
    assemblyId: number | null;
    locationId: number;
  }
) {
  return tx.batch.findFirst({
    where: {
      productId: opts.productId,
      jobId: opts.jobId ?? undefined,
      assemblyId: opts.assemblyId ?? undefined,
      locationId: opts.locationId,
    },
    orderBy: { createdAt: "desc" },
  });
}
