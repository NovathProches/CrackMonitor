-- ============================================================
-- 0002_anon_read_dev.sql  –  DEV ONLY: anon SELECT access
-- Remove / replace with auth-gated policies before production.
-- ============================================================

CREATE POLICY "anon_select_engineers"  ON engineers
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_devices"    ON devices
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_detections" ON detections
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_tickets"    ON tickets
  FOR SELECT TO anon USING (true);
