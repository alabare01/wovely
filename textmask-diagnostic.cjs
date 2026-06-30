// Diagnostic: does SOV identify stitches from visual content alone, or is it
// reading the text labels in the library reference images?
//
// For each of 10 representative stitches:
//  1. Load local reference PNG
//  2. Detect bounding box of yarn-saturated pixels → swatch-only crop
//  3. Upload cropped JPEG to Cloudinary under sov-textmask-test/
//  4. Run BOTH the original library URL and the cropped URL through SOV
//  5. Tabulate results

require('dotenv').config({ path: 'C:\\Users\\adam\\wovely\\.env.local' });
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const SOV_URL = "https://wovely-git-feat-sov-library-integration-alabare-8435s-projects.vercel.app/api/stitch-vision";
const IMG_DIR = "C:\\Users\\adam\\wovely\\stitch-extraction-images";

const STITCHES = [
  { slug: "single-crochet", expected: "Single Crochet", category: "simple" },
  { slug: "double-crochet", expected: "Double Crochet", category: "simple" },
  { slug: "basketweave-stitch", expected: "Basketweave Stitch", category: "textured" },
  { slug: "waffle-rib", expected: "Waffle Rib", category: "textured" },
  { slug: "spider", expected: "Spider", category: "lacy" },
  { slug: "pineapple", expected: "Pineapple", category: "lacy" },
  { slug: "tweed", expected: "Tweed", category: "patterned" },
  { slug: "diamond-tweed", expected: "Diamond Tweed", category: "patterned" },
  { slug: "solomons-knot-stitch", expected: "Solomon's Knot Stitch", category: "distinctive" },
  { slug: "broomstick-lace-flower", expected: "Broomstick Lace Flower", category: "distinctive" },
];

// Detect the bounding box of "yarn-saturated" pixels — i.e. textured colored fabric,
// excluding pure black background, white/red text, and white-on-black symbol charts.
async function detectSwatchBox(imgPath) {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const isYarnPixel = (r, g, b) => {
    if (r < 30 && g < 30 && b < 30) return false;            // pure black bg
    if (r > 200 && g > 200 && b > 200) return false;          // white text
    if (r > 150 && g < 80 && b < 80) return false;            // red header text
    return true;
  };

  // Per-row count of yarn pixels
  const rowCounts = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (isYarnPixel(data[i], data[i+1], data[i+2])) rowCounts[y]++;
    }
  }

  // Find longest contiguous run of "swatch-like" rows (>= 25% yarn pixels)
  const minRowYarn = Math.floor(width * 0.25);
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let y = 0; y < height; y++) {
    if (rowCounts[y] >= minRowYarn) {
      if (curStart === -1) curStart = y;
      curLen++;
    } else {
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
      curStart = -1; curLen = 0;
    }
  }
  if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }

  if (bestStart < 0 || bestLen < 50) {
    // Fallback: central 40% of height
    return { left: 0, top: Math.floor(height * 0.3), width, height: Math.floor(height * 0.4), fallback: true };
  }

  // Find column extent of yarn pixels within the row band
  const colCounts = new Array(width).fill(0);
  for (let y = bestStart; y < bestStart + bestLen; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (isYarnPixel(data[i], data[i+1], data[i+2])) colCounts[x]++;
    }
  }
  const minColYarn = Math.floor(bestLen * 0.15);
  let leftX = 0, rightX = width - 1;
  while (leftX < width - 1 && colCounts[leftX] < minColYarn) leftX++;
  while (rightX > 0 && colCounts[rightX] < minColYarn) rightX--;
  if (rightX <= leftX) { leftX = 0; rightX = width - 1; }

  // Snug margin
  const margin = 6;
  const left = Math.max(0, leftX - margin);
  const top = Math.max(0, bestStart - margin);
  const w = Math.min(width - left, (rightX - leftX) + 2 * margin);
  const h = Math.min(height - top, bestLen + 2 * margin);
  return { left, top, width: w, height: h, fallback: false };
}

async function cropAndUpload(slug) {
  const inputPath = path.join(IMG_DIR, `${slug}.png`);
  if (!fs.existsSync(inputPath)) throw new Error(`Missing local image: ${inputPath}`);

  const meta = await sharp(inputPath).metadata();
  const box = await detectSwatchBox(inputPath);
  console.log(`  ${slug}: ${meta.width}x${meta.height} → crop [${box.left},${box.top} ${box.width}x${box.height}]${box.fallback ? " (FALLBACK)" : ""}`);

  const outBuf = await sharp(inputPath)
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Persist locally so user can inspect if curious; will delete at end
  const outPath = path.join("C:\\Users\\adam\\wovely\\textmask-tmp", `${slug}-swatch.jpg`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, outBuf);

  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: "sov-textmask-test", public_id: slug, overwrite: true, resource_type: "image" },
      (err, res) => err ? reject(err) : resolve(res)
    ).end(outBuf);
  });
  return { croppedUrl: result.secure_url, dims: { ...box, srcW: meta.width, srcH: meta.height } };
}

