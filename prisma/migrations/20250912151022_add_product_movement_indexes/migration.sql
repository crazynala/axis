-- CreateIndex
CREATE INDEX "idx_product_movement_product_id" ON "ProductMovement"("productId");

-- CreateIndex
CREATE INDEX "idx_product_movement_product_date_id" ON "ProductMovement"("productId", "date", "id");
