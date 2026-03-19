-- Agregar customer_id a quote_batch para propagar cliente al editar/crear venta
ALTER TABLE quote_batch
ADD COLUMN customer_id UUID REFERENCES customer(id);