async function callSov(imageUrl) {
  const res = await fetch(SOV_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
  });
  return res.json();
}

(async () => {
  // Get original library URLs (already in stitch_library.image_url)
  const originals = {
    "single-crochet":         "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745199/stitch-library/single-crochet.png",
    "double-crochet":         "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745146/stitch-library/double-crochet.png",
    "basketweave-stitch":     "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745114/stitch-library/basketweave-stitch.png",
    "waffle-rib":             "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745215/stitch-library/waffle-rib.png",
    "spider":                 "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745204/stitch-library/spider.png",
    "pineapple":              "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745189/stitch-library/pineapple.png",
    "tweed":                  "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745214/stitch-library/tweed.png",
    "diamond-tweed":          "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745143/stitch-library/diamond-tweed.png",
    "solomons-knot-stitch":   "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745204/stitch-library/solomons-knot-stitch.png",
    "broomstick-lace-flower": "https://res.cloudinary.com/dmaupzhcx/image/upload/v1777745123/stitch-library/broomstick-lace-flower.png",
  };

  console.log("=== Phase 1: Crop + upload swatch-only versions ===");
  const cropped = {};
  for (const s of STITCHES) {
    cropped[s.slug] = await cropAndUpload(s.slug);
  }

  console.log("\n=== Phase 2: Run SOV against ORIGINAL library images ===");
  const originalResults = {};
  for (const s of STITCHES) {
    process.stdout.write(`  ${s.slug}... `);
    originalResults[s.slug] = await callSov(originals[s.slug]);
    const r = originalResults[s.slug];
    const got = r.matched ? r.stitch.primary_name : "NO MATCH";
    console.log(`${got} (${r.confidence || "—"})`);
  }

  console.log("\n=== Phase 3: Run SOV against CROPPED swatch-only images ===");
  const croppedResults = {};
  for (const s of STITCHES) {
    process.stdout.write(`  ${s.slug}... `);
    croppedResults[s.slug] = await callSov(cropped[s.slug].croppedUrl);
    const r = croppedResults[s.slug];
    const got = r.matched ? r.stitch.primary_name : "NO MATCH";
    console.log(`${got} (${r.confidence || "—"})`);
  }

  // Write detailed JSON for the report
  const summary = STITCHES.map(s => ({
    slug: s.slug,
    expected: s.expected,
    category: s.category,
    cropDims: cropped[s.slug].dims,
    croppedUrl: cropped[s.slug].croppedUrl,
    original: originalResults[s.slug],
    cropped: croppedResults[s.slug],
  }));
  fs.writeFileSync("C:\\Users\\adam\\wovely\\textmask-results.json", JSON.stringify(summary, null, 2));

  console.log("\n=== Phase 4: Summary table ===\n");
  const fmtRes = r => {
    if (!r) return "—";
    if (r.error) return "ERROR";
    if (!r.matched) return "NO MATCH";
    return `${r.stitch.primary_name} (${r.confidence})`;
  };
  console.log("| # | Slug | Expected | Original | Cropped | Verdict |");
  console.log("|---|---|---|---|---|---|");
  let pureVisual = 0, textAided = 0, bothMiss = 0, anomaly = 0;
  STITCHES.forEach((s, i) => {
    const o = originalResults[s.slug], c = croppedResults[s.slug];
    const oCorrect = o.matched && o.stitch.primary_name === s.expected;
    const cCorrect = c.matched && c.stitch.primary_name === s.expected;
    let verdict;
    if (cCorrect)        { verdict = "✅ pure visual"; pureVisual++; }
    else if (oCorrect)   { verdict = "⚠️ text-aided";  textAided++; }
    else if (!o.matched && !c.matched) { verdict = "❌ both miss"; bothMiss++; }
    else                 { verdict = "❓ anomaly";      anomaly++; }
    console.log(`| ${i+1} | ${s.slug} | ${s.expected} | ${fmtRes(o)} | ${fmtRes(c)} | ${verdict} |`);
  });
  console.log(`\nTotals: ${pureVisual} pure visual, ${textAided} text-aided, ${bothMiss} both miss, ${anomaly} anomaly`);
})().catch(err => { console.error("FATAL:", err); process.exit(1); });
