-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "addressCountry" TEXT,
ADD COLUMN     "addressCountyState" TEXT,
ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "addressLine3" TEXT,
ADD COLUMN     "addressName" TEXT,
ADD COLUMN     "addressTownCity" TEXT,
ADD COLUMN     "addressZipPostCode" TEXT,
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "shippingMethod" TEXT;
