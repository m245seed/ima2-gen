// Contract discovery API (070 WP7): catalog projections.
import type { Express, Request, Response } from "express";
import { buildCatalog } from "../lib/contracts/catalog.js";
import {
  buildToolShow,
  buildToolsList,
  catalogVersion,
  errorEnvelope,
  okEnvelope,
  type ProviderLiveState,
} from "../lib/contracts/discovery.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

export function registerContractRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);

  function loadState() {
    const entries = buildCatalog({ snapshots: [] });
    const liveByProvider: Record<string, ProviderLiveState> = {};
    return { entries, liveByProvider, meta: { catalogVersion: catalogVersion(entries), cliVersion: ctx.packageVersion } };
  }

  app.get("/api/contracts", (_req: Request, res: Response) => {
    try {
      const { entries, liveByProvider, meta } = loadState();
      res.json(okEnvelope({ tools: buildToolsList(entries, liveByProvider) }, meta));
    } catch (error) {
      res.status(500).json(errorEnvelope("server_error", String((error as Error).message).slice(0, 200), { catalogVersion: "unknown", cliVersion: ctx.packageVersion }));
    }
  });

  app.get("/api/contracts/:id", (req: Request, res: Response) => {
    try {
      const { entries, liveByProvider, meta } = loadState();
      const entry = entries.find((e) => e.id === String(req.params.id));
      if (!entry) return res.status(404).json(errorEnvelope("unknown_tool", `no contract: ${String(req.params.id)}`, meta));
      res.json(okEnvelope({ tool: buildToolShow(entry, liveByProvider) }, meta));
    } catch (error) {
      res.status(500).json(errorEnvelope("server_error", String((error as Error).message).slice(0, 200), { catalogVersion: "unknown", cliVersion: ctx.packageVersion }));
    }
  });
}
