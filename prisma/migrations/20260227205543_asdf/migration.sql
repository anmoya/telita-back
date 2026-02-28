-- DropForeignKey
ALTER TABLE "quote_batch" DROP CONSTRAINT "quote_batch_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_batch" DROP CONSTRAINT "quote_batch_created_by_fkey";

-- DropForeignKey
ALTER TABLE "quote_batch" DROP CONSTRAINT "quote_batch_price_list_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_batch_line" DROP CONSTRAINT "quote_batch_line_category_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_batch_line" DROP CONSTRAINT "quote_batch_line_quote_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_batch_line" DROP CONSTRAINT "quote_batch_line_sku_id_fkey";

-- AlterTable
ALTER TABLE "quote_batch" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "quote_batch_line" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "quote_batch" ADD CONSTRAINT "quote_batch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_batch" ADD CONSTRAINT "quote_batch_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_batch" ADD CONSTRAINT "quote_batch_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_batch_line" ADD CONSTRAINT "quote_batch_line_quote_batch_id_fkey" FOREIGN KEY ("quote_batch_id") REFERENCES "quote_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_batch_line" ADD CONSTRAINT "quote_batch_line_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "fabric_sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_batch_line" ADD CONSTRAINT "quote_batch_line_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "quote_item_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "quote_batch_branch_status_idx" RENAME TO "quote_batch_branch_id_status_created_at_idx";
