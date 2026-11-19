// Formats B, C, D: Claude designs an HTML/CSS page from the brief's spec; code wraps it (brand
// fonts embedded, strict content policy, no network), renders it in Chromium at the exact canvas,
// reads the text back and checks it, then places the official logo and exports the JPG.
// Port of agents/image/render/html_design.py.
import { chromium } from "playwright";
import { brand, geometry, palette, fontFaceCss, logoDataUrls } from "./brand.mjs";
import { fenced } from "./claude.mjs";
import { runStage } from "./llm.mjs";
import { specText, plainTitle, chartAmount, CHART_BARS } from "./brief.mjs";

// ---- prompt -------------------------------------------------------------------------------

const SYSTEM = `You are the senior information designer for Ethara.AI's social media images. You turn one image brief's spec into a finished, premium editorial graphic, built as an HTML page rendered to an image at an exact size. The brief decides every word; you decide the design: layout, scale, hierarchy, cards, icons and shapes.

THE STANDARD
Design it the way a top editorial data designer would for a LinkedIn audience of AI researchers and engineers: one clear focal point that carries the post's thesis, a strong reading order (title, then the key figure or structure, then support), generous but purposeful space, nothing that merely decorates. The image must read at phone size. Fill the canvas with the design: no large empty bands.

EDITORIAL SYSTEM (the look: a top consultancy or research-lab report, not an AI poster)
- Strict grid. The page has one margin M on all four sides and a 12-column grid with one gutter (numbers in the request). Every block starts and ends on a column edge. The title, subhead and the leftmost block share ONE left edge (x = M); the rightmost block ends exactly at the right margin; the last element ends exactly at the bottom margin (y = height - M). No element is "nearly" aligned.
- Equal spacing. One gutter between all cards in a row and between all cards in a column. Cards in the same row that have the same width have the same height. Vertical rhythm from the spacing scale only (8/16/24/32/48/64).
- BUILD THE LAYOUT FROM THE SKELETON CLASSES. They already guarantee the alignment this brief demands, so you do not compute positions:
  .page — the whole content box. It already starts BELOW the logo band and ends on the bottom margin, with a uniform gap between children. Put your blocks straight into it, in order, and never add top offsets to clear the logo.
  .grow — a block inside .page that takes the remaining height, so the last element always lands on the bottom margin.
  .cols — two columns of equal width whose cards stretch to the SAME height and END ON ONE BOTTOM EDGE. Use this for any side-by-side comparison; it makes unequal column heights impossible.
  .row — any number of equal-width cards in one row, all the same height, one gutter between them.
  .stack — a vertical stack with ONE uniform gap; .stack--even makes every child the same height.
  .grid2 — a 2x2 grid, equal cells.
  .bars — full-width rows for chart bars.
  .foot — pins the source line to the bottom of its container.
  Nest them (.page > .cols > .stack) rather than positioning anything absolutely. Only use absolute positioning for connector SVGs.
- Use the COMPONENT CLASSES provided (they carry all colours, type, borders and radii): .title (with <em> for the highlight word), .subhead, .eyebrow, .card and .card--hl, .chip (holds one 24px line-icon <svg>), .h3, .body, .stat, .track/.bar/.bar--hl, .line/.line--hl, .connector-label, .source. Your CSS does LAYOUT ONLY: position, display, grid, flex, gap, width, height, top/left, margin, padding, align/justify, and font-size on .title/.stat when a size must fit. Do not restyle colours, borders, radii or fonts.
- Flat and precise. No glows, shadows, blur, gradients, orbs, halos, textures, dotted backgrounds or decorative shapes. Hierarchy comes only from size, weight, position and the single purple accent on the thesis element (.card--hl, <em> in the title, .bar--hl, .line--hl).
- Connectors are straight or right-angled (orthogonal elbows), 2px, drawn in inline SVG or as .line divs, with a small solid arrowhead; never curves. A connector runs edge-to-edge between the cards it joins, centred on their sides, and its label (.connector-label) sits on a clear stretch of the line, never touching a card.
- Text never touches or overlaps a card it is not inside; every card's content keeps at least the standard card padding from its edges.
- A card that holds text is sized BY its text: use min-height, never a fixed height with overflow:hidden, and never clip a card's content. To make two columns end level, even up what is IN them (equal cards per side), not by cropping a card.
- Because the skeletons own the geometry, do not set explicit left/top/width/height on content blocks, and do not hand-compute column maths. Let .page, .cols, .row and .stack place everything; only sizes that must fit (a title font-size, a bar width percentage) are yours to set.

NO INVENTED DATA (the most important rule)
- Draw a bar, column, gauge, progress track, sparkline or any shape whose size or position reads as a measurement ONLY for the spec's chart bars, scaled exactly to their figures. Never add decorative, unlabelled or illustrative charts, bars of made-up heights, hatched "loss" areas, or brackets and markers that suggest values the spec does not give.
- A stat card shows its figure as text only. A comparison without figures (before/after, A vs B) uses structure, not drawn quantities.

BRAND (fixed)
- Colours: come from the component classes. If an SVG needs a colour, use ONLY the hex values listed in the request. The page ground is flat near-black (already set).
- The highlight purple marks the ONE thing the thesis is about (a word in the title, a bar, a node or a card). Warnings, losses and contrasts stay in the purple family and greys.
- Fonts: 'Roboto' (titles, figures; weights 300-700) and 'DM Sans' (support text, labels; weights 400-700). They are already loaded: never add @font-face, @import or links.
- The logo is added afterwards by code in the top-left corner. The LOGO BAND given below runs the full width of the canvas: no text anywhere in it, and the top-left corner is pure background (no shapes, lines, dots or glows). The logo sits ABOVE the title, never beside it on the same height: the title starts JUST below the band (within {gap}px of it), left-aligned under the logo: a tight logo-then-title stack, with no empty gap between them.
- The title (main heading) is ONE line, never wrapped: size it to fit the width in one line (at least {titleMin}px; the spec keeps titles short so they fit).

TEXT (checked by code after rendering; any mismatch sends the design back)
- The page carries EXACTLY the strings listed under TEXT, each once, spelled exactly. You may split a string across elements (a big number and a small unit) as long as it reads in order; CSS text-transform is fine.
- No other text at all: no axis numbers or tick labels, no legends, no extra titles, no "Source:" unless it is in a given string, no emoji, no letters inside icons, no SVG <text>. Shapes, lines and icons carry no words.
- In the title, the word between *asterisks* is set in the highlight purple; the asterisks are not shown.
- Smallest type: {minText}px. Nothing may be cut off, overflow its box, touch a card's border or leave the canvas: give every card padding of at least 4% of the short side on all sides.

FORMAT RULES
- data_chart: one full-width .card per bar, stacked in the given order with one gutter between them; inside each: label (.body or .h3) and value (.stat) on one line, then a .track holding a .bar on ONE shared scale from zero: for percentages the track is 0-100% and a bar's width is EXACTLY its figure % of the track (79.5% fills 79.5%); for other units the track is 0 to the largest figure, so that bar fills it. A range "a-b" is drawn from a to b. The qualifier ("up to", "within", "about") sits small beside the value. The thesis bar's card is .card--hl with .bar--hl; the others plain. Insight cards, if any, go in ONE equal-width row BELOW the bars (never a side column). The .source sits at the foot, starting at the left margin, ending at the bottom margin.
- Every card is sized to its content and its row: no card with a large empty band inside it. Equal gaps between equal items.
- Icons: simple 24px line icons (stroke only, no fill) inside a .chip, naming the thing literally. Never a light bulb, brain, robot or rocket.
- systems_diagram: nodes are .card elements of ONE size per rank, placed on the grid; straight or elbow connectors between them with .connector-label text; pipelines left to right in one row (or a clean 2-row snake on square canvases), branches fan out with right-angle elbows from one point, loops as a rectangle of nodes running clockwise. The node the thesis is about is .card--hl and its incoming connector .line--hl. Role colours (if any) only as a 4px left border stripe on the node card.
- branded_infographic: .eyebrow then the nodes as a clean structure (an equal-width row, a 2x2 grid, or a two-column comparison), then .eyebrow "KEY INSIGHTS" and up to 4 equal insight cards in one row or a 2x2 grid. A card's figure is .stat; a card without a figure aligns its text to the same baseline as its neighbours' captions.

TECHNICAL
- Your CSS and body are inserted into the <style> and <body> of a page whose body is exactly {width}x{height}px; set html, body { margin:0; width:{width}px; height:{height}px; overflow:hidden; } and lay out inside it in px.
- Inline SVG only for icons and arrows. No <script>, event handlers, <img> with URLs, iframes or external resources (the renderer blocks the network).

OUTPUT: exactly two fenced blocks and nothing else: first \`\`\`css (all the CSS, no <style> tags), then \`\`\`html (the inner HTML of <body>).`;

