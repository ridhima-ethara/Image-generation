#!/usr/bin/env node
// Scene mode: a metaphor-scene prompt (written for an image model) → Claude designs it as an
// HTML/SVG illustration → Chromium renders it → code checks (no text, exact size, brand
// palette, static page) → Claude reviews the image → one correction round.
//   node scene.mjs prompt.txt [--size 1600x900] [--out name]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { brand, OUT_DIR } from "./lib/brand.mjs";
import { runClaude, fenced, parseJson } from "./lib/claude.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : dflt; };
const size = opt("--size", "");
const outName = opt("--out", "");
const promptFile = args[0];
if (!promptFile) { console.error("Usage: node scene.mjs prompt.txt [--size 1600x900] [--out name]"); process.exit(1); }
const prompt = (await readFile(promptFile, "utf8")).trim();
const sizeMatch = /(\d{3,4})\s*[×x]\s*(\d{3,4})/.exec(size || prompt.match(/Size:\s*([^\n.]+)/i)?.[1] || "1600x900");
const W = Number(sizeMatch[1]), H = Number(sizeMatch[2]);
const log = (m) => console.log(`→ ${m}`);

const PALETTE = [...Object.entries(brand.accents).filter(([k]) => k !== "magenta").map(([, v]) => v), ...brand.neutrals].map((c) => c.toUpperCase());

const SYSTEM = `You are a senior editorial illustrator for Ethara.AI. You receive a scene prompt that was written for a photographic image model. You build that same scene as ONE self-contained HTML page with an inline SVG illustration, rendered in Chromium to an image of exactly ${W}x${H}px.

Make it as close to the prompt's look as vector art can get: a premium, highly detailed, physically lit illustration (layered gradients, soft shadows, specular highlights, depth, believable materials) — not flat clip-art, not a wireframe. Follow the prompt's subject, composition, camera angle, palette, reserved empty zones and exclusions exactly. Every part the prompt asks to be visible must sit at the coordinates it gives (percent across = x of ${W}, percent down = y of ${H}) and be clearly distinct and subtly lit.

HARD RULES
- Exactly ${W}x${H}px: html, body { margin:0; width:${W}px; height:${H}px; overflow:hidden; } and one <svg width="${W}" height="${H}">.
- NO text of any kind: no letters, numerals, labels, logos, watermarks, no SVG <text>, no HTML text nodes. Words, labels, leader lines and the logo are added later by code.
- Colours: only these hex values, or rgba()/stop-opacity of them: ${PALETTE.join(", ")}.
- Static and self-contained: no <script>, event handlers, external URLs, @import, fonts or images.

OUTPUT: one \`\`\`html block containing the full document, nothing else.`;

const HEX = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g;
function staticProblems(html) {
  const p = [];
  if (/<\s*script|\son[a-z]+\s*=|@import|<\s*(link|iframe|img)\b/i.test(html)) p.push("Remove scripts, event handlers, @import, <link>, <iframe> and <img>: the page must be static and self-contained");
  if (/(src|href)\s*=\s*['"]?https?:|url\(\s*['"]?https?:/i.test(html)) p.push("Remove external URLs");
  if (/<\s*(text|tspan|textpath)\b/i.test(html)) p.push("Remove SVG <text>: the scene carries no words or numerals");
  const bad = new Set();
  for (const m of html.matchAll(HEX)) {
    let v = m[1]; if (v.length === 3) v = [...v].map((c) => c + c).join("");
    if (!PALETTE.includes(`#${v.toUpperCase()}`)) bad.add(`#${v.toUpperCase()}`);
  }
  if (bad.size) p.push(`Colours outside the brand palette: ${[...bad].slice(0, 10).join(", ")}. Use only ${PALETTE.join(", ")} (or rgba of them)`);
  return p;
}

async function render(html, jpg) {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, offline: true });
    const p = await ctx.newPage();
    await p.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
    await p.setContent(html, { waitUntil: "load" });
    const seen = await p.evaluate(() => ({
      text: document.body.innerText.trim(),
      svgs: document.querySelectorAll("svg").length,
      w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight,
    }));
    const png = await p.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
    // reduce the 2x render to the exact canvas with high-quality resampling
    const jpgB64 = await p.evaluate(async ({ src, w, h }) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.94).split(",")[1];
    }, { src: "data:image/png;base64," + png.toString("base64"), w: W, h: H });
    await writeFile(jpg, Buffer.from(jpgB64, "base64"));
    const problems = [];
    if (seen.text) problems.push(`Visible text found on the page: "${seen.text.slice(0, 80)}". Remove all text`);
    if (!seen.svgs) problems.push("No <svg> found: draw the scene as inline SVG");
    return problems;
  } finally {
    await b.close();
  }
}

