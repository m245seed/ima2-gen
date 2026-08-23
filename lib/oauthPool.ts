/**
 * OAuth account pool for distributing Codex image generation across
 * multiple isolated CODEX_HOME identities.
 *
 * Discovery order (first match wins if env is set):
 * 1. IMA2_OAUTH_ACCOUNTS="authFile:port,authFile:port" explicit list
 * 2. IMA2_CODEX_HOMES="~/.codex,~/.codex2" → each home's auth.json
 * 3. IMA2_OAUTH_EXTRA_AUTH_FILES="file1,file2"
 * 4. codex-switch registry: ~/.telex-codex-switcher/registry.json → homes/<id>/auth.json
 * 5. Single-account fallback via detectCodexAuth()
 *
 * Runtime: round-robin with health-aware skip. Failed accounts are
 * cooled down for `cooldownMs` then re-tried.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { config } from "../config.js";
import { detectCodexAuth } from "./codexDetect.js";

export interface OAuthPoolAccount {
  id: string;
  label: string;
  authFile: string;
  port: number;
  url: string;
  readyState: "starting" | "ready" | "failed" | "disabled";
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  disabledUntil: number | null;
  reason?: string;
}

export interface OAuthPoolOptions {
  cooldownMs?: number;
  maxConsecutiveFailures?: number;
}

const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_MAX_FAILURES = 3;

export class OAuthPool {
  private accounts: OAuthPoolAccount[];
  private cursor = 0;
  private cooldownMs: number;
  private maxConsecutiveFailures: number;

  constructor(accounts: OAuthPoolAccount[], options: OAuthPoolOptions = {}) {
    this.accounts = accounts;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? DEFAULT_MAX_FAILURES;
  }

  get size(): number {
    return this.accounts.length;
  }

  get all(): OAuthPoolAccount[] {
    return [...this.accounts];
  }

  get healthy(): OAuthPoolAccount[] {
    const now = Date.now();
    return this.accounts.filter((a) => {
      if (a.readyState !== "ready") return false;
      if (a.disabledUntil && a.disabledUntil > now) return false;
      return true;
    });
  }

  /** All ready accounts regardless of cooldown — for status display. */
  get readyAccounts(): OAuthPoolAccount[] {
    return this.accounts.filter((a) => a.readyState === "ready");
  }

  isEnabled(): boolean {
    return this.accounts.length > 1;
  }

  /** Round-robin pick among healthy accounts; falls back to any ready account. */
  next(): OAuthPoolAccount | null {
    if (this.accounts.length === 0) return null;
    if (this.accounts.length === 1) {
      const only = this.accounts[0]!;
      return only.readyState === "ready" ? only : null;
    }
    const healthy = this.healthy;
    const pool = healthy.length > 0 ? healthy : this.readyAccounts;
    if (pool.length === 0) return null;
    // Round-robin over the chosen pool, but keep cursor stable across health changes
    const account = pool[this.cursor % pool.length]!;
    this.cursor = (this.cursor + 1) % pool.length;
    return account;
  }

  /** Iterate all healthy accounts starting at cursor — for failover retries. */
  *failoverOrder(excludeId?: string): Generator<OAuthPoolAccount> {
    const healthy = this.healthy;
    if (healthy.length === 0) return;
    // Build ordered list: cursor first, then wrap around
    const start = this.cursor % healthy.length;
    for (let i = 0; i < healthy.length; i++) {
      const idx = (start + i) % healthy.length;
      const acc = healthy[idx]!;
      if (acc.id === excludeId) continue;
      yield acc;
    }
  }

  byId(id: string): OAuthPoolAccount | undefined {
    return this.accounts.find((a) => a.id === id);
  }

  byPort(port: number): OAuthPoolAccount | undefined {
    return this.accounts.find((a) => a.port === port);
  }

  byAuthFile(authFile: string): OAuthPoolAccount | undefined {
    return this.accounts.find((a) => a.authFile === authFile);
  }

  markReady(portOrId: number | string, url?: string): void {
    const acc = typeof portOrId === "number" ? this.byPort(portOrId) : this.byId(portOrId);
    if (!acc) return;
    acc.readyState = "ready";
    if (url) acc.url = url;
  }

  markFailed(portOrId: number | string): void {
    const acc = typeof portOrId === "number" ? this.byPort(portOrId) : this.byId(portOrId);
    if (!acc) return;
    acc.readyState = "failed";
  }

  markSuccess(id: string): void {
    const acc = this.byId(id);
    if (!acc) return;
    acc.successCount += 1;
    acc.failureCount = 0;
    acc.lastSuccessAt = Date.now();
    acc.disabledUntil = null;
  }

  markFailure(id: string, _reason?: string): void {
    const acc = this.byId(id);
    if (!acc) return;
    acc.failureCount += 1;
    acc.lastFailureAt = Date.now();
    if (acc.failureCount >= this.maxConsecutiveFailures) {
      acc.disabledUntil = Date.now() + this.cooldownMs;
    }
  }

  /** Clear cooldown immediately (e.g. after manual intervention). */
  clearCooldown(id: string): void {
    const acc = this.byId(id);
    if (!acc) return;
    acc.disabledUntil = null;
    acc.failureCount = 0;
  }

  toJSON(): Record<string, unknown> {
    return {
      size: this.accounts.length,
      strategy: "round-robin",
      cursor: this.cursor,
      accounts: this.accounts.map((a) => ({
        id: a.id,
        label: a.label,
        port: a.port,
        url: a.url,
        readyState: a.readyState,
        failureCount: a.failureCount,
        successCount: a.successCount,
        disabledUntil: a.disabledUntil,
        authFile: a.authFile,
      })),
    };
  }
}

