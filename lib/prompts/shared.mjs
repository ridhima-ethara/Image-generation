// One source of truth for the rules every stage repeats.
// Edit a rule here and every prompt that uses it changes together.
import { brand } from "../brand.mjs";

export const AUDIENCE = brand.audience;

/** Imagery that reads as stock AI art. Named once; referenced by every stage. */
export const CLICHES =
  "glowing brain, humanoid robot or android, light bulb, rocket, circuit board, binary code, " +
  "padlock-and-shield, hologram, neon grid, floating glowing particles, lens flare";

/** Compositions that read as stock photography. */
export const STOCK_CLICHES =
  "handshake, team around a laptop, person at a whiteboard, lightbulb moment, chess pieces, domino rally, " +
  "jigsaw piece completing a puzzle, tug of war, climbing a mountain, a maze seen from above";

/** Why the photograph carries no words. Stated once, used wherever it applies. */
export const NO_TEXT_IN_PICTURE =
  "The photograph itself carries no words: no text, letters, numbers, labels, captions, signage, screens, " +
  "dashboards, charts, printed pages, watermarks or logos. Every word on the finished image is drawn " +
  "afterwards by code in brand type, which is why it is always spelled correctly.";

/** The palette, in prose, for prompts that must state it. */
export const PALETTE =
  "a near-black ground (#0B0E14 to #121724), restrained greys and the true colours of real materials, with " +
  "Ethara purple (#8B2CF5 / #A855F7) as the only accent";

export const FONTS = "'Roboto' for headings and figures, 'DM Sans' for supporting text and labels";

/** How people appear when they appear at all. */
export const PEOPLE_RULE =
  "People are optional and rare: include a person only when the claim is about someone acting or choosing and " +
  "objects alone cannot carry it. Then show hands or forearms mid-action, over-the-shoulder or from behind, with " +
  "the face absent, cropped or soft. Never a posed portrait looking at camera, never a stock-photo smile, never " +
  "a generic professional at work.";

/** The output contract every structured stage shares. */
export const jsonOnly = (shape) =>
  `OUTPUT: exactly one \`\`\`json block and nothing else — no preamble, no commentary, no trailing notes.\n${shape}`;

/** The standing instruction that a user's explicit request outranks any default in the prompt. */
export const USER_INTENT_WINS =
  "THE REQUEST IS THE AUTHORITY. The defaults in this prompt describe what to do when the user has not said " +
  "otherwise. The moment the user asks for something different, their request wins — carry it out and report " +
  "what it overrode rather than refusing or quietly doing something else.";

/** How every stage should behave when the input is genuinely unclear. */
export const AMBIGUITY_RULE =
  "If the input could mean two materially different things and guessing would produce the wrong result, say so " +
  "and ask ONE short, concrete question naming the likely readings. Do not use this to avoid work, and do not " +
  "use it for requests that are merely broad — only when the alternatives would look genuinely different.";

/** Reasoning instruction: think it through, return only the conclusion. */
export const REASON_SILENTLY =
  "Work through the problem carefully before answering, but return only the finished result in the required " +
  "shape — never your intermediate reasoning, notes or alternatives.";
