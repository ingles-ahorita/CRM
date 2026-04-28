ALTER TABLE public.closers
ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('closer-avatars', 'closer-avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read closer-avatars'
  ) THEN
    CREATE POLICY "Public read closer-avatars"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'closer-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public upload closer-avatars'
  ) THEN
    CREATE POLICY "Public upload closer-avatars"
    ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'closer-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public update closer-avatars'
  ) THEN
    CREATE POLICY "Public update closer-avatars"
    ON storage.objects
    FOR UPDATE
    USING (bucket_id = 'closer-avatars')
    WITH CHECK (bucket_id = 'closer-avatars');
  END IF;
END $$;

