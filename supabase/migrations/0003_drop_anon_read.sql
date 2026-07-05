-- ============================================================
-- 0003_drop_anon_read.sql  –  remove dev-only anon policies
-- Run this once auth is wired up in the frontend.
-- ============================================================

DROP POLICY IF EXISTS "anon_select_engineers"  ON engineers;
DROP POLICY IF EXISTS "anon_select_devices"    ON devices;
DROP POLICY IF EXISTS "anon_select_detections" ON detections;
DROP POLICY IF EXISTS "anon_select_tickets"    ON tickets;