function spec(b) {
  const lines = [`Format: ${b.format}`, `Theme: ${b.theme || "dark"}`, `Thesis (what the image must argue): ${b.thesis}`];
  if (b.rationale) lines.push(`Why this picture: ${b.rationale}`);
  lines.push(`Title: ${b.title}`);
  if (b.subhead) lines.push(`Subhead: ${b.subhead}`);
  if (b.format === "data_chart" && b.chart) {
    lines.push(`Metric: ${b.chart.metric}`);
    for (const bar of b.chart.bars.slice(0, CHART_BARS))
      lines.push(`Bar: ${bar.label} = ${bar.value} (figure ${chartAmount(bar.value)})${bar.highlight ? " [HIGHLIGHT: the thesis bar]" : ""}`);
    if (b.chart.source) lines.push(`Source: ${b.chart.source}`);
  }
  const byId = new Map((b.nodes || []).map((n) => [n.id, n]));
  for (const g of b.groups || []) {
    const members = (g.nodes || []).map((id) => byId.get(id)?.label).filter(Boolean);
    lines.push(`Group ${g.id} [${g.role}]${g.label ? ` "${g.label}"` : ""}: ${members.join(", ")}`);
  }
  if ((b.groups || []).some((g) => g.role === "side_a" || g.role === "side_b"))
    lines.push(`STRUCTURE: side_a and side_b are the two halves of the comparison. Draw them as two columns of EQUAL width that start at the same y and end on the same bottom edge, with the same number of equally sized cards in each. Any consequence group goes in a full-width row BELOW both columns, never inside one of them.`);
  for (const n of b.nodes || []) lines.push(`Node ${n.id}: ${n.label}${n.role ? ` — ${n.role}` : ""} [icon ${n.icon}, colour ${n.color_role}]`);
  const ids = new Set((b.nodes || []).map((n) => n.id));
  for (const e of b.edges || []) if (ids.has(e.from) && ids.has(e.to)) lines.push(`Edge ${e.from} -> ${e.to}${e.label ? ` "${e.label}"` : ""} [colour ${e.color_role}]`);
  for (const c of (b.insight_cards || []).slice(0, 4)) lines.push(`Insight card: ${c.value ? c.value + " — " : ""}${c.caption} [icon ${c.icon}]`);
  if (b.layout_wishes) lines.push(`Layout wishes: ${b.layout_wishes.replace(/finish\s+\w+/i, "finish flat")}`);
  return lines.join("\n");
}

/** The grid and type scale every design is built on. */
export function grid(width, height) {
  const g = geometry(width, height);
  const S = g.short, M = g.margin, G = 24, CW = width - 2 * M;
  const col = (CW - 11 * G) / 12;
  return {
    M, G, CW, col,
    pad: Math.round(S * 0.03), // card padding
    title: Math.round(S * 0.056), h3: Math.round(S * 0.03), bodyLg: Math.round(S * 0.026),
    body: g.minText, small: g.minText, stat: Math.round(S * 0.07),
  };
}

