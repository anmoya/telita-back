ALTER TYPE "ScrapStatus" ADD VALUE IF NOT EXISTS 'PENDING_INBOUND';

UPDATE "scrap"
SET "status" = 'PENDING_INBOUND'
WHERE "status" = 'PENDING_STORAGE';

INSERT INTO "status_label" ("entity_type", "status_code", "label_es", "description_es")
SELECT
  'scrap',
  'PENDING_INBOUND',
  'Pendiente ingreso',
  'Retazo útil pendiente de ingreso o ubicación final.'
WHERE NOT EXISTS (
  SELECT 1
  FROM "status_label"
  WHERE "entity_type" = 'scrap' AND "status_code" = 'PENDING_INBOUND'
);
