ALTER TABLE "scrap_soft_hold"
ADD COLUMN "sale_line_piece_id" UUID;

ALTER TABLE "scrap_soft_hold"
ADD CONSTRAINT "scrap_soft_hold_sale_line_piece_id_fkey"
FOREIGN KEY ("sale_line_piece_id") REFERENCES "sale_line_piece"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "scrap_soft_hold_sale_line_piece_id_idx"
ON "scrap_soft_hold"("sale_line_piece_id");
