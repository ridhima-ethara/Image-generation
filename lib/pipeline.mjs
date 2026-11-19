// caption → brief (+code checks) → HTML design (+browser checks) → logo → JPG → Claude QA
// → one correction round → stored record.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { brand, canvasFor, OUT_DIR, FORMAT_CODE, routeFor, isMetaphor } from "./brand.mjs";
import { writeBrief, checkBrief, plainTitle } from "./brief.mjs";
import { designImage, blocking, storedHtml, renderDesign } from "./design.mjs";
import { reviewImage, defectsAsProblems } from "./qa.mjs";
import { parseJson } from "./claude.mjs";
import { runStage, providerFor, providerLabel } from "./llm.mjs";
import { settings } from "./settings.mjs";
import { designByImageModel, composeScene } from "./imagegen.mjs";
import { enrichEdit, editImage, verifyEdit, plateChanged, buildStepPrompt, buildCorrectivePrompt } from "./imgedit.mjs";
import { DIAGRAM_EDIT_SYSTEM as EDIT_SYSTEM } from "./prompts/edit.mjs";

const QUALITY = 92;

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
}

export async function records() {
  if (!existsSync(OUT_DIR)) return [];
  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".json"));
  const out = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(path.join(OUT_DIR, f), "utf8")));
    } catch { /* skip broken record */ }
  }
  return out.sort((a, b) => b.created.localeCompare(a.created));
}

export async function record(id) {
  const file = path.join(OUT_DIR, `${path.basename(id)}.json`);
  return existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : null;
}

