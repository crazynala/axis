ALTER TABLE "Box" ADD COLUMN "importKey" TEXT;

CREATE UNIQUE INDEX "Box_importKey_key" ON "Box"("importKey");
