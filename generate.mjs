#!/usr/bin/env node
// Command line: caption → Ethara image.
//   node generate.mjs "caption text" [--platform linkedin|instagram|facebook|x] [--format data_chart]
//                     [--evidence-file source.txt] [--from "Lu et al., arXiv 2611.10866"]
import { readFile } from "node:fs/promises";
import { generate } from "./lib/pipeline.mjs";

const args = process.argv.slice(2);
const input = { platform: "linkedin" };
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--platform") input.platform = args[++i];
  else if (a === "--placement") input.placement = args[++i];
  else if (a === "--format") input.forcedFormat = args[++i];
  else if (a === "--from") input.from = args[++i];
  else if (a === "--evidence-file") input.evidence = await readFile(args[++i], "utf8");
  else rest.push(a);
}
input.caption = rest.join(" ").trim();

try {
  const r = await generate(input, (m) => console.log(`→ ${m}`));
  console.log(`\n${r.status === "ready" ? "✓" : "!"} ${r.status}  outputs/${r.id}.jpg  (${r.canvas}, ${r.format})`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
