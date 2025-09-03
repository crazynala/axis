/*
  Warnings:

  - You are about to drop the `_AssemblyProducts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Assembly" DROP CONSTRAINT "Assembly_productId_fkey";

-- DropForeignKey
ALTER TABLE "AssemblyActivity" DROP CONSTRAINT "AssemblyActivity_productId_fkey";

-- DropForeignKey
ALTER TABLE "_AssemblyProducts" DROP CONSTRAINT "_AssemblyProducts_A_fkey";

-- DropForeignKey
ALTER TABLE "_AssemblyProducts" DROP CONSTRAINT "_AssemblyProducts_B_fkey";

-- DropTable
DROP TABLE "_AssemblyProducts";
