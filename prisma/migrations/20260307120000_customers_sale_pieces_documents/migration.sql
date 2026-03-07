-- CreateEnum
CREATE TYPE "DiscountSource" AS ENUM ('NONE', 'CUSTOMER_CODE', 'MANUAL');

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40),
    "email" VARCHAR(160),
    "company_or_reference" VARCHAR(160),
    "preferred_price_list_id" UUID,
    "discount_code" VARCHAR(40),
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line_piece" (
    "id" UUID NOT NULL,
    "sale_line_id" UUID NOT NULL,
    "piece_index" INTEGER NOT NULL,
    "piece_total" INTEGER NOT NULL,
    "requested_width_m" DECIMAL(12,3) NOT NULL,
    "requested_height_m" DECIMAL(12,3) NOT NULL,
    "room_area_name" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_line_piece_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "sale"
  ADD COLUMN "customer_id" UUID,
  ADD COLUMN "manual_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "manual_discount_reason" VARCHAR(240),
  ADD COLUMN "discount_source" "DiscountSource" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discount_code_applied" VARCHAR(40),
  ADD COLUMN "discount_pct_applied" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_line"
  ADD COLUMN "room_area_name" VARCHAR(120);

-- AlterTable
ALTER TABLE "scrap"
  ADD COLUMN "sale_line_piece_id" UUID;

-- AlterTable
ALTER TABLE "label"
  ADD COLUMN "sale_line_piece_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "customer_branch_id_code_key" ON "customer"("branch_id", "code");
CREATE UNIQUE INDEX "customer_branch_id_discount_code_key" ON "customer"("branch_id", "discount_code");
CREATE INDEX "customer_branch_id_full_name_is_active_idx" ON "customer"("branch_id", "full_name", "is_active");
CREATE UNIQUE INDEX "sale_line_piece_sale_line_id_piece_index_key" ON "sale_line_piece"("sale_line_id", "piece_index");
CREATE INDEX "sale_line_piece_sale_line_id_idx" ON "sale_line_piece"("sale_line_id");

-- AddForeignKey
ALTER TABLE "customer"
  ADD CONSTRAINT "customer_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer"
  ADD CONSTRAINT "customer_preferred_price_list_id_fkey" FOREIGN KEY ("preferred_price_list_id") REFERENCES "price_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale"
  ADD CONSTRAINT "sale_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_line_piece"
  ADD CONSTRAINT "sale_line_piece_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scrap"
  ADD CONSTRAINT "scrap_sale_line_piece_id_fkey" FOREIGN KEY ("sale_line_piece_id") REFERENCES "sale_line_piece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "label"
  ADD CONSTRAINT "label_sale_line_piece_id_fkey" FOREIGN KEY ("sale_line_piece_id") REFERENCES "sale_line_piece"("id") ON DELETE SET NULL ON UPDATE CASCADE;
