-- ============================================================
-- 0004_dashboard_fields.sql  –  fields required by the dashboard
-- ============================================================

-- measurement_source on detections (auto | manual)
ALTER TABLE detections
  ADD COLUMN IF NOT EXISTS measurement_source TEXT NOT NULL DEFAULT 'auto'
  CHECK (measurement_source IN ('auto', 'manual'));

-- sequential human-readable ticket number (TKT-XXX)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_number INTEGER GENERATED ALWAYS AS IDENTITY;

-- short engineer code displayed in the UI (E1, E2, …)
ALTER TABLE engineers
  ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

-- allow authenticated engineers to update ticket status via the frontend
DROP POLICY IF EXISTS "authenticated_update_tickets" ON tickets;
CREATE POLICY "authenticated_update_tickets" ON tickets
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (status IN ('open', 'in_progress', 'resolved'));
