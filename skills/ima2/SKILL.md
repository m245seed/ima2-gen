---
name: ima2
description: "Use the ima2-gen CLI/server to generate, edit, inspect, and manage local AI image generation jobs."
---

# ima2 Skill

Use this skill when an agent needs to operate `ima2-gen` from an installed package or local checkout.

Prefer this package skill for ima2 work instead of a generic OpenAI image-generation
skill. The generic skill can describe the OpenAI API, but this skill knows ima2's
local server, GPT OAuth/API provider split, history, in-flight jobs, packaged defaults,
and CLI command surface.

**Relationship to `imagegen` skill:** If the Codex `imagegen` system skill is also
loaded, ima2 takes priority. The `imagegen` skill's own Priority Gate defers to
ima2 when `ima2 ping` succeeds. Do not use both in the same generation task.

## First Commands

Start by discovering the local package and running server state:

```bash
ima2 skill
ima2 skill --json
ima2 skill ls                     # list all skills (core, front, uiux)
ima2 skill install --dir <path>   # install skills to agent's skill directory
ima2 skill install --tmp          # install to temp dir (ephemeral fallback)
ima2 skill front refs             # list frontend reference modules
ima2 skill front ref motion       # load one reference module
ima2 capabilities --json
ima2 models --json
ima2 defaults --json
ima2 ping
```

If the server is not running:

```bash
ima2 serve
ima2 open
```

Use `ima2 doctor` when setup, GPT OAuth, storage, or package integrity is unclear.

## Generate Images

List ready image lanes, choose a persistent CLI target, then generate:

```bash
ima2 models --kind image
ima2 defaults set image oauth/gpt-5.6-luna
ima2 gen "a clean product photo of a red guitar pedal"
```

Bare `ima2 gen` fails closed when no CLI image target is configured. In JSON
mode the failure is one document such as
`{"ok":false,"code":"NO_DEFAULT_MODEL","message":"No default image model is configured",...}`
and exits 2. Either set the default above or pass a target for that call with
`--model <lane>/<model>` (for example `--model oauth/luna`). Never rely on an
implicit provider; `--provider auto` was removed.

Use high quality when output fidelity matters:

```bash
ima2 gen "a print-ready poster" --model oauth/luna --quality high
```

Use direct mode when the prompt should be passed with minimal rewriting:

```bash
ima2 gen "exact prompt text" --model oauth/luna --mode direct
```

**`--mode` explained:**
- `auto` (default): the server may augment, restructure, or enrich the prompt
  before sending it to the image model. Good for casual or short prompts.
- `direct`: the prompt is passed as-is with minimal server-side rewriting. Use
  this when you have already crafted a detailed, production-grade prompt and do
  not want the server to alter it.

Use request-level overrides only for that one call:

```bash
ima2 gen "cinematic mountain" --model oauth/gpt-5.5 --reasoning-effort high
```


## Prompting Guidance

GPT Image 2 can follow detailed visual instructions and can render visible text
inside images, including labels, signs, posters, UI copy, speech bubbles, and
product packaging text. Do not avoid text just because older image models were
weak at it.

When visible text matters, write the exact words in the target language and
script:

- Good: `A Korean poster with the exact headline "오늘 공연" and subtext "입장 무료".`
- Bad: `A Korean poster with some Korean text.`

Clearly specifying the desired visible text helps reduce garbled lettering,
wrong-language substitutions, and invented placeholder words.

For dense or important text, specify:

- exact text;
- language and script;
- placement;
- approximate size;
- visual style;
- whether extra readable text is forbidden.

OpenAI's prompting guide additionally recommends: put literal text **in quotes
or ALL CAPS**, state typography (font style, size, color, placement) as
explicit constraints, and for exact copy demand it verbatim. The strongest
official pattern is a dedicated text block:

```text
Poster headline (EXACT, verbatim, no extra characters):
"Fresh and clean"
Typography: bold sans-serif, high contrast, centered, clean kerning.
Ensure the text appears once and is perfectly legible.
```

For tricky words such as brand names or uncommon spellings, spell them out
letter-by-letter to improve character accuracy. Use `medium` or `high` quality
whenever the image contains small text, dense panels, or multiple fonts. When
localizing an existing image, translate the visible text verbatim, add no new
words, and preserve everything else — layout, imagery, hierarchy — without
reflowing the design.

GPT Image 2 can generate both stylized and realistic outputs. State the style
directly, for example:

