-- 020_user_monthly_budget.sql
-- Per-team-member monthly budget cap (default ₹50,000). Enforced at approval time:
-- the sum of a creator's locked (committed, non-barter) collabs for a calendar month
-- cannot exceed their cap. Resets each calendar month. Admin-editable per user.

ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_budget numeric NOT NULL DEFAULT 50000;
