-- MVP-05: Abono del cliente en cotización
ALTER TABLE quote_batch
ADD COLUMN amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0;