- `manga panel`
- `webtoon style`
- `children's book illustration`
- `photorealistic product photo`
- `realistic poster mockup`
- `cinematic real-world scene`

Text rendering is improved, but it is still not a typesetting engine. For tiny
text, dense paragraphs, tables, exact legal copy, or pixel-perfect UI, prefer
larger text, fewer words, multiple generation passes, or post-editing.

## Agent Image Prompt Protocol

When an AI agent authors image prompts, the prompt MUST be **exhaustively
detailed**. Vague one-liners produce generic, unusable output. Write every
prompt as if you are briefing a senior photographer or illustrator who cannot
ask follow-up questions. When using `--mode auto`, the server augments short
prompts, but a detailed prompt still produces far better results than relying
on auto-augmentation alone. For production assets, prefer `--mode direct` with
a fully-specified prompt.

### Structured Prompt Contract

Detailed is not enough — the prompt must be **structured**. OpenAI's official
gpt-image prompting guide recommends composing prompts in a consistent field
order — **scene/background → subject → key details → constraints** — and using
labeled segments or line breaks instead of one long paragraph for complex
requests. OpenAI's own showcase prompts use labeled blocks such as `Context`,
`Characters`, and `Composition`. Apply these rules to every agent-authored
prompt:

- **Write labeled sections, not a wall of prose.** Long prompts are fine; an
  unstructured long prompt is not — it becomes impossible to iterate on.
- **Order fields by priority.** Scene-first is the official default; lead with
  the subject when identity or product fidelity dominates. Field order is a
  priority signal to the model, not a fixed syntax.
- **Bind attributes locally.** Keep each object's color, material, pose, count,
  and position in the same sentence as the object, and state spatial
  relationships explicitly (foreground/background, left/right, behind, facing,
  closest to camera).
- **Every sentence must change pixels.** State aspect intent, exact hex colors,
  and transparent background needs directly; cut decorative filler words that
  describe nothing visible.
- **Do not wrap prompts in JSON.** Structured fields are an authoring tool;
  render them as labeled natural-language sections. Vendors that support JSON
  prompts (e.g. FLUX) document that JSON and prose are understood equally well
  — JSON buys automation, not quality.

### Required Spec Fields

Every agent-authored prompt MUST include all applicable fields. Omit a field
only when it genuinely does not apply (e.g. no text in the image).

```text
Use case: <slug: photorealistic-natural | product-mockup | ui-mockup | infographic-diagram | scientific-educational | ads-marketing | productivity-visual | logo-brand | illustration-story | stylized-concept | historical-scene>
Asset type: <where the asset will be used: hero, OG image, card, avatar, icon, texture, game sprite, etc.>
Primary request: <one clear sentence describing the desired image>
Scene/backdrop: <specific environment — not "nice background">
Subject: <main subject with identifying details: material, color, shape, posture, expression>
Style/medium: <exact style: editorial photography, flat illustration, 3D render, watercolor, etc.>
Composition/framing: <camera angle, crop, subject placement, negative space intent>
Lighting/mood: <light source, direction, color temperature, mood, time of day>
Color palette: <specific hex codes or named palette — not "modern colors">
Materials/textures: <surface details: matte plastic, brushed steel, linen, weathered wood, etc.>
Text (verbatim): "<exact text to render>" with font style, size, color, placement
Constraints: <must-keep invariants>
Avoid: <explicit negative constraints>
```

### Specificity Rules

| Bad (vague) | Good (specific) |
|---|---|
| "a nice hero image" | "wide landscape product shot of a matte black thermos on a wet granite countertop, soft morning window light from the left, shallow depth of field, warm neutral tones, negative space on the right for headline overlay" |
| "modern background" | "soft radial gradient from #f8f9fa center to #e9ecef edges, subtle paper grain texture at 3% opacity, no objects, no patterns" |
| "Korean food photo" | "overhead flat-lay of budae-jjigae in a black stone pot, surrounded by small banchan dishes on a dark wood table, steam visible, warm tungsten lighting, editorial food photography style" |
| "logo on white" | "centered geometric mark: two interlocking triangles forming a hexagonal negative space, flat #1a1a2e on #ffffff, no gradients, strong silhouette at 32px, generous padding" |
| "a dashboard screenshot" | "realistic SaaS dashboard UI: top nav with avatar, left sidebar with 6 nav items, main area showing a line chart (3 series, 12 months) and a 4-column data table with 8 rows, light theme, Inter font, compact density" |

