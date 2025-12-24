import assert from "node:assert/strict";
import { prisma } from "../app/utils/prisma.server";
import { generateSalePriceRangesForProduct } from "../app/modules/pricing/services/generateSaleTiers.server";

async function main() {
  let productId: number | null = null;
  let specId: number | null = null;
  let manualRangeId: number | null = null;

  try {
    const spec = await prisma.pricingSpec.create({
      data: {
        code: `TEST_CMT_${Date.now()}`,
        name: "Test CMT Spec",
        target: "SELL",
        curveFamily: "CMT_MOQ_50",
        defaultBreakpoints: [1, 5, 10, 25, 50, 100],
        params: null,
      },
    });
    specId = spec.id;

    const product = await prisma.product.create({
      data: {
        sku: `TEST-CMT-${Date.now()}`,
        name: "Test CMT",
        type: "CMT",
      },
    });
    productId = product.id;

    const manual = await prisma.salePriceRange.create({
      data: {
        productId,
        saleGroupId: null,
        rangeFrom: 1,
        rangeTo: 4,
        price: 9.99,
      },
    });
    manualRangeId = manual.id;

    const first = await generateSalePriceRangesForProduct({
      productId,
      pricingSpecId: specId,
      paramsOverride: {
        anchorPrice: 5,
        lowQtyMultiplier: 3,
        lowQtyFloor: 10,
        steepness: 1,
        rounding: 0.1,
      },
    });
    assert.ok(first.createdCount > 0, "Should create generated tiers");

    const generated = await prisma.salePriceRange.findMany({
      where: { productId, generatedBySpecId: specId },
      orderBy: { rangeFrom: "asc" },
    });
    assert.equal(
      generated.length,
      first.createdCount,
      "Generated count should match"
    );

    // Prices should be non-increasing across breakpoints
    for (let i = 1; i < generated.length; i++) {
      const prev = Number(generated[i - 1].price);
      const curr = Number(generated[i].price);
      assert.ok(curr <= prev + 1e-9, "Tier prices must be non-increasing");
    }

    // Low qty tiers should be near lowQtyMultiplier * anchorPrice
    const expectedLow = 5 * 3;
    const lowTier = generated.find((r) => r.rangeFrom === 1);
    assert.ok(lowTier, "Low tier exists");
    assert.equal(Number(lowTier!.price), expectedLow, "Low tier price matches");

    const second = await generateSalePriceRangesForProduct({
      productId,
      pricingSpecId: specId,
      paramsOverride: {
        anchorPrice: 5,
        lowQtyMultiplier: 3,
        lowQtyFloor: 10,
        steepness: 1,
        rounding: 0.1,
      },
    });
    assert.equal(first.hash, second.hash, "Hash should be stable");

    const generated2 = await prisma.salePriceRange.findMany({
      where: { productId, generatedBySpecId: specId },
      orderBy: { rangeFrom: "asc" },
    });
    assert.equal(generated2.length, generated.length, "Idempotent count");
    for (let i = 0; i < generated.length; i++) {
      assert.equal(
        Number(generated2[i].price),
        Number(generated[i].price),
        "Idempotent prices"
      );
    }

    const manualStill = await prisma.salePriceRange.findUnique({
      where: { id: manualRangeId },
    });
    assert.ok(manualStill, "Manual tiers should not be deleted");

    console.log("pricing spec tier tests: ok");
  } finally {
    if (manualRangeId != null) {
      await prisma.salePriceRange.deleteMany({ where: { id: manualRangeId } });
    }
    if (productId != null && specId != null) {
      await prisma.salePriceRange.deleteMany({
        where: { productId, generatedBySpecId: specId },
      });
    }
    if (productId != null) {
      await prisma.product.delete({ where: { id: productId } });
    }
    if (specId != null) {
      await prisma.pricingSpec.delete({ where: { id: specId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("pricing spec tier tests: failed", error);
  process.exitCode = 1;
});
