-- Add commercial adjustment and installation amount to quote_batch and sale
ALTER TABLE "quote_batch"
  ADD COLUMN "commercial_adjustment_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "installation_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "sale"
  ADD COLUMN "commercial_adjustment_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "installation_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;