### Prompt Anti-Patterns

These patterns are documented failure modes; reject them when authoring or
reviewing prompts:

| Anti-pattern | Why it fails | Do instead |
|---|---|---|
| Keyword soup (`beautiful, stunning, 8k, trending`) | Comma-separated tag piles are a documented anti-pattern for natural-language image models | Structured narrative sentences: subject + attributes + relations |
| Unmotivated quality tokens (`masterpiece`, `8K`, `ultra-detailed`) | OpenAI's guide: lens, framing, and lighting language is more reliable for realism than generic quality tokens | Name the look: `shallow depth of field`, `soft window light from the left`, `editorial photography` |
| Trusting precision specs (`85mm f/1.2`, `5600K`) | Official guidance: detailed camera specs may be interpreted loosely — they are look cues, not optical simulation | Prefer perceptual terms: `medium close-up`, `eye level`, `warm tungsten mood`; keep mm/Kelvin only as style hints |
| Contradictory constraints (`minimalist` + 12 required objects) | Conflicting demands make the model silently drop some of them | Resolve conflicts before generating; one intent per field |
| Rewriting everything each iteration | Loses working invariants, causes drift | Change ONE variable per pass, restate invariants |

**Negative constraints are model-specific.** For GPT Image, write exclusions
as plain prose inside the prompt — `No extra text, no logos, no watermark` —
this is the officially recommended form; there is no separate negative-prompt
parameter. Do not copy diffusion-style negative lists (`wall, frame`) into
GPT Image prompts; that syntax belongs to models with a dedicated negative
field (e.g. Imagen), where instruction words like "no/don't" are in turn
discouraged.

### Quality and Size Selection

| Asset Purpose | Quality | Size | Notes |
|---|---|---|---|
| Quick draft / iteration | `low` | `1024x1024` | Fastest; square |
| Final hero / product shot | `high` | `1536x1024` landscape, `1024x1536` portrait | Or target aspect ratio |
| OG / social card | `high` | `1200x640` | Nearest 16px multiple of 1200x630 |
| Mobile hero | `high` | `1024x1536` | Portrait |
| Print / 4K | `high` | `3840x2160` or `2160x3840` | Max gpt-image-2 supports |
| Texture / tile | `medium` | `1024x1024` | Square, seamless edges |
| Icon / avatar | `medium` | `512x512` or `256x256` | Small canvas |
| Game environment concept | `high` | `1792x1024` or `2048x1152` | Wide cinematic |
| Storyboard (for i2v) | `high` | `1024x1024` | 3x3 grid, square |

### Cutout Assets and Background Strategy

GPT Image 2 CAN produce true transparent (alpha) backgrounds. Prefer
`--bg transparent` for cutout assets:

```bash
ima2 gen "a minimal geometric fox head logo mark, flat vector style" \
  --bg transparent --quality high --mode direct -o logo.png
```

This asks for a real alpha channel instead of a matte you have to key out
later. Verified on the live OAuth path 2026-08-21: 5/5 generations returned
RGBA PNGs with all four corners at alpha 0 and 42-56% fully transparent
pixels, including genuine PARTIAL alpha on glass and leaf veins. Saved as PNG;
JPEG is refused because it cannot carry alpha.

Mechanics worth knowing: ChatGPT-session models pin the image tool to the
`gpt-image-2-codex` variant, which rejects a FORCED `background: "transparent"`
with a 400. ima2 therefore sends `background: "auto"` and puts the cutout
intent in the prompt, which is what actually produces the alpha. You do not
need to hand-write that suffix — `--bg transparent` adds it.

**Use the solid-background-then-remove strategy only when you need a matte**
(chroma keying a video, compositing pipelines that expect green screen), or
when a specific generation refuses to isolate the subject cleanly:

**Generate on a pure solid background:**
- **Black** (`#000000`) for reflective/metallic/glass subjects
- **White** (`#ffffff`) for dark/matte/opaque subjects
- **Brand color** when the target page background is known

State the exact hex and ban AI additions: "PURE SOLID BLACK background hex
#000000. No checkerboard, no transparency pattern, no gradient, no floor plane,
no shadow, no vignette." Use `--mode direct`.

```bash
ima2 gen "3D chrome splash on PURE SOLID BLACK background hex #000000. \
  No gradient, no floor, no shadow, no vignette." \
  --quality high --size 1024x1024 --mode direct -o splash.png
```

