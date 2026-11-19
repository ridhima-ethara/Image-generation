// Central prompt registry. Every model-facing instruction in the pipeline lives here or in a
// stage file beside it, so prompts can be changed without touching pipeline logic.
//
// Each stage declares: who runs it, what it is for, and its system prompt.
// `owner` records which model performs the stage in the shipped architecture:
//   reason → the text model chosen in settings (Claude by default)
//   vision → the same, but given the rendered image
//   image  → the OpenAI image model (prompt is composed in lib/imagegen.mjs, not here)
import * as S from "./shared.mjs";
import { CONCEPTS_SYSTEM, FORMAT_SYSTEM } from "./concepts.mjs";
import { EDIT_INTENT_SYSTEM, EDIT_VERIFY_SYSTEM, DIAGRAM_EDIT_SYSTEM } from "./edit.mjs";
import { QA_DIAGRAM_SYSTEM, QA_METAPHOR_SYSTEM } from "./qa.mjs";

export const VERSION = "2026-11-18.1";

export const STAGES = {
  concepts: {
    owner: "reason",
    purpose: "Caption understanding and metaphorical concept generation: four distinct ideas to choose between.",
    system: CONCEPTS_SYSTEM,
  },
  format: {
    owner: "reason",
    purpose: "Caption understanding for non-metaphorical posts: which diagram, infographic or chart the caption supports.",
    system: FORMAT_SYSTEM,
  },
  editIntent: {
    owner: "vision",
    purpose: "Edit This Image: read the current image, interpret the user's instruction, and write the editing instruction.",
    system: EDIT_INTENT_SYSTEM,
  },
  editVerify: {
    owner: "vision",
    purpose: "Check that an edit was actually applied and that nothing else drifted.",
    system: EDIT_VERIFY_SYSTEM,
  },
  diagramEdit: {
    owner: "reason",
    purpose: "Edit This Image for diagrams: apply the request to the brief, or describe the layout change.",
    system: DIAGRAM_EDIT_SYSTEM,
  },
  qaDiagram: {
    owner: "vision",
    purpose: "Quality assessment for a rendered diagram, infographic or chart.",
    system: QA_DIAGRAM_SYSTEM,
  },
  qaMetaphor: {
    owner: "vision",
    purpose: "Quality assessment for a photographed metaphor and its drawn annotation layer.",
    system: QA_METAPHOR_SYSTEM,
  },
};

/** The system prompt for a stage. Throws loudly rather than sending an empty prompt. */
export function promptFor(stage) {
  const s = STAGES[stage];
  if (!s?.system) throw new Error(`No prompt registered for stage "${stage}"`);
  return s.system;
}

export { S as shared };
