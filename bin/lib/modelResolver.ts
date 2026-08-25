import { canonicalizeImageModel } from "./model-aliases.js";
import { deriveProviderIds } from "../../lib/providers/derive.js";
import type { CoreProviderId } from "../../lib/providers/registry.js";

export type Lane = CoreProviderId;
export type LaneStatus = "ready" | "locked" | "disconnected" | "key-missing";

export interface ModelEntry {
  id: string;
  label?: string;
  capabilities?: unknown;
}

export interface LaneInfo {
  status: LaneStatus;
  reason?: string;
  defaults: { image?: string };
  models: { image: ModelEntry[] };
}

export type ModelCatalog = { lanes: Record<string, LaneInfo> };
export interface CliDefaults { image?: string }
export type ResolveResult =
  | { ok: true; lane: Lane; model: string; transport: "core" }
  | { ok: false; code: string; message: string; extra?: Record<string, unknown> | undefined };

const LANES = deriveProviderIds() as readonly Lane[];

function failure(code: string, message: string, extra?: Record<string, unknown> | undefined): ResolveResult {
  return { ok: false, code, message, ...(extra ? { extra } : {}) };
}

function knownLane(value: string | undefined, catalog: ModelCatalog): Lane | null {
  if (!value || !LANES.includes(value as Lane) || !catalog.lanes[value]) return null;
  return value as Lane;
}

function canonicalModel(model: string): string {
  return canonicalizeImageModel(model) ?? model;
}

function modelExists(info: LaneInfo | undefined, model: string): boolean {
  return info?.models.image.some((entry) => entry.id === model) ?? false;
}

function resolveLaneModel(lane: Lane, model: string, catalog: ModelCatalog): ResolveResult {
  const info = catalog.lanes[lane];
  if (!info) return failure("UNKNOWN_LANE", `Unknown lane: ${lane}`);
  if (!modelExists(info, model)) return failure("MODEL_NOT_FOUND", `${lane}/${model} is not available for image`);
  if (info.status !== "ready") {
    const reason = info.reason ? `: ${info.reason}` : "";
    return failure("LANE_UNAVAILABLE", `${lane} is ${info.status}${reason}`, {
      lane, status: info.status, ...(info.reason ? { reason: info.reason } : {}),
    });
  }
  return { ok: true, lane, model, transport: "core" };
}

function groupedModels(catalog: ModelCatalog): Record<string, string[]> {
  return Object.fromEntries(LANES.map((lane) => [
    lane,
    (catalog.lanes[lane]?.models.image ?? []).map((entry) => entry.id),
  ]));
}

function noDefault(catalog: ModelCatalog): ResolveResult {
  return failure("NO_DEFAULT_MODEL", "No default image model is configured", {
    models: groupedModels(catalog),
    fix: [
      "ima2 defaults set image <lane>/<model>",
      "ima2 models",
    ],
  });
}

function parseNamespaced(model: string): { lane: string; model: string } | null {
  const slash = model.indexOf("/");
  if (slash < 0) return null;
  return { lane: model.slice(0, slash), model: model.slice(slash + 1) };
}

function resolveNamespaced(
  rawModel: string,
  provider: string | undefined,
  catalog: ModelCatalog,
): ResolveResult {
  const parsed = parseNamespaced(rawModel);
  if (!parsed) return failure("MODEL_NOT_FOUND", `Model target must use <lane>/<model>: ${rawModel}`);
  const lane = knownLane(parsed.lane, catalog);
  if (!lane) return failure("UNKNOWN_LANE", `Unknown lane: ${parsed.lane}`);
  if (provider && provider !== lane) return failure("LANE_CONFLICT", `--provider ${provider} conflicts with --model ${rawModel}`);
  return resolveLaneModel(lane, canonicalModel(parsed.model), catalog);
}

function resolveBare(
  rawModel: string,
  provider: string | undefined,
  catalog: ModelCatalog,
): ResolveResult {
  const model = canonicalModel(rawModel);
  const lanes = provider ? [provider as Lane] : LANES.filter((lane) => modelExists(catalog.lanes[lane], model));
  const matches = lanes.filter((lane) => modelExists(catalog.lanes[lane], model));
  if (matches.length > 1) {
    return failure("MODEL_AMBIGUOUS", `${model} exists in multiple lanes; pass --provider <lane>`, {
      candidates: matches.map((lane) => `${lane}/${model}`),
    });
  }
  const only = matches[0];
  if (matches.length === 1 && only) return resolveLaneModel(only, model, catalog);
  return failure("MODEL_NOT_FOUND", `${model} is not available for image`);
}

export function resolveTarget(
  flags: { model?: string | undefined; provider?: string | undefined },
  catalog: ModelCatalog,
  defaults: CliDefaults,
): ResolveResult {
  if (flags.provider === "auto") {
    return failure("PROVIDER_AUTO_REMOVED", "--provider auto was removed; run `ima2 models` and pass `--provider <lane>`");
  }
  const provider = flags.provider ? knownLane(flags.provider, catalog) : null;
  if (flags.provider && !provider) return failure("UNKNOWN_LANE", `Unknown lane: ${flags.provider}`);
  if (flags.model) {
    return parseNamespaced(flags.model)
      ? resolveNamespaced(flags.model, provider ?? undefined, catalog)
      : resolveBare(flags.model, provider ?? undefined, catalog);
  }
  if (provider) {
    const laneInfo = catalog.lanes[provider];
    if (!laneInfo) return failure("UNKNOWN_LANE", `Unknown lane: ${provider}`);
    const model = laneInfo.defaults.image;
    if (!model) return failure("NO_DEFAULT_MODEL", `${provider} has no default image model`);
    return resolveLaneModel(provider, canonicalModel(model), catalog);
  }
  const configured = defaults.image;
  if (!configured) return noDefault(catalog);
  return resolveNamespaced(configured, undefined, catalog);
}
