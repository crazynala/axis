import { prisma } from "../app/utils/prisma.server";
import {
  resolvePricingModeForImport,
  type PricingMode,
} from "../app/modules/product/services/pricingMode.server";

async function backfillPricingMode() {
  const rows = await prisma.product.findMany({
    where: { pricingMode: null },
    select: {
      id: true,
      type: true,
      manualSalePrice: true,
      pricingSpecId: true,
      salePriceGroupId: true,
      costGroupId: true,
      salePriceRanges: { select: { id: true } },
      salePriceGroup: { select: { saleRanges: { select: { id: true } } } },
      costGroup: { select: { costRanges: { select: { id: true } } } },
    },
  });

  let updated = 0;
  for (const row of rows) {
    const pricingMode = resolvePricingModeForImport({
      type: row.type ? String(row.type) : null,
      manualSalePrice: row.manualSalePrice as any,
      pricingSpecId: row.pricingSpecId ?? null,
      salePriceGroupId: row.salePriceGroupId ?? null,
      costGroupId: row.costGroupId ?? null,
      salePriceRanges: row.salePriceRanges || [],
      salePriceGroup: row.salePriceGroup || null,
      costGroup: row.costGroup || null,
    }) as PricingMode;

    await prisma.product.update({
      where: { id: row.id },
      data: { pricingMode },
    });
    updated += 1;
  }

  console.log(
    `[backfill] pricingMode updated ${updated} of ${rows.length} products with null pricingMode`
  );
}

backfillPricingMode()
  .catch((err) => {
    console.error("[backfill] pricingMode failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
