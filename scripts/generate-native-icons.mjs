// Replaces the stock Capacitor launcher icons and splash screens with Wovely's
// brand art, for both native projects.
//
// Run with: node scripts/generate-native-icons.mjs
//
// `npx cap add` ships the Capacitor logo as a placeholder in every mipmap and
// splash slot. Shipping that to a store is the sort of thing nobody notices
// until it is on a review screenshot, so this overwrites all of them from the
// same masters the web icons come from (scripts/generate-pwa-icons.mjs), which
// is what keeps the home-screen icon, the browser tab and the two app stores
// showing one picture instead of three.
//
// ─── ANDROID ADAPTIVE ICONS, AND THE SAFE ZONE THAT IS NOT THE SAME ONE ──────
//
// Android has TWO different safe zones and they are easy to conflate:
//
//   PWA maskable icon      content inside the centre 80% of the image
//   Adaptive icon layer    content inside the centre 66.6% (72dp of 108dp)
//
// The adaptive one is much tighter, because the launcher both masks the icon
// AND parallax-shifts the layers when the user scrolls. Measured on the source
// art, Bev needs a 91.4% circle at full bleed, so the foreground layer scales
// the source to 72% (91.4 * 0.72 = 65.8%, just inside the 66.6% guarantee).
//
// The foreground layer keeps its transparent corners and sits over a solid
// background colour set to the same plate the art already uses, so the disc in
// the source art and the layer behind it are the same colour and the seam is
// invisible.
//
// ─── THE iOS ALPHA RULE ──────────────────────────────────────────────────────
//
// App Store Connect rejects an app icon that contains an alpha channel, with a
// validation error rather than a review note. The 1024 master is flattened and
// written without alpha for exactly that reason.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("public/bev.png");
const ANDROID_RES = path.resolve("android/app/src/main/res");
const IOS_ASSETS = path.resolve("ios/App/App/Assets.xcassets");

const PLATE = "#EFE9FB";      // the disc colour in the source art
const APP_BG = "#FBF9FF";     // body background in src/index.css, so the splash
                              // does not flash a different colour before paint

// Content inside the centre 66.6% for an adaptive foreground layer.
const ADAPTIVE_SCALE = 0.72;

const exists = (p) => fs.existsSync(p);

/** Square icon: source scaled to `scale` of the frame, centred, on `background`. */
const square = async (size, { scale = 1, background = PLATE, alpha = true } = {}) => {
  const inner = Math.round(size * scale);
  const art = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const pad = Math.round((size - inner) / 2);
  let img = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background === "transparent" ? { r: 0, g: 0, b: 0, alpha: 0 } : background,
    },
  }).composite([{ input: art, top: pad, left: pad }]);
  if (!alpha) img = img.flatten({ background: APP_BG }).removeAlpha();
  return img.png({ compressionLevel: 9 }).toBuffer();
};

/** Circular crop, for Android's ic_launcher_round slot. */
const round = async (size) => {
  const base = await square(size);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp(base)
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};

/** Splash: mascot centred small on the app background, at an arbitrary aspect. */
const splash = async (w, h) => {
  const art = Math.round(Math.min(w, h) * 0.32);
  const bev = await sharp(SRC).resize(art, art, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: APP_BG } })
    .composite([{ input: bev, top: Math.round((h - art) / 2), left: Math.round((w - art) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};

const write = (file, buf) => {
  fs.writeFileSync(file, buf);
  console.log(`  ${path.relative(process.cwd(), file).replace(/\\/g, "/")}  ${(buf.length / 1024).toFixed(1)} kB`);
};

// ─── ANDROID ─────────────────────────────────────────────────────────────────

if (exists(ANDROID_RES)) {
  console.log("[native] android launcher icons");
  // Legacy square, round, and the adaptive foreground layer, per density.
  const densities = {
    mdpi: { legacy: 48, foreground: 108 },
    hdpi: { legacy: 72, foreground: 162 },
    xhdpi: { legacy: 96, foreground: 216 },
    xxhdpi: { legacy: 144, foreground: 324 },
    xxxhdpi: { legacy: 192, foreground: 432 },
  };
  for (const [density, sizes] of Object.entries(densities)) {
    const dir = path.join(ANDROID_RES, `mipmap-${density}`);
    if (!exists(dir)) continue;
    write(path.join(dir, "ic_launcher.png"), await square(sizes.legacy));
    write(path.join(dir, "ic_launcher_round.png"), await round(sizes.legacy));
    write(
      path.join(dir, "ic_launcher_foreground.png"),
      await square(sizes.foreground, { scale: ADAPTIVE_SCALE, background: "transparent" })
    );
  }

  // The adaptive background layer is a flat colour, not an image. It shipped
  // as #FFFFFF, which put a white ring around the lavender disc on every
  // circular launcher.
  const colorFile = path.join(ANDROID_RES, "values", "ic_launcher_background.xml");
  fs.writeFileSync(
    colorFile,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${PLATE}</color>\n</resources>\n`,
    "utf8"
  );
  console.log(`  ${path.relative(process.cwd(), colorFile).replace(/\\/g, "/")}  -> ${PLATE}`);

  console.log("[native] android splash screens");
  // Regenerate every splash slot at whatever size Capacitor put there, so this
  // keeps working if the template's density list changes.
  for (const dir of fs.readdirSync(ANDROID_RES)) {
    if (!dir.startsWith("drawable")) continue;
    const file = path.join(ANDROID_RES, dir, "splash.png");
    if (!exists(file)) continue;
    const { width, height } = await sharp(file).metadata();
    write(file, await splash(width, height));
  }
}

// ─── iOS ─────────────────────────────────────────────────────────────────────

if (exists(IOS_ASSETS)) {
  console.log("[native] ios app icon");
  const appIcon = path.join(IOS_ASSETS, "AppIcon.appiconset", "AppIcon-512@2x.png");
  if (exists(appIcon)) {
    // alpha: false — App Store Connect rejects an icon with an alpha channel.
    write(appIcon, await square(1024, { alpha: false }));
    const meta = await sharp(appIcon).metadata();
    if (meta.hasAlpha) throw new Error("iOS app icon still has an alpha channel; App Store validation would reject it");
    console.log(`  verified: ${meta.width}x${meta.height}, hasAlpha=${meta.hasAlpha}`);
  }

  console.log("[native] ios splash screens");
  const splashDir = path.join(IOS_ASSETS, "Splash.imageset");
  if (exists(splashDir)) {
    for (const f of fs.readdirSync(splashDir)) {
      if (!f.endsWith(".png")) continue;
      const file = path.join(splashDir, f);
      const { width, height } = await sharp(file).metadata();
      write(file, await splash(width, height));
    }
  }
}

console.log("[native] done");
