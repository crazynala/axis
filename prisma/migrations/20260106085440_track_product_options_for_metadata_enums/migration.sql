-- AlterTable
ALTER TABLE "ProductAttributeValue" ADD COLUMN     "optionId" INTEGER;

-- CreateTable
CREATE TABLE "ProductAttributeOption" (
    "id" SERIAL NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAttributeOption_definitionId_idx" ON "ProductAttributeOption"("definitionId");

-- CreateIndex
CREATE INDEX "ProductAttributeOption_mergedIntoId_idx" ON "ProductAttributeOption"("mergedIntoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeOption_definitionId_slug_key" ON "ProductAttributeOption"("definitionId", "slug");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_optionId_idx" ON "ProductAttributeValue"("optionId");

-- AddForeignKey
ALTER TABLE "ProductAttributeOption" ADD CONSTRAINT "ProductAttributeOption_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ProductAttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeOption" ADD CONSTRAINT "ProductAttributeOption_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "ProductAttributeOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductAttributeOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
