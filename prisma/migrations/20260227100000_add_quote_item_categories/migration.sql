-- CreateTable
CREATE TABLE "quote_item_category" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_item_category_pkey" PRIMARY KEY ("id")
);

-- AlterTable sale_line
ALTER TABLE "sale_line" ADD COLUMN "category_id" UUID;
ALTER TABLE "sale_line" ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sale_line" ADD COLUMN "line_note" VARCHAR(240);

-- CreateIndex
CREATE UNIQUE INDEX "quote_item_category_branch_id_name_key" ON "quote_item_category"("branch_id", "name");

-- AddForeignKey
ALTER TABLE "quote_item_category" ADD CONSTRAINT "quote_item_category_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quote_item_category" ADD CONSTRAINT "quote_item_category_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "quote_item_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
