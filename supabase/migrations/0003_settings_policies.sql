-- Add code column to engineers (short display identifier, e.g. "JD")
ALTER TABLE engineers ADD COLUMN IF NOT EXISTS code TEXT;

-- Authenticated users can update their own engineer profile row
CREATE POLICY "authenticated_update_own_engineer" ON engineers
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Authenticated users can insert engineer rows (new team members / own profile)
CREATE POLICY "authenticated_insert_engineers" ON engineers
  FOR INSERT TO authenticated WITH CHECK (true);

-- Authenticated users can register and calibrate devices
CREATE POLICY "authenticated_insert_devices" ON devices
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_devices" ON devices
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
