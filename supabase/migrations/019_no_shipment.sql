-- 019_no_shipment.sql
-- Allow a collab to skip the shipment step when the influencer already has the product.
-- When true, dispatch is bypassed and content submission unlocks as if the product were delivered.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS no_shipment boolean NOT NULL DEFAULT false;
