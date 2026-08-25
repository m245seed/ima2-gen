import { config } from "../config.js";
import { parseLocalhostPortFromUrl, parseOAuthReadyUrl } from "./runtimePorts.js";
import { detectCodexAuth } from "./codexDetect.js";
import { resolvePackageBin } from "./packageCli.js";
import { type ChildProcess, spawn } from "node:child_process";
import type { OAuthPool } from "./oauthPool.js";
export function startOAuthProxy(options: any = {}) {
  const oauthPort = options.oauthPort ?? config.oauth.proxyPort;
  const restartDelayMs = options.restartDelayMs ?? config.oauth.restartDelayMs;
  let currentChild: ChildProcess | null = null;
  let stopping = false;
  let restartTimer: NodeJS.Timeout | null = null;
  let hasBeenReady = false;
  let restartCount = 0;
  const MAX_RESTARTS = 3;
  const detectAuth = options.detectAuth ?? detectCodexAuth;
  const execPath = options.execPath ?? process.execPath;
  const resolveOAuthBin = options.resolveOAuthBin ?? (() => resolvePackageBin("openai-oauth", "openai-oauth"));
  const spawnImpl = options.spawnImpl ?? spawn;

  const spawnProxy = () => {
    // Guard: don't start if no auth file exists (avoids pointless crash loops
    // and prevents openai-oauth from corrupting state on refresh failure)
    const auth = detectAuth();
    if (!auth.proxyReady || typeof auth.proxyAuthFile !== "string") {
      console.log("[gpt-oauth] No file-backed Codex session found. Run `ima2 login` to enable GPT OAuth.");
      options.onExit?.({ code: 0, reason: "missing-auth-file" });
      return;
    }

    console.log(`Starting GPT OAuth proxy (openai-oauth) on port ${oauthPort}...`);
    const spawnedAt = Date.now();
    let oauthBin: string;
    try {
      oauthBin = resolveOAuthBin();
    } catch (error) {
      console.error(`[gpt-oauth] failed to resolve bundled proxy: ${(error as Error).message}`);
      options.onExit?.({ code: 1 });
      return;
    }
    const child = spawnImpl(execPath, [
      oauthBin,
      "--port",
      String(oauthPort),
      "--oauth-file",
      auth.proxyAuthFile,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    }) as ChildProcess;
    currentChild = child;

    child.on("error", (err) => {
      console.error(`[gpt-oauth] failed to start proxy: ${err.message}`);
      if (currentChild === child) currentChild = null;
    });

    child.stdout?.on("data", (d) => {
      const msg = d.toString().trim();
      if (!msg) return;
      console.log(`[gpt-oauth] ${msg}`);
      for (const line of msg.split(/\r?\n/)) {
        const url = parseOAuthReadyUrl(line);
        if (!url) continue;
        const port = parseLocalhostPortFromUrl(url);
        if (port && port !== oauthPort) {
          console.log(`[gpt-oauth] requested port ${oauthPort}, actual port ${port}`);
        }
        options.onReady?.({ url, port: port || oauthPort, requestedPort: oauthPort });
        hasBeenReady = true;
      }
    });

    child.stderr?.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg && !msg.includes("npm warn")) console.error(`[gpt-oauth] ${msg}`);
    });

    child.on("exit", (code) => {
      if (currentChild === child) currentChild = null;
      if (stopping) return;
      const uptime = Date.now() - spawnedAt;
      if (uptime < 5000 && !hasBeenReady) {
        // Crashed immediately without ever becoming ready — likely missing openai-oauth or no token.
        // Don't restart; just mark as failed silently.
        console.log(`[gpt-oauth] proxy exited immediately (code ${code}). Skipping — API-key-only mode is fine.`);
        options.onExit?.({ code });
        return;
      }
      options.onExit?.({ code });
      if (restartCount >= MAX_RESTARTS) {
        console.log(`[gpt-oauth] max restarts (${MAX_RESTARTS}) reached. Giving up — API-key-only mode is fine.`);
        return;
      }
      restartCount++;
      console.log(`[gpt-oauth] exited with code ${code}, restarting in ${Math.round(restartDelayMs / 1000)}s... (attempt ${restartCount}/${MAX_RESTARTS})`);
      restartTimer = setTimeout(spawnProxy, restartDelayMs);
    });
  };

  spawnProxy();

  return {
    get child() {
      return currentChild;
    },
    kill(signal: NodeJS.Signals = "SIGTERM") {
      this.stop(signal);
    },
    stop(signal: NodeJS.Signals = "SIGTERM") {
      stopping = true;
      if (restartTimer) clearTimeout(restartTimer);
      try { currentChild?.kill(signal); } catch {}
    },
  };
}

// ── Pool launcher ───────────────────────────────────────────────────────

