import type { Express, Request, Response } from "express";
import { readFile, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { RuntimeContext } from "../lib/runtimeContext.js";
import OpenAI from "openai";

// Atomic + 0600 config write: temp file then rename, so a crash or concurrent
// save can't corrupt config.json (which may hold API keys). Rename also forces
// 0600 perms even if a looser-perm config pre-existed.
async function writeConfigAtomic(cfgPath: string, data: unknown): Promise<void> {
  const tmp = `${cfgPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(tmp, cfgPath);
}

let configMutationQueue: Promise<void> = Promise.resolve();

function serializeConfigMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = configMutationQueue.then(mutation, mutation);
  configMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function updateConfigFile(
  cfgPath: string,
  mutate: (config: Record<string, unknown>) => void,
): Promise<void> {
  await serializeConfigMutation(async () => {
    let existing: Record<string, unknown> = {};
    try { existing = JSON.parse(await readFile(cfgPath, "utf-8")); } catch { /* new file */ }
    mutate(existing);
    await writeConfigAtomic(cfgPath, existing);
  });
}


type KeyProvider = "openai";

const KEY_PREFIX_MAP: Record<KeyProvider, string[]> = {
  openai: ["sk-"],
};

const VALIDATE_URL_MAP: Record<KeyProvider, string> = {
  openai: "https://api.openai.com/v1/models",
};
const CONFIG_KEY_MAP: Record<KeyProvider, string> = {
  openai: "apiKey",
};

function isKeyProvider(v: string): v is KeyProvider {
  return v === "openai";
}

function maskKey(key: string): string {
  if (key.length <= 10) return "***";
  return `${key.slice(0, 4)}..${key.slice(-2)}`;
}

function keySourceForProvider(ctx: RuntimeContext, provider: KeyProvider): { key: string | undefined; source: string } {
  if (provider === "openai") return { key: ctx.apiKey, source: ctx.apiKeySource || "none" };
  return { key: undefined, source: "none" };
}

export function mountKeyRoutes(app: Express, ctx: RuntimeContext) {
  app.get("/api/keys/status", (_req: Request, res: Response) => {
    const provider = "openai" as const;
    const { key, source } = keySourceForProvider(ctx, provider);
    res.json({
      [provider]: {
        configured: !!key,
        source,
        valid: !!key,
        maskedKey: key ? maskKey(key) : null,
      },
    });
  });


  app.put("/api/keys/:provider", async (req: Request<{ provider: string }>, res: Response) => {
    const { provider } = req.params;
    if (!isKeyProvider(provider)) {
      return res.status(400).json({ ok: false, error: "Invalid provider", code: "INVALID_PROVIDER" });
    }
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "Missing apiKey", code: "MISSING_KEY" });
    }
    const trimmed = apiKey.trim();
    if (trimmed.length > 512) {
      return res.status(400).json({ ok: false, error: "API key too large", code: "KEY_TOO_LARGE" });
    }

    // Format check (providers with an empty prefix list accept any non-empty key)
    const prefixes = KEY_PREFIX_MAP[provider];
    const validPrefix = prefixes.length === 0 || prefixes.some((p) => trimmed.startsWith(p));
    if (!validPrefix) {
      return res.status(400).json({
        ok: false,
        error: `Invalid key format for ${provider}: expected prefix ${prefixes.join(" or ")}`,
        code: "INVALID_KEY_FORMAT",
      });
    }

    try {
      const url = VALIDATE_URL_MAP[provider];
      const opts: RequestInit = {
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${trimmed}` },
      };
      const validateRes = await fetch(url, opts);
      if (!validateRes.ok) throw new Error(`HTTP ${validateRes.status}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "unknown";
      return res.status(400).json({
        ok: false,
        error: `API key validation failed: ${message}`,
        code: "KEY_VALIDATION_FAILED",
      });
    }

    // Save to config.json
    const cfgPath = ctx.config.storage.configFile;
    await updateConfigFile(cfgPath, (existing) => {
      existing[CONFIG_KEY_MAP[provider]] = trimmed;
    });

    // Hot-update runtime context
    ctx.apiKey = trimmed;
    ctx.apiKeySource = "config";
    ctx.hasApiKey = true;
    try {
      ctx.openai = new OpenAI({ apiKey: trimmed });
    } catch { /* ignore */ }

    return res.json({ ok: true, provider, source: "config", valid: true });
  });

  app.delete("/api/keys/:provider", async (req: Request<{ provider: string }>, res: Response) => {
    const { provider } = req.params;
    if (!isKeyProvider(provider)) {
      return res.status(400).json({ ok: false, error: "Invalid provider", code: "INVALID_PROVIDER" });
    }
    const { source } = keySourceForProvider(ctx, provider);
    if (source === "env") {
      return res.status(400).json({ ok: false, error: "Cannot remove env-sourced key", code: "ENV_KEY_IMMUTABLE" });
    }

    // Remove from config.json
    const cfgPath = ctx.config.storage.configFile;
    await updateConfigFile(cfgPath, (existing) => { delete existing[CONFIG_KEY_MAP[provider]]; });

    // Clear runtime
    ctx.apiKey = undefined;
    ctx.apiKeySource = "none";
    ctx.hasApiKey = false;
    ctx.openai = null;

    return res.json({ ok: true, provider, removed: true });
  });
}
