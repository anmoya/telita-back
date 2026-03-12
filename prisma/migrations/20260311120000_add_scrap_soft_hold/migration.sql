-- CreateEnum
CREATE TYPE "SoftHoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONVERTED');

-- CreateTable
CREATE TABLE "scrap_soft_hold" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "scrap_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "sale_line_id" UUID,
    "held_by" UUID NOT NULL,
    "reason" VARCHAR(200),
    "status" "SoftHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "released_at" TIMESTAMPTZ(6),
    "converted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrap_soft_hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scrap_soft_hold_scrap_id_status_idx" ON "scrap_soft_hold"("scrap_id", "status");

-- CreateIndex
CREATE INDEX "scrap_soft_hold_sale_id_idx" ON "scrap_soft_hold"("sale_id");

-- CreateIndex
CREATE INDEX "scrap_soft_hold_expires_at_idx" ON "scrap_soft_hold"("expires_at");

-- AddForeignKey
ALTER TABLE "scrap_soft_hold" ADD CONSTRAINT "scrap_soft_hold_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_soft_hold" ADD CONSTRAINT "scrap_soft_hold_scrap_id_fkey" FOREIGN KEY ("scrap_id") REFERENCES "scrap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_soft_hold" ADD CONSTRAINT "scrap_soft_hold_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_soft_hold" ADD CONSTRAINT "scrap_soft_hold_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_soft_hold" ADD CONSTRAINT "scrap_soft_hold_held_by_fkey" FOREIGN KEY ("held_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
