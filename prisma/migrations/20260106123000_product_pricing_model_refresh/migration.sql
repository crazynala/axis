-- CreateEnum
CREATE TYPE "ProductPricingModel" AS ENUM ('COST_PLUS_MARGIN', 'COST_PLUS_FIXED_SELL', 'TIERED_COST_PLUS_MARGIN', 'CURVE_SELL_AT_MOQ', 'TIERED_COST_PLUS_FIXED_SELL');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "pricingModel" "ProductPricingModel";
ALTER TABLE "Product" ADD COLUMN     "baselinePriceAtMoq" DECIMAL(14,4);
ALTER TABLE "Product" ADD COLUMN     "transferPercent" DECIMAL(8,4) NOT NULL DEFAULT 0.75;

-- Data migration from legacy pricingMode when present
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Product' AND column_name = 'pricingMode'
  ) THEN
    UPDATE "Product"
    SET "pricingModel" = (CASE
      WHEN "pricingMode" = 'FIXED_MARGIN' THEN 'COST_PLUS_MARGIN'
      WHEN "pricingMode" = 'FIXED_PRICE' THEN 'COST_PLUS_FIXED_SELL'
      WHEN "pricingMode" = 'TIERED_COST' THEN 'TIERED_COST_PLUS_MARGIN'
      WHEN "pricingMode" = 'GENERATED' AND "pricingSpecId" IS NOT NULL THEN 'CURVE_SELL_AT_MOQ'
      ELSE NULL
    END)::"ProductPricingModel"
    WHERE "pricingModel" IS NULL;
  END IF;
END $$;

-- Drop legacy pricingMode enum + column
ALTER TABLE "Product" DROP COLUMN IF EXISTS "pricingMode";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PricingMode') THEN
    DROP TYPE "PricingMode";
  END IF;
END $$;

-- CreateTable
CREATE TABLE "PricingSpecRange" (
    "id" SERIAL NOT NULL,
    "pricingSpecId" INTEGER NOT NULL,
    "rangeFrom" INTEGER,
    "rangeTo" INTEGER,
    "multiplier" DECIMAL(14,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSpecRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingSpecRange_pricingSpecId_idx" ON "PricingSpecRange"("pricingSpecId");

-- CreateIndex
CREATE INDEX "PricingSpecRange_pricingSpecId_rangeFrom_rangeTo_idx" ON "PricingSpecRange"("pricingSpecId", "rangeFrom", "rangeTo");

-- AddForeignKey
ALTER TABLE "PricingSpecRange" ADD CONSTRAINT "PricingSpecRange_pricingSpecId_fkey" FOREIGN KEY ("pricingSpecId") REFERENCES "PricingSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;
