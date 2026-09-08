// Generates the PWA / home-screen icon set from the existing brand art.
//
// Run with: node scripts/generate-pwa-icons.mjs
//
// This is a build-time-only generator, not part of `npm run build`. The icons
// it writes are committed to public/, because they change only when the brand
// art changes and regenerating them on every deploy would be four seconds of
// sharp for a byte-identical result.
//
// ─── SOURCE ──────────────────────────────────────────────────────────────────
//
// public/bev.png, 512x512: Bev the mascot on a pale lavender disc with
// transparent corners. It is the highest-resolution square brand asset in the
// repo, and it is already what favicon.svg points at, so the home-screen icon
// and the browser tab stay the same picture.
//
// ─── WHY TWO SHAPES ──────────────────────────────────────────────────────────
//
// Android does not draw the icon you give it. It masks it — circle, squircle,
// rounded square, teardrop, depending on the launcher — and a "maskable" icon
// is one that promises all its meaning sits inside the centre circle of 80%
// diameter. Everything outside that is decoration the launcher may cut off.
//
// Measured, rather than guessed: the mascot's bounding box in bev.png is
// 298x316 at (112,118), whose furthest corner from centre needs a safe circle
// of 91.4% diameter. That is wider than the 80% Android guarantees, so a
// full-bleed maskable icon would have Bev's tail and coil clipped on any
// circular launcher. Scaling the source to 82% brings the required circle to
// 91.4 * 0.82 = 74.9%, comfortably inside the guarantee with room to spare.
//
// The "any" icons stay full-bleed, because nothing masks those aggressively
// and the art is better used edge to edge.
//
// ─── THE APPLE ICON, WHICH WAS BROKEN ────────────────────────────────────────
//
// public/apple-touch-icon.png shipped with a fully transparent background
// (verified: pixel 0,0 was rgba(0,0,0,0) and sharp reported isOpaque false).
// iOS does not composite an apple-touch-icon onto white. It composites it onto
// BLACK. So every iPhone user who added Wovely to their home screen got a
// black tile with a lavender snake on it. This regenerates it flattened onto
// the brand plate, which is the whole reason it is in this script rather than
// left alone.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("public/bev.png");
const PUBLIC = path.resolve("public");
const ICON_DIR = path.join(PUBLIC, "icons");

// Sampled from bev.png's own disc, so the plate and the art cannot drift apart.
const PLATE = "#EFE9FB";

// See the reasoning above. 0.82 of the frame, centred.
const MASKABLE_SCALE = 0.82;

fs.mkdirSync(ICON_DIR, { recursive: true });

const square = async (size, { scale = 1, background = PLATE } = {}) => {
  const inner = Math.round(size * scale);
  const art = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const pad = Math.round((size - inner) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: art, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};

const write = async (file, buf) => {
  fs.writeFileSync(file, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`  ${path.relative(process.cwd(), file).replace(/\\/g, "/")}  ${kb} kB`);
};

console.log("[icons] any-purpose (full bleed, opaque plate)");
for (const size of [192, 512]) {
  await write(path.join(ICON_DIR, `icon-${size}.png`), await square(size));
}

console.log("[icons] maskable (82% safe zone)");
for (const size of [192, 512]) {
  await write(
    path.join(ICON_DIR, `maskable-${size}.png`),
    await square(size, { scale: MASKABLE_SCALE })
  );
}

// 1024 master, kept for the native app icons. Both the iOS AppIcon set and the
// Android mipmaps are cut from this, so all three platforms trace back to one
// file rather than three independent crops that slowly disagree.
console.log("[icons] native master");
await write(path.join(ICON_DIR, "icon-1024.png"), await square(1024));
await write(path.join(ICON_DIR, "maskable-1024.png"), await square(1024, { scale: MASKABLE_SCALE }));

// The fix described at the top of this file.
console.log("[icons] apple-touch-icon (flattened onto the plate, was transparent)");
await write(path.join(PUBLIC, "apple-touch-icon.png"), await square(180));

console.log("[icons] done");