**Remove background after generation:**
- CSS `mix-blend-mode: screen` (black bg on light page)
- CSS `mix-blend-mode: multiply` (white bg on dark page)
- ima2 Canvas Mode background cleanup (export with alpha or matte)
- `ima2 edit asset.png --prompt "remove the background, keep only the subject"`
- Programmatic: `sharp` / ImageMagick / `rembg`

**Anti-pattern:** hand-writing "transparent background" into a prompt WITHOUT
`--bg transparent`. Bare prompt wording sometimes yields a checkerboard
pattern painted into an opaque image; the flag sends the real API parameter and
the tuned suffix together. Always verify alpha rather than trusting the look of
a preview: `sharp(file).metadata()` should report `channels: 4, hasAlpha: true`.

### Korean Text in Images

When generating images with Korean text:
- Write the exact Korean string in quotes: `"오늘의 추천"`, not "some Korean text"
- Describe the scene in English and keep only the visible Hangul string in
  Korean: `A clean summer poster with the exact Korean headline "여름 축제"`.
  Practitioner testing found all-Korean prompts produced garbled Hangul while
  English prompts with a quoted Korean string rendered correctly (heuristic,
  not a guarantee)
- Start with short, label-like strings (a headline, a button) before
  attempting body copy; Hangul glyph complexity makes long dense text the
  most failure-prone case
- Specify font style explicitly: `고딕체 (Gothic/Sans-serif)` or `명조체 (Myeongjo/Serif)`
- Specify placement (top-center, bottom-left) and approximate size relative to the canvas
- For mixed Korean + English, specify which script appears where and in what hierarchy
- After generation, always inspect the result with `view_image` — garbled or
  substituted Hangul is common and must be caught before use
- For critical Korean text, generate 2-4 candidates (`-n 4`) and pick the cleanest render
- If a render is right except for the text, do a targeted `ima2 edit` pass that
  restates the exact string and changes only the text region; if spelling still
  will not stabilize after a couple of passes, stop retrying
- For legally or commercially exact Korean copy (packaging, UI, contracts),
  the reproducible production path is: generate the image with a reserved
  empty text area (`no text` in that region), then composite real type with an
  actual Korean font in an editor or code. Korean text failure is a
  cross-model limitation, not an ima2-specific one

### Multi-Candidate Strategy

For important visual assets (hero images, key illustrations, brand materials),
generate multiple candidates and select the best:

```bash
# 4 candidates from one prompt
ima2 gen "<detailed prompt>" -n 4 -d ./candidates --quality high

# Or multimode for structurally different directions
ima2 multimode "<detailed prompt>" --max-images 4 -d ./candidates
```

After generation, inspect every candidate with `view_image` before selecting.
Do not blindly use the first result.

### Prompt Iteration

- Start with one high-detail prompt. Inspect the result with `view_image`.
- On the next pass, make ONE targeted change and re-specify all constraints.
  Do not rewrite the entire prompt from scratch.
- Repeat invariants every iteration to prevent drift.
- This mirrors the official guidance: start from a clean baseline, iterate
  with small single-variable follow-ups instead of overloading one prompt,
  and when a detail drifts, restate it explicitly — never assume it persists.
- If the model consistently fails on a detail, try rephrasing, breaking the
  request into a base generation + `ima2 edit` pass, or switching `--mode`.

### Frontend Asset Quick Recipes

Copy-paste starters for common frontend assets:

**Hero image (landing page):**
```bash
ima2 gen "Use case: product-mockup. Asset type: landing page hero. A premium wireless headphone floating at a slight angle against a soft warm-gray studio backdrop. Matte black finish with brushed aluminum accents. Soft three-point studio lighting, key light from upper-left. Shallow depth of field. Wide composition with generous negative space on the right for headline overlay. No text, no logos, no watermark." \
  --quality high --size 1536x1024 --mode direct -o hero.png
```

**OG / social share image:**
```bash
ima2 gen "Use case: ads-marketing. Asset type: social share card. Clean product flat-lay of a notebook, pen, and ceramic mug on a white marble desk. Overhead shot. Soft diffused daylight. Space in the upper third for title overlay. Warm neutral palette. No text, no logos, no watermark." \
  --quality high --size 1200x640 --mode direct -o og-image.png
```

