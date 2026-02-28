-- AlterEnum
ALTER TYPE "PriceMethod" ADD VALUE 'TABLE_LOOKUP';

-- CreateTable
CREATE TABLE "price_list_cell" (
    "id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "max_width_m" DECIMAL(12,3) NOT NULL,
    "max_height_m" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_cell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_list_cell_price_list_id_sku_id_idx" ON "price_list_cell"("price_list_id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_cell_price_list_id_sku_id_max_width_m_max_height_m_key" ON "price_list_cell"("price_list_id", "sku_id", "max_width_m", "max_height_m");

-- AddForeignKey
ALTER TABLE "price_list_cell" ADD CONSTRAINT "price_list_cell_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_cell" ADD CONSTRAINT "price_list_cell_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "fabric_sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
