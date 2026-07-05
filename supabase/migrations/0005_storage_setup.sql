-- ============================================================
-- 0005_storage_setup.sql  –  detections storage bucket + RLS
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'detections',
  'detections',
  false,
  52428800,   -- 50 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- cv-service (service_role) can upload
CREATE POLICY "service_role_upload_detections" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'detections');

-- authenticated engineers can read
CREATE POLICY "authenticated_read_detections" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'detections');
