import { prismaBase, refreshProductStockSnapshot } from "~/utils/prisma.server";
import { assertTransferLocations } from "~/utils/stockMovementGuards";

export async function amendBatch(
  productId: number | null,
  batchId: number,
  locationId: number | null,
  date: Date,
  delta: number
) {
  const hdr = await prismaBase.productMovement.create({
    data: {
      productId: Number.isFinite(productId as any)
        ? (productId as any)
        : undefined,
      movementType: "Amendment",
      date,
      locationInId: locationId ?? undefined,
      quantity: Math.abs(delta),
      notes: "Inventory amendment",
    },
  });
  await prismaBase.productMovementLine.create({
    data: {
      movementId: hdr.id,
      productMovementId: hdr.id,
      productId: Number.isFinite(productId as any)
        ? (productId as any)
        : undefined,
      batchId: Number.isFinite(batchId as any) ? (batchId as any) : undefined,
      quantity: delta,
      notes: null,
    },
  });
  try {
    await refreshProductStockSnapshot(false);
  } catch {}
  return { ok: true } as const;
}

export async function amendProductBulk(
  productId: number,
  date: Date,
  changes: Array<{ batchId: number; locationId: number | null; delta: number }>,
  creates: Array<{
    name?: string | null;
    codeMill?: string | null;
    codeSartor?: string | null;
    locationId: number | null;
    qty: number;
  }>
) {
  for (const ch of changes) {
    const d = Number(ch.delta || 0);
    if (!d) continue;
    const movementType = "Amendment";
    const hdr = await prismaBase.productMovement.create({
      data: {
        productId: Number.isFinite(productId) ? productId : undefined,
        movementType,
        date,
        locationId: ch.locationId ?? undefined,
        quantity: Math.abs(d),
        notes: "Inventory amendment (bulk)",
      },
    });
    await prismaBase.productMovementLine.create({
      data: {
        movementId: hdr.id,
        productMovementId: hdr.id,
        productId: Number.isFinite(productId) ? productId : undefined,
        batchId: Number(ch.batchId) || undefined,
        quantity: d,
        notes: null,
      },
    });
  }
  for (const cr of creates) {
    const createdBatch = await prismaBase.batch.create({
      data: {
        productId: Number.isFinite(productId) ? productId : undefined,
        name: cr.name || null,
        codeMill: cr.codeMill || null,
        codeSartor: cr.codeSartor || null,
        locationId: cr.locationId ?? undefined,
        quantity: Number(cr.qty) || 0,
        receivedAt: date,
      },
    });
    const hdr = await prismaBase.productMovement.create({
      data: {
        productId: Number.isFinite(productId) ? productId : undefined,
        movementType: "Amendment",
        date,
        locationId: cr.locationId ?? undefined,
        quantity: Math.abs(Number(cr.qty) || 0),
        notes: "Inventory amendment (new batch)",
      },
    });
    await prismaBase.productMovementLine.create({
      data: {
        movementId: hdr.id,
        productMovementId: hdr.id,
        productId: Number.isFinite(productId) ? productId : undefined,
        batchId: createdBatch.id,
        quantity: Number(cr.qty) || 0,
        notes: null,
      },
    });
  }
  try {
    await refreshProductStockSnapshot(false);
  } catch {}
  return { ok: true } as const;
}

export async function transferBetweenBatches(
  productId: number,
  sourceBatchId: number,
  qty: number,
  date: Date,
  target:
    | { mode: "existing"; targetBatchId: number }
    | {
        mode: "new";
        name?: string | null;
        codeMill?: string | null;
        codeSartor?: string | null;
        locationId: number | null;
      }
) {
  let targetBatchId: number | null = null;
  let targetLocationId: number | null = null;
  if (target.mode === "existing") {
    targetBatchId = target.targetBatchId;
    const t = await prismaBase.batch.findUnique({
      where: { id: targetBatchId || 0 },
      select: { locationId: true },
    });
    targetLocationId = t?.locationId ?? null;
  } else {
    const created = await prismaBase.batch.create({
      data: {
        productId: Number.isFinite(productId) ? productId : undefined,
        name: target.name || null,
        codeMill: target.codeMill || null,
        codeSartor: target.codeSartor || null,
        locationId: target.locationId ?? undefined,
        receivedAt: date,
      },
    });
    targetBatchId = created.id;
    targetLocationId = target.locationId;
  }
  const source = await prismaBase.batch.findUnique({
    where: { id: sourceBatchId },
    select: { locationId: true },
  });
  const sourceLocId = source?.locationId ?? null;
  const hdr = await prismaBase.productMovement.create({
    data: {
      productId: Number.isFinite(productId) ? productId : undefined,
      movementType: "Transfer",
      date,
      locationOutId: sourceLocId ?? undefined,
      locationInId: targetLocationId ?? undefined,
      quantity: Math.abs(qty),
      notes: "Inventory transfer",
    },
  });
  assertTransferLocations({
    movementType: hdr.movementType,
    locationInId: hdr.locationInId,
    locationOutId: hdr.locationOutId,
    context: { movementId: hdr.id, productId },
  });
  await prismaBase.productMovementLine.create({
    data: {
      movementId: hdr.id,
      productMovementId: hdr.id,
      productId: Number.isFinite(productId) ? productId : undefined,
      batchId: sourceBatchId || undefined,
      quantity: -Math.abs(qty),
      notes: null,
    },
  });
  await prismaBase.productMovementLine.create({
    data: {
      movementId: hdr.id,
      productMovementId: hdr.id,
      productId: Number.isFinite(productId) ? productId : undefined,
      batchId: targetBatchId || undefined,
      quantity: Math.abs(qty),
      notes: null,
    },
  });
  try {
    await refreshProductStockSnapshot(false);
  } catch {}
  return { ok: true } as const;
}
