// Button the Mushroom, the free starter pattern, as structured data.
//
// WHY THIS FILE EXISTS
// The signup card promises "Includes Button the Mushroom, our free original,
// on the house." Until 2026-09-08 that promise was kept by making the new user
// run an import: fetch a PDF out of Supabase Storage, read it with pdf.js in
// the browser, queue a job, wait for a model to parse it, then confirm a review
// modal. Five steps, one model call, and a shared point of failure with every
// other import. When extraction broke, the promise broke with it and the
// account opened on an empty library ("Pattern fetch count: 0").
//
// A pattern Wovely wrote does not need to be re-read by a model on every
// signup. The parse is captured here once, verbatim from the extraction that
// produced it, and the account is seeded from this object. No network call, no
// model, no queue, nothing to fail.
//
// PROVENANCE
// Lifted from pattern 4d2a6d50-5498-4f99-b9eb-dcd2002c01c0 in Supabase on
// 2026-09-08. It is the most complete of the 22 extractions of
// starters/button-the-mushroom-v1.pdf then in the table (23 rows against a
// 20 to 23 spread; the shorter ones dropped the OPTIONAL and FINISH steps).
// Progress flags were cleared. source_file_url still points at the PDF, so
// "View source" opens the real document.
//
// Stitch counts check end to end: cap 6 -> 12 -> 18 -> 24 -> 30 -> 30 -> 24 ->
// 18, stem 6 -> 12 -> 18 held to 18.
//
// EDITING THIS FILE
// It is a fixture, not a cache. If the PDF changes, re-import it once, pull the
// row, and regenerate. Do not hand-edit rows without checking the counts.

