-- 018_manager_note.sql
-- A management directive note that can be attached to any collab by an admin/manager.
-- Shown prominently to the executive (negotiator) so they know what management wants on the collab.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS manager_note text;
