// The annotation layer: every word on a photographed metaphor is drawn here, in brand type,
// as HTML/CSS/SVG over the picture — never by the image model.
// The treatment is chosen per image by the brief, so two images do not look alike.
import { brand, geometry } from "./brand.mjs";

export const STYLES = ["editorial_only", "object_labels", "technical_callouts", "numbered_steps", "split_compare"];
export const ZONES = ["left", "right", "bottom", "bottom_left", "top_left"];

const esc = (s = "") => String(s).replace(/[<&>]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" }[c]));

/**
 * ANNOTATION REGISTRY — the single source of truth for what gets labelled.
 * Runs before anything is drawn. One annotation per semantic concept, one per target, and
 * nothing that points at empty space. Returns the surviving callouts and what it removed.
 */
export function registerAnnotations(callouts = [], opts = {}) {
  const { maxLabels = 3, minSeparation = 0.07 } = opts;
  const norm = (x = "") => String(x).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const stem = (x = "") => norm(x).split(" ").filter((w) => w.length > 3).sort().join(" ");
  const kept = [], dropped = [];
  const byText = new Set(), byTarget = new Set(), byConcept = new Set();

  for (const [i, c] of callouts.entries()) {
    const label = String(c?.label || "").trim();
    if (!label) { dropped.push({ label: "(blank)", why: "no text" }); continue; }
    const target = norm(c.points_at || "");
    const text = norm(label);
    const concept = stem(label);

    // the same words twice is always a duplicate
    if (byText.has(text)) { dropped.push({ label, why: "identical label already placed" }); continue; }
    // the same semantic idea, differently worded
    if (concept && byConcept.has(concept)) { dropped.push({ label, why: "same concept as an existing label" }); continue; }
    // two labels on one object: the first wins
    if (target && byTarget.has(target)) { dropped.push({ label, why: `"${c.points_at}" is already labelled` }); continue; }
    // an anchor that points nowhere cannot be drawn honestly
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) { dropped.push({ label, why: "no anchor point" }); continue; }
    if (c.x < 0 || c.x > 100 || c.y < 0 || c.y > 100) { dropped.push({ label, why: "anchor outside the canvas" }); continue; }
    if (!target) { dropped.push({ label, why: "does not name the element it points at" }); continue; }
    // two anchors on top of each other produce crossing connectors
    const clash = kept.find((k) => Math.hypot((k.x - c.x) / 100, (k.y - c.y) / 100) < minSeparation);
    if (clash) { dropped.push({ label, why: `anchor sits on top of "${clash.label}"` }); continue; }

    byText.add(text); byConcept.add(concept); byTarget.add(target);
    // normalised coordinates travel with the annotation, so any canvas size can use them
    kept.push({ ...c, label, id: c.id || `a${i + 1}`, nx: c.x / 100, ny: c.y / 100, priority: Number(c.priority) || kept.length + 1 });
    if (kept.length >= maxLabels) {
      for (const rest of callouts.slice(i + 1)) if (rest?.label) dropped.push({ label: rest.label, why: `over the ${maxLabels}-label limit` });
      break;
    }
  }
  return { callouts: kept, dropped };
}

/** Where the headline sits, and the scrim that guarantees it stays readable. */
export function headlineZone(zone, width, height) {
  const g = geometry(width, height);
  const M = g.margin;
  const band = Math.round(height * 0.46), col = Math.round(width * 0.58);
  switch (zone) {
    case "right":
      return {
        copy: `right:${M}px;top:${Math.round(height * 0.3)}px;width:${Math.round(width * 0.42)}px;text-align:right;`,
        scrim: `right:0;top:0;bottom:0;width:${col}px;background:linear-gradient(to left,#0B0E14 14%,rgba(11,14,20,.74) 52%,rgba(11,14,20,0) 100%);`,
        rect: { x: width - M - width * 0.42, y: height * 0.3, w: width * 0.42, h: height * 0.4 },
      };
    case "bottom":
      return {
        copy: `left:${M}px;right:${M}px;bottom:${M}px;`,
        scrim: `left:0;right:0;bottom:0;height:${band}px;background:linear-gradient(to top,#0B0E14 18%,rgba(11,14,20,.72) 55%,rgba(11,14,20,0) 100%);`,
        rect: { x: M, y: height - M - height * 0.3, w: width - 2 * M, h: height * 0.3 },
      };
    case "bottom_left":
      return {
        copy: `left:${M}px;bottom:${M}px;width:${Math.round(width * 0.5)}px;`,
        scrim: `left:0;bottom:0;width:${Math.round(width * 0.72)}px;height:${band}px;background:linear-gradient(to top right,#0B0E14 10%,rgba(11,14,20,.70) 48%,rgba(11,14,20,0) 100%);`,
        rect: { x: M, y: height - M - height * 0.32, w: width * 0.5, h: height * 0.32 },
      };
    case "top_left":
      return {
        copy: `left:${M}px;top:${g.band + g.gap}px;width:${Math.round(width * 0.46)}px;`,
        scrim: `left:0;top:0;width:${Math.round(width * 0.66)}px;height:${Math.round(height * 0.5)}px;background:linear-gradient(to bottom right,#0B0E14 12%,rgba(11,14,20,.70) 50%,rgba(11,14,20,0) 100%);`,
        rect: { x: M, y: g.band, w: width * 0.46, h: height * 0.34 },
      };
    default: // left
      return {
        copy: `left:${M}px;top:${Math.round(height * 0.34)}px;width:${Math.round(width * 0.42)}px;`,
        scrim: `left:0;top:0;bottom:0;width:${col}px;background:linear-gradient(to right,#0B0E14 14%,rgba(11,14,20,.74) 52%,rgba(11,14,20,0) 100%);`,
        rect: { x: M, y: height * 0.34, w: width * 0.42, h: height * 0.4 },
      };
  }
}

