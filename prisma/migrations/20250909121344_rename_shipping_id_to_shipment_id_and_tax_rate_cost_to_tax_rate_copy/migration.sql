/*
  Warnings:

  - You are about to drop the column `taxRateCost` on the `InvoiceLine` table. All the data in the column will be lost.
  - You are about to drop the column `shippingId` on the `ShipmentLine` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ShipmentLine" DROP CONSTRAINT "ShipmentLine_shippingId_fkey";

-- AlterTable
ALTER TABLE "InvoiceLine" DROP COLUMN "taxRateCost",
ADD COLUMN     "taxRateCopy" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ShipmentLine" DROP COLUMN "shippingId",
ADD COLUMN     "shipmentId" INTEGER;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
