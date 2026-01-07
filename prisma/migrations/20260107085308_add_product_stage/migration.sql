-- CreateEnum
CREATE TYPE "ProductStage" AS ENUM ('SETUP', 'LIVE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productStage" "ProductStage" NOT NULL DEFAULT 'SETUP';
