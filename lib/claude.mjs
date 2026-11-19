// The "Claude bridge": one isolated `claude -p` call (no tools unless asked, no MCP servers,
// no user hooks or settings, no saved session).
import { spawn } from "node:child_process";

export function runClaude({ system, user, model, effort, timeoutS = 300, tools = "", addDir = "" }) {
  const args = [
    "-p",
    "--output-format", "text",
    "--system-prompt", system,
    "--tools", tools,
    "--no-session-persistence",
    "--strict-mcp-config",
    "--setting-sources", "local",
  ];
  if (tools) args.push("--allowedTools", tools);
  if (addDir) args.push("--add-dir", addDir);
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);

  return new Promise((resolve, reject) => {
    // detached: its own session with no controlling terminal, so a server running in the
    // background never has the CLI stopped by the OS for touching the terminal (SIGTTIN/SIGTTOU).
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], detached: true, env: { ...process.env, CI: "1" } });
    const killGroup = (sig) => {
      try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } }
    };
    let out = "", err = "", timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), 3000).unref();
      reject(new Error(`Claude (${model || "default"}) timed out after ${timeoutS}s${err ? `: ${err.slice(-400)}` : ""}`));
    }, timeoutS * 1000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start the claude CLI: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`Claude (${model || "default"}) timed out after ${timeoutS}s`));
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 600)}`));
      resolve(out);
    });
    child.stdin.end(user);
  });
}

/** The body of the first ```lang fenced block, or null. */
export function fenced(text, lang) {
  const m = new RegExp("```" + lang + "[ \\t]*\\n([\\s\\S]*?)```", "i").exec(text);
  return m ? m[1].trim() : null;
}

/** A JSON object from a reply: the ```json block, else the outermost {...}. */
export function parseJson(text) {
  const block = fenced(text, "json");
  const raw = block ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}