/**
 * Spawn one openai-oauth proxy per account in the pool.
 * Each child is bound to its account's `authFile` and `port`.
 * Calls `pool.markReady/markFailed` and forwards `onReady/onExit` per account.
 */
export function startOAuthPool(pool: OAuthPool, options: any = {}) {
  const restartDelayMs = options.restartDelayMs ?? config.oauth.restartDelayMs;
  const execPath = options.execPath ?? process.execPath;
  const resolveOAuthBin = options.resolveOAuthBin ?? (() => resolvePackageBin("openai-oauth", "openai-oauth"));
  const spawnImpl = options.spawnImpl ?? spawn;

  const children = new Map<string, ReturnType<typeof startOAuthProxy>>();
  const stopping = { value: false };

  // Detect readiness aggregate: resolve when at least one proxy is ready
  let readyCount = 0;

  for (const account of pool.all) {
    // Per-account spawn wrapper that binds directly to its authFile (no detectCodexAuth)
    const spawnForAccount = () => {
      let hasBeenReady = false;
      const child = spawnImpl(
        execPath,
        [
          resolveOAuthBin(),
          "--port",
          String(account.port),
          "--oauth-file",
          account.authFile,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
          env: { ...process.env },
        },
      ) as import("node:child_process").ChildProcess;

      console.log(`[gpt-oauth:pool] Starting ${account.label} (${account.id}) on port ${account.port} → ${account.authFile}`);

      child.stdout?.on("data", (d: Buffer) => {
        const msg = d.toString().trim();
        if (!msg) return;
        console.log(`[gpt-oauth:${account.id}] ${msg}`);
        for (const line of msg.split(/\r?\n/)) {
          const url = parseOAuthReadyUrl(line);
          if (!url) continue;
          const port = parseLocalhostPortFromUrl(url) || account.port;
          pool.markReady(account.id, url);
          hasBeenReady = true;
          readyCount++;
          options.onReady?.({ url, port, accountId: account.id, account });
          if (readyCount === 1) {
            // First account ready drives global oauthReadyState
            options.onPoolReady?.({ url, port });
          }
          options.onAccountReady?.({ url, port, accountId: account.id, account });
        }
      });
      child.stderr?.on("data", (d: Buffer) => {
        const msg = d.toString().trim();
        if (msg && !msg.includes("npm warn")) console.error(`[gpt-oauth:${account.id}] ${msg}`);
      });
      child.on("error", (err: Error) => {
        console.error(`[gpt-oauth:pool] ${account.id} failed to start: ${err.message}`);
        pool.markFailed(account.id);
      });
      child.on("exit", (code: number | null) => {
        if (stopping.value) return;
        const uptime = Date.now(); // not precise but enough for log
        void uptime;
        if (!hasBeenReady) {
          console.log(`[gpt-oauth:pool] ${account.id} exited immediately (code ${code}). Marking failed.`);
          pool.markFailed(account.id);
          options.onAccountExit?.({ code, accountId: account.id, account });
          // If all accounts failed, signal pool failure
          if (pool.readyAccounts.length === 0 && pool.all.every((a) => a.readyState === "failed")) {
            options.onExit?.({ code, reason: "all-pool-failed" });
            options.onPoolExit?.({ code });
          }
          return;
        }
        options.onAccountExit?.({ code, accountId: account.id, account });
        // Restart single account after delay (simple: respawn same account)
        if (!stopping.value) {
          console.log(`[gpt-oauth:pool] ${account.id} exited (code ${code}), restarting in ${Math.round(restartDelayMs / 1000)}s...`);
          setTimeout(spawnForAccount, restartDelayMs);
        }
      });
      return child;
    };

    try {
      const child = spawnForAccount();
      // Store a handle compatible with startOAuthProxy return shape
      children.set(account.id, {
        get child() { return child; },
        kill(signal: NodeJS.Signals = "SIGTERM") { try { (child as any)?.kill(signal); } catch {} },
        stop(signal: NodeJS.Signals = "SIGTERM") { try { (child as any)?.kill(signal); } catch {} },
        // expose raw for pool stop
        _raw: child,
      } as any);
    } catch (err) {
      console.error(`[gpt-oauth:pool] Failed to spawn ${account.id}: ${(err as Error).message}`);
      pool.markFailed(account.id);
    }
  }

  return {
    children,
    pool,
    get size() { return children.size; },
    kill(signal: NodeJS.Signals = "SIGTERM") { this.stop(signal); },
    stop(signal: NodeJS.Signals = "SIGTERM") {
      stopping.value = true;
      for (const handle of children.values()) {
        try { (handle as any).stop?.(signal); } catch {}
        try { (handle as any).kill?.(signal); } catch {}
        try { (handle as any)._raw?.kill(signal); } catch {}
      }
    },
  };
}
