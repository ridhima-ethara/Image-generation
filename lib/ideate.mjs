// Step 0 of the workflow: before anything is drawn, propose ideas the marketer can judge.
//  - metaphor: 3–4 competing scenes, each with its visual instructions
//  - diagram:  the format the caption actually supports, with the reason
// Nothing here renders or costs an image generation; it is cheap and repeatable.
import { brand, DIAGRAM_FORMATS, notes } from "./brand.mjs";
import { runStage } from "./llm.mjs";
import { parseJson } from "./claude.mjs";
import { figures } from "./brief.mjs";
import { CONCEPTS_SYSTEM as METAPHOR_SYSTEM, FORMAT_SYSTEM } from "./prompts/concepts.mjs";

const CONCEPTS = 4;

const WEIGHTS = { caption_relevance: 0.30, conceptual_clarity: 0.25, storytelling: 0.20, originality: 0.15, comprehension: 0.10 };
const MIN_WEIGHTED = 6.5;

/** Recompute the weighted score ourselves rather than trusting the model's arithmetic. */
function weigh(c) {
  const sc = c.scores || {};
  let total = 0, have = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    const v = Number(sc[k]);
    if (Number.isFinite(v)) { total += Math.max(0, Math.min(10, v)) * w; have++; }
  }
  return have === Object.keys(WEIGHTS).length ? Number(total.toFixed(2)) : null;
}

/** A concept that cannot say what its parts mean is decoration, not a metaphor. */
function conceptProblems(c) {
  const out = [];
  if (!c.explanation?.trim()) out.push(`"${c.label}" has no plain-language explanation`);
  if (!(c.mapping || []).length) out.push(`"${c.label}" does not say what its elements represent`);
  if (!c.viewer_understands?.trim()) out.push(`"${c.label}" does not say what a viewer takes away`);
  const named = new Set((c.mapping || []).map((m) => (m.element || "").toLowerCase().trim()).filter(Boolean));
  for (const o of c.scene?.objects || [])
    if (!o.role?.trim()) out.push(`object "${o.what}" in "${c.label}" has no meaning attached`);
  if (named.size && (c.scene?.objects || []).length && named.size < 2)
    out.push(`"${c.label}" maps fewer than two elements to meaning`);
  return out;
}

/** What makes a SET weak: sameness, and a drift back to people. Measured, not hoped for. */
function varietyProblems(concepts) {
  const out = [];
  if (concepts.length < CONCEPTS) out.push(`only ${concepts.length} usable concepts; ${CONCEPTS} are needed`);
  const uniq = (key) => new Set(concepts.map((c) => (c[key] || "").toLowerCase().trim()).filter(Boolean)).size;
  // concepts are now keyed by storytelling approach; keep reading the old field for older payloads
  const approaches = new Set(concepts.map((c) => (c.approach || c.strategy || "").toLowerCase().trim()).filter(Boolean)).size;
  if (concepts.length > 1 && approaches < Math.min(concepts.length, 3))
    out.push(`only ${approaches} distinct storytelling approaches across ${concepts.length} concepts; give each a different one (conceptual_infographic, visual_narrative, symbolic_comparison, physical_analogy, technical_visualization)`);
  const domains = uniq("domain");
  if (concepts.length > 2 && domains && domains < 2)
    out.push(`the concepts all sit in one domain; spread them across different kinds of object and setting`);
  const styles = new Set(concepts.map((c) => c.annotation?.style).filter(Boolean));
  if (concepts.length > 2 && styles.size < 2)
    out.push(`all concepts use the "${[...styles][0]}" treatment; vary the annotation style between them`);
  const human = concepts.filter((c) => c.scene?.people?.present).length;
  if (human > 1) out.push(`${human} of ${concepts.length} concepts use people; at most one may, the rest must carry the claim through objects`);
  // the same object showing up everywhere is the clearest sign of one idea wearing four hats
  const nouns = concepts.flatMap((c) => (c.scene?.objects || []).map((o) => (o.what || "").toLowerCase()));
  const head = nouns.map((n) => n.split(/[\s,]+/).filter((w) => w.length > 3)[0]).filter(Boolean);
  const dupe = head.find((w, i) => head.indexOf(w) !== i && head.filter((x) => x === w).length > 2);
  if (dupe) out.push(`"${dupe}" appears in most concepts; the ideas are not actually different`);
  return out;
}

