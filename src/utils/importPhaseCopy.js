// Shared phase copy source. Consumed by ImportPill (compact surface)
// and PDFUploadForm inside AddPatternModal (big surface). Both surfaces
// must speak with one voice — phase from polling.currentPhase drives
// both. Pool slugs align with PHASE_* in api/cron/process-queue.js.

export const PHASE_COPY_POOLS = {
  analyzing: [
    "Sizing up your pattern...",
    "Taking a quick look...",
    "Getting the lay of the land...",
  ],
  reading: [
    "Reading every word...",
    "Cracking open the PDF...",
    "Going page by page...",
  ],
  extracting: [
    "Counting your stitches...",
    "Untangling the rounds...",
    "Making sense of the pattern...",
  ],
  validating: [
    "Double-checking the math...",
    "Making sure it all adds up...",
    "Running the numbers...",
  ],
  finalizing: [
    "Packing it up for your hive...",
    "Almost ready to show you...",
    "Wrapping things up...",
  ],
};

export const REASSURANCE_LINE = "Bev's working in the background. Feel free to navigate away — I'll let you know when she's done.";

// Starter clone copy. A starter pick is NOT an extraction — nothing is being
// read or counted — so it must NOT borrow the extraction-implying lines above.
// Honest setup copy in Bev's voice, played in the SAME loading treatment as a
// real import (the floating pill) so the pacing feels the same. The reassurance
// keeps the "look around" promise, which is honest: the pill never blocks.
export const STARTER_SETUP_COPY = [
  "Getting your pattern ready...",
  "Setting up your starter...",
];

export const STARTER_REASSURANCE_LINE = "Bev's getting it ready. Feel free to look around.";

export function pickPhaseCopy(phase) {
  const pool = phase && PHASE_COPY_POOLS[phase];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
