import type { Express, Request, Response } from "express";
import type { CoreProviderId } from "../lib/providers/registry.js";
import {
  requireRuntimeContext,
  type RouteRuntimeContext,
  type RuntimeContext,
} from "../lib/runtimeContext.js";

export type ModelLaneStatus = "ready" | "locked" | "disconnected" | "key-missing";
export type ModelLaneId = CoreProviderId;

type ModelParameter = {
  name: string;
  type: string;
  options?: Array<string | number>;
  min?: number;
  max?: number;
};

type ModelCapabilities = {
  source: "verified-contract";
  aspectRatios: string[];
  parameters: ModelParameter[];
  inputRoles: string[];
};

type ModelEntry = {
  id: string;
  label: string;
  capabilities: ModelCapabilities;
};

type ModelCatalog = {
  image: ModelEntry[];
};

export interface ModelLaneDto {
  status: ModelLaneStatus;
  reason?: string;
  defaults: { image?: string };
  models: ModelCatalog;
}

function capabilities(inputRoles: string[] = []): ModelCapabilities {
  return {
    source: "verified-contract",
    aspectRatios: [],
    parameters: [],
    inputRoles,
  };
}

function entries(ids: Iterable<string>): ModelEntry[] {
  return [...ids].map((id) => ({
    id,
    label: id,
    capabilities: capabilities(["text", "image_references"]),
  }));
}

function lane(
  status: ModelLaneStatus,
  reason: string | undefined,
  defaults: ModelLaneDto["defaults"],
  image: ModelEntry[],
): ModelLaneDto {
  return {
    status,
    ...(reason ? { reason } : {}),
    defaults,
    models: { image },
  };
}

function oauthLane(ctx: RuntimeContext, image: ModelEntry[]): ModelLaneDto {
  const ready = ctx.oauthReadyState === "ready";
  return lane(
    ready ? "ready" : "disconnected",
    ready ? undefined : `oauth proxy ${ctx.oauthReadyState ?? "not ready"}`,
    { image: ctx.config.imageModels.default },
    image,
  );
}

function apiLane(ctx: RuntimeContext, image: ModelEntry[]): ModelLaneDto {
  return lane(
    ctx.hasApiKey ? "ready" : "key-missing",
    ctx.hasApiKey ? undefined : "OpenAI API key missing",
    { image: ctx.config.apiProvider.defaultImageModel },
    image,
  );
}

function buildCoreLanes(ctx: RuntimeContext): Record<CoreProviderId, ModelLaneDto> {
  const image = entries(ctx.config.imageModels.valid);
  return {
    oauth: oauthLane(ctx, image),
    api: apiLane(ctx, entries(ctx.config.imageModels.valid)),
  };
}

export function registerModelsRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.get("/api/models", (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, lanes: buildCoreLanes(ctx) });
    } catch {
      res.status(500).json({ ok: false, error: "MODEL_CATALOG_UNAVAILABLE" });
    }
  });
}