export const STARTER_PATTERN = {
  "title": "Button the Mushroom",
  "cat": "Amigurumi",
  "source": "Wovely",
  "source_url": "",
  "notes": "",
  "pattern_notes": "Work in a continuous spiral. Do not join or turn at the end of a round. Place a stitch marker in the first stitch of each round and move it up as you go. The number in parentheses after each round is your stitch count for that round. Button is made in two pieces, a Cap and a Stem, then seamed together. Every piece opens with a magic ring pull tight 6 sc into a magic ring.",
  "difficulty": "Beginner",
  "weight": "Worsted or aran (medium, 4)",
  "hook": "3.5 mm",
  "gauge": {
    "rows": 16,
    "size": 4,
    "stitches": 12
  },
  "tags": [],
  "is_ai_generated": false,
  "extracted_by_ai": false,
  "image_url": "",
  "photo": "https://res.cloudinary.com/dmaupzhcx/image/upload/v1781136378/covers/zqo1rink0r0rbt7jvi1x.jpg",
  "cover_image_url": "https://res.cloudinary.com/dmaupzhcx/image/upload/v1781136378/covers/zqo1rink0r0rbt7jvi1x.jpg",
  "materials": [
    {
      "id": 1,
      "name": "Yarn, cap color",
      "notes": "Worsted or aran weight",
      "amount": "Less than half a ball",
      "yardage": 0
    },
    {
      "id": 2,
      "name": "Yarn, stem color",
      "notes": "Worsted or aran weight",
      "amount": "Less than half a ball",
      "yardage": 0
    },
    {
      "id": 3,
      "name": "Fiberfill",
      "notes": "",
      "amount": "Small amount",
      "yardage": 0
    },
    {
      "id": 4,
      "name": "Yarn needle",
      "notes": "",
      "amount": "1",
      "yardage": 0
    },
    {
      "id": 5,
      "name": "Stitch marker",
      "notes": "",
      "amount": "1",
      "yardage": 0
    }
  ],
  "rows": [
    {
      "id": "header-the-cap",
      "body": null,
      "done": false,
      "note": "",
      "text": "── THE CAP ──",
      "isHeader": true,
      "makeCount": 1,
      "independent": false,
      "componentName": "The Cap"
    },
    {
      "id": "row-1",
      "done": false,
      "note": "",
      "text": "SETUP: Make a magic ring with 6 sc (6)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": []
    },
    {
      "id": "row-2",
      "done": false,
      "note": "",
      "text": "RND 1: inc in each st around (12)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": []
    },
    {
      "id": "row-3",
      "done": false,
      "note": "",
      "text": "RND 2: (1 sc, inc) 6 times (18)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": [
        {
          "bracket": "(1 sc, inc)",
          "repeat_count": 6
        }
      ]
    },
    {
      "id": "row-4",
      "done": false,
      "note": "",
      "text": "RND 3: (2 sc, inc) 6 times (24)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": [
        {
          "bracket": "(2 sc, inc)",
          "repeat_count": 6
        }
      ]
    },
    {
      "id": "row-5",
      "done": false,
      "note": "",
      "text": "RND 4: (3 sc, inc) 6 times (30)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": [
        {
          "bracket": "(3 sc, inc)",
          "repeat_count": 6
        }
      ]
    },
    {
      "id": "row-6",
      "done": false,
      "note": "",
      "text": "RND 5: sc in each st around (30)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": []
    },
    {
      "id": "row-7",
      "done": false,
      "note": "",
      "text": "RND 6: sc in each st around (30)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": []
    },
    {
      "id": "row-8",
      "done": false,
      "note": "",
      "text": "RND 7: sc in each st around (30)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": []
    },
    {
      "id": "row-9",
      "done": false,
      "note": "",
      "text": "RND 8: (3 sc, dec) 6 times (24)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": [
        {
          "bracket": "(3 sc, dec)",
          "repeat_count": 6
        }
      ]
    },
    {
      "id": "row-10",
      "done": false,
      "note": "Stuff as you close. After Rnd 9 the cap is a firm little dome. Press in fiberfill before the opening gets too small to reach.",
      "text": "RND 9: (2 sc, dec) 6 times (18)",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": [
        {
          "bracket": "(2 sc, dec)",
          "repeat_count": 6
        }
      ]
    },
    {
      "id": "row-11",
      "done": false,
      "note": "",
      "text": "📌 FINISH: Fasten off and leave a long tail for seaming",
      "isAction": true,
      "componentName": "The Cap",
      "repeat_brackets": []
    },
    {
      "id": "row-12",
      "done": false,
      "note": "Plain caps are just as lovely, so this step is yours to take or skip.",
      "text": "OPTIONAL: Embroider a scatter of small white dots across the cap once it is closed for toadstool spots",
      "isAction": false,
      "componentName": "The Cap",
      "repeat_brackets": []
    },
    {
      "id": "header-the-stem",
      "body": null,
      "done": false,
      "note": "",
      "text": "── THE STEM ──",
      "isHeader": true,
      "makeCount": 1,
      "independent": false,
      "componentName": "The Stem"
    },
    {
      "id": "row-13",
      "done": false,
      "note": "",
      "text": "SETUP: Make a magic ring with 6 sc (6)",
      "isAction": false,
      "componentName": "The Stem",
      "repeat_brackets": []
    },
    {
      "id": "row-14",
      "done": false,
      "note": "",
      "text": "RND 1: inc in each st around (12)",
      "isAction": false,
      "componentName": "The Stem",
      "repeat_brackets": []
    },
    {
      "id": "row-15",
      "done": false,
      "note": "",
      "text": "RND 2: (1 sc, inc) 6 times (18)",
      "isAction": false,
      "componentName": "The Stem",
      "repeat_brackets": [
        {
          "bracket": "(1 sc, inc)",
          "repeat_count": 6
        }
      ]
    },
    {
      "id": "row-16",
      "done": false,
      "note": "Rnd 3 worked in back loops only leaves a tidy ridge, so the stem sits flat and stands on its own.",
      "text": "RND 3: sc in each st around, back loops only (18)",
      "isAction": false,
      "componentName": "The Stem",
      "repeat_brackets": []
    },
    {
      "id": "row-17",
      "done": false,
      "note": "",
      "text": "RND 4: sc in each st around (18)",
      "isAction": false,
      "componentName": "The Stem",
      "repeat_brackets": []
    },
    {
      "id": "row-18",
      "done": false,
      "note": "",
      "text": "RND 5: sc in each st around (18)",
      "isAction": false,
      "componentName": "The Stem",
      "repeat_brackets": []
    },
    {
      "id": "row-19",
      "done": false,
      "note": "",
      "text": "RND 6: sc in each st around (18)",
      "isAction": false,
      "componentName": "The Stem",
      "repeat_brackets": []
    },
    {
      "id": "row-20",
      "done": false,
      "note": "",
      "text": "RND 7: sc in each st around (18)",
      "isAction": false,
      "componentName": "The Stem",
      "repeat_brackets": []
    },
    {
      "id": "row-21",
      "done": false,
      "note": "The stem stays soft enough to seam, firm enough to stand. Fill it loosely.",
      "text": "📌 FINISH: Stuff lightly and fasten off with a long tail",
      "isAction": true,
      "componentName": "The Stem",
      "repeat_brackets": []
    }
  ],
  "rating": 0,
  "yardage": 0,
  "skeins": 0,
  "skeinYards": 200,
  "dimensions": {
    "width": 50,
    "height": 60
  },
  "components": [
    {
      "name": "The Cap",
      "rows": [
        {
          "id": "cap-setup",
          "note": null,
          "text": "Make a magic ring with 6 sc",
          "label": "SETUP",
          "action_item": false,
          "stitch_count": 6,
          "repeat_brackets": []
        },
        {
          "id": "rnd-1",
          "note": null,
          "text": "inc in each st around",
          "label": "RND 1",
          "action_item": false,
          "stitch_count": 12,
          "repeat_brackets": []
        },
        {
          "id": "rnd-2",
          "note": null,
          "text": "(1 sc, inc) 6 times",
          "label": "RND 2",
          "action_item": false,
          "stitch_count": 18,
          "repeat_brackets": [
            {
              "bracket": "(1 sc, inc)",
              "repeat_count": 6
            }
          ]
        },
        {
          "id": "rnd-3",
          "note": null,
          "text": "(2 sc, inc) 6 times",
          "label": "RND 3",
          "action_item": false,
          "stitch_count": 24,
          "repeat_brackets": [
            {
              "bracket": "(2 sc, inc)",
              "repeat_count": 6
            }
          ]
        },
        {
          "id": "rnd-4",
          "note": null,
          "text": "(3 sc, inc) 6 times",
          "label": "RND 4",
          "action_item": false,
          "stitch_count": 30,
          "repeat_brackets": [
            {
              "bracket": "(3 sc, inc)",
              "repeat_count": 6
            }
          ]
        },
        {
          "id": "rnd-5",
          "note": null,
          "text": "sc in each st around",
          "label": "RND 5",
          "action_item": false,
          "stitch_count": 30,
          "repeat_brackets": []
        },
        {
          "id": "rnd-6",
          "note": null,
          "text": "sc in each st around",
          "label": "RND 6",
          "action_item": false,
          "stitch_count": 30,
          "repeat_brackets": []
        },
        {
          "id": "rnd-7",
          "note": null,
          "text": "sc in each st around",
          "label": "RND 7",
          "action_item": false,
          "stitch_count": 30,
          "repeat_brackets": []
        },
        {
          "id": "rnd-8",
          "note": null,
          "text": "(3 sc, dec) 6 times",
          "label": "RND 8",
          "action_item": false,
          "stitch_count": 24,
          "repeat_brackets": [
            {
              "bracket": "(3 sc, dec)",
              "repeat_count": 6
            }
          ]
        },
        {
          "id": "rnd-9",
          "note": "Stuff as you close. After Rnd 9 the cap is a firm little dome. Press in fiberfill before the opening gets too small to reach.",
          "text": "(2 sc, dec) 6 times",
          "label": "RND 9",
          "action_item": false,
          "stitch_count": 18,
          "repeat_brackets": [
            {
              "bracket": "(2 sc, dec)",
              "repeat_count": 6
            }
          ]
        },
        {
          "id": "cap-finish",
          "note": null,
          "text": "Fasten off and leave a long tail for seaming",
          "label": "FINISH",
          "action_item": true,
          "stitch_count": null,
          "repeat_brackets": []
        },
        {
          "id": "cap-optional",
          "note": "Plain caps are just as lovely, so this step is yours to take or skip.",
          "text": "Embroider a scatter of small white dots across the cap once it is closed for toadstool spots",
          "label": "OPTIONAL",
          "action_item": false,
          "stitch_count": null,
          "repeat_brackets": []
        }
      ],
      "make_count": 1,
      "independent": false
    },
    {
      "name": "The Stem",
      "rows": [
        {
          "id": "stem-setup",
          "note": null,
          "text": "Make a magic ring with 6 sc",
          "label": "SETUP",
          "action_item": false,
          "stitch_count": 6,
          "repeat_brackets": []
        },
        {
          "id": "rnd-1",
          "note": null,
          "text": "inc in each st around",
          "label": "RND 1",
          "action_item": false,
          "stitch_count": 12,
          "repeat_brackets": []
        },
        {
          "id": "rnd-2",
          "note": null,
          "text": "(1 sc, inc) 6 times",
          "label": "RND 2",
          "action_item": false,
          "stitch_count": 18,
          "repeat_brackets": [
            {
              "bracket": "(1 sc, inc)",
              "repeat_count": 6
            }
          ]
        },
        {
          "id": "rnd-3",
          "note": "Rnd 3 worked in back loops only leaves a tidy ridge, so the stem sits flat and stands on its own.",
          "text": "sc in each st around, back loops only",
          "label": "RND 3",
          "action_item": false,
          "stitch_count": 18,
          "repeat_brackets": []
        },
        {
          "id": "rnd-4",
          "note": null,
          "text": "sc in each st around",
          "label": "RND 4",
          "action_item": false,
          "stitch_count": 18,
          "repeat_brackets": []
        },
        {
          "id": "rnd-5",
          "note": null,
          "text": "sc in each st around",
          "label": "RND 5",
          "action_item": false,
          "stitch_count": 18,
          "repeat_brackets": []
        },
        {
          "id": "rnd-6",
          "note": null,
          "text": "sc in each st around",
          "label": "RND 6",
          "action_item": false,
          "stitch_count": 18,
          "repeat_brackets": []
        },
        {
          "id": "rnd-7",
          "note": null,
          "text": "sc in each st around",
          "label": "RND 7",
          "action_item": false,
          "stitch_count": 18,
          "repeat_brackets": []
        },
        {
          "id": "stem-finish",
          "note": "The stem stays soft enough to seam, firm enough to stand. Fill it loosely.",
          "text": "Stuff lightly and fasten off with a long tail",
          "label": "FINISH",
          "action_item": true,
          "stitch_count": null,
          "repeat_brackets": []
        }
      ],
      "make_count": 1,
      "independent": false
    }
  ],
  "source_file_url": "https://vbtsdyxvqqwxjzpuseaf.supabase.co/storage/v1/object/public/pattern-files/starters/button-the-mushroom-v1.pdf",
  "source_file_name": "button-the-mushroom-v1.pdf",
  "source_file_type": "application/pdf",
  "validation_flags": null,
  "validation_report": null
};

