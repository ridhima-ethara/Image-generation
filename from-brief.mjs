#!/usr/bin/env node
// Design straight from a finished brief (skip the brief step): HTML design → browser checks →
// official logo → JPG → Claude QA → one correction round.
//   node from-brief.mjs briefs/name.json
// The JSON is a brief (see lib/brief.mjs) plus "width", "height" and optionally "caption".
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { OUT_DIR, brand } from "./lib/brand.mjs";
import { specText } from "./lib/brief.mjs";
import { designImage, blocking, storedHtml } from "./lib/design.mjs";
import { reviewImage, defectsAsProblems } from "./lib/qa.mjs";

const file = process.argv[2];
if (!file) { console.error("Usage: node from-brief.mjs brief.json"); process.exit(1); }
const brief = JSON.parse(await readFile(file, "utf8"));
const { width, height } = brief;
const caption = brief.caption || `${brief.thesis}\n${brief.subhead || ""}`;
const id = path.basename(file, ".json");
const log = (m) => console.log(`→ ${m}`);

await mkdir(OUT_DIR, { recursive: true });
const jpgPath = path.join(OUT_DIR, `${id}.jpg`);
const opts = { width, height, scale: 1, quality: 92, jpgPath };
console.log(`TEXT on the image:\n${specText(brief).map((t, i) => `  ${i + 1}. ${t}`).join("\n")}\n`);

let result = await designImage(brief, opts, log);
let qa = await reviewImage({ jpgPath, brief, caption }, log);
for (let i = 0; i < brand.models.qa.corrections && (qa.verdict === "REVISE" || qa.verdict === "REGENERATE"); i++) {
  log(`Correction round (${qa.verdict})…`);
  result = await designImage(brief, opts, log, { previous: result.design, problems: defectsAsProblems(qa), keepLayout: qa.verdict === "REVISE" });
  qa = await reviewImage({ jpgPath, brief, caption }, log);
}

const hard = blocking(result.problems);
await writeFile(path.join(OUT_DIR, `${id}.html`), storedHtml(brief, result.design, width, height));
await writeFile(path.join(OUT_DIR, `${id}.json`), JSON.stringify({ id, created: new Date().toISOString(), canvas: `${width}×${height}`, brief, design: result.design, logo: result.logoVariant, checks: { problems: result.problems }, qa }, null, 2));
const ok = qa.verdict === "PASS" && !hard.length;
console.log(`\n${ok ? "✓ ready" : "! needs_review"}  outputs/${id}.jpg  (${width}×${height})`);
if (result.problems.length) console.log(`Code checks: ${result.problems.join("; ")}`);
if (qa.defects?.length) console.log(`QA notes: ${qa.defects.map((d) => `${d.where}: ${d.problem}`).join("; ")}`);
