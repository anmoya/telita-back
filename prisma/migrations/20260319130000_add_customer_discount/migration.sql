-- MVP-07: Vigencia temporal de descuentos de cliente
CREATE TABLE customer_discount (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer(id),
  discount_code VARCHAR(40),
  discount_pct DECIMAL(5,2) NOT NULL CHECK (discount_pct >= 0 AND discount_pct <= 100),
  reason VARCHAR(200),
  valid_from DATE NOT NULL,
  valid_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_discount_customer ON customer_discount(customer_id);
CREATE INDEX idx_customer_discount_vigencia ON customer_discount(customer_id, valid_from, valid_to);

-- Backfill: migrar descuentos existentes de clientes con discountPct > 0
INSERT INTO customer_discount (customer_id, discount_code, discount_pct, reason, valid_from, is_active, created_by)
SELECT
  c.id,
  c.discount_code,
  c.discount_pct,
  'Migrado desde campo plano de cliente',
  c.created_at::date,
  true,
  (SELECT id FROM app_user ORDER BY created_at LIMIT 1)
FROM customer c
WHERE c.discount_pct > 0;