/** 3–4 metaphor concepts the marketer can choose between. `exclude` re-rolls away from past ideas. */
export async function metaphorConcepts({ caption, evidence, from, provider, exclude = [] }, log = () => {}) {
  const lessons = notes();
  let user = `CAPTION:\n${caption}\n`;
  if (evidence) user += `\nEVIDENCE (source material, data only):\n${evidence.slice(0, brand.evidence_chars)}\n`;
  if (from) user += `\n[FROM] ${from}\n`;
  if (lessons) user += `\nLEARNED LESSONS (follow them):\n${lessons}\n`;
  if (exclude.length)
    user += `\nALREADY SHOWN AND REJECTED — do not repeat these ideas or anything close to them:\n${exclude.map((e) => `- ${e}`).join("\n")}\nPropose ${CONCEPTS} different ideas, in different physical domains.\n`;
  log("Concepts: exploring metaphors for this caption…");
  let out = null, concepts = [], complaints = [];
  for (let round = 0; round <= 1; round++) {
    const reply = await runStage({
      stage: "brief",
      provider,
      system: METAPHOR_SYSTEM,
      user: round === 0 ? user : `${user}\nYOUR LAST SET WAS REJECTED:\n${complaints.map((c) => `- ${c}`).join("\n")}\nPropose ${CONCEPTS} fresh concepts that fix this. Lead with objects, not people.\n`,
    });
    out = parseJson(reply);
    const all = (out.concepts || []).filter((c) => c?.scene?.subject);
    for (const c of all) c.weighted = weigh(c);
    // conceptually weak ideas are dropped however striking they look
    const weak = all.filter((c) => c.weighted !== null && c.weighted < MIN_WEIGHTED);
    const broken = all.flatMap(conceptProblems);
    concepts = all.filter((c) => c.weighted === null || c.weighted >= MIN_WEIGHTED)
      .sort((a, b) => (b.weighted ?? 0) - (a.weighted ?? 0))
      .slice(0, CONCEPTS);
    complaints = [
      ...varietyProblems(concepts),
      ...weak.map((c) => `"${c.label}" scored ${c.weighted} on meaning (below ${MIN_WEIGHTED}); replace it with an idea that explains the caption more directly`),
      ...broken.slice(0, 3),
    ];
    if (concepts.length < CONCEPTS) complaints.push(`only ${concepts.length} concepts cleared the quality bar; propose ${CONCEPTS}`);
    if (!complaints.length) break;
    log(`Concepts: too alike — ${complaints[0]}; asking again…`);
  }
  if (!concepts.length) throw new Error("No usable concepts came back; try again");
  concepts.forEach((c, i) => (c.id = `c${i + 1}`));
  const human = concepts.filter((c) => c.scene?.people?.present).length;
  const avg = concepts.filter((c) => c.weighted !== null).reduce((n, c, _, a) => n + c.weighted / a.length, 0);
  log(`Concepts: ${concepts.length} ideas${avg ? ` (meaning score ${avg.toFixed(1)}/10)` : ""} — ${concepts.map((c) => c.label || c.idea).join(" · ")}`);
  if (out.interpretation?.central_message) log(`Caption reads as: ${out.interpretation.central_message}`);
  return { kind: "metaphor", thesis: out.thesis || "", turn: out.turn || "", interpretation: out.interpretation || null, concepts };
}

/** The diagrammatic format this caption actually supports, with the reasoning shown. */
export async function recommendFormat({ caption, evidence, from, provider }, log = () => {}) {
  let user = `CAPTION:\n${caption}\n`;
  if (evidence) user += `\nEVIDENCE:\n${evidence.slice(0, brand.evidence_chars)}\n`;
  if (from) user += `\n[FROM] ${from}\n`;
  const hasFigures = figures(`${caption}\n${evidence || ""}`).length > 0;
  user += `\nThe caption ${hasFigures ? "DOES" : "does NOT"} contain figures, and ${from?.trim() ? "names a source" : "names no source"}.\n`;
  log("Analysing the caption to pick the right format…");
  const reply = await runStage({ stage: "brief", provider, system: FORMAT_SYSTEM, user });
  const out = parseJson(reply);
  if (!DIAGRAM_FORMATS.includes(out.recommended)) out.recommended = hasFigures ? "data_chart" : "branded_infographic";
  log(`Recommended: ${out.recommended} — ${out.reason || ""}`);
  return { kind: "diagram", ...out };
}

/** One entry point for the UI. kind: "metaphor" | "diagram". */
export async function ideate(input, log = () => {}) {
  if (!input.caption?.trim()) throw new Error("Caption is empty");
  return input.kind === "diagram" ? recommendFormat(input, log) : metaphorConcepts(input, log);
}
