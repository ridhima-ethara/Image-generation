# Ethara Image Agent

Caption → Claude brief → Claude HTML design → browser checks → official logo → JPG → Claude QA.
Runs through the local `claude` CLI (your Claude Code login, no API key).

## Use

```bash
npm start    # → http://127.0.0.1:4317
```

Paste the caption, pick the platform (the platform sets the canvas size), and optionally add
the source text and source line (needed for any figures). Click **Generate**. To change a
finished image, use **Edit this image**: it keeps the design and changes only what you ask.

Command line: `node generate.mjs "caption" --platform linkedin [--format data_chart] [--evidence-file src.txt] [--from "Lu et al., arXiv 2611.10866"]`

## Where each rule lives

| What | File |
|---|---|
| Colours, fonts, logo, canvas sizes, models and limits | `brand/brand.json` |
| Logo PNGs and Roboto / DM Sans font files (copied from the SMA repo) | `brand/` |
| Brief rules: thesis, formats, word limits, scoring | `lib/brief.mjs` (`SYSTEM`) |
| Brief code checks: word limits, numbers vs source, chart qualifiers, units, banned words, palette | `lib/brief.mjs` (`checkBrief`) |
| Per-format rules and golden examples | `rules/formats.md`, `rules/golden.jsonl` |
| HTML designer prompt and browser checks (text readback, logo band, one-line title, fonts, min size, palette) | `lib/design.mjs` |
| QA prompt (PASS / REVISE / REGENERATE) | `lib/qa.mjs` |
| Lessons and extra rules added from the UI | `brand/notes.md` |

Outputs: `outputs/<id>.jpg`, `.html` (the rendered page), and `.json` (the brief, design, checks and QA).
