-- CreateEnum
CREATE TYPE "ProductAttributeDisplayWidth" AS ENUM ('full', 'half', 'third');

-- AlterTable
ALTER TABLE "ProductAttributeDefinition" ADD COLUMN     "appliesToCategoryIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "appliesToSubcategoryIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "displayWidth" "ProductAttributeDisplayWidth" NOT NULL DEFAULT 'full';
