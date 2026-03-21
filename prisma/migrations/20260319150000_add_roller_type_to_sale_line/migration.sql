-- MVP-03: Tipo de roller (Simple / Doble)
CREATE TYPE "RollerType" AS ENUM ('SIMPLE', 'DOBLE');

ALTER TABLE "sale_line"
  ADD COLUMN "roller_type" "RollerType" NOT NULL DEFAULT 'SIMPLE',
  ADD COLUMN "paired_line_id" UUID NULL;

-- Self-referencing FK
ALTER TABLE "sale_line"
  ADD CONSTRAINT "sale_line_paired_line_id_fkey"
  FOREIGN KEY ("paired_line_id") REFERENCES "sale_line"("id") ON DELETE SET NULL;
