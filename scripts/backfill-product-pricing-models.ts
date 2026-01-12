import { prisma } from "../app/utils/prisma.server";

const DRY_RUN =
  process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

async function main() {
  const candidates = await prisma.product.findMany({
    where: {
      pricingModel: "COST_PLUS_MARGIN",
      costGroupId: { not: null },
    },
    select: {
      id: true,
      pricingModel: true,
      costGroupId: true,
      manualSalePrice: true,
    },
  });

  let toTieredMargin = 0;
  let toTieredFixed = 0;

  for (const p of candidates) {
    const next =
      p.manualSalePrice != null
        ? "TIERED_COST_PLUS_FIXED_SELL"
        : "TIERED_COST_PLUS_MARGIN";
    if (next === "TIERED_COST_PLUS_FIXED_SELL") toTieredFixed += 1;
    else toTieredMargin += 1;
    if (DRY_RUN) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { pricingModel: next },
    });
  }

  console.log("[backfill-pricing-models] candidates:", candidates.length);
  console.log("[backfill-pricing-models] tiered margin:", toTieredMargin);
  console.log("[backfill-pricing-models] tiered fixed:", toTieredFixed);
  console.log("[backfill-pricing-models] dryRun:", DRY_RUN);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