// ── Discovery helpers ─────────────────────────────────────────────────

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function parsePort(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 65535 ? n : fallback;
}

/**
 * Parse IMA2_OAUTH_ACCOUNTS="authFile:port,authFile:port"
 */
function parseExplicitAccounts(envValue: string | undefined, basePort: number): OAuthPoolAccount[] | null {
  if (!envValue || typeof envValue !== "string" || envValue.trim() === "") return null;
  const entries = envValue.split(",").map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) return null;
  const accounts: OAuthPoolAccount[] = [];
  entries.forEach((entry, idx) => {
    const [rawFile, rawPort] = entry.split(":").map((s) => s.trim());
    if (!rawFile) return;
    const authFile = expandHome(rawFile);
    if (!existsSync(authFile)) return;
    const port = rawPort ? parsePort(rawPort, basePort + idx) : basePort + idx;
    accounts.push({
      id: `oauth-${idx + 1}`,
      label: `Account ${idx + 1}`,
      authFile,
      port,
      url: `http://127.0.0.1:${port}`,
      readyState: "starting",
      failureCount: 0,
      successCount: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      disabledUntil: null,
    });
  });
  return accounts.length > 0 ? accounts : null;
}

/**
 * Parse IMA2_CODEX_HOMES="~/.codex,~/.codex-2"
 */
function parseCodexHomes(envValue: string | undefined, basePort: number): OAuthPoolAccount[] | null {
  if (!envValue || typeof envValue !== "string" || envValue.trim() === "") return null;
  const homes = envValue.split(",").map((s) => expandHome(s.trim())).filter(Boolean);
  if (homes.length === 0) return null;
  const accounts: OAuthPoolAccount[] = [];
  homes.forEach((home, idx) => {
    const authFile = join(home, "auth.json");
    if (!existsSync(authFile)) return;
    accounts.push({
      id: `codex-home-${idx + 1}`,
      label: `Codex Home ${idx + 1} (${home})`,
      authFile,
      port: basePort + idx,
      url: `http://127.0.0.1:${basePort + idx}`,
      readyState: "starting",
      failureCount: 0,
      successCount: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      disabledUntil: null,
    });
  });
  return accounts.length > 0 ? accounts : null;
}

/**
 * Parse IMA2_OAUTH_EXTRA_AUTH_FILES="file1,file2" (ports auto-assigned)
 */
function parseExtraAuthFiles(envValue: string | undefined, basePort: number, existingPorts: Set<number>): OAuthPoolAccount[] | null {
  if (!envValue || typeof envValue !== "string" || envValue.trim() === "") return null;
  const files = envValue.split(",").map((s) => expandHome(s.trim())).filter(Boolean);
  if (files.length === 0) return null;
  const accounts: OAuthPoolAccount[] = [];
  let offset = 1;
  for (const f of files) {
    if (!existsSync(f)) continue;
    // Find next free port
    let port = basePort + offset;
    while (existingPorts.has(port)) {
      offset++;
      port = basePort + offset;
    }
    existingPorts.add(port);
    accounts.push({
      id: `extra-${offset}`,
      label: `Extra Account ${offset}`,
      authFile: f,
      port,
      url: `http://127.0.0.1:${port}`,
      readyState: "starting",
      failureCount: 0,
      successCount: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      disabledUntil: null,
    });
    offset++;
  }
  return accounts.length > 0 ? accounts : null;
}