/** Design, check, QA, one correction round; writes JPG + HTML + JSON record. */
async function finish({ id, brief: initialBrief, briefNotes, input, canvas, log, previousDesign = null, editProblems = [], overrides = null }) {
  let brief = initialBrief;
  const jpgPath = path.join(OUT_DIR, `${id}.jpg`);
  const opts = { width: canvas.width, height: canvas.height, scale: 1, quality: QUALITY, jpgPath, provider: input.provider, caption: input.caption, evidence: input.evidence, overrides };

  // The BRIEF's format decides the renderer: metaphorical images are photographed by the
  // image model, diagrammatic ones are built and checked as HTML by the original pipeline.
  const route = routeFor(brief.format);
  const imageMode = route.render === "image";
  if (imageMode && !settings().openai.apiKey)
    throw new Error(`"${brief.format}" is a photographed metaphor and needs an OpenAI key (add OPENAI_API_KEY to .env), or force a diagram format.`);
  log(`Category: ${route.category} (${brief.format}) → ${imageMode ? `photographed by ${settings().openai.imageModel}` : "designed as HTML and checked in the browser"}`);
  let result = imageMode
    ? await designByImageModel(brief, opts, log)
    : await designImage(brief, opts, log, { previous: previousDesign, problems: editProblems, keepLayout: true });
  // the image stage may have moved labels onto the elements it actually drew
  if (result.brief) brief = result.brief;
  let qa = await reviewImage({ jpgPath, brief, caption: input.caption, evidence: input.evidence, provider: input.provider }, log);

  const corrections = brand.models.qa.corrections;
  for (let i = 0; i < corrections && (qa.verdict === "REVISE" || qa.verdict === "REGENERATE"); i++) {
    log(`Correction round: ${qa.verdict === "REVISE" ? "revising the layout" : "redesigning from scratch"}…`);
    // an image model cannot be asked to "keep the layout": it regenerates the scene
    const retry = imageMode
      ? await designByImageModel(brief, opts, log).then((x) => { if (x.brief) brief = x.brief; return x; })
      : await designImage(brief, opts, log, {
          previous: result.design,
          problems: defectsAsProblems(qa),
          keepLayout: qa.verdict === "REVISE",
        });
    // a correction that renders worse than what we already had is not an improvement: keep the best
    const scoreOf = (r) => blocking(r.problems || []).length * 10 + (r.problems || []).length;
    if (scoreOf(retry) <= scoreOf(result)) result = retry;
    else {
      log(`Correction was worse (${scoreOf(retry)} vs ${scoreOf(result)}); keeping the earlier version`);
      // the retry already overwrote the JPG, so put the kept version back on disk
      if (!imageMode && result.design?.css) {
        const r = await renderDesign(brief, result.design, opts);
        result = { ...result, ...r, problems: result.problems };
      }
    }
    qa = await reviewImage({ jpgPath, brief, caption: input.caption, evidence: input.evidence, provider: input.provider }, log);
  }

  const hard = blocking(result.problems);
  const status = qa.verdict === "PASS" && !hard.length ? "ready" : "needs_review";
  const rec = {
    id,
    created: new Date().toISOString(),
    status,
    platform: input.platform,
    placement: canvas.placement,
    canvas: `${canvas.width}×${canvas.height}`,
    format: brief.format,
    formatCode: FORMAT_CODE[brief.format],
    family: brief.concepts?.[brief.chosen_concept ?? 0]?.family || "",
    title: plainTitle(brief.title),
    caption: input.caption,
    evidence: input.evidence || "",
    from: input.from || "",
    forcedFormat: input.forcedFormat || "",
    provider: providerFor(input.provider),   // which provider made this image (never the key)
    concept: input.concept || null,   // the idea the marketer approved, if any
    mode: imageMode ? "image" : "html",
    overrides: overrides && Object.keys(overrides).length ? overrides : null,   // layout rules the marketer changed
    overlay: result.overlay || null,   // treatment actually drawn, for variety checks
    plate: result.plate ? `/outputs/${path.basename(result.plate)}` : null,   // the wordless photograph
    category: route.category,
    brief,
    design: result.design,
    logo: result.logoVariant,
    checks: { problems: result.problems, notes: briefNotes },
    qa,
    parent: input.parent || null,
    edit: input.edit || null,
    jpg: `/outputs/${id}.jpg`,
    html: `/outputs/${id}.html`,
  };
  // image mode has no page to store: keep the scene prompt beside the JPG instead
  await writeFile(
    path.join(OUT_DIR, `${id}.html`),
    imageMode
      ? `<!-- mode:image model:${result.design.model} -->\n<!doctype html><meta charset="utf-8"><title>${plainTitle(brief.title)}</title>` +
        `<body style="margin:0;background:#0B0E14;color:#8A8FA5;font:14px/1.5 system-ui">` +
        `<img src="${id}.jpg" style="max-width:100%;display:block">` +
        `<pre style="white-space:pre-wrap;padding:24px">${result.design.prompt.replace(/[<&]/g, (c) => ({ "<": "&lt;", "&": "&amp;" }[c]))}</pre></body>`
      : storedHtml(brief, result.design, canvas.width, canvas.height)
  );
  await writeFile(path.join(OUT_DIR, `${id}.json`), JSON.stringify(rec, null, 2));
  log(status === "ready" ? `Done: ${rec.canvas} JPG ready` : `Done, marked needs_review: ${[...hard, ...defectsAsProblems(qa)].slice(0, 3).join("; ") || qa.verdict}`);
  return rec;
}

