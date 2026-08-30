import type { Express } from "express";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { requireRuntimeContext } from "../lib/runtimeContext.js";
import type { RouteRuntimeContext } from "../lib/runtimeContext.js";

export interface QuotaWindow {
  label: string;
  percent: number;
  resetsAt: string | null;
}

export interface QuotaResult {
  provider: string;
  account?: { email: string | null; plan: string | null } | null;
  windows: QuotaWindow[];
  error?: boolean;
  authenticated?: boolean;
  billing?: { usedUsd: number; limitUsd: number };
}

function readCodexTokens(): { access_token: string; account_id: string } | null {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  try {
    const j = JSON.parse(readFileSync(join(codexHome, "auth.json"), "utf8"));
    if (j?.tokens?.access_token) {
      return { access_token: j.tokens.access_token, account_id: j.tokens.account_id ?? "" };
    }
  } catch {}
  return null;
}

function readCodexTokensFromFile(authFile: string): { access_token: string; account_id: string } | null {
  try {
    const j = JSON.parse(readFileSync(authFile, "utf8"));
    const tok = j?.tokens?.access_token ?? j?.access_token;
    if (tok) return { access_token: tok, account_id: j?.tokens?.account_id ?? j?.account_id ?? "" };
  } catch {}
  return null;
}

async function fetchCodexUsage(tokens: { access_token: string; account_id: string }): Promise<QuotaResult> {
  try {
    const resp = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "ChatGPT-Account-Id": tokens.account_id,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) return { provider: "codex", authenticated: false, windows: [] };
      return { provider: "codex", error: true, windows: [] };
    }
    const data = await resp.json() as {
      email?: string | null;
      plan_type?: string | null;
      rate_limit?: {
        primary_window?: { used_percent?: number; reset_at?: number };
        secondary_window?: { used_percent?: number; reset_at?: number };
      };
    };
    const account = { email: data.email ?? null, plan: data.plan_type ?? null };
    const windows: QuotaWindow[] = [];
    if (data.rate_limit?.primary_window) {
      windows.push({
        label: "5h",
        percent: Math.round(data.rate_limit.primary_window.used_percent ?? 0),
        resetsAt: data.rate_limit.primary_window.reset_at
          ? new Date(data.rate_limit.primary_window.reset_at * 1000).toISOString()
          : null,
      });
    }
    if (data.rate_limit?.secondary_window) {
      windows.push({
        label: "7d",
        percent: Math.round(data.rate_limit.secondary_window.used_percent ?? 0),
        resetsAt: data.rate_limit.secondary_window.reset_at
          ? new Date(data.rate_limit.secondary_window.reset_at * 1000).toISOString()
          : null,
      });
    }
    return { provider: "codex", account, windows };
  } catch {
    return { provider: "codex", error: true, windows: [] };
  }
}

export function registerQuotaRoutes(app: Express, _ctx: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(_ctx);
  app.get("/api/quota", async (_req, res) => {
    try {
      const pool = ctx.oauthPool;
      // Pool mode: fetch quota for each account independently
      if (pool && pool.size > 1) {
        const accounts = await Promise.all(
          pool.all.map(async (acc) => {
            const tokens = readCodexTokensFromFile(acc.authFile);
            let quota: QuotaResult;
            if (tokens) quota = await fetchCodexUsage(tokens);
            else quota = { provider: "codex", authenticated: false, windows: [] } as QuotaResult;
            return {
              id: acc.id,
              label: acc.label,
              port: acc.port,
              url: acc.url,
              readyState: acc.readyState,
              healthy: pool.healthy.some((h) => h.id === acc.id),
              successCount: acc.successCount,
              failureCount: acc.failureCount,
              disabledUntil: acc.disabledUntil,
              quota,
            };
          }),
        );
        const primaryQuota = accounts[0]?.quota ?? ({ provider: "codex", authenticated: false, windows: [] } as QuotaResult);
        return res.json({
          codex: primaryQuota,
          codexAccounts: accounts,
          pool: {
            size: pool.size,
            strategy: "round-robin",
            healthy: pool.healthy.length,
            ready: pool.readyAccounts.length,
            cursor: (pool as unknown as { cursor?: number }).cursor ?? 0,
            distribution: "Round-robin across accounts (requests alternate A→B→A…). 429/503 auto-failover to next healthy account.",
          },
        });
      }
      // Single-account fallback (backward compatible)
      const tokens = readCodexTokens();
      const codex = tokens
        ? await fetchCodexUsage(tokens)
        : ({ provider: "codex", authenticated: false, windows: [] } as QuotaResult);
      res.json({ codex });
    } catch {
      res.status(500).json({ error: "Failed to fetch quota" });
    }
  });
}
