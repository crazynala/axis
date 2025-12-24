-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FIXED_PRICE', 'FIXED_MARGIN', 'TIERED_COST', 'TIERED_SELL', 'GENERATED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "pricingMode" "PricingMode";
