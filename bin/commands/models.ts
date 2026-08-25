import { parseArgs } from "../lib/args.js";
import { request, resolveServer } from "../lib/client.js";
import type { ModelCatalog as Catalog } from "../lib/modelResolver.js";
import { fail, json, out, table } from "../lib/output.js";

const SPEC = {
  flags: {
    lane: { type: "string" },
    json: { type: "boolean" },
    server: { type: "string" },
    help: { short: "h", type: "boolean" },
  },
};

const HELP = `
  ima2 models [--lane <lane>] [--json]

  List image models exposed by the running ima2 server.

  Options:
        --lane <lane>         Filter by provider lane
        --json                Print the stable machine-readable contract
        --server <url>        Override server URL
`;

function capText(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const capabilities = raw as Record<string, unknown>;
  const parameters = Array.isArray(capabilities.parameters)
    ? capabilities.parameters as Array<Record<string, unknown>>
    : [];
  const summaries = parameters
    .filter((item) => ["duration", "resolution", "ratio", "aspect_ratio"].includes(String(item.name)))
    .map((item) => {
      const options = Array.isArray(item.options) ? item.options.join("|") : "";
      const range = item.min !== undefined || item.max !== undefined ? `${item.min ?? ""}-${item.max ?? ""}` : "";
      return `${item.name}:${options || range || item.type || "set"}`;
    });
  const ratios = Array.isArray(capabilities.aspectRatios) ? capabilities.aspectRatios.join("|") : "";
  if (ratios && !summaries.some((item) => item.startsWith("ratio:"))) summaries.push(`ratio:${ratios}`);
  return summaries.join(", ");
}

function flatten(catalog: Catalog, laneFilter?: string) {
  return Object.entries(catalog.lanes)
    .filter(([lane]) => !laneFilter || lane === laneFilter)
    .flatMap(([lane, info]) => (info.models.image ?? []).map((model) => ({
      lane,
      id: model.id,
      label: model.label ?? model.id,
      status: info.status,
      capabilities: model.capabilities ?? {},
    })));
}

async function fetchCatalog(serverFlag: unknown, isJson: boolean): Promise<{ base: string; catalog: Catalog }> {
  try {
    const server = await resolveServer({ serverFlag });
    const catalog = await request(server.base, "/api/models", { timeoutMs: 5000 }) as Catalog;
    return { base: server.base, catalog };
  } catch (error) {
    const message = (error as Error)?.message || "server unreachable";
    fail({ json: isJson, code: "SERVER_UNREACHABLE", message, exitCode: 3 });
  }
}

export default async function modelsCmd(argv: string[]): Promise<void> {
  const args = parseArgs(argv, SPEC);
  if (args.help) { out(HELP); return; }
  const isJson = Boolean(args.json);
  const { catalog } = await fetchCatalog(args.server, isJson);
  const models = flatten(catalog, args.lane ? String(args.lane) : undefined);
  if (isJson) { json({ ok: true, kinds: { image: models } }); return; }
  const rows = models
    .map((item) => ({ ...item, kind: "image", caps: capText(item.capabilities) }));
  table(rows, [
    { key: "lane", label: "lane" }, { key: "kind", label: "kind" },
    { key: "id", label: "model-id" }, { key: "status", label: "status" },
    { key: "caps", label: "caps" },
  ]);
}
