import { config } from "../../config.js";
import { errInfo } from "../../lib/errInfo.js";
import { parseArgs, type ParsedArgs } from "../lib/args.js";
import { resolveServer, request, normalizeGenerate } from "../lib/client.js";
import { fileToDataUri, dataUriToFile, defaultOutName, readStdin } from "../lib/files.js";
import { loadCliDefaults } from "../lib/config-store.js";
import { resolveTarget, type ModelCatalog, type ResolveResult } from "../lib/modelResolver.js";
import { out, die, dieWithError, color, err, fail, json } from "../lib/output.js";
import { createCliRequestId, recoverGeneratedOutputs, formatRecoveryHint } from "../lib/recover-output.js";
import { deriveProviderIds } from "../../lib/providers/derive.js";
import { BACKGROUND_PRESETS } from "../../lib/backgroundPresets.js";

const VALID_MODES = new Set(["auto", "direct"]);
const VALID_MODERATION = new Set(["auto", "low"]);
const MAX_GENERATION_COUNT = Math.max(1, Math.trunc(Number(config.limits.maxGeneratedImages) || 24));
const MAX_REFERENCE_COUNT = Math.max(1, Math.trunc(Number(config.limits.maxRefCount) || 5));
const PROVIDER_VALUES = deriveProviderIds();
const SPEC = {
  flags: {
    quality: { short: "q", type: "string", default: "low" },
    size: { short: "s", type: "string", default: "1024x1024" },
    count: { short: "n", type: "string", default: "1" },
    ref: { type: "string", repeatable: true },
    out: { short: "o", type: "string" },
    "out-dir": { short: "d", type: "string" },
    json: { type: "boolean" }, "no-save": { type: "boolean" }, force: { type: "boolean" },
    stdin: { type: "boolean" }, timeout: { type: "string", default: "180" }, server: { type: "string" },
    model: { type: "string" }, provider: { type: "string" }, mode: { type: "string", default: "auto" },
    moderation: { type: "string", default: "low" }, bg: { type: "string" }, session: { type: "string" },
    "reasoning-effort": { type: "string" }, "web-search": { type: "boolean" },
    "no-web-search": { type: "boolean" }, help: { short: "h", type: "boolean" },
  },
};

const HELP = `
  ima2 gen <prompt...> [options]

  Generate image(s) via a configured OAuth or API lane.
  Set a default with 'ima2 defaults set image <lane>/<model>' or inspect lanes with 'ima2 models'.

  Batch/async note:
    Use -n <N> for multiple candidates. Independent CLI commands can run
    concurrently; monitor requestIds with 'ima2 ps --json' and cancel with
    'ima2 cancel <requestId>'.

  Options:
    -q, --quality <low|medium|high>         Default: low
    -s, --size <WxH | auto>                 Default: 1024x1024
    -n, --count <1..${MAX_GENERATION_COUNT}> Default: 1
        --ref <file>                        Local reference image (repeatable)
    -o, --out <file>                        Single-image output path
    -d, --out-dir <dir>                     Output directory
        --json                              Print one JSON result to stdout
        --no-save                           Print base64 image data
        --stdin                              Read prompt from stdin
        --timeout <sec>                     Default: 180
        --server <url>                      Override server URL
        --model <model|lane/model>          Bare IDs must be unique across lanes
                                            Core aliases: luna, sol, terra, spark
        --provider <${PROVIDER_VALUES.join("|")}>
                                            'auto' was removed; choose a lane explicitly
        --mode <auto|direct>                Default: auto
        --moderation <auto|low>             Default: low
        --bg <chroma-green|white|black|transparent>
                                            'transparent' asks GPT Image 2 for alpha
        --session <id>                      Apply session style sheet
        --reasoning-effort <none|low|medium|high|xhigh|max>
        --web-search / --no-web-search      Override web-search toggle

  Examples:
    ima2 defaults set image oauth/gpt-5.6-luna
    ima2 gen "a shiba in space"
    ima2 gen "poster" --model oauth/luna --mode direct
    ima2 gen "fox logo mark" --bg transparent -o logo.png
`;

type ResolvedTarget = Extract<ResolveResult, { ok: true }>;
type ImageContext = {
  server: { base: string };
  target: ResolvedTarget;
  prompt: string;
  refs: string[];
  explicitOut: string | null;
  outDir: string | null;
};

function failServer(jsonMode: boolean, error: unknown): never {
  const message = (error as Error)?.message || "server unreachable";
  if (jsonMode) err("Hint: start the server with `ima2 serve`.");
  fail({ json: jsonMode, code: "SERVER_UNREACHABLE", message: `${message}\nHint: run ima2 serve`, exitCode: 3 });
}

async function fetchCatalog(serverFlag: unknown, jsonMode: boolean) {
  try {
    const server = await resolveServer({ serverFlag });
    const catalog = await request(server.base, "/api/models", { timeoutMs: 5000 }) as ModelCatalog;
    return { server, catalog };
  } catch (error) {
    failServer(jsonMode, error);
  }
}

function resolveImageTarget(args: ParsedArgs, catalog: ModelCatalog): ResolvedTarget {
  const result = resolveTarget({
    ...(args.model ? { model: String(args.model) } : {}),
    ...(args.provider ? { provider: String(args.provider) } : {}),
  }, catalog, loadCliDefaults());
  if (!result.ok) {
    fail({ json: Boolean(args.json), code: result.code, message: result.message, ...(result.extra ? { extra: result.extra } : {}) });
  }
  return result;
}


