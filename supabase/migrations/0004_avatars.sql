-- Avatars bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload/replace their own avatar (name = auth.uid())
DROP POLICY IF EXISTS "avatar_insert" ON storage.objects;
CREATE POLICY "avatar_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_update" ON storage.objects;
CREATE POLICY "avatar_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING  (bucket_id = 'avatars' AND name = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::text);

-- Public read for all avatar objects
DROP POLICY IF EXISTS "avatar_public_read" ON storage.objects;
CREATE POLICY "avatar_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- avatar_url on engineers for persistence
ALTER TABLE engineers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
