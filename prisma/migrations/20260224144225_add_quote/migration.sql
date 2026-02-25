-- CreateTable
CREATE TABLE "quote" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "requested_width_m" DECIMAL(12,3) NOT NULL,
    "requested_height_m" DECIMAL(12,3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "linear_meters" DECIMAL(12,3) NOT NULL,
    "subtotal_amount" DECIMAL(14,2) NOT NULL,
    "total_rounded" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_branch_id_created_at_idx" ON "quote"("branch_id", "created_at");

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "fabric_sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
