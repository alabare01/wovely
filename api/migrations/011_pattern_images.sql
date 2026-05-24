-- 011_pattern_images.sql
-- Pattern image extraction storage. Bev classifies each PDF page (chart, cover,
-- diagram, photo, glossary) server-side immediately after pattern save, then
-- the client lazy-renders + uploads each meaningful page to Cloudinary on the
-- Craft-tier detail view. cloudinary_url is nullable so the classification can
-- land before the upload completes — UI treats null as "render pending".

CREATE TABLE public.pattern_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id uuid REFERENCES public.patterns(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  cloudinary_url text,
  image_type text NOT NULL CHECK (image_type IN ('chart', 'cover', 'diagram', 'photo', 'glossary')),
  page_number integer,
  sort_order integer DEFAULT 0,
  caption text,
  component_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pattern_images_pattern ON public.pattern_images(pattern_id);
CREATE INDEX idx_pattern_images_user ON public.pattern_images(user_id);

ALTER TABLE public.pattern_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own images"
  ON public.pattern_images FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own images"
  ON public.pattern_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own images"
  ON public.pattern_images FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own images"
  ON public.pattern_images FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON public.pattern_images FOR ALL
  USING (auth.role() = 'service_role');