// Deep clone so a caller mutating the pattern it was handed (checking a row,
// renaming it) can never write back into the module-level fixture and hand the
// next account a half-finished mushroom.
export const buildStarterPattern = () => JSON.parse(JSON.stringify(STARTER_PATTERN));

// Local pattern shape -> the patterns table row shape. Mirrors the mapping in
// App.jsx handleAddPattern so a seeded starter and an imported pattern land as
// the same kind of row.
export const starterPatternRow = (userId) => {
  const p = buildStarterPattern();
  return {
    user_id: userId,
    title: p.title,
    cat: p.cat,
    source: p.source,
    source_url: p.source_url,
    notes: p.notes,
    pattern_notes: p.pattern_notes,
    difficulty: p.difficulty,
    yarn_weight: p.weight,
    hook_size: p.hook,
    weight: p.weight,
    hook: p.hook,
    gauge: p.gauge,
    tags: p.tags,
    is_ai_generated: p.is_ai_generated,
    extracted_by_ai: p.extracted_by_ai,
    is_starter: true,
    image_url: p.image_url,
    photo: p.photo,
    cover_image_url: p.cover_image_url,
    row_count: p.rows.length,
    materials: p.materials,
    rows: p.rows,
    rating: p.rating,
    yardage: p.yardage,
    skeins: p.skeins,
    skein_yards: p.skeinYards,
    dimensions: p.dimensions,
    source_file_url: p.source_file_url,
    source_file_name: p.source_file_name,
    source_file_type: p.source_file_type,
    components: p.components,
    validation_flags: p.validation_flags,
    validation_report: p.validation_report,
  };
};
