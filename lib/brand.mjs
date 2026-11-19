// Brand config, fonts, logos and the canvas geometry every format shares.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BRAND_DIR = path.join(ROOT, "brand");
export const OUT_DIR = path.join(ROOT, "outputs");
export const NOTES_PATH = path.join(BRAND_DIR, "notes.md");
export const FORMATS_PATH = path.join(ROOT, "rules", "formats.md");

export const brand = JSON.parse(readFileSync(path.join(BRAND_DIR, "brand.json"), "utf8"));

export const FORMATS = ["concept_metaphor", "systems_diagram", "branded_infographic", "data_chart"];
export const FORMAT_CODE = { concept_metaphor: "A", systems_diagram: "B", branded_infographic: "C", data_chart: "D" };

/** Two categories: metaphorical images are photographed, diagrammatic ones are built as HTML. */
export const routeFor = (format) => brand.routing?.[format] || { category: "diagrammatic", render: "html" };
export const isMetaphor = (format) => routeFor(format).category === "metaphorical";
export const METAPHOR_FORMATS = FORMATS.filter(isMetaphor);
export const DIAGRAM_FORMATS = FORMATS.filter((f) => !isMetaphor(f));

/** The canvas for a platform + placement. */
export function canvasFor(platform, placement) {
  const p = brand.placements[platform];
  if (!p) throw new Error(`Unknown platform "${platform}"`);
  const name = placement || brand.default_placement[platform];
  const size = p[name];
  if (!size) throw new Error(`Unknown placement "${name}" for ${platform}`);
  return { width: size[0], height: size[1], placement: name };
}

/** Logo band, title position and type minimums (html_design.py / compositor.py). */
export function geometry(width, height) {
  const short = Math.min(width, height);
  const margin = Math.floor(short * brand.logo.margin_share);
  // logoH is the visible wordmark height (the logo files are trimmed to their ink)
  const logoH = Math.max(18, Math.round(short * brand.logo.height_share));
  const logoW = Math.round(logoH * brand.logo.aspect);
  return {
    short,
    margin,
    logoH,
    logoW,
    logoOffset: margin, // top edge, and left edge when there is no title to align with
    zoneW: Math.max(Math.round(short * 0.3), margin + logoW + Math.round(logoH / 2)),
    band: margin + logoH + Math.round(logoH / 2), // logo plus half a logo-height of clear space
    gap: Math.round(short * 0.035), // title starts within this under the band
    titleMin: Math.round(short * 0.045),
    minText: Math.round(short * 0.022),
  };
}

/** Colours a design may use. Magenta only when the brief asks; role colours only for B. */
export function palette(brief) {
  const out = {};
  for (const [k, v] of Object.entries(brand.accents)) {
    if (k !== "magenta" || brief.use_magenta) out[`accent ${k}`] = v.toUpperCase();
  }
  brand.neutrals.forEach((v, i) => (out[`neutral ${i + 1}`] = v.toUpperCase()));
  if (brief.format === "systems_diagram") {
    for (const [k, v] of Object.entries(brand.functional)) out[`role ${k}`] = v.toUpperCase();
  }
  return out;
}

let fontCss;
export function fontFaceCss() {
  if (fontCss) return fontCss;
  const face = (family, file, weight, style = "normal") => {
    const data = readFileSync(path.join(BRAND_DIR, "fonts", file)).toString("base64");
    return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${data}) format('truetype');font-weight:${weight};font-style:${style};}`;
  };
  fontCss =
    face("Roboto", "Roboto.ttf", "100 900") +
    face("Roboto", "Roboto-Italic.ttf", "100 900", "italic") +
    face("DM Sans", "DMSans.ttf", "100 1000");
  return fontCss;
}

export function logoDataUrls() {
  const read = (f) => {
    const p = path.join(BRAND_DIR, f);
    if (!existsSync(p)) throw new Error(`NEEDS_ASSET: logo file missing (${p})`);
    return "data:image/png;base64," + readFileSync(p).toString("base64");
  };
  return { onDark: read(brand.logo.on_dark), onLight: read(brand.logo.on_light) };
}

export function notes() {
  return existsSync(NOTES_PATH) ? readFileSync(NOTES_PATH, "utf8").trim() : "";
}
