import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config } from "../../config.js";
import { buildIma2Capabilities } from "../../lib/capabilities.js";
import { parseArgs, type ParsedArgs } from "../lib/args.js";
import { resolveServer, request } from "../lib/client.js";
import { color, dieWithError, json, out } from "../lib/output.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGE_PATH = join(ROOT, "package.json");

const HELP = `
  ima2 capabilities [--json] [--server <url>] [--require-server]

  Print agent-friendly capability metadata.

  Options:
    --json             Print JSON
    --server <url>     Query a specific running server
    --require-server   Fail instead of falling back to local package metadata
`;

const FLAGS = {
  json: { type: "boolean" },
  server: { type: "string" },
  "require-server": { type: "boolean" },
  help: { short: "h", type: "boolean" },
};
type CapabilityData = {
  source: string;
  version: string;
  server: string | null;
  defaults?: {
    oauth?: { model?: string; reasoningEffort?: string };
    api?: { model?: string; reasoningEffort?: string };
  };
  valid?: {
    imageModels?: { supported?: string[] };
    reasoningEfforts?: string[];
    quality?: string[];
    modes?: string[];
    moderation?: unknown[];
    providers?: string[];
  };
  configKeys?: { writable?: unknown[] };
  limits?: {
    maxRefCount?: number;
    maxGeneratedImages?: number;
    maxParallel?: { value?: number; note?: string };
  };
};
function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf-8")) as { version?: string };
    return pkg.version || "?";
  } catch {
    return "?";
  }
}

function localCapabilities() {
  return buildIma2Capabilities({
    appConfig: config,
    packageVersion: packageVersion(),
    source: "local",
    server: null,
  });
}

async function readCapabilities(args: ParsedArgs): Promise<CapabilityData> {
  try {
    const server = await resolveServer({ serverFlag: args.server });
    return await request(server.base, "/api/capabilities", { timeoutMs: 5000 }) as CapabilityData;
  } catch (error) {
    if (args.server || args["require-server"]) throw error;
    return localCapabilities();
  }
}

function printText(capabilities: CapabilityData): void {
  out(`ima2 capabilities (${capabilities.source})`);
  out(`version: ${capabilities.version}`);
  out(`server: ${capabilities.server || "none"}`);
  out("");
  out("defaults:");
  out(`  gpt-oauth model: ${capabilities.defaults?.oauth?.model}`);
  out(`  gpt-oauth reasoning: ${capabilities.defaults?.oauth?.reasoningEffort}`);
  out(`  api model: ${capabilities.defaults?.api?.model}`);
  out(`  api reasoning: ${capabilities.defaults?.api?.reasoningEffort}`);
  out("");
  out("valid:");
  out(`  models: ${capabilities.valid?.imageModels?.supported?.join(", ")}`);
  out(`  reasoning: ${capabilities.valid?.reasoningEfforts?.join(", ")}`);
  out(`  quality: ${capabilities.valid?.quality?.join(", ")}`);
  out(`  modes: ${capabilities.valid?.modes?.join(", ")}`);
  out(`  moderation: ${capabilities.valid?.moderation?.join(", ")}`);
  out(`  providers: ${capabilities.valid?.providers?.join(", ")}`);
  out("");
  out(`config keys: ${capabilities.configKeys?.writable?.length ?? 0} writable`);
  out(color.dim("run: ima2 config keys --json"));
  out("");
  out(`limits: refs=${capabilities.limits?.maxRefCount}, images=${capabilities.limits?.maxGeneratedImages}`);
  out(color.dim(`maxParallel: ${capabilities.limits?.maxParallel?.value} (${capabilities.limits?.maxParallel?.note})`));
}

export default async function capabilitiesCmd(argv: string[]) {
  const args = parseArgs(argv, { flags: FLAGS });
  if (args.help) {
    out(HELP);
    return;
  }

  try {
    const capabilities = await readCapabilities(args);
    if (args.json) json(capabilities);
    else printText(capabilities);
  } catch (error) {
    dieWithError(error);
  }
}