/** New image from a caption. input: { caption, evidence?, from?, platform, placement?, forcedFormat? } */
export async function generate(input, log = console.log) {
  if (!input.caption?.trim()) throw new Error("Caption is empty");
  await mkdir(OUT_DIR, { recursive: true });
  const canvas = canvasFor(input.platform || "linkedin", input.placement);
  const recent = (await records()).slice(0, 10).map((r) => ({ format: r.format, family: r.family, style: r.brief?.annotation?.style, zone: r.brief?.annotation?.headline_zone }));
  log(`Provider: ${providerLabel(providerFor(input.provider), "brief")} for the brief, ${providerLabel(providerFor(input.provider), "design")} for the design`);
  const { brief, notes } = await writeBrief({ ...input, recent }, log);
  const id = `${slug(plainTitle(brief.title))}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  return finish({ id, brief, briefNotes: notes, input, canvas, log });
}

// ---- edits from chat (§15): reuse the stored design, change only what was asked -----------

/**
 * Editing a photographed metaphor: Claude writes the instruction, the image model performs it
 * on the ORIGINAL plate, then the words are redrawn and the result is checked.
 * Claude's reply is never the image — it is only the instruction.
 */
async function editRaster(prev, request, spec, log) {
  // any image can be edited: prefer the wordless plate when one exists, else the finished JPG
  const plateName = prev.plate ? path.basename(prev.plate) : `${prev.id}.scene.png`;
  const platePath = path.join(OUT_DIR, plateName);
  const hasPlate = existsSync(platePath);
  const srcPath = hasPlate ? platePath : path.join(OUT_DIR, `${prev.id}.jpg`);
  if (!existsSync(srcPath)) throw new Error("The image file for this record is missing, so it cannot be edited.");

  const canvas = canvasFor(prev.platform, prev.placement);
  const id2 = `${prev.id.replace(/-v[a-z0-9]+$/, "")}-v${Date.now().toString(36)}`;
  const jpgPath = path.join(OUT_DIR, `${id2}.jpg`);
  const newPlate = path.join(OUT_DIR, `${id2}.scene.png`);
  const tmp = path.join(OUT_DIR, `.${id2}.work.png`);

  const brief = structuredClone(prev.brief || {});
  if (spec.text_change && brief.title !== undefined) {
    if (spec.text_change.title) brief.title = spec.text_change.title;
    if (spec.text_change.subhead) brief.subhead = spec.text_change.subhead;
    if (spec.text_change.callouts && brief.annotation)
      brief.annotation.callouts = (brief.annotation.callouts || []).map((c, i) => ({ ...c, ...(spec.text_change.callouts[i] || {}) }));
  }

  // --- apply each step to the output of the last one -------------------------------------
  const startB64 = readFileSync(srcPath).toString("base64");
  let cur = startB64;
  const applied = [];
  for (const [i, step] of spec.steps.entries()) {
    const prompt = buildStepPrompt(step, spec, { wordless: hasPlate });
    log(`Edit ${i + 1}/${spec.steps.length}: ${step.what || step.instruction.slice(0, 60)}…`);
    await writeFile(tmp, Buffer.from(cur, "base64"));
    let next;
    try {
      next = await editImage({ srcPath: tmp, prompt, width: canvas.width, height: canvas.height, timeoutS: brand.models.design.timeout_s });
    } catch (e) {
      throw new Error(`The image editor failed on "${step.what || "this change"}": ${e.message}\nThe original image is unchanged.`);
    }
    const moved = await plateChanged(cur, next);
    if (!moved.changed) log(`Edit ${i + 1}: that step did not move the picture`);
    else log(`Edit ${i + 1}: applied (${Math.round(moved.maxTile * 100)}% peak change)`);
    applied.push({ ...step, moved: moved.changed });
    cur = next;
  }

  const totalMove = await plateChanged(startB64, cur);
  if (spec.steps.length && !totalMove.changed)
    log("Edit: the picture is unchanged after every step — the editor did not act on this request");

  const render = async (b64) => {
    await writeFile(newPlate, Buffer.from(b64, "base64"));
    return composeScene({ b: brief, pngB64: b64, width: canvas.width, height: canvas.height, quality: QUALITY, jpgPath });
  };
  let composed = await render(cur);

  // --- verify, then one corrective pass for whatever did not land -------------------------
  let check = await verifyEdit(
    { jpgPath, request, steps: spec.steps, changes: spec.steps.map((x) => x.what || x.instruction), preserve: spec.preserve, provider: prev.provider },
    log
  );
  let corrected = false;
  if (check.corrective_instruction && ["PARTIAL", "NOT_APPLIED", "BROKE_SOMETHING"].includes(check.verdict)) {
    log(`Edit: correcting — ${check.corrective_instruction.slice(0, 110)}`);
    try {
      await writeFile(tmp, Buffer.from(cur, "base64"));
      const fixed = await editImage({
        srcPath: tmp,
        prompt: buildCorrectivePrompt(check.corrective_instruction, spec) +
          (hasPlate ? " Draw no text, letters, words or logos into the picture; all wording is added afterwards by code." : ""),
        width: canvas.width,
        height: canvas.height,
        timeoutS: brand.models.design.timeout_s,
      });
      const moved = await plateChanged(cur, fixed);
      if (moved.changed) {
        cur = fixed;
        corrected = true;
        composed = await render(cur);
        check = await verifyEdit(
          { jpgPath, request, steps: spec.steps, changes: spec.steps.map((x) => x.what || x.instruction), preserve: spec.preserve, provider: prev.provider },
          log
        );
      } else log("Edit: the correction did not change anything either");
    } catch (e) {
      log(`Edit: the correction could not run (${e.message.split("\n")[0]})`);
    }
  }
  try { if (existsSync(tmp)) await (await import("node:fs/promises")).unlink(tmp); } catch { /* best effort */ }

  if (spec.steps.length && !totalMove.changed && !corrected)
    check = { ...check, verdict: "NOT_APPLIED", missing: [...(check.missing || []), "the image editor returned the picture unchanged"], summary: "Nothing in the picture changed. Reword the request or make it more specific." };

  const ok = ["APPLIED", "UNCHECKED"].includes(check.verdict) && !composed.problems.length;
  const rec = {
    id: id2, created: new Date().toISOString(), status: ok ? "ready" : "needs_review",
    platform: prev.platform, placement: prev.placement, canvas: `${canvas.width}×${canvas.height}`,
    format: prev.format, formatCode: prev.formatCode, family: prev.family, category: prev.category, mode: "image",
    title: plainTitle(brief.title || prev.title), caption: prev.caption, evidence: prev.evidence, from: prev.from,
    forcedFormat: prev.forcedFormat, provider: prev.provider, concept: prev.concept || null,
    brief, design: prev.design, logo: composed.logoVariant,
    overlay: composed.overlay || null, plate: `/outputs/${path.basename(newPlate)}`,
    overrides: Object.keys({ ...(prev.overrides || {}), ...(spec.layout_overrides || {}) }).length
      ? { ...(prev.overrides || {}), ...(spec.layout_overrides || {}) } : null,
    checks: { problems: composed.problems, notes: [] },
    qa: prev.qa, editCheck: check,
    editPlan: {
      ...spec,
      appliedSteps: applied,
      corrected,
      sourceImage: `/outputs/${path.basename(srcPath)}`,
      imageModel: settings().openai.imageModel,
      editedAt: new Date().toISOString(),
    },
    parent: prev.id, edit: request,
    jpg: `/outputs/${id2}.jpg`, html: `/outputs/${id2}.html`,
  };
  await writeFile(path.join(OUT_DIR, `${id2}.html`),
    `<!-- edit-of:${prev.id} -->\n<!doctype html><meta charset="utf-8"><title>${plainTitle(brief.title || prev.title)}</title>` +
    `<body style="margin:0;background:#0B0E14;color:#8A8FA5;font:14px/1.5 system-ui"><img src="${id2}.jpg" style="max-width:100%;display:block">` +
    `<pre style="white-space:pre-wrap;padding:24px">${spec.steps.map((x) => "• " + x.instruction).join("\n\n").replace(/[<&]/g, (c) => ({ "<": "&lt;", "&": "&amp;" }[c]))}</pre></body>`);
  await writeFile(path.join(OUT_DIR, `${id2}.json`), JSON.stringify(rec, null, 2));
  log(ok ? `Done: ${check.summary || "edit applied"}` : `Done, marked needs_review: ${[...(check.missing || []), ...(check.damage || [])].slice(0, 2).join("; ") || check.verdict}`);
  return rec;
}

/** Every edit accepted so far on this image, oldest first, by walking the parent chain. */
async function editHistory(rec, limit = 12) {
  const chain = [];
  let cur = rec;
  const seen = new Set();
  while (cur && chain.length < limit && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.edit) chain.push({ request: cur.edit, applied: (cur.editCheck?.applied || []).slice(0, 3), id: cur.id });
    cur = cur.parent ? await record(cur.parent) : null;
  }
  return chain.reverse();
}

export async function edit(id, request, log = console.log) {
  const prev = await record(id);
  if (!prev) throw new Error("Image not found");
  const srcJpg = path.join(OUT_DIR, `${prev.id}.jpg`);
  if (!existsSync(srcJpg)) throw new Error("The image file for this record is missing, so it cannot be edited.");

  // A diagram is a rendered HTML page, so ANY change to it — words, layout, shape language,
  // colour, structure — is best done by re-rendering that page: the text stays crisp and the
  // brand classes stay exact. Raster editing is for photographs, which have no source to redraw.
  const isRenderedDesign = !isMetaphor(prev.format) && prev.design?.css;
  if (!isRenderedDesign) {
    const history = await editHistory(prev);
    if (history.length) log(`Edit: ${history.length} earlier edit${history.length === 1 ? "" : "s"} still in force`);
    const spec = await enrichEdit(
      { jpgPath: srcJpg, brief: prev.brief, caption: prev.caption, request, provider: prev.provider, history, concept: prev.concept },
      log
    );
    if (spec.needs_clarification)
      return { clarify: true, question: spec.question, understood: spec.understood, parent: prev.id, id: prev.id };
    return editRaster(prev, request, spec, log);
  }

  if (!prev.design) throw new Error("This image has no stored design to edit (made by an older version)");
  log("Edit: applying your request to the brief…");
  const reply = await runStage({
    stage: "qa", // the edit is a small, cheap reasoning step: it runs on the QA budget
    provider: prev.provider,
    system: EDIT_SYSTEM,
    user: `REQUEST: ${request}\n\nCAPTION:\n${prev.caption}\n${prev.evidence ? `\nEVIDENCE:\n${prev.evidence.slice(0, 4000)}\n` : ""}\nCURRENT BRIEF:\n\`\`\`json\n${JSON.stringify(prev.brief, null, 1)}\n\`\`\``,
  });
  const out = parseJson(reply);
  if (out.needs_clarification && out.question) {
    log(`Edit: ${out.question}`);
    return { clarify: true, question: out.question, understood: out.understood || "", parent: prev.id, id: prev.id };
  }
  if (out.conflicts?.length) log(`Edit: ${out.conflicts.join("; ")}`);
  const brief = out.brief || prev.brief;
  brief.format = prev.brief.format; // an edit never switches format
  const { hard, soft } = checkBrief(brief, { caption: prev.caption, evidence: prev.evidence, from: prev.from, forcedFormat: brief.format, recent: [] });
  if (hard.length) throw new Error(`That change breaks a rule, so it was not applied:\n- ${hard.join("\n- ")}\nThe image is unchanged. Reword the request within these limits and try again.`);

  const canvas = canvasFor(prev.platform, prev.placement);
  // overrides already in force on this image stay in force; the new edit may add to them
  const newDirectives = Array.isArray(out.design_directives) ? out.design_directives.filter((d) => typeof d === "string" && d.trim()) : [];
  const overrides = {
    ...(prev.overrides || {}),
    ...(out.layout_overrides || {}),
    // directives accumulate: an earlier "make it circular" survives a later "make it warmer"
    ...(newDirectives.length || prev.overrides?.directives
      ? { directives: [...(prev.overrides?.directives || []), ...newDirectives].slice(-6) }
      : {}),
  };
  const problems = [`Marketer's edit request: ${request}`];
  if (out.layout_change) problems.push(`Layout change: ${out.layout_change}`);
  if (overrides.headingAlign && overrides.headingAlign !== "left")
    problems.push(`The title and subhead must be ${overrides.headingAlign}-aligned across the full content width — this replaces the shared-left-edge rule.`);
  for (const d of newDirectives) problems.push(`The marketer asked for this and it overrides the house style: ${d}`);
  const id2 = `${prev.id.replace(/-v\d+$/, "")}-v${Date.now().toString(36)}`;
  return finish({
    id: id2,
    brief,
    briefNotes: soft,
    input: { caption: prev.caption, evidence: prev.evidence, from: prev.from, platform: prev.platform, placement: prev.placement, parent: prev.id, edit: request, provider: prev.provider },
    canvas,
    log,
    previousDesign: prev.design,
    editProblems: problems,
    overrides,
  });
}
