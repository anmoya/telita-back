ALTER TABLE "quote_batch"
ADD COLUMN "quote_number" INTEGER NOT NULL DEFAULT 0;

WITH numbered_batches AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY branch_id
      ORDER BY created_at ASC, id ASC
    ) AS next_quote_number
  FROM "quote_batch"
)
UPDATE "quote_batch" qb
SET "quote_number" = numbered_batches.next_quote_number
FROM numbered_batches
WHERE qb.id = numbered_batches.id;
