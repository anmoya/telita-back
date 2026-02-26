-- Add column first
ALTER TABLE "sale" ADD COLUMN     "quote_number" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing sales with sequential quote numbers per branch
WITH ranked_sales AS (
  SELECT
    s.id,
    s.branch_id,
    ROW_NUMBER() OVER (PARTITION BY s.branch_id ORDER BY s.created_at ASC) AS row_num
  FROM "sale" s
)
UPDATE "sale" s
SET quote_number = r.row_num
FROM ranked_sales r
WHERE s.id = r.id;
