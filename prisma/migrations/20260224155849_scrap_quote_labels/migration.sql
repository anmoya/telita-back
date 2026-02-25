-- DropForeignKey
ALTER TABLE "scrap" DROP CONSTRAINT "scrap_cut_job_id_fkey";

-- DropForeignKey
ALTER TABLE "scrap" DROP CONSTRAINT "scrap_sale_line_id_fkey";

-- AlterTable
ALTER TABLE "label" ADD COLUMN     "quote_id" UUID;

-- AlterTable
ALTER TABLE "scrap" ADD COLUMN     "quote_id" UUID,
ALTER COLUMN "sale_line_id" DROP NOT NULL,
ALTER COLUMN "cut_job_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_cut_job_id_fkey" FOREIGN KEY ("cut_job_id") REFERENCES "cut_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
