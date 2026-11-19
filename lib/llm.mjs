// One door to whichever model runs a stage. Callers pass the stage, not a model name:
// brand.json holds the Claude side (model/effort/timeout/retries), settings.local.json
// holds the chosen provider and the OpenAI model per stage.
import path from "node:path";
import { brand } from "./brand.mjs";
import { runClaude } from "./claude.mjs";
import { runOpenAI } from "./openai.mjs";
import { settings, PROVIDERS } from "./settings.mjs";

/** Budget for a stage: rounds/repairs/timeouts stay in brand.json whoever is running. */
export const stageConfig = (stage) => brand.models[stage];

/** The provider for this run: an explicit override wins, else the saved default. */
export const providerFor = (override) => (PROVIDERS.includes(override) ? override : settings().provider);

export const providerLabel = (p, stage) =>
  p === "openai" ? `OpenAI ${settings().openai.models[stage]}` : `Claude ${brand.models[stage].model}`;

/**
 * Run one stage. `imagePath` is only meaningful for QA: Claude reads it from disk with
 * its Read tool, OpenAI gets it inline as a data: URL. Everything else is identical.
 */
export async function runStage({ stage, provider, system, user, imagePath = "" }) {
  const cfg = stageConfig(stage);
  const p = providerFor(provider);
  if (p === "openai") {
    return runOpenAI({
      system,
      user,
      model: settings().openai.models[stage],
      effort: cfg.effort,
      timeoutS: cfg.timeout_s,
      imagePath,
    });
  }
  return runClaude({
    system,
    user,
    model: cfg.model,
    effort: cfg.effort,
    timeoutS: cfg.timeout_s,
    // Claude opens the file itself: it needs the directory unlocked, not the file path
    ...(imagePath ? { tools: "Read", addDir: path.dirname(imagePath) } : {}),
  });
}
