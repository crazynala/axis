-- AlterTable
ALTER TABLE "BoxLine" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isAdHoc" BOOLEAN DEFAULT false,
ADD COLUMN     "packingOnly" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "packMode" TEXT DEFAULT 'line';