function validateCoreFlags(args: ParsedArgs): void {
  if (!VALID_MODES.has(String(args.mode))) die(2, "--mode must be one of: auto, direct");
  if (!VALID_MODERATION.has(String(args.moderation))) die(2, "--moderation must be one of: auto, low");
  // Fail locally on a typo instead of spending a round trip to learn the
  // server rejected it.
  if (args.bg && !BACKGROUND_PRESETS.includes(String(args.bg) as (typeof BACKGROUND_PRESETS)[number])) {
    die(2, `--bg must be one of: ${BACKGROUND_PRESETS.join(", ")}`);
  }
  const validReasoning = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
  if (args["reasoning-effort"] && !validReasoning.has(String(args["reasoning-effort"]))) die(2, "--reasoning-effort must be one of: none, low, medium, high, xhigh, max");
  if (args["web-search"] && args["no-web-search"]) die(2, "--web-search and --no-web-search are mutually exclusive");
}

async function requestCoreImage(args: ParsedArgs, context: ImageContext, n: number, requestId: string) {
  const references = await Promise.all(context.refs.map((path: string) => fileToDataUri(path)));
  const body: Record<string, unknown> = { prompt: context.prompt, quality: args.quality, size: args.size, n, references,
    model: context.target.model, mode: args.mode, moderation: args.moderation, sessionId: args.session,
    provider: context.target.lane };
  body.requestId = requestId;
  if (args.bg) body.backgroundPreset = String(args.bg);
  if (args["reasoning-effort"]) body.reasoningEffort = args["reasoning-effort"];
  if (args["no-web-search"]) body.webSearchEnabled = false;
  else if (args["web-search"]) body.webSearchEnabled = true;
  return request(context.server.base, "/api/generate", { method: "POST", body,
    timeoutMs: (parseInt(String(args.timeout)) || 180) * 1000, headers: { "X-Request-Id": requestId } });
}

async function recoverCoreTimeout(args: ParsedArgs, context: ImageContext, requestId: string, n: number): Promise<boolean> {
  if (!context.explicitOut && !context.outDir) return false;
  const result = await recoverGeneratedOutputs(context.server.base, requestId, { explicitOut: context.explicitOut,
    outDir: context.outDir, expectedCount: n, json: Boolean(args.json) });
  if (!result.recovered) { if (!args.json) out(formatRecoveryHint(result)); return false; }
  if (args.json) json({ ok: true, requestId, recovered: true, images: result.paths.map((path) => ({ path })) });
  else for (const path of result.paths) out(color.green("✓ ") + path + color.dim(" (recovered)"));
  return true;
}

async function runCoreImage(args: ParsedArgs, context: ImageContext): Promise<void> {
  validateCoreFlags(args);
  const n = Math.max(1, Math.min(MAX_GENERATION_COUNT, parseInt(String(args.count)) || 1));
  const requestId = createCliRequestId("req_cli_gen");
  let response;
  try { response = await requestCoreImage(args, context, n, requestId); }
  catch (error) {
    const info = errInfo(error);
    const timedOut = info.name === "TimeoutError" || info.name === "AbortError";
    if (timedOut && await recoverCoreTimeout(args, context, requestId, n)) return;
    if (args.json) json({ ok: false, error: info.message, code: info.code, status: info.status, requestId });
    dieWithError(error);
  }
  const norm = normalizeGenerate(response);
  if (norm.images.length === 0) die(1, "server returned no images");
  if (args["no-save"]) {
    const bytes = norm.images.reduce((sum: number, image) => sum + (image.image?.length ?? 0), 0);
    if (process.stdout.isTTY && bytes > 2 * 1024 * 1024 && !args.force) die(2, "refusing to print >2MB of b64 to TTY; use --force or drop --no-save");
    for (const image of norm.images) out(image.image);
    return;
  }
  if (context.explicitOut && norm.images.length > 1) die(2, "--out only supports a single image; use --out-dir for n>1");
  const paths: string[] = [];
  for (let i = 0; i < norm.images.length; i += 1) {
    let target: string;
    if (context.explicitOut) target = context.explicitOut;
    else if (context.outDir) target = `${context.outDir}/${defaultOutName(i, norm.images.length)}`;
    else target = `${config.storage.generatedDir}/${defaultOutName(i, norm.images.length)}`;
    const image = norm.images[i];
    if (!image) continue;
    await dataUriToFile(String(image.image), target);
    paths.push(target);
  }
  if (args.json) json({ ok: true, requestId: norm.requestId, elapsed: norm.elapsed,
    images: paths.map((path, index) => ({ path, filename: norm.images[index]?.filename })) });
  else { for (const path of paths) out(color.green("✓ ") + path); if (norm.elapsed) out(color.dim(`elapsed ${norm.elapsed}s`)); }
}
export default async function genCmd(argv: string[]): Promise<void> {
  const args = parseArgs(argv, SPEC);
  if (args.help) { out(HELP); return; }
  let prompt = args.positional.join(" ");
  if (!prompt && !args.stdin) die(2, "prompt is required (positional or via --stdin)");
  const refs = (Array.isArray(args.ref) ? args.ref : []) as string[];
  if (refs.length > MAX_REFERENCE_COUNT) die(2, `max ${MAX_REFERENCE_COUNT} --ref attachments`);
  const { server, catalog } = await fetchCatalog(args.server, Boolean(args.json));
  const target = resolveImageTarget(args, catalog);
  let context = { server, target, prompt, refs, explicitOut: args.out ? String(args.out) : null,
    outDir: args["out-dir"] ? String(args["out-dir"]) : null };
  if (args.stdin) { const piped = await readStdin(); if (piped) prompt = prompt ? `${prompt} ${piped}` : piped; }
  if (!prompt) die(2, "prompt is required (positional or via --stdin)");
  context = { ...context, prompt };
  return runCoreImage(args, context);
}
