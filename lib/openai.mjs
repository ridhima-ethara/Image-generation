// The OpenAI bridge: same contract as runClaude (system + user in, reply text out).
// Differences handled here, not by the callers:
//  - no filesystem tool, so the QA stage sends the JPG inline as a data: URL (vision)
//  - reasoning_effort is only accepted by some models, so a rejection retries without it
import { readFileSync } from "node:fs";
import { settings } from "./settings.mjs";

const REASONING_REJECTED = /reasoning_effort|unsupported_parameter|unrecognized request argument/i;

async function post(url, key, payload, signal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
    signal,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

/**
 * @param imagePath when set, the image is sent with the user message (the QA stage).
 * @returns the assistant's reply text.
 */
export async function runOpenAI({ system, user, model, effort, timeoutS = 300, imagePath = "" }) {
  const cfg = settings().openai;
  if (!cfg.apiKey) throw new Error("No OpenAI API key set. Add one in Settings → Model provider.");

  const content = [{ type: "text", text: user }];
  if (imagePath) {
    const b64 = readFileSync(imagePath).toString("base64");
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
  }
  const base = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutS * 1000);
  try {
    let r = await post(`${cfg.baseUrl}/chat/completions`, cfg.apiKey, effort ? { ...base, reasoning_effort: effort } : base, ctrl.signal);
    // models that don't take a reasoning budget: drop it and try once more
    if (!r.ok && effort && REASONING_REJECTED.test(r.text)) r = await post(`${cfg.baseUrl}/chat/completions`, cfg.apiKey, base, ctrl.signal);
    if (!r.ok) {
      let msg = r.text.slice(0, 400);
      try { msg = JSON.parse(r.text).error?.message || msg; } catch { /* keep the raw body */ }
      throw new Error(`OpenAI ${r.status}: ${msg}`);
    }
    const body = JSON.parse(r.text);
    const out = body.choices?.[0]?.message?.content;
    if (!out?.trim()) throw new Error(`OpenAI returned an empty reply (finish_reason: ${body.choices?.[0]?.finish_reason || "?"})`);
    return out;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`OpenAI (${model}) timed out after ${timeoutS}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Validate a key and list the models it can actually see. Used by the Test button. */
export async function listModels(apiKey, baseUrl = "https://api.openai.com/v1") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try { msg = JSON.parse(text).error?.message || msg; } catch { /* keep the raw body */ }
      throw new Error(`${res.status}: ${msg}`);
    }
    return (JSON.parse(text).data || []).map((m) => m.id).sort();
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Timed out reaching OpenAI" : e.message);
  } finally {
    clearTimeout(timer);
  }
}