/**
 * Auto-discover from codex-switch registry (~/.telex-codex-switcher)
 * Layout: registry.json lists identities, each has id; homes/<id>/auth.json holds creds.
 */
function discoverCodexSwitchAccounts(basePort: number): OAuthPoolAccount[] | null {
  const candidates = [
    join(homedir(), ".telex-codex-switcher"),
    join(homedir(), ".codex-switcher"),
  ];
  for (const baseRoot of candidates) {
    const registryPath = join(baseRoot, "registry.json");
    if (!existsSync(registryPath)) continue;
    try {
      const raw = readFileSync(registryPath, "utf-8");
      const data = JSON.parse(raw);
      const identities: unknown[] = Array.isArray(data?.identities)
        ? data.identities
        : Array.isArray(data)
          ? data
          : [];
      const homesDir = join(baseRoot, "homes");
      if (!existsSync(homesDir)) continue;
      const accounts: OAuthPoolAccount[] = [];
      identities.forEach((entry: unknown, idx) => {
        const id = typeof (entry as Record<string, unknown>)?.id === "string"
          ? (entry as Record<string, unknown>).id as string
          : typeof (entry as Record<string, unknown>)?.display_name === "string"
            ? (entry as Record<string, unknown>).display_name as string
            : `identity-${idx + 1}`;
        // Try homes/<id>/auth.json first (isolated CODEX_HOME), then homes/<id>/
        const candidatesAuth = [
          join(homesDir, id, "auth.json"),
          join(homesDir, id, ".codex", "auth.json"),
          join(homesDir, String(idx), "auth.json"),
        ];
        let authFile: string | null = null;
        for (const c of candidatesAuth) {
          if (existsSync(c)) { authFile = c; break; }
        }
        // Fallback: scan homes subdirs for any auth.json
        if (!authFile) {
          try {
            const subdirs = readdirSync(homesDir, { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => d.name);
            for (const dir of subdirs) {
              const p = join(homesDir, dir, "auth.json");
              const p2 = join(homesDir, dir, ".codex", "auth.json");
              if (existsSync(p)) { authFile = p; break; }
              if (existsSync(p2)) { authFile = p2; break; }
            }
          } catch {}
        }
        if (!authFile) return;
        // Deduplicate by authFile
        if (accounts.some((a) => a.authFile === authFile)) return;
        const label = typeof (entry as Record<string, unknown>)?.display_name === "string"
          ? (entry as Record<string, unknown>).display_name as string
          : id;
        accounts.push({
          id: `switch-${String(id).slice(0, 8)}`,
          label: String(label),
          authFile,
          port: basePort + accounts.length,
          url: `http://127.0.0.1:${basePort + accounts.length}`,
          readyState: "starting",
          failureCount: 0,
          successCount: 0,
          lastFailureAt: null,
          lastSuccessAt: null,
          disabledUntil: null,
        });
      });
      if (accounts.length >= 2) return accounts.slice(0, 8); // cap at 8
      // If only 1 found, not enough for pool — let fallback handle
      if (accounts.length === 1) return null;
    } catch {
      // ignore malformed registry
    }
  }
  // Direct homes scan without registry.json
  for (const baseRoot of candidates) {
    const homesDir = join(baseRoot, "homes");
    if (!existsSync(homesDir)) continue;
    try {
      const subdirs = readdirSync(homesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      const accounts: OAuthPoolAccount[] = [];
      for (const dir of subdirs) {
        const candidatesAuth = [
          join(homesDir, dir, "auth.json"),
          join(homesDir, dir, ".codex", "auth.json"),
        ];
        let authFile: string | null = null;
        for (const c of candidatesAuth) if (existsSync(c)) { authFile = c; break; }
        if (!authFile) continue;
        accounts.push({
          id: `switch-${dir.slice(0, 8)}`,
          label: dir,
          authFile,
          port: basePort + accounts.length,
          url: `http://127.0.0.1:${basePort + accounts.length}`,
          readyState: "starting",
          failureCount: 0,
          successCount: 0,
          lastFailureAt: null,
          lastSuccessAt: null,
          disabledUntil: null,
        });
        if (accounts.length >= 8) break;
      }
      if (accounts.length >= 2) return accounts;
    } catch {}
  }
  return null;
}

/**
 * Main discovery entry. Returns null if pool should NOT be used (single-account mode).
 * Returns OAuthPool when 2+ accounts are available.
 */
export function discoverOAuthPool(basePort?: number): OAuthPool | null {
  const port = basePort ?? config.oauth.proxyPort;

  // Priority 1: explicit IMA2_OAUTH_ACCOUNTS
  const explicit = parseExplicitAccounts(process.env.IMA2_OAUTH_ACCOUNTS, port);
  if (explicit && explicit.length >= 2) return new OAuthPool(explicit);
  if (explicit && explicit.length === 1) {
    // If 1 explicit + extras below, merge
    const extra = parseExtraAuthFiles(process.env.IMA2_OAUTH_EXTRA_AUTH_FILES, port, new Set(explicit.map((a) => a.port)));
    if (extra && extra.length > 0) {
      return new OAuthPool([...explicit, ...extra]);
    }
    // Single explicit still not a pool — but respect it as single pool for uniform code
    // we return null to keep single-proxy path; config still honors single.
    // To allow 1 explicit as pool of 1 (for testing), check IMA2_OAUTH_POOL_FORCE
    if (process.env.IMA2_OAUTH_POOL_FORCE === "1") return new OAuthPool(explicit);
    return null;
  }

  // Priority 2: IMA2_CODEX_HOMES
  const homes = parseCodexHomes(process.env.IMA2_CODEX_HOMES, port);
  if (homes && homes.length >= 2) return new OAuthPool(homes);
  if (homes && homes.length === 1) {
    const extra = parseExtraAuthFiles(process.env.IMA2_OAUTH_EXTRA_AUTH_FILES, port, new Set(homes.map((a) => a.port)));
    if (extra && extra.length > 0) return new OAuthPool([...homes, ...extra]);
  }

  // Priority 3: standalone extra auth files (e.g. user duplicated ~/.codex/auth.json)
  // We try to combine primary auth + extras into a pool.
  const primary = detectCodexAuth();
  if (primary.proxyAuthFile) {
    const extraFilesRaw = process.env.IMA2_OAUTH_EXTRA_AUTH_FILES;
    const extra = parseExtraAuthFiles(extraFilesRaw, port + 1, new Set([port]));
    if (extra && extra.length > 0) {
      const primaryAccount: OAuthPoolAccount = {
        id: "primary",
        label: "Primary",
        authFile: primary.proxyAuthFile,
        port,
        url: `http://127.0.0.1:${port}`,
        readyState: "starting",
        failureCount: 0,
        successCount: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        disabledUntil: null,
      };
      // Dedup if extra already contains primary file
      const combined = [primaryAccount, ...extra.filter((e) => e.authFile !== primaryAccount.authFile)];
      if (combined.length >= 2) return new OAuthPool(combined);
    }
    // Auto-discover sibling auth files like ~/.codex-2/auth.json, ~/.codex/auth-2.json
    const siblingCandidates = [
      join(homedir(), ".codex2", "auth.json"),
      join(homedir(), ".codex-2", "auth.json"),
      join(homedir(), ".codex-second", "auth.json"),
      join(homedir(), ".config", "codex-2", "auth.json"),
    ];
    for (const cand of siblingCandidates) {
      if (existsSync(cand) && cand !== primary.proxyAuthFile) {
        return new OAuthPool([
          {
            id: "primary",
            label: "Primary",
            authFile: primary.proxyAuthFile,
            port,
            url: `http://127.0.0.1:${port}`,
            readyState: "starting",
            failureCount: 0,
            successCount: 0,
            lastFailureAt: null,
            lastSuccessAt: null,
            disabledUntil: null,
          },
          {
            id: "sibling",
            label: "Secondary",
            authFile: cand,
            port: port + 1,
            url: `http://127.0.0.1:${port + 1}`,
            readyState: "starting",
            failureCount: 0,
            successCount: 0,
            lastFailureAt: null,
            lastSuccessAt: null,
            disabledUntil: null,
          },
        ]);
      }
    }
  }

  // Priority 4: codex-switch registry/homes
  const switched = discoverCodexSwitchAccounts(port);
  if (switched && switched.length >= 2) return new OAuthPool(switched);

  return null;
}

/**
 * Single-account fallback as a 1-element pool (for uniform code paths when
 * caller forces pool mode). Not used in normal single-account boot.
 */
export function createSingleAccountPool(): OAuthPool | null {
  const primary = detectCodexAuth();
  if (!primary.proxyAuthFile) return null;
  const port = config.oauth.proxyPort;
  return new OAuthPool([
    {
      id: "primary",
      label: "Primary",
      authFile: primary.proxyAuthFile,
      port,
      url: `http://127.0.0.1:${port}`,
      readyState: "starting",
      failureCount: 0,
      successCount: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      disabledUntil: null,
    },
  ]);
}