// The component classes: all colour, type, border and radius live here, not in Claude's CSS.
function systemCss(width, height) {
  const k = grid(width, height);
  return `
:root{--m:${k.M}px;--g:${k.G}px;--pad:${k.pad}px;--band:${geometry(width, height).band + geometry(width, height).gap}px}
body{background:#0B0E14;color:#E6E8EF;font-family:'DM Sans',sans-serif;position:relative}
.title{font-family:'Roboto';font-weight:700;font-size:${k.title}px;line-height:1.1;letter-spacing:-0.01em;color:#FFFFFF;margin:0;white-space:nowrap}
.title em{font-style:normal;color:#A855F7}
.subhead{font-family:'DM Sans';font-weight:400;font-size:${k.bodyLg}px;line-height:1.35;color:#8A8FA5;margin:0}
.eyebrow{font-family:'DM Sans';font-weight:600;font-size:${k.small}px;line-height:1;letter-spacing:.12em;text-transform:uppercase;color:#A855F7;margin:0}
.card{background:#121724;border:1px solid #1F2433;border-radius:16px;padding:var(--pad);box-sizing:border-box;position:relative}
.card--hl{background:rgba(139,44,245,0.10);border-color:#8B2CF5}
.chip{width:48px;height:48px;border-radius:12px;background:#1F2433;display:flex;align-items:center;justify-content:center;color:#A855F7;flex:none}
.chip svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.card--hl .chip{background:#8B2CF5;color:#FFFFFF}
.h3{font-family:'Roboto';font-weight:600;font-size:${k.h3}px;line-height:1.2;color:#FFFFFF;margin:0}
.body{font-family:'DM Sans';font-weight:400;font-size:${k.body}px;line-height:1.4;color:#8A8FA5;margin:0}
.stat{font-family:'Roboto';font-weight:700;font-size:${k.stat}px;line-height:1;letter-spacing:-0.02em;color:#FFFFFF;margin:0}
.card--hl .stat{color:#A855F7}
.track{height:12px;border-radius:6px;background:#1F2433;position:relative;overflow:hidden}
.bar{height:12px;border-radius:6px;background:#3A3F55}
.bar--hl{background:#8B2CF5}
.line{background:#3A3F55}
.line--hl{background:#8B2CF5}
.connector-label{font-family:'DM Sans';font-weight:500;font-size:${k.small}px;line-height:1;color:#8A8FA5;background:#0B0E14;padding:0 8px;white-space:nowrap}
.source{font-family:'DM Sans';font-weight:400;font-size:${k.small}px;line-height:1.3;color:#8A8FA5;margin:0}

/* LAYOUT SKELETONS — use these instead of writing your own positioning.
   They are pre-built so that equal things stay equal and gaps stay uniform. */
.page{position:absolute;left:var(--m);top:var(--band);right:var(--m);bottom:var(--m);display:flex;flex-direction:column;gap:var(--g)}
.page>.grow{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:var(--g)}
.grow>.cols,.grow>.row,.grow>.stack,.grow>.grid2,.grow>.bars{flex:1 1 auto;min-height:0}
.row{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:var(--g);align-items:stretch}
.row>*{min-width:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:var(--g);align-items:stretch}
.cols>*{min-width:0;display:flex;flex-direction:column;gap:var(--g)}
.cols>*>.card{flex:1 1 0;min-height:0}
.stack{display:flex;flex-direction:column;gap:var(--g)}
.stack>*{flex:0 0 auto}
.stack--even>*{flex:1 1 0;min-height:0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:var(--g);align-items:stretch}
.grid2>*{min-width:0}
.bars{display:flex;flex-direction:column;gap:var(--g)}
.bars>.card{width:100%}
.card{display:flex;flex-direction:column;justify-content:center}
.foot{margin-top:auto}
`;
}

