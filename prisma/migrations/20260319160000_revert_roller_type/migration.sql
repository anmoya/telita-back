-- Revert MVP-03 roller type changes
DROP INDEX IF EXISTS "sale_line_paired_line_id_key";
ALTER TABLE "sale_line" DROP CONSTRAINT IF EXISTS "sale_line_paired_line_id_fkey";
ALTER TABLE "sale_line" DROP COLUMN IF EXISTS "paired_line_id";
ALTER TABLE "sale_line" DROP COLUMN IF EXISTS "roller_type";
DROP TYPE IF EXISTS "RollerType";
