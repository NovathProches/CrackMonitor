-- Allow authenticated users to update ticket status and assignee.
-- The frontend Maintenance page needs to change status and reassign
-- directly via the Supabase client (service_role is used by cv-service
-- for inserts; authenticated users drive status workflow from the UI).
CREATE POLICY "authenticated_update_tickets" ON tickets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