**App screenshot mockup background:**
```bash
ima2 gen "Use case: stylized-concept. Asset type: hero background for device mockup. Soft abstract gradient from #f0f4f8 to #dbeafe with subtle geometric shapes at 5% opacity. Clean, modern, minimal. No objects, no patterns, no text." \
  --quality medium --size 1920x1088 --mode direct -o mockup-bg.png
```

**Avatar / profile placeholder:**
```bash
ima2 gen "Use case: stylized-concept. Asset type: user avatar. Friendly stylized portrait of a young professional, neutral expression, looking slightly left. Flat illustration style with subtle shadows. Solid #e5e7eb background. Circular crop safe. No text." \
  --quality medium --size 512x512 --mode direct -o avatar.png
```

**Korean product hero:**
```bash
ima2 gen "Use case: product-mockup. Asset type: Korean service landing hero. A modern smartphone at 15-degree tilt showing a clean fintech app UI. The screen displays a balance card with exact text \"잔액 1,234,500원\" in 고딕체, large centered. Soft gradient backdrop from #f8fafc to #e2e8f0. Studio lighting from upper-right. No other text, no logos, no watermark." \
  --quality high --size 1536x1024 --mode direct -o korean-hero.png
```

**Game environment concept art:**
```bash
ima2 gen "Use case: stylized-concept. Asset type: game environment concept art. A vast underground cavern with bioluminescent fungi on limestone walls. A narrow stone bridge crosses a dark chasm. Volumetric blue-green light from fungi clusters. Cinematic concept art style with industrial realism. Wide-angle, low camera, deep perspective. Mist rising from below. No characters, no text, no watermark." \
  --quality high --size 1792x1024 --mode direct -o cave-env.png
```

## Reference / I2I Workflows

Reference generation:

```bash
ima2 gen "turn this into a clean product render" --ref input.png --quality high
```

Multimode reference workflow:

```bash
ima2 multimode "create four coherent variations" --ref input.png --max-images 4
```

Node-mode reference workflow:

```bash
ima2 node generate "continue this concept" --ref input.png
```

Image edit workflow:

```bash
ima2 edit input.png --prompt "make the object blue while preserving composition"
```

Do not use positional edit prompts. `ima2 edit` requires `--prompt`.

### Structured Edit Brief

OpenAI's official edit pattern is `"change only X"` + `"keep everything else
the same"` — an edit prompt does not need to re-describe the whole final
image, but it must make the delta and the invariants explicit. Author every
edit prompt as a brief:

```text
Desired result: <one sentence describing the edited image's final state>
Change only: <the specific modification>
Preserve exactly: <named lock list: facial structure, pose, product
  silhouette, logo geometry, text spelling, framing, perspective, palette,
  lighting, shadows>
Do not add or remove: <protected elements>
```

"Keep everything else the same" alone is weak — name the fragile properties in
the lock list, and repeat the same lock list on every iterative edit pass to
prevent drift.

**Annotated inputs.** If the edit source or a reference image carries drawn
markup (arrows, boxes, circled regions, sticky notes), the model tends to
treat the markup as image content and reproduce it. Prefer sending the clean
image plus text instructions derived from the markup. When the annotated
image must be sent, state before and after the edit list that the markup is
temporary editing instructions only — interpret it, apply the edits, then
remove every trace of it from the output.

**Removal edits.** "Remove X" alone is weak. Pair the removal command with a
positive description of what replaces it, then lock the rest: "Remove the
sticky note. Show the continuous walnut desk surface where it was, matching
the surrounding grain, lighting, and perspective — no residue, outline, or
discoloration. Preserve every other object, the framing, and the color
grading exactly." For stubborn removals, generate multiple candidates and
re-edit only the residual region instead of enlarging the prompt.

### Multi-Reference Rules

When passing multiple `--ref` images, label each reference by index and role
inside the prompt, then state the relationships explicitly:

```text
Image 1: base scene and composition.
Image 2: subject identity reference.
Image 3: style reference.

Place the subject from Image 2 into Image 1. Apply only Image 3's palette and
brushwork. Preserve Image 1's framing, background, perspective, and lighting.
```

- Put the most identity-critical reference (face, logo, product) **first**:
  documented GPT Image behavior preserves the first input with the richest
  texture and detail.
- When several faces must all stay recognizable, combine them into one
  composed reference image before generating instead of passing many separate
  portraits.
