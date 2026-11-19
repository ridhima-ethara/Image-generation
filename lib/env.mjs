// Reads a .env file next to the project, so a key can live in a file instead of the UI.
// Re-read on every call: editing .env takes effect on the next job, with no restart.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./brand.mjs";

export const ENV_PATH = path.join(ROOT, ".env");

/** Minimal dotenv: KEY=value, optional `export`, # comments, single/double quotes. */
export function dotenv() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const raw of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim();
    const q = v[0];
    if (q === '"' || q === "'") {
      // quoted: take what is inside the matching quote and ignore any trailing comment
      const close = v.indexOf(q, 1);
      out[m[1]] = close === -1 ? v.slice(1) : v.slice(1, close);
    } else {
      out[m[1]] = v.split(" #")[0].trim(); // unquoted: a trailing comment ends the value
    }
  }
  return out;
}

/** A real environment variable beats .env; .env beats nothing. */
export function envVar(name) {
  const fromProcess = process.env[name];
  if (fromProcess?.trim()) return fromProcess.trim();
  const v = dotenv()[name];
  return v?.trim() || "";
}
