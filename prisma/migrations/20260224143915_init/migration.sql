-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('superadmin', 'admin', 'operador');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PriceMethod" AS ENUM ('LINEAR_METER', 'AREA', 'FIXED');

-- CreateEnum
CREATE TYPE "CutJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'CUT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ScrapStatus" AS ENUM ('PENDING_CLASSIFICATION', 'DISCARDED', 'PENDING_STORAGE', 'STORED', 'USED');

-- CreateEnum
CREATE TYPE "LabelType" AS ENUM ('SALE_CUT', 'SCRAP');

-- CreateEnum
CREATE TYPE "LabelCodeType" AS ENUM ('QR');

-- CreateEnum
CREATE TYPE "PrintFormat" AS ENUM ('A4');

-- CreateEnum
CREATE TYPE "PrintChannel" AS ENUM ('BROWSER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'PRINT');

-- CreateTable
CREATE TABLE "brand" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" UUID NOT NULL,
    "brand_id" UUID,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "role" "UserRole" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_length" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "to_meter_factor" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "unit_length_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_weight" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "to_kg_factor" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "unit_weight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabric_sku" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "length_value" DECIMAL(12,3) NOT NULL,
    "length_unit_id" SMALLINT NOT NULL,
    "width_value" DECIMAL(12,3) NOT NULL,
    "width_unit_id" SMALLINT NOT NULL,
    "thickness_value" DECIMAL(12,3) NOT NULL,
    "thickness_unit_id" SMALLINT NOT NULL,
    "weight_value" DECIMAL(12,3) NOT NULL,
    "weight_unit_id" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fabric_sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency" (
    "code" CHAR(3) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "tax" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "rate_pct" DECIMAL(6,3) NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_setting" (
    "key" VARCHAR(80) NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "price_list" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_item" (
    "id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "base_price" DECIMAL(14,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_list_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "customer_name" VARCHAR(160),
    "customer_reference" VARCHAR(120),
    "status" "SaleStatus" NOT NULL,
    "price_list_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "subtotal_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "canceled_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "requested_width_m" DECIMAL(12,3) NOT NULL,
    "requested_height_m" DECIMAL(12,3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_method" "PriceMethod" NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sale_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cut_job" (
    "id" UUID NOT NULL,
    "sale_line_id" UUID NOT NULL,
    "status" "CutJobStatus" NOT NULL,
    "cut_by" UUID,
    "cut_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cut_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_location" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" VARCHAR(160),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrap" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "sale_line_id" UUID NOT NULL,
    "cut_job_id" UUID NOT NULL,
    "width_m" DECIMAL(12,3) NOT NULL,
    "height_m" DECIMAL(12,3) NOT NULL,
    "area_m2" DECIMAL(12,3) NOT NULL,
    "status" "ScrapStatus" NOT NULL,
    "location_id" UUID,
    "generated_by" UUID NOT NULL,
    "classified_by" UUID,
    "classified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scrap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "type" "LabelType" NOT NULL,
    "sale_line_id" UUID,
    "scrap_id" UUID,
    "payload_json" JSONB NOT NULL,
    "code_type" "LabelCodeType" NOT NULL DEFAULT 'QR',
    "print_format" "PrintFormat" NOT NULL DEFAULT 'A4',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_print_event" (
    "id" UUID NOT NULL,
    "label_id" UUID NOT NULL,
    "printed_by" UUID NOT NULL,
    "printed_at" TIMESTAMPTZ(6) NOT NULL,
    "channel" "PrintChannel" NOT NULL,

    CONSTRAINT "label_print_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "branch_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brand_name_key" ON "brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "branch_code_key" ON "branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "unit_length_code_key" ON "unit_length"("code");

-- CreateIndex
CREATE UNIQUE INDEX "unit_weight_code_key" ON "unit_weight"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fabric_sku_branch_id_code_key" ON "fabric_sku"("branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_code_key" ON "tax"("code");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_item_price_list_id_sku_id_key" ON "price_list_item"("price_list_id", "sku_id");

-- CreateIndex
CREATE INDEX "sale_branch_id_status_created_at_idx" ON "sale"("branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "sale_line_sale_id_idx" ON "sale_line"("sale_id");

-- CreateIndex
CREATE INDEX "cut_job_status_cut_at_idx" ON "cut_job"("status", "cut_at");

-- CreateIndex
CREATE UNIQUE INDEX "storage_location_branch_id_code_key" ON "storage_location"("branch_id", "code");

-- CreateIndex
CREATE INDEX "scrap_branch_id_status_sku_id_idx" ON "scrap"("branch_id", "status", "sku_id");

-- CreateIndex
CREATE INDEX "scrap_location_id_idx" ON "scrap"("location_id");

-- CreateIndex
CREATE INDEX "label_type_created_at_idx" ON "label"("type", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabric_sku" ADD CONSTRAINT "fabric_sku_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabric_sku" ADD CONSTRAINT "fabric_sku_length_unit_id_fkey" FOREIGN KEY ("length_unit_id") REFERENCES "unit_length"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabric_sku" ADD CONSTRAINT "fabric_sku_width_unit_id_fkey" FOREIGN KEY ("width_unit_id") REFERENCES "unit_length"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabric_sku" ADD CONSTRAINT "fabric_sku_thickness_unit_id_fkey" FOREIGN KEY ("thickness_unit_id") REFERENCES "unit_length"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabric_sku" ADD CONSTRAINT "fabric_sku_weight_unit_id_fkey" FOREIGN KEY ("weight_unit_id") REFERENCES "unit_weight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_setting" ADD CONSTRAINT "system_setting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_item" ADD CONSTRAINT "price_list_item_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_item" ADD CONSTRAINT "price_list_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "fabric_sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "fabric_sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cut_job" ADD CONSTRAINT "cut_job_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cut_job" ADD CONSTRAINT "cut_job_cut_by_fkey" FOREIGN KEY ("cut_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_location" ADD CONSTRAINT "storage_location_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_location" ADD CONSTRAINT "storage_location_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "fabric_sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_cut_job_id_fkey" FOREIGN KEY ("cut_job_id") REFERENCES "cut_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "storage_location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap" ADD CONSTRAINT "scrap_classified_by_fkey" FOREIGN KEY ("classified_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_scrap_id_fkey" FOREIGN KEY ("scrap_id") REFERENCES "scrap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_print_event" ADD CONSTRAINT "label_print_event_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_print_event" ADD CONSTRAINT "label_print_event_printed_by_fkey" FOREIGN KEY ("printed_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
