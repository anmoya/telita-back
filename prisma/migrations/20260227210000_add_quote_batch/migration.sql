CREATE TYPE "QuoteBatchStatus" AS ENUM ('DRAFT', 'FINALIZED', 'EXPIRED');

CREATE TABLE "quote_batch" (
  "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
  "branch_id"         UUID         NOT NULL,
  "created_by"        UUID         NOT NULL,
  "price_list_id"     UUID         NOT NULL,
  "customer_name"     VARCHAR(160),
  "customer_reference" VARCHAR(120),
  "subtotal_amount"   DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax_amount"        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_amount"      DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status"            "QuoteBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "quote_batch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_batch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id"),
  CONSTRAINT "quote_batch_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id"),
  CONSTRAINT "quote_batch_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id")
);

CREATE INDEX "quote_batch_branch_status_idx" ON "quote_batch"("branch_id", "status", "created_at");

CREATE TABLE "quote_batch_line" (
  "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
  "quote_batch_id"    UUID         NOT NULL,
  "sku_id"            UUID         NOT NULL,
  "requested_width_m"  DECIMAL(12,3) NOT NULL,
  "requested_height_m" DECIMAL(12,3) NOT NULL,
  "quantity"          INTEGER      NOT NULL DEFAULT 1,
  "unit_price"        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "line_subtotal"     DECIMAL(14,2) NOT NULL DEFAULT 0,
  "price_method"      "PriceMethod" NOT NULL DEFAULT 'LINEAR_METER',
  "category_id"       UUID,
  "line_note"         TEXT,
  "display_order"     INTEGER      NOT NULL DEFAULT 0,

  CONSTRAINT "quote_batch_line_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_batch_line_quote_batch_id_fkey" FOREIGN KEY ("quote_batch_id") REFERENCES "quote_batch"("id") ON DELETE CASCADE,
  CONSTRAINT "quote_batch_line_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "fabric_sku"("id"),
  CONSTRAINT "quote_batch_line_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "quote_item_category"("id")
);
