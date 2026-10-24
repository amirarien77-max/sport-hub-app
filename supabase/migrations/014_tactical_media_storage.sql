-- Tactical play media bucket (coach upload → media_url). Safe to re-run.
-- Public read of objects; write limited to authenticated team staff via path team_id/.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tactical-media',
  'tactical-media',
  TRUE,
  52428800, -- 50MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS tactical_media_public_read ON storage.objects;
CREATE POLICY tactical_media_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tactical-media');

DROP POLICY IF EXISTS tactical_media_staff_insert ON storage.objects;
CREATE POLICY tactical_media_staff_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tactical-media'
    AND public.is_team_staff()
    AND (storage.foldername(name))[1] = public.current_app_team_id()::text
  );

DROP POLICY IF EXISTS tactical_media_staff_update ON storage.objects;
CREATE POLICY tactical_media_staff_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'tactical-media'
    AND public.is_team_staff()
    AND (storage.foldername(name))[1] = public.current_app_team_id()::text
  )
  WITH CHECK (
    bucket_id = 'tactical-media'
    AND public.is_team_staff()
    AND (storage.foldername(name))[1] = public.current_app_team_id()::text
  );

DROP POLICY IF EXISTS tactical_media_staff_delete ON storage.objects;
CREATE POLICY tactical_media_staff_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tactical-media'
    AND public.is_team_staff()
    AND (storage.foldername(name))[1] = public.current_app_team_id()::text
  );
