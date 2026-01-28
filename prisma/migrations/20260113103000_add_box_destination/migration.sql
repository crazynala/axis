-- Add destination fields to Box for explicit ship-to or retention endpoints
ALTER TABLE "Box"
  ADD COLUMN "destinationAddressId" INTEGER,
  ADD COLUMN "destinationLocationId" INTEGER;

CREATE INDEX "Box_destinationAddressId_idx" ON "Box"("destinationAddressId");
CREATE INDEX "Box_destinationLocationId_idx" ON "Box"("destinationLocationId");

ALTER TABLE "Box"
  ADD CONSTRAINT "Box_destinationAddressId_fkey"
  FOREIGN KEY ("destinationAddressId")
  REFERENCES "Address"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "Box"
  ADD CONSTRAINT "Box_destinationLocationId_fkey"
  FOREIGN KEY ("destinationLocationId")
  REFERENCES "Location"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
