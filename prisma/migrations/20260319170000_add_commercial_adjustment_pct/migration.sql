-- Add commercial_adjustment_pct to sale and quote_batch
ALTER TABLE "sale" ADD COLUMN "commercial_adjustment_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "quote_batch" ADD COLUMN "commercial_adjustment_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;
