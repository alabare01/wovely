import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mljicgrwjoxvwfpspcdy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1samljZ3J3am94dndmcHNwY2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzYyNzcwMzcsImV4cCI6MTk5MTg1MzAzN30.y7Qjg3Yd-PYQO8d-JQsEQxLvxWS_QK-N1E9rKCL5TLQ'
);

try {
  // Get patterns with images
  const { data: patterns, error } = await supabase
    .from('patterns')
    .select('id, title, pdf_url, thumbnail_url, image_url, created_at')
    .limit(20);

  if (error) {
    console.log('Error fetching patterns:', error.message);
  } else {
    console.log('=== PATTERN DATABASE ===\n');
    patterns.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title}`);
      if (p.thumbnail_url) console.log(`   Thumbnail: ${p.thumbnail_url}`);
      if (p.image_url) console.log(`   Image: ${p.image_url}`);
      if (p.pdf_url) console.log(`   PDF: ${p.pdf_url}`);
      console.log();
    });
  }
} catch (e) {
  console.log('Connection error:', e.message);
}
