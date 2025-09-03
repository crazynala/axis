/*
  Warnings:

  - You are about to drop the column `assemblyId` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the `_AssemblyToProduct` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_assemblyId_fkey";

-- DropForeignKey
ALTER TABLE "_AssemblyToProduct" DROP CONSTRAINT "_AssemblyToProduct_A_fkey";

-- DropForeignKey
ALTER TABLE "_AssemblyToProduct" DROP CONSTRAINT "_AssemblyToProduct_B_fkey";

-- AlterTable
ALTER TABLE "Assembly" ADD COLUMN     "productId" INTEGER;

-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "assemblyId";

-- DropTable
DROP TABLE "_AssemblyToProduct";

-- CreateTable
CREATE TABLE "_AssemblyProducts" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_AssemblyProducts_AB_unique" ON "_AssemblyProducts"("A", "B");

-- CreateIndex
CREATE INDEX "_AssemblyProducts_B_index" ON "_AssemblyProducts"("B");

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssemblyProducts" ADD CONSTRAINT "_AssemblyProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssemblyProducts" ADD CONSTRAINT "_AssemblyProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
