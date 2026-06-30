# Stitch Extraction Spec

You extract stitch library entries from screenshot images authored by Dani LaBare for the Wovely Stitch Library.

## What is a stitch entry?
- A stitch name header
- A sample swatch image
- A description and/or row-by-row instructions

## What to skip (log to entries_skipped with a reason)
- Table of contents pages
- Section header pages with no stitch detail
- Blank pages
- Chart-symbol legends/keys (a grid of small symbols with their meanings is NOT a stitch)
- Copyright pages
- Generic intro pages
- A continuation of a stitch from a prior screenshot — reason: "continuation of [primary_name]"

A single screenshot may contain multiple stitches stacked vertically — extract each separately.

## Output fields per stitch
- `primary_name`: exactly as printed (clean of formatting marks). Title Case as printed.
- `slug`: lowercase kebab-case, alphanumeric + hyphens only. Strip apostrophes, ampersands, parentheses, quotes, periods, slashes. Collapse multiple hyphens.
- `also_known_as`: array of alternate names if printed (look for "also known as", "aka", "or", parenthetical synonyms). Empty array if none.
- `description`: full description text verbatim. Preserve paragraph breaks as `\n\n`. Do NOT include row instructions.
- `instructions`: row-by-row or step-by-step instructions verbatim if present. Multi-line joined with `\n`. null if absent.
- `dimension`: one of `stitch_technique` | `pattern_arrangement` | `construction_method`. Default `stitch_technique`. Use `pattern_arrangement` for repeating multi-row patterns, `construction_method` for whole-piece techniques (joining, edging).
- `difficulty`: `beginner` | `intermediate` | `advanced` | null. Infer from instruction complexity. null if unclear.
- `common_uses`: array of use cases mentioned (e.g. "blankets", "edging", "scrubbies", "garments"). Empty if none.
- `visual_cues`: array of visual identifiers (e.g. "raised texture", "V-shape", "horizontal ridges", "dense fabric"). Empty if none.
- `source_filename`: just the filename, not full path.

## Rules
- DO NOT HALLUCINATE. Missing field → null/empty array.
- DO NOT PARAPHRASE. Preserve Dani's voice verbatim.
- Within-chunk dedup: same `primary_name` twice → keep first, log second to `duplicates_skipped`.
- Cross-chunk dedup: caller will provide a list of already-extracted slugs/names to skip. Treat those as duplicates too.

## Output JSON shape
```json
{
  "stitches": [ { primary_name, slug, also_known_as, description, instructions, dimension, difficulty, common_uses, visual_cues, source_filename }, ... ],
  "entries_skipped": [ { source_filename, reason }, ... ],
  "duplicates_skipped": [ { primary_name, source_filename }, ... ]
}
```

## Process
1. Read your filelist to get the screenshot paths.
2. Read each image with the Read tool.
3. Build the output JSON per the shape above.
4. Write it using the Write tool to your assigned output path.
5. Return a short summary: stitches extracted, entries skipped, duplicates skipped, any unreadable images.

Every input file must produce either a stitch entry or an `entries_skipped` entry — no silent drops.
