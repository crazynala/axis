import { prisma, refreshProductStockSnapshot } from "../app/utils/prisma.server";

const tag = `test-defect-${Date.now()}`;

async function run() {
  const main = await prisma.location.create({
    data: { name: `${tag}-main`, type: "stock" as any },
  });
  const sample = await prisma.location.create({
    data: { name: `${tag}-sample`, type: "sample" as any },
  });
  const product = await prisma.product.create({
    data: {
      sku: `${tag}-sku`,
      name: `${tag}-product`,
      stockTrackingEnabled: true,
    },
  });
  const batch = await prisma.batch.create({
    data: {
      productId: product.id,
      locationId: main.id,
      quantity: 0,
      name: `${tag}-batch`,
    },
  });

  const movement = await prisma.productMovement.create({
    data: {
      movementType: "DEFECT_SAMPLE",
      date: new Date(),
      productId: product.id,
      locationOutId: main.id,
      locationInId: sample.id,
      quantity: 1,
      notes: "test defect sample",
    },
  });

  await refreshProductStockSnapshot(false);

  const rows = await prisma.$queryRaw<
    Array<{ location_id: number | null; location_qty: number | null; total_qty: number | null }>
  >`
    SELECT location_id, location_qty, total_qty
    FROM product_stock_snapshot
    WHERE product_id = ${product.id}
  `;

  const byLoc = new Map<number | null, number>();
  let totalQty = 0;
  for (const row of rows) {
    if (row.location_id != null) {
      byLoc.set(row.location_id, Number(row.location_qty ?? 0));
    }
    totalQty = Number(row.total_qty ?? 0);
  }

  const mainQty = byLoc.get(main.id) ?? 0;
  const sampleQty = byLoc.get(sample.id) ?? 0;

  if (mainQty !== -1 || sampleQty !== 1 || totalQty !== 0) {
    throw new Error(
      `Unexpected snapshot values: main=${mainQty} sample=${sampleQty} total=${totalQty}`
    );
  }

  console.log("OK: defect transfer updates locations without inflating total.");

  await prisma.productMovement.delete({ where: { id: movement.id } });
  await prisma.batch.delete({ where: { id: batch.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.location.deleteMany({ where: { id: { in: [main.id, sample.id] } } });
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
