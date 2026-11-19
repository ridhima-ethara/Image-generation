# Image Formats

> Loaded one section at a time, after the Image agent picks `format`. Each section: when to use it,
> layout, what the image model draws vs what the compositor draws, and when not to use it.
> Golden rows are the examples from the golden set.

## concept_metaphor
- **Use when:** one abstract idea needs one memorable object (turns: hidden_part, transformation,
  opportunity, sometimes loop).
- **Layout:** one focal object, centred or on the right third; headline on the left third; 40% empty
  space; dark base with a purple rim light on the object.
- **Model draws:** the object and its light. **Compositor:** headline, logo, source line.
- **Do not use when:** the caption's point is a number (use data_chart) or a sequence (use a diagram).
- **Golden rows:** 7 mirror, 13 rough stone to diamond, 22 iceberg, 11 prism, 37 door with light.

## split_metaphor
- **Use when:** contrast between two cases, and the difference itself is the message.
- **Layout:** the canvas split in two, same object in two states; the difference highlighted in
  `#A855F7`; a one-line label per side.
- **Golden rows:** 9 counterfactual split face.

## side_by_side
- **Use when:** two setups, two benchmarks or two methods with one measurable difference.
- **Layout:** two equal panels, matching headers, the key number large in each; "vs" divider; source
  line under both.
- **Model draws:** background only. **Compositor or chart template:** panels, numbers, labels.
- **Golden rows:** 28 JEPA 67.3 vs 56.1, 30 SWE-EVO vs EnterpriseOps-Gym, 29 Direct-Likert vs
  RaR-Implicit.

## data_chart
- **Use when:** the caption carries numbers from a named source, and each bar has its own stated
  figure (exact, a range, or a bound such as "up to 5.4"). A claim with no figure ("stayed near the
  base model", "much faster") is not a bar: if only one side has a figure, choose another format.
- **Values:** each bar's value as the source writes it, qualifier included: "up to 5.4 pts",
  "within 1 pt", "1.3-3.1 pts". Never turn "up to X" into a plain X, never copy one group figure
  onto several bars (one bar for the group: "FFT / LoRA / Sparse"), never write "~0" or any
  figure the source does not state.
- **Labels:** each bar named in the source's own terms. The same model before and after a method
  is "Base model" and "After <method as the caption names it>", never "Baseline" when the source
  keeps "baseline" for other systems; never add a qualifier the source doesn't use ("no
  self-learning"). The title credits what the source credits (the whole method), not one part.
- **Source:** `chart.source` names authors and the paper id from the evidence's [FROM] line
  (e.g. "Source: Kong et al., arXiv 2610.39671"), never just "arXiv paper".
- **Layout:** one chart only (bars for comparison, line for change over time); the hero value labelled
  directly; no legend when labels fit; source line mandatory (`chart.source`: the paper, report or
  page, e.g. "Source: Lu et al., arXiv 2611.10866").
- **Model draws:** nothing on the chart. **Designed as HTML** (bars to scale on one axis, each value
  large with its qualifier small, the thesis bar in an outlined accent card); all marks and numbers
  from `facts_used`.
- **Golden rows:** 32 SWE-EVO resolved rates, 2 saturation chart.

## loop_diagram
- **Use when:** a cycle (feedback, RL step, flywheel, agent loop).
- **Layout:** 3 to 6 nodes on a ring, one direction, the reinforcing arrow highlighted; labels are
  verbs or short nouns.
- **Golden rows:** 1 Evaluate-Learn-Improve-Repeat, 16 Plan-Act-Observe-Evaluate-Improve, 21
  post-training flywheel, 33 State-Action-Reward.

## pipeline_diagram
- **Only for a real sequence:** each arrow means "this stage feeds the next" and must be a step the
  caption states in that order. A list of facts about one subject (what it is, its rules, its
  results) is not a pipeline: use branded_infographic. A result reached under different
  conditions ("outside the official run", "with a bigger budget", "in a later test") is never the
  next stage of the run before it; show it apart and say how it differs.
- **Edge labels** name the relationship, never a result; a result belongs in its node, once.
- **Use when:** stages in order (data lifecycle, input → process → output).
- **Layout:** left to right, 3 to 7 stages, one stage accented when the caption stresses it; optional
  controls row under the stages.
- **Golden rows:** 10 AI factories, 25 AI data lifecycle, 12 token chain to one reward.

## taxonomy_map
- **Use when:** many parts of one whole (abilities, branches, languages).
- **Layout:** constellation, grid of icons, or branching tree; at most 16 items; one cluster
  highlighted.
- **Golden rows:** 18 CHC constellation, 19 16-icon anatomy of intelligence, 4 globe of languages.

## timeline
- **Use when:** evolution over dated steps.
- **Layout:** one horizontal axis to scale; 5 to 8 dated marks; the present or next step accented.
- **Golden rows:** 14 benchmarks from GLUE (2018) to ARC-AGI (2026).

## carousel
- **Use when:** a teaching post with 4 to 8 distinct points.
- **Layout:** cover slide with the hook; one point per slide with one visual; last slide with the
  closing question. Same grid and type on every slide.
- **Golden rows:** 2, 5, 8, 15, 17, 20.

## worked_example
- **Use when:** showing how a method works on a real case (rubric, scorecard, control table).
- **Layout:** one table or card; one deliberate error or key cell marked in red-free accent (use
  `#C084FC` outline, never `#E9096F`).
- **Golden rows:** 34 rubric table, 25 controls table.

## typography_spotlight
- **Use when:** a paper or idea worth reading where the words are the hook.
- **Layout:** series label ("Research Spotlight 01"), a large title, one supporting line, paper
  reference; abstract purple texture only.
- **Golden rows:** 23 Open Rubrics.

## real_world_proof
- **Use when:** PR, partnership, event, team or people news.
- **Layout:** approved photo, portrait with quote, or phone mockup of the real article. Never
  generate a real person's face; use only approved assets. Third-party marks only as the article
  shows them, in a mockup of that article.
- **Golden rows:** 35 candid ecosystem photo, 36 portrait with quote, 38 phone mockup of the AWS blog.