function designPrompt(b, width, height, previous, problems, keepLayout = true, overrides = null) {
  const g = geometry(width, height);
  const k = grid(width, height);
  let system = SYSTEM.replace("{gap}", g.gap).replace("{titleMin}", g.titleMin).replace("{minText}", g.minText)
    .replaceAll("{width}", width).replaceAll("{height}", height);
  // A system prompt that forbids curves while the request asks for them makes the model thrash.
  // Where the marketer has overridden the shape language, strike the absolute out of the prompt.
  const directives = overrides?.directives || [];
  if (directives.length) {
    const d = directives.join(" ").toLowerCase();
    if (/curv|round|organic|flow/.test(d))
      system = system
        .replace(/Connectors are straight or right-angled \(orthogonal elbows\), 2px/, "Connectors are 2px")
        .replace(/; never curves/, "");
    if (/circ|radial|ring|round/.test(d))
      system = system.replace(/loops as a rectangle of nodes running clockwise/, "loops arranged as the marketer's directives require");
  }
  const colours = Object.entries(palette(b)).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const text = specText(b).map((t, i) => `${i + 1}. ${t}`).join("\n");
  const cols = Array.from({ length: 12 }, (_, i) => Math.round(k.M + i * (k.col + k.G)));
  let user = `Canvas: ${width}x${height}px.\nGRID: margin M = ${k.M}px on all sides (content box x ${k.M}-${width - k.M}, y bottom edge ${height - k.M}); 12 columns of ${k.col.toFixed(1)}px with ${k.G}px gutters; column left edges at x ${cols.join(", ")}. Card padding ${k.pad}px. Type sizes: title ${k.title}px, h3 ${k.h3}px, subhead ${k.bodyLg}px, body/labels ${k.body}px, stat ${k.stat}px.\nLOGO BAND (no text, top-left corner pure background): y 0-${g.band}px; logo corner x 0-${g.zoneW}px. The title starts just below the band (by y ${g.band + g.gap}px), on one line.\n\nAllowed colours:\n${colours}\n\nSPEC\n${spec(b)}\n\nTEXT (the only text on the page, each exactly once):\n${text}\n`;
  const structural = directives.some((x) => /circ|radial|ring|curv|layout|arrange|grid|stack|column|row|shape/i.test(x));
  if (previous && !structural) user += `\nCURRENT DESIGN of this image (${keepLayout ? "keep its layout and look; change only what the spec or the problems below require" : "it was rejected: design it again from scratch"}):\n\`\`\`css\n${previous.css}\n\`\`\`\n\`\`\`html\n${previous.body}\n\`\`\`\n`;
  else if (previous && structural) user += `\nThe marketer asked for a different arrangement, so build this layout afresh rather than adapting the old one. Keep the same strings, the same component classes and the same palette.\n`;
  // A ring layout needs trigonometry. The designer is already given a grid; give it the ring
  // too, so it places nodes instead of computing circles — that is what made this call stall.
  if (directives.some((x) => /circ|radial|ring/i.test(x))) {
    const n = (b.nodes || []).length;
    if (n >= 3) {
      const cx = Math.round(width / 2), cy = Math.round(height * 0.58);
      const r = Math.round(Math.min(width, height) * 0.29);
      const pts = Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; // start at the top, go clockwise
        return `${b.nodes[i].label}: centre (${Math.round(cx + r * Math.cos(a))}, ${Math.round(cy + r * Math.sin(a))})`;
      });
      user += `\nTHE RING, ALREADY CALCULATED FOR YOU — place each node box centred on its point, and curve each connector along the ring between consecutive points:\ncircle centre (${cx}, ${cy}), radius ${r}px\n${pts.map((x) => `- ${x}`).join("\n")}\nUse these numbers; do not compute your own positions.\n`;
    }
  }
  if (directives.length)
    user += `\nTHE MARKETER ASKED FOR THIS, AND IT OVERRIDES THE HOUSE RULES IN YOUR BRIEF ABOVE. Where these conflict with anything you were told about connectors, shapes, arrangement, spacing or alignment, FOLLOW THESE AND IGNORE THAT RULE:\n${directives.map((d) => `- ${d}`).join("\n")}\nEverything the marketer did not ask about keeps the house style.\n`;
  if (overrides?.headingAlign && overrides.headingAlign !== "left")
    user += `\nTHE MARKETER ASKED FOR THIS AND IT OVERRIDES THE GRID RULE ABOVE: the title and subhead are ${overrides.headingAlign}-aligned, not left-aligned. Set text-align:${overrides.headingAlign} on .title and .subhead and give them the full content width (x ${k.M} to ${width - k.M}) so they ${overrides.headingAlign === "center" ? "centre on x " + Math.round(width / 2) : "end at the right margin"}. Everything else keeps the grid.\n`;
  if (problems?.length) user += `\nFIX THESE PROBLEMS found when the last design was rendered:\n${problems.map((p) => `- ${p}`).join("\n")}\n`;
  return { system, user };
}

// ---- static checks ------------------------------------------------------------------------