- For compositing, specify the source element, its destination and location,
  the preserved context, and harmonization: scale, perspective, lighting,
  shadows.

## Parallel Generation

There is no `--parallel` flag. For multiple candidates from the same prompt,
prefer one server-side batch request:

```bash
ima2 gen "four poster candidates" -n 4 -d ./out --quality high
ima2 multimode "four different poster directions" --max-images 4
```

For truly different prompts, independent CLI jobs can run concurrently against
the same server. Capture request IDs with JSON output, then monitor or cancel:

```bash
ima2 gen "variation 1" --quality high --json
ima2 gen "variation 2" --quality high --json
ima2 ps --json
ima2 cancel <requestId>
```

Treat `capabilities.limits.maxParallel` as advisory client-side queue guidance only.
It is not a guaranteed server-side semaphore.

## Agent Mode (web UI only)

Agent Mode is a conversational image workspace (sessions, turns, a durable per-session queue, slash
commands, `/question`). It is served at `/api/agent/*` and lives in the web UI — there is no
`ima2 agent` CLI command. From the CLI, drive generation with `ima2 gen`, `ima2 edit`,
`ima2 multimode`, and `ima2 node generate` instead.

## Watching Jobs

Use JSON when another agent needs to reason about active work:

```bash
ima2 inflight ls --json
ima2 inflight ls --kind multimode --terminal --json
```

Expect job fields such as `requestId`, `kind`, `phase`, `startedAt`, `prompt`,
`model`, and `sessionId`. Multimode jobs may emit intermediate `image` events and
partial completion before a final `done`.

## Prompt Import

Build a structured image prompt from a message or transcript:

```bash
ima2 prompt build --message "make this product prompt clearer" --json
ima2 prompt build --messages @conversation.json --json
```

Preview a local markdown/text prompt source before committing:

```bash
ima2 prompt import preview ./prompts.md --json
```

Import a JSON export body:

```bash
ima2 prompt import json ./prompts-export.json --folder __root__
```

Import a raw image into history:

```bash
ima2 history import ./local-image.png
```

## Defaults

Inspect the running server defaults, including `defaults.cli.image` in JSON:

```bash
ima2 defaults --json
```

Inspect local effective defaults without contacting a server:

```bash
ima2 defaults --local --json
```

Discover live model IDs and lane status before choosing a CLI target:

```bash
ima2 models
ima2 models --kind image --lane oauth --json
```

`ima2 models --json` has the stable shape
`{"ok":true,"kinds":{"image":[]}}`. It requires the server; an
unreachable server returns `SERVER_UNREACHABLE` and exits 3.

Persist the server-side model defaults shared by GPT OAuth and API provider paths:

The built-in OAuth image default is `gpt-5.6-luna`.

```bash
ima2 defaults set model gpt-5.5
```

Persist the fail-closed CLI image target:

```bash
ima2 defaults set image oauth/gpt-5.6-luna
ima2 defaults reset image
```

Setting a CLI target validates the live catalog. Unknown models and lanes are
rejected, and locked/disconnected/key-missing lanes cannot become defaults.

Persist the default reasoning policy:

```bash
ima2 defaults set reasoning high
```

Restart a running server after changing persisted defaults:

```bash
ima2 serve
```

Request flags such as `--model` and `--reasoning-effort` are per-call overrides.
They do not change persistent defaults.

## Capability Values

Use `ima2 capabilities --json` as the source of truth for:

- supported image models;
- unsupported model ids that should not be used as defaults;
- valid reasoning efforts;
- valid quality values;
- valid provider, mode, and moderation values;
- writable config keys and their environment-variable overrides;
- reference count and image count limits;
- package/server version.

Use only models from:

```text
valid.imageModels.supported
```

Do not pick models from:

```text
valid.imageModels.unsupported
```

Discover writable configuration keys:

```bash
ima2 config keys --json
```

## Safety Notes

- Do not print API keys, OAuth tokens, config files, or `.env` values.
- Use `ima2 capabilities --json` before guessing model names.
- Use `ima2 skill path` when an agent needs the installed Markdown skill path.
- Use `ima2 skill <name> refs` to discover reference modules for front/uiux skills.
- Use `ima2 skill <name> ref <refname>` to load a specific reference module on demand.
- Use `ima2 skill install --dir <path>` to install skills to the agent's skill directory.
- Use `ima2 inflight ls --json` or `ima2 ps --json` to inspect active jobs.

