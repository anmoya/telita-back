-- Add unique constraint for one-to-one paired line relation
CREATE UNIQUE INDEX "sale_line_paired_line_id_key" ON "sale_line"("paired_line_id");
