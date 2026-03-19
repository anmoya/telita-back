-- Add RUT field to customer table
ALTER TABLE customer ADD COLUMN rut VARCHAR(12) NULL;

-- Unique RUT per branch (only enforced when rut is not null)
CREATE UNIQUE INDEX ux_customer_branch_rut ON customer(branch_id, rut) WHERE rut IS NOT NULL;
