// Claude QA on the finished image (prompts/qa.md): PASS, REVISE or REGENERATE with located defects.
import { brand } from "./brand.mjs";
import { parseJson } from "./claude.mjs";
import { runStage } from "./llm.mjs";
import { specText } from "./brief.mjs";
import { isMetaphor } from "./brand.mjs";
import { QA_DIAGRAM_SYSTEM as SYSTEM, QA_METAPHOR_SYSTEM as META_SYSTEM } from "./prompts/qa.mjs";

export async function reviewImage({ jpgPath, brief, caption, evidence, provider }, log) {
  const cfg = brand.models.qa;
  log("QA: reviewing the finished image…");
  const metaphor = isMetaphor(brief.format);
  const user = `IMAGE FILE: ${jpgPath}\n\nCAPTION:\n${caption}\n${evidence ? `\nEVIDENCE (excerpt):\n${evidence.slice(0, 3000)}\n` : ""}\nBRIEF:\n- format: ${brief.format}\n- thesis: ${brief.thesis}\n- rationale: ${brief.rationale || ""}\n\nTHE ONLY STRINGS ALLOWED ON THE IMAGE:\n${specText(brief).map((t) => `- ${t}`).join("\n")}\n\nThe logo is the official Ethara.AI wordmark placed by code; do not flag it as extra text.${
    metaphor && brief.scene
      ? `${
          (brief.annotation?.callouts || []).length
            ? `\n\nEACH LABEL AND THE THING IT IS SUPPOSED TO POINT AT — check that the label sits on or beside that exact thing, and that its leader line ends on it:\n${(brief.annotation.callouts || []).map((c) => `- "${c.label}" should point at: ${c.points_at || "(unstated)"}`).join("\n")}`
            : ""
        }\n\nTHE SCENE THE PHOTOGRAPH WAS MEANT TO SHOW:\n- subject: ${brief.scene.subject}\n- action: ${brief.scene.action || ""}\n- objects: ${(brief.scene.objects || []).map((o) => o.what).join(", ")}\n- people: ${brief.scene.people?.present ? `${brief.scene.people.who} (${brief.scene.people.framing})` : "none"}\nJudge whether the photograph actually delivers this, and whether it argues the thesis.`
      : ""
  }`;
  let reply;
  try {
    reply = await runStage({ stage: "qa", provider, system: metaphor ? META_SYSTEM : SYSTEM, user, imagePath: jpgPath });
  } catch (e) {
    // a slow or failed review never throws away a finished image: keep it, mark it for review
    log(`QA: could not finish (${e.message.split("\n")[0]}); image kept, marked for review`);
    return { verdict: "UNREVIEWED", defects: [], summary: "The review did not finish; check this image by eye." };
  }
  try {
    const qa = parseJson(reply);
    if (!["PASS", "REVISE", "REGENERATE"].includes(qa.verdict)) throw new Error("bad verdict");
    qa.defects ||= [];
    log(`QA: ${qa.verdict}${qa.defects.length ? ` — ${qa.defects.length} defect(s)` : ""}`);
    return qa;
  } catch {
    log("QA: reply could not be read; marking for review");
    return { verdict: "UNREADABLE", defects: [], summary: reply.slice(0, 300) };
  }
}

export const defectsAsProblems = (qa) =>
  qa.defects.map((d) => `QA (${qa.verdict}): ${d.where ? d.where + ": " : ""}${d.problem}${d.fix ? " → " + d.fix : ""}`);
