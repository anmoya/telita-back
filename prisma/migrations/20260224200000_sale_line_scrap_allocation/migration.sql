-- CreateTable
CREATE TABLE "sale_line_scrap_allocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_line_id" UUID NOT NULL,
    "scrap_id" UUID NOT NULL,
    "allocated_by" UUID NOT NULL,
    "allocated_at" TIMESTAMPTZ(6) NOT NULL,
    "released_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_line_scrap_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_line_scrap_allocation_sale_line_id_idx" ON "sale_line_scrap_allocation"("sale_line_id");

-- CreateIndex
CREATE INDEX "sale_line_scrap_allocation_scrap_id_idx" ON "sale_line_scrap_allocation"("scrap_id");

-- AddForeignKey
ALTER TABLE "sale_line_scrap_allocation" ADD CONSTRAINT "sale_line_scrap_allocation_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line_scrap_allocation" ADD CONSTRAINT "sale_line_scrap_allocation_scrap_id_fkey" FOREIGN KEY ("scrap_id") REFERENCES "scrap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line_scrap_allocation" ADD CONSTRAINT "sale_line_scrap_allocation_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