const QA_SYSTEM = `You review one illustration against the scene prompt it was built from. Open the image file with the Read tool and look carefully.
It is an HTML/SVG illustration by design: never ask for a real photograph or flag "not photorealistic"; judge how premium, detailed and physically lit it is as an illustration.
Judge: is it ONE coherent subject as described (no doubled or overlapping objects)? Are the named parts visible, distinct, subtly lit and at the requested positions? Is the left ~40% clean negative space and the top-left corner clear? Palette dark with purple only as an accent? Any text, numerals or labels (there must be none)? Does it look premium and detailed, and read at thumbnail size?
Reply with ONE \`\`\`json block: {"verdict":"PASS|REVISE","defects":[{"where":"…","problem":"…","fix":"concrete instruction for the illustrator"}],"summary":"one sentence"}`;

async function review(jpg) {
  const reply = await runClaude({
    system: QA_SYSTEM,
    user: `IMAGE FILE: ${jpg}\n\nSCENE PROMPT:\n${prompt}`,
    model: brand.models.qa.model, effort: brand.models.qa.effort, timeoutS: brand.models.qa.timeout_s,
    tools: "Read", addDir: path.dirname(jpg),
  });
  try { return parseJson(reply); } catch { return { verdict: "UNREADABLE", defects: [], summary: reply.slice(0, 200) }; }
}

await mkdir(OUT_DIR, { recursive: true });
const id = outName || `scene-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
const jpg = path.join(OUT_DIR, `${id}.jpg`);
const cfg = brand.models.design;
let html = null, problems = [], qa = null;
const maxRounds = cfg.rounds + 1 + brand.models.qa.corrections;

for (let round = 0; round < maxRounds; round++) {
  log(round === 0 ? `Claude (${cfg.model}) is building the ${W}x${H} scene…` : `Claude is fixing ${problems.length} problem(s), round ${round}…`);
  let user = `SCENE PROMPT:\n${prompt}\n`;
  if (html) user += `\nCURRENT VERSION (keep what works; change only what the problems require):\n\`\`\`html\n${html}\n\`\`\`\n`;
  if (problems.length) user += `\nFIX THESE PROBLEMS:\n${problems.map((p) => `- ${p}`).join("\n")}\n`;
  let reply;
  try {
    reply = await runClaude({ system: SYSTEM, user, model: cfg.model, effort: cfg.effort, timeoutS: 600 });
  } catch (e) {
    if (!html) throw e;
    log(`${e.message.split("\n")[0]} — keeping the last rendered version`);
    break;
  }
  const next = fenced(reply, "html");
  if (!next) { problems = ["Reply must be one ```html block with the full document"]; continue; }
  html = next;
  problems = staticProblems(html);
  if (problems.length && round < maxRounds - 1) { log(`Code checks: ${problems.join("; ").slice(0, 200)}`); continue; }
  log("Rendering in Chromium…");
  problems = problems.concat(await render(html, jpg));
  if (problems.length) { log(`Render checks: ${problems.join("; ").slice(0, 200)}`); continue; }
  log("Claude QA is reviewing the image…");
  qa = await review(jpg);
  log(`QA: ${qa.verdict}${qa.summary ? " — " + qa.summary : ""}`);
  if (qa.verdict !== "REVISE" || round >= maxRounds - 1) break;
  problems = (qa.defects || []).map((d) => `${d.where}: ${d.problem} → ${d.fix}`);
  if (!problems.length) break;
}

await writeFile(path.join(OUT_DIR, `${id}.html`), html || "");
await writeFile(path.join(OUT_DIR, `${id}.json`.replace(".json", ".scene.json")), JSON.stringify({ id, created: new Date().toISOString(), size: `${W}x${H}`, prompt, qa, problems }, null, 2));
console.log(`\n${qa?.verdict === "PASS" && !problems.length ? "✓" : "!"} outputs/${id}.jpg  (${W}x${H})${problems.length ? "  open problems: " + problems.join("; ") : ""}`);
