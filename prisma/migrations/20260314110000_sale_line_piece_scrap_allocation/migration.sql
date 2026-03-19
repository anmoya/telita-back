ALTER TABLE "sale_line_scrap_allocation"
ADD COLUMN "sale_line_piece_id" UUID;

INSERT INTO "sale_line_piece" (
  "id",
  "sale_line_id",
  "piece_index",
  "piece_total",
  "requested_width_m",
  "requested_height_m",
  "room_area_name",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  line."id",
  series."piece_index",
  GREATEST(line."quantity", 1),
  line."requested_width_m",
  line."requested_height_m",
  line."room_area_name",
  NOW(),
  NOW()
FROM "sale_line" line
LEFT JOIN "sale_line_piece" existing_piece
  ON existing_piece."sale_line_id" = line."id"
CROSS JOIN LATERAL generate_series(1, GREATEST(line."quantity", 1)) AS series("piece_index")
WHERE existing_piece."id" IS NULL;

WITH ranked_allocations AS (
  SELECT
    alloc."id",
    alloc."sale_line_id",
    ROW_NUMBER() OVER (
      PARTITION BY alloc."sale_line_id"
      ORDER BY alloc."is_active" DESC, alloc."allocated_at" ASC, alloc."created_at" ASC, alloc."id" ASC
    ) AS "allocation_rank"
  FROM "sale_line_scrap_allocation" alloc
),
ranked_pieces AS (
  SELECT
    piece."id",
    piece."sale_line_id",
    ROW_NUMBER() OVER (
      PARTITION BY piece."sale_line_id"
      ORDER BY piece."piece_index" ASC, piece."id" ASC
    ) AS "piece_rank",
    COUNT(*) OVER (PARTITION BY piece."sale_line_id") AS "piece_count"
  FROM "sale_line_piece" piece
),
piece_choice AS (
  SELECT
    alloc."id" AS "allocation_id",
    piece."id" AS "sale_line_piece_id"
  FROM ranked_allocations alloc
  JOIN ranked_pieces piece
    ON piece."sale_line_id" = alloc."sale_line_id"
   AND piece."piece_rank" = LEAST(alloc."allocation_rank", piece."piece_count")
)
UPDATE "sale_line_scrap_allocation" alloc
SET "sale_line_piece_id" = piece_choice."sale_line_piece_id"
FROM piece_choice
WHERE piece_choice."allocation_id" = alloc."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "sale_line_scrap_allocation"
    WHERE "sale_line_piece_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Could not backfill sale_line_piece_id for all existing scrap allocations.';
  END IF;
END $$;

ALTER TABLE "sale_line_scrap_allocation"
ALTER COLUMN "sale_line_piece_id" SET NOT NULL;

ALTER TABLE "sale_line_scrap_allocation"
ADD CONSTRAINT "sale_line_scrap_allocation_sale_line_piece_id_fkey"
FOREIGN KEY ("sale_line_piece_id") REFERENCES "sale_line_piece"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "sale_line_scrap_allocation_sale_line_piece_id_idx"
ON "sale_line_scrap_allocation"("sale_line_piece_id");

CREATE UNIQUE INDEX "sale_line_scrap_allocation_active_piece_key"
ON "sale_line_scrap_allocation"("sale_line_piece_id")
WHERE "is_active" = true;

CREATE UNIQUE INDEX "sale_line_scrap_allocation_active_scrap_key"
ON "sale_line_scrap_allocation"("scrap_id")
WHERE "is_active" = true;
