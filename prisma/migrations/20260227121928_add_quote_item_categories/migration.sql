-- AlterTable
ALTER TABLE "price_list_cell" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(6);

-- RenameIndex
ALTER INDEX "price_list_cell_price_list_id_sku_id_max_width_m_max_height_m_k" RENAME TO "price_list_cell_price_list_id_sku_id_max_width_m_max_height_key";