/** Type treatment per style: the headline itself changes character, not just the labels. */
function typeFor(style, width, height) {
  const S = Math.min(width, height);
  const base = { title: Math.round(S * 0.058), sub: Math.round(S * 0.026), lab: Math.max(13, Math.round(S * 0.019)) };
  switch (style) {
    case "editorial_only":
      return { ...base, title: Math.round(S * 0.072), titleWeight: 300, titleSpacing: "-0.02em", subColor: "#8A8FA5", rule: true };
    case "technical_callouts":
      return { ...base, title: Math.round(S * 0.05), titleWeight: 600, titleSpacing: "0", labUpper: true, labSpacing: ".10em", mono: true };
    case "numbered_steps":
      return { ...base, titleWeight: 700, titleSpacing: "-0.01em", labUpper: false };
    case "split_compare":
      return { ...base, title: Math.round(S * 0.054), titleWeight: 700, labUpper: true, labSpacing: ".10em" };
    default: // object_labels
      return { ...base, titleWeight: 700, titleSpacing: "-0.01em", labUpper: true, labSpacing: ".08em" };
  }
}

/**
 * Build the overlay. Returns { css, html } to drop into the composited page.
 * `ann` is the brief's annotation block; everything is optional and degrades to a clean headline.
 */
export function annotationLayer(b, width, height) {
  const ann = b.annotation || {};
  const style = STYLES.includes(ann.style) ? ann.style : "object_labels";
  const zone = ZONES.includes(ann.headline_zone) ? ann.headline_zone : "left";
  const z = headlineZone(zone, width, height);
  const t = typeFor(style, width, height);
  const marked = (b.title || "").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // every label passes the registry before it can be drawn
  const reg = registerAnnotations(style === "editorial_only" ? [] : ann.callouts || []);
  const calls = reg.callouts;

  const labCss = `font-family:${t.mono ? "'DM Sans'" : "'DM Sans'"};font-weight:600;font-size:${t.lab}px;` +
    (t.labUpper ? `text-transform:uppercase;letter-spacing:${t.labSpacing || ".08em"};` : "letter-spacing:.01em;") +
    `color:#FFFFFF;`;

  // one <svg> holds every leader line and arrowhead so they sit under the labels
  const leaders = [];
  // RAIL: when labels would crowd the subject, stack them in a margin column and run leaders to
  // the parts. A technical drawing never floats labels over the artwork, and a rail cannot collide.
  const M = geometry(width, height).margin;
  const useRail = ann.label_placement === "rail" || (calls.length >= 3 && style !== "numbered_steps");
  if (useRail && calls.length) {
    const right = calls.reduce((n, c) => n + (c.x > 50 ? 1 : -1), 0) >= 0; // rail on the busier side's edge
    const railX = right ? width - M : M;
    const span = height * 0.46;
    const top = height * 0.3;
    const rows = calls.map((c, i) => top + (calls.length === 1 ? span / 2 : (i * span) / (calls.length - 1)));
    const nodes2 = calls.map((c, i) => {
      const ax = (Math.min(94, Math.max(3, c.x)) / 100) * width;
      const ay = (Math.min(95, Math.max(3, c.y)) / 100) * height;
      const ry = Math.round(rows[i]);
      const elbow = right ? Math.max(ax + 24, railX - Math.round(width * 0.16)) : Math.min(ax - 24, railX + Math.round(width * 0.16));
      leaders.push(
        `<path data-leader-for="r${i}" data-ax="${ax}" data-ay="${ay}" d="M ${ax} ${ay} L ${elbow} ${ay} L ${elbow} ${ry} L ${right ? railX - 10 : railX + 10} ${ry}" fill="none" stroke="#A855F7" stroke-width="1.5" />` +
        `<circle cx="${ax}" cy="${ay}" r="3" fill="#A855F7" />`
      );
      return `<div class="lab" data-leader="r${i}" style="left:${railX}px;top:${ry}px;transform:translate(${right ? "-100%" : "0"},-50%);">${esc(c.label)}</div>`;
    });
    const css0 = `
.scrim{position:absolute;${z.scrim}}
.copy{position:absolute;${z.copy}}
.t{font-family:'Roboto';font-weight:${t.titleWeight};font-size:${t.title}px;line-height:1.08;letter-spacing:${t.titleSpacing || "-0.01em"};color:#FFFFFF;margin:0}
.t em{font-style:normal;color:#A855F7}
.s{font-family:'DM Sans';font-weight:400;font-size:${t.sub}px;line-height:1.35;color:${t.subColor || "#C9CDDA"};margin:${Math.round(t.sub * 0.7)}px 0 0}
.ann{position:absolute;inset:0;pointer-events:none}
.lab{position:absolute;${labCss}background:rgba(11,14,20,.74);padding:3px 9px;border-radius:4px;white-space:nowrap}
`;
    return {
      css: css0,
      html:
        `<div class="scrim"></div>` +
        `<div class="copy"><h1 class="t">${marked}</h1>${b.subhead ? `<p class="s">${b.subhead}</p>` : ""}</div>` +
        `<div class="ann"><svg width="${width}" height="${height}" style="position:absolute;inset:0">${leaders.join("")}</svg>${nodes2.join("")}</div>`,
      style, zone, headlineRect: z.rect, labelCount: calls.length, placement: "rail", dropped: reg.dropped,
    };
  }
  const nodes = calls.map((c, i) => {
    const x = Math.min(94, Math.max(3, c.x)), y = Math.min(95, Math.max(3, c.y));
    const px = (x / 100) * width, py = (y / 100) * height;
    const flip = x > 55;
    const run = Math.round(Math.min(width, height) * (style === "technical_callouts" ? 0.11 : 0.045));
    const lx = flip ? px - run : px + run;
    if (style === "technical_callouts") {
      // technical drawing: elbow leader with a small arrowhead at the part
      const midY = py - Math.round(run * 0.55);
      leaders.push(
        `<path data-leader-for="l${i}" data-ax="${px}" data-ay="${py}" d="M ${px} ${py} L ${px} ${midY} L ${lx} ${midY}" fill="none" stroke="#A855F7" stroke-width="1.6" />` +
        `<circle cx="${px}" cy="${py}" r="3.2" fill="#A855F7" />`
      );
      return `<div class="lab" data-leader="l${i}" style="left:${lx}px;top:${midY}px;transform:translate(${flip ? "-100%" : "0"},-115%);">${esc(c.label)}</div>`;
    }
    if (style === "numbered_steps") {
      return `<div class="num" style="left:${px}px;top:${py}px;">${i + 1}</div>`;
    }
    // object_labels / split_compare: a short rule from the part to the word
    leaders.push(
      `<path data-leader-for="l${i}" data-ax="${px}" data-ay="${py}" d="M ${px} ${py} L ${lx} ${py}" fill="none" stroke="#A855F7" stroke-width="1.5" />` +
      `<circle cx="${px}" cy="${py}" r="3" fill="#A855F7" />`
    );
    return `<div class="lab" data-leader="l${i}" style="left:${lx + (flip ? -6 : 6)}px;top:${py}px;transform:translate(${flip ? "-100%" : "0"},-50%);">${esc(c.label)}</div>`;
  });

  // the numbered style needs a legend, because a bare digit says nothing on its own
  const legend =
    style === "numbered_steps" && calls.length
      ? `<ol class="legend">${calls.map((c) => `<li><span>${esc(c.label)}</span></li>`).join("")}</ol>`
      : "";

  // a split comparison gets a real divider and two side tags
  const cmp = ann.compare || null;
  const split =
    style === "split_compare" && cmp?.left && cmp?.right
      ? `<div class="divider"></div>
         <div class="side side-l">${esc(cmp.left)}</div>
         <div class="side side-r">${esc(cmp.right)}</div>`
      : "";

  const css = `
.scrim{position:absolute;${z.scrim}}
.copy{position:absolute;${z.copy}}
.t{font-family:'Roboto';font-weight:${t.titleWeight};font-size:${t.title}px;line-height:1.08;letter-spacing:${t.titleSpacing || "-0.01em"};color:#FFFFFF;margin:0}
.t em{font-style:normal;color:#A855F7}
.s{font-family:'DM Sans';font-weight:400;font-size:${t.sub}px;line-height:1.35;color:${t.subColor || "#C9CDDA"};margin:${Math.round(t.sub * 0.7)}px 0 0}
${t.rule ? `.rule{width:${Math.round(t.title * 0.9)}px;height:3px;background:#8B2CF5;margin:0 0 ${Math.round(t.sub * 0.9)}px}` : ""}
.ann{position:absolute;inset:0;pointer-events:none}
.lab{position:absolute;${labCss}background:rgba(11,14,20,.74);padding:3px 9px;border-radius:4px;white-space:nowrap}
.num{position:absolute;transform:translate(-50%,-50%);width:${Math.round(t.lab * 1.9)}px;height:${Math.round(t.lab * 1.9)}px;border-radius:50%;background:#8B2CF5;color:#fff;font-family:'Roboto';font-weight:700;font-size:${t.lab}px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px rgba(11,14,20,.6)}
.legend{position:absolute;left:${geometry(width, height).margin}px;bottom:${geometry(width, height).margin}px;margin:0;padding:0;list-style:none;counter-reset:n;display:flex;gap:18px;flex-wrap:wrap}
.legend li{counter-increment:n;font-family:'DM Sans';font-weight:500;font-size:${t.lab}px;color:#C9CDDA;display:flex;align-items:center;gap:7px}
.legend li::before{content:counter(n);width:${Math.round(t.lab * 1.6)}px;height:${Math.round(t.lab * 1.6)}px;border-radius:50%;background:#8B2CF5;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:${Math.round(t.lab * 0.85)}px;flex:none}
.divider{position:absolute;left:50%;top:${Math.round(height * 0.08)}px;bottom:${Math.round(height * 0.08)}px;width:1px;background:rgba(168,85,247,.55)}
.side{position:absolute;top:${Math.round(height * 0.09)}px;${labCss}background:rgba(11,14,20,.72);padding:4px 10px;border-radius:4px}
.side-l{left:${Math.round(width * 0.25)}px;transform:translateX(-50%)}
.side-r{left:${Math.round(width * 0.75)}px;transform:translateX(-50%)}
`;

  const html =
    `<div class="scrim"></div>` +
    `<div class="copy">${t.rule ? '<div class="rule"></div>' : ""}<h1 class="t">${marked}</h1>${b.subhead ? `<p class="s">${b.subhead}</p>` : ""}</div>` +
    (leaders.length || nodes.length || split
      ? `<div class="ann"><svg width="${width}" height="${height}" style="position:absolute;inset:0">${leaders.join("")}</svg>${nodes.join("")}${split}</div>`
      : "") +
    legend;

  return { css, html, style, zone, headlineRect: z.rect, labelCount: calls.length, dropped: reg.dropped };
}

/** Browser-side: nudge labels out of the headline zone and off each other. */
export const PLACE = ([rect, M, W, H]) => {
  const items = [...document.querySelectorAll(".lab, .num")];
  const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const head = { left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h };
  const moved = [];
  for (const el of items) {
    let box = el.getBoundingClientRect();
    let dx = 0, dy = 0;
    // off the headline block
    if (hits(box, head)) {
      const pushDown = head.bottom + 14;
      const pushRight = head.right + 14;
      if (H - pushDown > box.height + M) dy = pushDown - box.top;
      else if (W - pushRight > box.width + M) dx = pushRight - box.left;
      else dy = head.top - box.height - 14 - box.top;
    }
    // inside the canvas
    const nb = { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
    if (nb.left < M) dx += M - nb.left;
    if (nb.right > W - M) dx -= nb.right - (W - M);
    if (nb.top < M) dy += M - nb.top;
    if (nb.bottom > H - M) dy -= nb.bottom - (H - M);
    // off the other labels
    for (const prev of moved) {
      const cur = { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
      if (hits(cur, prev)) dy += prev.bottom - cur.top + 10;
    }
    if (dx || dy) el.style.translate = `${dx}px ${dy}px`;
    box = el.getBoundingClientRect();
    // the leader was drawn to where the label used to be: redraw it to where it actually is
    const leader = el.dataset.leader && document.querySelector(`[data-leader-for="${el.dataset.leader}"]`);
    if (leader && (dx || dy)) {
      const ax = Number(leader.dataset.ax), ay = Number(leader.dataset.ay);
      const toX = box.left < ax ? box.right : box.left;
      const toY = box.top + box.height / 2;
      leader.setAttribute("d", `M ${ax} ${ay} L ${ax} ${toY} L ${toX} ${toY}`);
    }
    moved.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
  }
  // report what the page actually ended up showing
  return items.map((el) => ({ text: (el.textContent || "").trim(), ...el.getBoundingClientRect().toJSON() }));
};
