// Local settings: which provider runs each stage, and the OpenAI key.
// The key lives in settings.local.json (chmod 600, never served, never logged, never
// written into an image record). Only a masked hint ever leaves this module.
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./brand.mjs";
import { envVar } from "./env.mjs";

export const SETTINGS_PATH = path.join(ROOT, "settings.local.json");
export const PROVIDERS = ["claude", "openai"];
const STAGES = ["brief", "design", "qa"];
export const MODES = ["html", "image"];

const DEFAULTS = {
  provider: "claude",
  mode: "html",   // "html" = design the page; "image" = generate the picture with an image model
  openai: { apiKey: "", baseUrl: "https://api.openai.com/v1", imageModel: "gpt-image-2.5-sunburst", models: { brief: "gpt-4o", design: "gpt-4o", qa: "gpt-4o" } },
};

/** What .env contributes. An empty string means "not set there". */
export function envOverrides() {
  return {
    provider: envVar("IMAGE_AGENT_PROVIDER"),
    mode: envVar("IMAGE_AGENT_MODE"),
    imageModel: envVar("OPENAI_IMAGE_MODEL"),
    apiKey: envVar("OPENAI_API_KEY"),
    baseUrl: envVar("OPENAI_BASE_URL"),
    models: { brief: envVar("OPENAI_MODEL_BRIEF"), design: envVar("OPENAI_MODEL_DESIGN"), qa: envVar("OPENAI_MODEL_QA") },
  };
}

/** Where the key in force came from — shown in the UI so the source is never a mystery. */
export function keySource() {
  if (envVar("OPENAI_API_KEY")) return "env";
  return stored().openai.apiKey ? "saved" : "none";
}

function stored() {
  if (!existsSync(SETTINGS_PATH)) return structuredClone(DEFAULTS);
  try {
    const s = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    return {
      provider: PROVIDERS.includes(s.provider) ? s.provider : DEFAULTS.provider,
      mode: MODES.includes(s.mode) ? s.mode : DEFAULTS.mode,
      openai: {
        apiKey: String(s.openai?.apiKey || ""),
        baseUrl: String(s.openai?.baseUrl || DEFAULTS.openai.baseUrl).replace(/\/+$/, ""),
        imageModel: String(s.openai?.imageModel || DEFAULTS.openai.imageModel),
        models: Object.fromEntries(STAGES.map((k) => [k, String(s.openai?.models?.[k] || DEFAULTS.openai.models[k])])),
      },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/** The settings actually in force: .env wins over anything saved from the UI. */
export function settings() {
  const base = stored(), env = envOverrides();
  return {
    provider: PROVIDERS.includes(env.provider) ? env.provider : base.provider,
    mode: MODES.includes(env.mode) ? env.mode : base.mode,
    openai: {
      apiKey: env.apiKey || base.openai.apiKey,
      baseUrl: env.baseUrl || base.openai.baseUrl,
      imageModel: env.imageModel || base.openai.imageModel,
      models: Object.fromEntries(STAGES.map((k) => [k, env.models[k] || base.openai.models[k]])),
    },
  };
}

/** Save. An absent/undefined apiKey keeps the stored one, so the UI never has to resend it. */
export function saveSettings(patch) {
  const cur = stored();   // never write env-provided values back into the file
  const next = {
    provider: PROVIDERS.includes(patch.provider) ? patch.provider : cur.provider,
    mode: MODES.includes(patch.mode) ? patch.mode : cur.mode,
    openai: {
      apiKey: patch.openai?.apiKey === undefined ? cur.openai.apiKey : String(patch.openai.apiKey).trim(),
      baseUrl: String(patch.openai?.baseUrl || cur.openai.baseUrl).replace(/\/+$/, ""),
      imageModel: String(patch.openai?.imageModel || cur.openai.imageModel),
      models: Object.fromEntries(STAGES.map((k) => [k, String(patch.openai?.models?.[k] || cur.openai.models[k])])),
    },
  };
  writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  try { chmodSync(SETTINGS_PATH, 0o600); } catch { /* best effort on odd filesystems */ }
  return next;
}

/** "sk-…a1b2" — enough to recognise a key, never enough to use one. */
export const maskKey = (k = "") => (k ? `${k.slice(0, 3)}…${k.slice(-4)}` : "");

/** The shape the UI is allowed to see: no key, only whether one is set and how it looks. */
export function publicSettings() {
  const s = settings(), env = envOverrides();
  return {
    provider: s.provider,
    providers: PROVIDERS,
    mode: s.mode,
    modes: MODES,
    keySource: keySource(),                       // "env" | "saved" | "none"
    envLocked: {                                  // fields .env is supplying, so the UI can say so
      provider: !!env.provider, apiKey: !!env.apiKey, baseUrl: !!env.baseUrl,
      models: { brief: !!env.models.brief, design: !!env.models.design, qa: !!env.models.qa },
    },
    openai: { hasKey: !!s.openai.apiKey, keyHint: maskKey(s.openai.apiKey), baseUrl: s.openai.baseUrl, imageModel: s.openai.imageModel, models: s.openai.models },
  };
}
