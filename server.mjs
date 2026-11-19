#!/usr/bin/env node
// Local web UI.  npm start → http://127.0.0.1:4317
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ROOT, OUT_DIR, NOTES_PATH, brand, FORMATS } from "./lib/brand.mjs";
import { generate, edit, records, record } from "./lib/pipeline.mjs";
import { ideate } from "./lib/ideate.mjs";
import { publicSettings, saveSettings, settings, PROVIDERS } from "./lib/settings.mjs";
import { listModels } from "./lib/openai.mjs";

const PORT = Number(process.env.PORT) || 4317;
const MIME = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json" };
const MAX_JOBS = 3; // images made at once (config.yaml concurrency)

const jobs = new Map(); // id → { status, log, result, error }
let running = 0;
const queue = [];

function startJob(work) {
  const id = randomUUID();
  const job = { id, status: "queued", log: [], result: null, error: null, started: Date.now() };
  jobs.set(id, job);
  const log = (m) => {
    job.log.push({ t: Math.round((Date.now() - job.started) / 1000), m });
    console.log(`[${id.slice(0, 6)}] ${m}`);
  };
  const run = async () => {
    running++;
    job.status = "running";
    try {
      job.result = await work(log);
      job.status = "done";
    } catch (e) {
      job.error = e.message;
      job.status = "failed";
      log(`Failed: ${e.message.split("\n")[0]}`);
    } finally {
      running--;
      queue.shift()?.();
    }
  };
  if (running < MAX_JOBS) run();
  else {
    log("Waiting: 3 images are already being made");
    queue.push(run);
  }
  return id;
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

async function body(req, limit = 2_000_000) {
  let data = "";
  for await (const c of req) {
    data += c;
    if (data.length > limit) throw new Error("Request too large");
  }
  return JSON.parse(data || "{}");
}

const summary = (r) => ({ id: r.id, jpg: r.jpg, html: r.html, title: r.title, status: r.status, format: r.format, formatCode: r.formatCode, canvas: r.canvas, platform: r.platform, created: r.created });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (req.method === "GET" && p === "/") return send(res, 200, await readFile(path.join(ROOT, "ui", "index.html")), MIME[".html"]);
    if (req.method === "GET" && p.startsWith("/outputs/")) {
      const file = path.resolve(OUT_DIR, decodeURIComponent(p.slice(9)));
      if (!file.startsWith(OUT_DIR + path.sep) || !existsSync(file)) return send(res, 404, { error: "Not found" });
      return send(res, 200, await readFile(file), MIME[path.extname(file)] || "application/octet-stream");
    }
    if (req.method === "GET" && p === "/api/config")
      return send(res, 200, { placements: brand.placements, defaults: brand.default_placement, routing: brand.routing, settings: publicSettings() });
    if (req.method === "GET" && p === "/api/history") return send(res, 200, (await records()).map(summary));
    if (req.method === "GET" && p.startsWith("/api/images/")) {
      const r = await record(p.slice(12));
      return r ? send(res, 200, r) : send(res, 404, { error: "Not found" });
    }
    // step 0: propose ideas before anything is drawn
    if (req.method === "POST" && p === "/api/ideate") {
      const { caption, evidence, from, kind, provider, exclude } = await body(req);
      if (!caption?.trim()) return send(res, 400, { error: "Paste the post caption first" });
      const id = startJob((log) =>
        ideate({
          caption: caption.trim(),
          evidence: evidence?.trim(),
          from: from?.trim(),
          kind: kind === "diagram" ? "diagram" : "metaphor",
          provider: PROVIDERS.includes(provider) ? provider : undefined,
          exclude: Array.isArray(exclude) ? exclude.slice(0, 12).map(String) : [],
        }, log)
      );
      return send(res, 202, { job: id });
    }

    if (req.method === "POST" && p === "/api/generate") {
      const { caption, evidence, from, platform, forcedFormat, provider, concept } = await body(req);
      if (!caption?.trim()) return send(res, 400, { error: "Paste the post caption first" });
      if (!brand.placements[platform]) return send(res, 400, { error: "Unknown platform" });
      const ok = ["", ...FORMATS];
      const id = startJob((log) =>
        generate({
          caption: caption.trim(), evidence: evidence?.trim(), from: from?.trim(), platform,
          forcedFormat: ok.includes(forcedFormat) ? forcedFormat : "",
          provider: PROVIDERS.includes(provider) ? provider : undefined,
          concept: concept && typeof concept === "object" ? concept : null,
        }, log)
      );
      return send(res, 202, { job: id });
    }
    if (req.method === "POST" && p === "/api/edit") {
      const { id, request } = await body(req);
      if (!request?.trim()) return send(res, 400, { error: "Say what to change" });
      return send(res, 202, { job: startJob((log) => edit(id, request.trim(), log)) });
    }
    if (req.method === "GET" && p.startsWith("/api/jobs/")) {
      const job = jobs.get(p.slice(10));
      if (!job) return send(res, 404, { error: "Job not found (the server restarted?)" });
      return send(res, 200, { status: job.status, log: job.log, error: job.error, result: job.result });
    }
    // settings: the key goes IN here, and never comes back out — only a masked hint
    if (req.method === "GET" && p === "/api/settings") return send(res, 200, publicSettings());
    if (req.method === "PUT" && p === "/api/settings") {
      const patch = await body(req);
      if (patch.provider && !PROVIDERS.includes(patch.provider)) return send(res, 400, { error: "Unknown provider" });
      saveSettings(patch);
      return send(res, 200, publicSettings());
    }
    if (req.method === "POST" && p === "/api/settings/test") {
      const { apiKey, baseUrl } = await body(req);
      const cfg = settings().openai;
      // an empty key in the request means "test the one already saved"
      const key = apiKey?.trim() || cfg.apiKey;
      if (!key) return send(res, 400, { error: "No API key to test" });
      try {
        const models = await listModels(key, baseUrl?.trim() || cfg.baseUrl);
        return send(res, 200, { ok: true, count: models.length, models });
      } catch (e) {
        return send(res, 200, { ok: false, error: e.message });
      }
    }

    if (req.method === "GET" && p === "/api/notes") return send(res, 200, { text: existsSync(NOTES_PATH) ? await readFile(NOTES_PATH, "utf8") : "" });
    if (req.method === "PUT" && p === "/api/notes") {
      const { text } = await body(req);
      await writeFile(NOTES_PATH, String(text ?? ""));
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

server.requestTimeout = 0;
server.listen(PORT, "127.0.0.1", () => console.log(`Ethara image agent → http://127.0.0.1:${PORT}`));