const FORBIDDEN = [
  [/<\s*script/i, "remove <script>: the page must be static"],
  [/\son[a-z]+\s*=/i, "remove event handler attributes (onload=, onclick=…)"],
  [/<\s*(link|iframe|object|embed|base|meta)\b/i, "remove <link>/<iframe>/<object>/<embed>/<base>/<meta>"],
  [/@font-face|@import/i, "remove @font-face/@import: the fonts are already loaded"],
  [/url\(\s*['"]?(?!data:|#)/i, "remove url() to anything but data: URLs"],
  [/\b(src|href)\s*=\s*['"]?(?!data:|#)/i, "remove src/href URLs"],
];
const HEX = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g;
const RGB = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;

function colourProblems(design, allowed) {
  const ok = new Set(allowed.map((a) => a.toUpperCase()));
  const okRgb = new Set([...ok].map((a) => [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)).join(",")));
  const found = new Set();
  const all = design.css + design.body;
  for (const m of all.matchAll(HEX)) {
    let v = m[1];
    if (v.length === 3) v = [...v].map((c) => c + c).join("");
    if (!ok.has(`#${v.toUpperCase()}`)) found.add(`#${v.toUpperCase()}`);
  }
  for (const m of all.matchAll(RGB)) if (!okRgb.has(`${+m[1]},${+m[2]},${+m[3]}`)) found.add(`rgb(${m[1]},${m[2]},${m[3]})`);
  return found.size ? [`Colours outside the allowed list: ${[...found].slice(0, 8).join(", ")}. Use only the listed hex values (or rgba() of them)`] : [];
}

function staticProblems(b, design) {
  const problems = FORBIDDEN.filter(([re]) => re.test(design.css + design.body)).map(([, msg]) => msg);
  if (/<\s*(text|tspan|textpath)\b/i.test(design.body)) problems.push("Remove SVG <text>: all words are HTML elements, never SVG");
  const fx = (design.css + design.body).match(/box-shadow|text-shadow|filter\s*[:=]|<\s*filter\b|feGaussianBlur|drop-shadow|backdrop-filter|blur\(|radial-gradient|linear-gradient|conic-gradient|<\s*(radialGradient|linearGradient)\b|animation|@keyframes/gi);
  if (fx) problems.push(`Remove decorative effects (${[...new Set(fx.map((s) => s.toLowerCase()))].join(", ")}): the system is flat — no glows, shadows, blur or gradients`);
  if (/(?:^|[\s,{};])(?:color|fill|stroke|background)\s*:\s*(?!#|rgba?\(|transparent|none|currentcolor|inherit|linear|radial|var\()[a-z]+/i.test(design.css))
    problems.push("Named CSS colours are not allowed; use the listed hex values");
  // Uneven gaps come from per-card margins. The skeleton containers own spacing via `gap`,
  // which is uniform by construction, so a margin on a card is always a bug.
  for (const m of design.css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), decl = m[2];
    if (!/\.card|\.stack\s*>|\.cols\s*>|\.row\s*>/.test(sel)) continue;
    const mg = /(?:^|[;\s])margin(?:-top|-bottom)?\s*:\s*(?!0\b|0px|auto)([^;]+)/i.exec(decl);
    if (mg) {
      problems.push(
        `"${sel.slice(0, 40)}" sets margin:${mg[1].trim().slice(0, 20)} on a card. Remove every margin from cards — ` +
          `spacing belongs to the container's gap (.stack, .cols, .row already apply one uniform gap), which is how gaps stay equal.`
      );
      break;
    }
  }

  // a pinned height plus clipping is how text gets cut off: size cards by their content.
  // html/body is exempt: the page frame is required to be exactly the canvas, and clipped.
  for (const m of design.css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), decl = m[2];
    if (!sel || /^(?:html|body|\*|:root|@)/i.test(sel) || sel.split(",").every((x) => /^\s*(?:html|body)\s*$/i.test(x))) continue;
    if (/(?:^|[;\s])height\s*:\s*\d+(?:\.\d+)?(?:px|%)/i.test(decl) && /overflow\s*:\s*hidden/i.test(decl)) {
      problems.push(`"${sel.slice(0, 40)}" pins a height and clips it (${decl.replace(/\s+/g, " ").trim().slice(0, 60)}): use min-height and let the box grow to its text, so nothing is ever cut off`);
      break;
    }
  }
  return problems.concat(colourProblems(design, Object.values(palette(b))));
}

// ---- page + render ------------------------------------------------------------------------

const POLICY = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; script-src 'none'";

export function page(design, width, height) {
  const body = design.body
    .replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const css = design.css.replaceAll("</style", "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"><style>${fontFaceCss()}html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;}*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}${systemCss(width, height)}</style><style>${css}</style></head><body>${body}</body></html>`;
}

const READBACK = ([band, minText, title]) => {
  const norm = (t) => t.toLowerCase().replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
  const wantTitle = norm(title);
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
  const out = { outside: [], clipped: [], zone: [], tiny: [], font: [] };
  const titleRects = [];
  // the title's own element: the smallest one whose whole text is the title (so a card label
  // that repeats words of the title is never counted as a second title line)
  let titleEl = null;
  for (const el of document.body.querySelectorAll("*")) {
    if (norm(el.textContent || "") === wantTitle && (!titleEl || titleEl.contains(el))) titleEl = el;
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (!text) continue;
    const el = node.parentElement, style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || parseFloat(style.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.outside.push(text);
      if (r.top < band) out.zone.push(text);
      if (titleEl ? titleEl.contains(node) : text.length > 1 && wantTitle.includes(norm(text))) titleRects.push([r.top, r.height, r.left]);
    }
    if (parseFloat(style.fontSize) < minText) out.tiny.push(text);
    const fam = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    if (fam !== "Roboto" && fam !== "DM Sans") out.font.push(`${text} (${fam})`);
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if ((s.overflow !== "visible" || s.textOverflow === "ellipsis") && (a.scrollWidth > a.clientWidth + 1 || a.scrollHeight > a.clientHeight + 1)) {
        out.clipped.push(text);
        break;
      }
    }
  }
  const lines = titleRects.reduce((acc, [top, h]) => (acc.some((t) => Math.abs(t - top) < h * 0.6) ? acc : [...acc, top]), []);
  return {
    text: document.body.innerText,
    outside: [...new Set(out.outside)], clipped: [...new Set(out.clipped)], zone: [...new Set(out.zone)],
    tiny: [...new Set(out.tiny)], font: [...new Set(out.font)],
    titleTop: titleRects.length ? Math.min(...titleRects.map(([t]) => t)) : null,
    titleLeft: titleRects.length ? Math.min(...titleRects.map(([, , l]) => l)) : null,
    titleLines: lines.length,
  };
};

// Grid alignment and spacing, measured on the rendered page.
const ALIGN = ([W, H, M, pad, format, over]) => {
  const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
  const box = (e) => { const b = e.getBoundingClientRect(); return { e, l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, name: (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 28) }; };
  const px = Math.round;
  const out = [];
  const cards = [...document.querySelectorAll(".card")].filter(vis).filter((c) => !c.parentElement.closest(".card")).map(box);
  // every visible text run
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim() || !vis(n.parentElement)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) if (r.width && r.height) texts.push({ node: n, l: r.left, t: r.top, r: r.right, b: r.bottom, s: n.textContent.trim().slice(0, 28) });
  }
  // the heading edge the marketer asked for: left unless an edit overrode it
  const headAlign = (over && over.headingAlign) || "left";
  for (const sel of [".title", ".subhead"]) {
    const e = document.querySelector(sel);
    if (e && vis(e)) {
      const runs = texts.filter((t) => e.contains(t.node));
      const box = e.getBoundingClientRect();
      const left = runs.length ? Math.min(...runs.map((t) => t.l)) : box.left;
      const right = runs.length ? Math.max(...runs.map((t) => t.r)) : box.right;
      if (headAlign === "center") {
        const mid = (left + right) / 2;
        if (Math.abs(mid - W / 2) > 6) out.push(`${sel.slice(1)} is not centred: its text spans x ${px(left)}–${px(right)}, centre ${px(mid)}; centre it on x ${px(W / 2)} (text-align:center across the full content width)`);
      } else if (headAlign === "right") {
        if (Math.abs(right - (W - M)) > 3) out.push(`${sel.slice(1)} text ends at x ${px(right)}; align it to the right margin x ${W - M}`);
      } else {
        if (Math.abs(left - M) > 3) out.push(`${sel.slice(1)} text starts at x ${px(left)}; align it to the left margin x ${M}`);
      }
    }
  }
  if (cards.length) {
    // The skeletons exist so that gaps and column heights cannot be wrong. A card placed by hand
    // sits outside them, which is how negative gaps and unequal columns get back in.
    const orphans = cards.filter((c) => !c.e.closest(".page"));
    if (orphans.length)
      out.push(
        `${orphans.length} of ${cards.length} cards are positioned by hand instead of living inside the layout skeleton. ` +
          `Wrap ALL content in <div class="page">, put side-by-side blocks in <div class="cols">, rows of equal cards in <div class="row">, ` +
          `and vertical runs in <div class="stack">. Remove every position/left/top/width/height you set on a card or its wrapper — ` +
          `the skeleton already applies the margins, the uniform gap, equal column heights and the bottom margin. Only connector SVGs may be absolutely positioned.`
      );
    const minL = Math.min(...cards.map((c) => c.l)), maxR = Math.max(...cards.map((c) => c.r));
    if (Math.abs(minL - M) > 2) out.push(`The leftmost card starts at x ${px(minL)}; it must start exactly at the left margin x ${M}`);
    if (Math.abs(maxR - (W - M)) > 2) out.push(`The rightmost card ends at x ${px(maxR)}; it must end exactly at the right margin x ${W - M}`);
    for (const c of cards) if (c.l < M - 2 || c.r > W - M + 2) out.push(`Card "${c.name}" crosses the margin (x ${px(c.l)}-${px(c.r)}); keep it inside x ${M}-${W - M}`);
    // rows: cards sharing a top edge
    const rows = [];
    for (const c of [...cards].sort((a, b) => a.t - b.t)) { const r = rows.find((r) => Math.abs(r[0].t - c.t) <= 3); r ? r.push(c) : rows.push([c]); }
    for (const r of rows.filter((r) => r.length > 1)) {
      r.sort((a, b) => a.l - b.l);
      const gaps = r.slice(1).map((c, i) => c.l - r[i].r);
      if (Math.max(...gaps) - Math.min(...gaps) > 2) {
        const target = px(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]);
        out.push(`The cards in the row at y ${px(r[0].t)} have gaps of ${gaps.map(px).join(", ")}px. Set EVERY gap in that row to exactly ${target}px.`);
      }
      const sameW = r.filter((c) => Math.abs(c.w - r[0].w) <= 2);
      if (sameW.length === r.length && Math.max(...r.map((c) => c.h)) - Math.min(...r.map((c) => c.h)) > 2) {
        const tall = px(Math.max(...r.map((c) => c.h)));
        out.push(`Cards in the row at y ${px(r[0].t)} are ${r.map((c) => px(c.h)).join(", ")}px tall. Give every card in that row the SAME height of ${tall}px (align-items:stretch on the row, or min-height:${tall}px on each).`);
      }
    }
    // columns: cards sharing a left edge
    const cols = [];
    for (const c of [...cards].sort((a, b) => a.l - b.l)) { const k = cols.find((k) => Math.abs(k[0].l - c.l) <= 3); k ? k.push(c) : cols.push([c]); }
    for (const k of cols.filter((k) => k.length > 2)) {
      k.sort((a, b) => a.t - b.t);
      const gaps = k.slice(1).map((c, i) => c.t - k[i].b);
      if (Math.max(...gaps) - Math.min(...gaps) > 2) {
        const target = px(gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)]);
        out.push(`The stacked cards at x ${px(k[0].l)} have vertical gaps of ${gaps.map(px).join(", ")}px. Set EVERY gap in that stack to exactly ${target}px (one flex/grid gap, not per-card margins).`);
      }
    }
    // structure: chart bars span the content width; the source starts at the left margin
    if (format === "data_chart") {
      for (const c of cards.filter((c) => c.e.querySelector(".track"))) {
        if (Math.abs(c.l - M) > 2 || Math.abs(c.r - (W - M)) > 2) out.push(`Bar card "${c.name}" must span the full content width (x ${M}-${W - M}); put insight cards in a row BELOW the bars, never in a side column`);
      }
    }
    const src = document.querySelector(".source");
    if (src && vis(src) && Math.abs(src.getBoundingClientRect().left - M) > 3) out.push(`The source line must start at the left margin x ${M}, at the foot of the image`);
    // multi-column layouts end on one baseline
    const lowest = Math.max(...cards.map((c) => c.b));
    const colsByX = [];
    for (const c of cards) { const k = colsByX.find((k) => c.l < k.r - 2 && k.l < c.r - 2); k ? (k.b = Math.max(k.b, c.b), k.l = Math.min(k.l, c.l), k.r = Math.max(k.r, c.r)) : colsByX.push({ l: c.l, r: c.r, b: c.b }); }
    if (colsByX.length > 1 && colsByX.some((k) => lowest - k.b > pad * 1.5)) out.push(`Side-by-side columns end at different heights (${colsByX.map((k) => px(k.b)).join(", ")}px): make the columns end on one bottom edge, or stack the blocks in full-width rows`);
    // empty bands inside cards: content should fill the card, or sit centred in it
    for (const c of cards) {
      const inside = texts.filter((t) => c.e.contains(t.node));
      const kids = [...c.e.querySelectorAll("svg, .chip, .track")].filter(vis).map(box);
      const all = [...inside, ...kids];
      if (!all.length) continue;
      const top = Math.min(...all.map((a) => a.t)) - c.t, bottom = c.b - Math.max(...all.map((a) => a.b));
      if (bottom - top > Math.max(pad * 0.75, c.h * 0.18)) out.push(`Card "${c.name}" has an empty band at its bottom (${px(top)}px above the content, ${px(bottom)}px below): centre its content vertically or make the card shorter`);
      // pinned height + clipping: the card is cropping its own content
      const cs = getComputedStyle(c.e);
      if (cs.overflow !== "visible" && (c.e.style.height || cs.height !== "auto") && c.e.scrollHeight > c.e.clientHeight + 1)
        out.push(`Card "${c.name}" is clipping its own content (${px(c.e.scrollHeight)}px of content in a ${px(c.e.clientHeight)}px box): give the card min-height instead of a fixed height so it grows to its text`);
      // an empty band in the middle: icon at the top, text at the bottom, nothing between
      const spans = all.map((a) => [a.t, a.b]).sort((x, y) => x[0] - y[0]);
      let reach = spans[0][1], hole = 0;
      for (const [t, b2] of spans.slice(1)) { hole = Math.max(hole, t - reach); reach = Math.max(reach, b2); }
      if (hole > Math.max(pad * 1.5, c.h * 0.2)) out.push(`Card "${c.name}" has a ${px(hole)}px empty gap between its parts (e.g. icon far above the text): keep its content together and size the card to it`);
    }
    const sub = document.querySelector(".subhead");
    if (sub && vis(sub)) {
      const lines = new Set(texts.filter((t) => sub.contains(t.node)).map((t) => Math.round(t.t / 4))).size;
      const range = document.createRange(); range.selectNodeContents(sub);
      const w = Math.max(...[...range.getClientRects()].map((r) => r.width));
      if (lines > 1 && sub.scrollWidth <= W - 2 * M && (sub.textContent.length * parseFloat(getComputedStyle(sub).fontSize) * 0.5) < W - 2 * M) out.push(`The subhead wraps onto ${lines} lines but fits on one: let it run the full content width (${W - 2 * M}px)`);
      // a lone word (widow) on the subhead's last line
      const subLines = [];
      for (const t of texts.filter((t) => sub.contains(t.node))) { const l = subLines.find((l) => Math.abs(l.t - t.t) < 4); l ? (l.w += t.r - t.l) : subLines.push({ t: t.t, w: t.r - t.l }); }
      if (subLines.length > 1) {
        const last = subLines.sort((a, b) => a.t - b.t).at(-1);
        if (last.w < (W - 2 * M) * 0.2) out.push(`The subhead ends with a lone word on its last line. Give .subhead the full content width of ${W - 2 * M}px, or reduce its font-size until it fits on one line, or insert a <br> so the two lines are of similar length.`);
      }
    }
    // overlaps and padding
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) out.push(`Cards "${a.name}" and "${b.name}" overlap`);
    }
    for (const t of texts) {
      const home = t.node.parentElement.closest(".card");
      for (const c of cards) {
        if (home === c.e || (home && c.e.contains(home))) {
          const p = Math.min(t.l - c.l, c.r - t.r, t.t - c.t, c.b - t.b);
          if (p < pad * 0.6) out.push(`"${t.s}" is ${px(Math.max(0, p))}px from the edge of its card; keep at least ${pad}px padding`);
        } else if (t.l < c.r && c.l < t.r && t.t < c.b && c.t < t.b) out.push(`"${t.s}" overlaps the card "${c.name}"; move it onto a clear stretch`);
      }
    }
  }
  const bottoms = [...cards.map((c) => c.b), ...texts.map((t) => t.b)];
  if (bottoms.length) {
    const end = Math.max(...bottoms), gap = H - end;
    if (Math.abs(gap - M) > 8) out.push(`The content ends at y ${px(end)} leaving ${px(gap)}px below. Move or grow the last block so its bottom edge lands on y ${H - M} exactly (bottom margin must equal the ${M}px side margins).`);
  }
  return [...new Set(out)].slice(0, 8);
};

// Mean luminance (0-1) and spread of a screenshot region, measured on a canvas.
const GROUND = async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, sq = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    sum += l; sq += l * l; n++;
  }
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
};

const normal = (t) => t.toLowerCase().replace(/[–—−]/g, "-").replace(/\*/g, "").replace(/\s+/g, " ").trim();

function textProblems(seen, wanted) {
  let rest = ` ${normal(seen)} `;
  const problems = [];
  // every copy counts: two nodes may carry the same label, and each must appear
  for (const want of wanted.filter((w) => w.trim()).sort((a, b) => b.length - a.length)) {
    const target = normal(want);
    if (rest.includes(target)) rest = rest.replace(target, " ");
    else problems.push(`Missing or changed text: "${want}" (set it exactly as given)`);
  }
  const extra = rest.replace(/[^0-9a-z]+/g, " ").trim();
  if (extra) problems.push(`Text not in the brief: "${extra.slice(0, 120)}". Remove it (no tick labels, legends or extra words)`);
  return problems;
}

const SOFT = ["The title wraps", "Too much space between the logo", "The logo corner"];
export const blocking = (problems) => problems.filter((p) => !SOFT.some((s) => p.startsWith(s)));

/** Render the design, check it, place the logo, export the JPG. */
export async function renderDesign(b, design, opts) {
  const { width, height, scale, quality, jpgPath } = opts;
  const g = geometry(width, height);
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, offline: true });
    const p = await ctx.newPage();
    await p.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await p.setContent(page(design, width, height), { waitUntil: "load" });
    const fontsOk = await p.evaluate(() =>
      Promise.all([document.fonts.load("16px 'Roboto'"), document.fonts.load("16px 'DM Sans'")]).then((l) => l.every((f) => f.length > 0))
    );
    await p.evaluate(() => document.fonts.ready.then(() => true));
    const back = await p.evaluate(READBACK, [g.band, g.minText - 0.5, plainTitle(b.title)]);
    const gk = grid(width, height);
    const alignment = await p.evaluate(ALIGN, [width, height, gk.M, gk.pad, b.format, opts.overrides || null]);

    // the ground the logo sits on: picks the logo variant, and must be plain
    const logos = logoDataUrls();
    const ratio = await p.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); return i.width / i.height; }, logos.onDark);
    const logoW = Math.round(ratio * g.logoH);
    // left edge lines up with the heading's left edge (optical: the ink of its first letter)
    const logoX = brand.logo.align === "title" && back.titleLeft !== null && back.titleLeft >= 16 && back.titleLeft < width * 0.2
      ? Math.round(back.titleLeft) : g.logoOffset;
    const box = { x: logoX, y: g.logoOffset, width: logoW, height: g.logoH };
    const shot = await p.screenshot({ clip: box, type: "png" });
    const ground = await p.evaluate(GROUND, "data:image/png;base64," + shot.toString("base64"));
    const onDark = ground.mean < 0.5;

    const problems = textProblems(back.text, specText(b));
    if (back.outside.length) problems.push(`Text outside the canvas: ${back.outside.slice(0, 4).join("; ")}`);
    if (back.clipped.length) problems.push(`Text cut off or overflowing its box (give it room or wrap it): ${back.clipped.slice(0, 4).join("; ")}`);
    if (back.zone.length) problems.push(`Text inside the logo band at the top (the logo sits above the title: move all text below y ${g.band}px): ${back.zone.slice(0, 4).join("; ")}`);
    if (back.tiny.length) problems.push(`Text smaller than ${g.minText}px: ${back.tiny.slice(0, 4).join("; ")}`);
    if (back.font.length) problems.push(`Text in a font other than 'Roboto' or 'DM Sans': ${back.font.slice(0, 4).join("; ")}`);
    if (!fontsOk) problems.push("The brand fonts did not load: use font-family 'Roboto' or 'DM Sans'");
    if (back.titleTop !== null && back.titleTop > g.band + g.gap)
      problems.push(`Too much space between the logo and the title: the title starts at y ${Math.round(back.titleTop)}px; start it by y ${g.band + g.gap}px, right under the logo`);
    if (back.titleLines > 1) problems.push(`The title wraps onto ${back.titleLines} lines: set it on ONE line (smaller size, or it fits as given)`);
    if (ground.std > 0.06) problems.push("The logo corner is not plain background: remove shapes, lines, dots or glows from the top-left corner");
    problems.push(...alignment.map((a) => `Alignment: ${a}`));

    // official logo, placed by code: light text on dark ground, dark text on light
    await p.evaluate(
      async ({ src, x, y, h }) => {
        const img = document.createElement("img");
        img.src = src;
        img.style.cssText = `position:fixed;left:${x}px;top:${y}px;height:${h}px;width:auto;z-index:2147483647;margin:0;padding:0;`;
        document.body.appendChild(img);
        await img.decode();
      },
      { src: onDark ? logos.onDark : logos.onLight, x: box.x, y: box.y, h: g.logoH }
    );

    const png = await p.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
    // export: 2× as drawn, or reduced to the exact canvas (1×) with high-quality resampling
    const outW = Math.round(width * scale), outH = Math.round(height * scale);
    const exp = await browser.newPage();
    const jpgB64 = await exp.evaluate(
      async ({ src, w, h, q }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        return c.toDataURL("image/jpeg", q).split(",")[1];
      },
      { src: "data:image/png;base64," + png.toString("base64"), w: outW, h: outH, q: quality / 100 }
    );
    const { writeFile } = await import("node:fs/promises");
    await writeFile(jpgPath, Buffer.from(jpgB64, "base64"));
    return { problems, logoVariant: onDark ? "light-text (dark ground)" : "dark-text (light ground)", pixels: `${outW}×${outH}` };
  } finally {
    await browser.close();
  }
}

/** Claude designs; code checks; problems go back for up to `rounds` more attempts. */
export async function designImage(b, opts, log, { previous = null, problems: initial = [], keepLayout = true } = {}) {
  const overrides = opts.overrides || null;
  const cfg = brand.models.design;
  let design = previous, problems = initial, best = null, last = null;
  const seen = new Set(), seenLines = new Set();
  for (let attempt = 0; attempt <= cfg.rounds; attempt++) {
    log(attempt === 0 && !initial.length ? "Design: laying out the HTML…" : `Design: fixing ${problems.length} problem(s), round ${attempt + (initial.length ? 1 : 0)}…`);
    const { system, user } = designPrompt(b, opts.width, opts.height, design, problems, attempt > 0 || keepLayout, overrides);
    const reply = await runStage({ stage: "design", provider: opts.provider, system, user });
    const css = fenced(reply, "css"), body = fenced(reply, "html");
    if (css === null || body === null) {
      problems = ["Reply must be exactly a ```css block then a ```html block"];
      continue;
    }
    design = { css, body };
    const stat = staticProblems(b, design);
    if (blocking(stat).length && attempt < cfg.rounds) {
      problems = stat;
      log(`Design checks: ${stat.length} problem(s) — ${stat.slice(0, 2).join("; ")}`);
      continue;
    }
    log("Rendering in Chromium and reading the text back…");
    const r = await renderDesign(b, design, opts);
    last = design;
    r.problems = [...stat, ...r.problems];
    const score = blocking(r.problems).length * 10 + r.problems.length;
    if (!best || score < best.score) best = { ...r, design, score };
    if (!r.problems.length) break;
    // the same complaint coming back after a "fix" means the numbers are being tuned in circles
    const sig = (list) => list.map((x) => x.replace(/\d+/g, "#").slice(0, 70)).sort().join(" | ");
    const thisSig = sig(r.problems);
    const repeat = seen.has(thisSig) || r.problems.some((x) => seenLines.has(x.replace(/\d+/g, "#").slice(0, 70)));
    seen.add(thisSig);
    for (const x of r.problems) seenLines.add(x.replace(/\d+/g, "#").slice(0, 70));
    problems = r.problems;
    if (repeat)
      problems = [
        `You are going in circles: these same problems came back after you changed the numbers. STOP adjusting values and change the layout approach instead — equalise what is IN the columns or rows (same number of cards, same content height), or stack the blocks as full-width rows so there is nothing to misalign.`,
        ...r.problems,
      ];
    log(`Render checks: ${r.problems.length} problem(s)${repeat ? " (repeating — escalating)" : ""} — ${r.problems.slice(0, 2).join("; ")}`);
  }
  if (!best) throw new Error(`The model never returned a usable design:\n- ${problems.join("\n- ")}`);
  if (best.design !== last) {
    // a later, worse attempt overwrote the file: render the best one again
    const r = await renderDesign(b, best.design, opts);
    best = { ...best, ...r, problems: best.problems };
  }
  return best;
}

export function storedHtml(b, design, width, height) {
  return `<!-- format:${b.format} -->\n` + page(design, width, height);
}
