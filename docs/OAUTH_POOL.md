# OAuth Pool — 2 Codex Accounts, Load-Balanced Image Generation

`ima2-gen` now supports **round-robin distribution** of `oauth/gpt-5.6-luna` image requests across **2 (or more) Codex OAuth accounts** on one machine. Each account keeps its own `CODEX_HOME` and quota.

## Why

- Each ChatGPT/Codex account has its own rate limit and 5h/weekly quota.
- Pooling 2 accounts roughly **doubles throughput** and **halves per-account pressure** when you run concurrent `ima2 gen` / multimode / node generations.
- Failover: if one account hits `429`/`503`/`401`, the request auto-retries on the next healthy account.

## Quick Start (isolated CODEX_HOME — no codex-switch needed)

```bash
# 1. Your first account is already in ~/.codex/auth.json
ls -l ~/.codex/auth.json

# 2. Create a second isolated home and log in with a DIFFERENT ChatGPT account
CODEX_HOME=~/.codex2 npx @openai/codex login
#  → follow the browser OAuth flow with account 2

ls -l ~/.codex/auth.json ~/.codex2/auth.json
# both should exist

# 3. Start ima2 — it auto-discovers ~/.codex2/auth.json as a sibling
ima2 serve
#  → logs: [oauth:pool] Discovered 2 Codex accounts … Starting pool … round-robin …

# 4. Verify
curl http://127.0.0.1:3333/api/oauth/pool | jq
#  { "enabled": true, "size": 2, "strategy": "round-robin", "accounts": [...] }

# 5. Generate — requests alternate A→B→A…
ima2 gen "a cat" --model oauth/gpt-5.6-luna &
ima2 gen "a dog" --model oauth/gpt-5.6-luna &
wait
```

## Configuration

Discovery order (first match with 2+ accounts wins):

| Priority | Env | Example | Notes |
|----------|-----|---------|-------|
| 1 | `IMA2_OAUTH_ACCOUNTS` | `~/.codex/auth.json:10531,~/.codex2/auth.json:10532` | Explicit `authFile:port` list |
| 2 | `IMA2_CODEX_HOMES` | `~/.codex,~/.codex2` | Each home's `auth.json` |
| 3 | `IMA2_OAUTH_EXTRA_AUTH_FILES` | `~/.codex2/auth.json` | Extra files merged with primary `~/.codex/auth.json` |
| 4 | Sibling auto-discover | `~/.codex2/auth.json` (or `~/.codex-2/auth.json`) | If primary exists, sibling is auto-pooled with no env |
| 5 | codex-switch | `~/.telex-codex-switcher/homes/*/auth.json` | `codex-switch add` twice → auto-discovered |

Single-account mode is fully backward compatible: if only one auth file exists, the server behaves exactly as before (single proxy on `10531`).

### Explicit Examples

```bash
# Explicit 2 accounts, custom ports
IMA2_OAUTH_ACCOUNTS=~/.codex/auth.json:10531,~/.codex2/auth.json:10532 ima2 serve

# Codex homes
IMA2_CODEX_HOMES=~/.codex,~/.codex2 ima2 serve

# Extra file (primary auto-detected)
IMA2_OAUTH_EXTRA_AUTH_FILES=~/.codex2/auth.json ima2 serve

# Force single file into pool mode (testing)
IMA2_OAUTH_ACCOUNTS=~/.codex/auth.json:10531 IMA2_OAUTH_POOL_FORCE=1 ima2 serve
```

### Tunables (in `~/.ima2/config.json` or env)

```json
{
  "oauth": {
    "poolStrategy": "round-robin",
    "poolCooldownMs": 60000,
    "poolMaxFailures": 3
  }
}
```

| Key | Env | Default | Meaning |
|-----|-----|---------|---------|
| `oauth.poolCooldownMs` | `IMA2_OAUTH_POOL_COOLDOWN_MS` | `60000` | How long a 429-failing account is skipped |
| `oauth.poolMaxFailures` | `IMA2_OAUTH_POOL_MAX_FAILURES` | `3` | Consecutive 429/503 before cooldown |

## Distribution & Failover

- **Round-robin**: `next()` cycles `A → B → A → B…` across *healthy* accounts.
- **Health-aware skip**: an account with `≥ poolMaxFailures` consecutive 429/503 is cooled down for `poolCooldownMs`, then retried.
- **Auto-failover**: on `429`/`503`/`502`/`401`/`403`, the same request retries once on the next healthy account (no extra billing — only one image is produced).
- **Card News / legacy**: `generateViaOAuth` helpers use the same `getOAuthUrl` pool picker, so they also distribute.

## Observability

```bash
# Pool status
curl http://127.0.0.1:3333/api/oauth/pool | jq
curl http://127.0.0.1:3333/api/health | jq .runtime.oauth.pool

# Verbose per-request logs
ima2 serve --dev
# → [oauth:pool] Starting pool … round-robin …
# → [oauth:pool] Account oauth-1 ready on :10531
# → (per generation) pool_pick { accountId: "oauth-1", ... }
# → on 429: pool_retry { fromAccount: "oauth-1", status: 429, remaining: 1 }
```

## Helper

```bash
node scripts/setup-oauth-pool.mjs --check   # env + file discovery (no server)
node scripts/setup-oauth-pool.mjs --init    # guided setup
```

## FAQ

**Do I need codex-switch?** No. Method A (`CODEX_HOME=~/.codex2`) is enough. codex-switch is just another auto-discovery source if you already use it.

**Will billing be split?** Each image is billed to the account that served it. Quota is tracked per-account upstream; ima2 logs `accountId` so you can audit distribution.

**What about `provider: api` (API key)?** Not pooled — pooling is only for `provider: oauth` (Codex OAuth). Use `api` with your own key if you want a third independent lane.

**How many accounts?** Up to 8 via codex-switch discovery, arbitrary via `IMA2_OAUTH_ACCOUNTS`.

**Stopping?** `ima2 stop` stops all pool proxies.

## Internals

- `lib/oauthPool.ts` — discovery + `OAuthPool` (round-robin + cooldown).
- `lib/oauthLauncher.ts: startOAuthPool()` — one `openai-oauth` child per account.
- `lib/oauthProxy/runtime.ts: getOAuthUrl()` — pool-aware picker.
- `lib/responsesImageAdapter.ts: postResponses()` — pool retry loop for `429/503`.
- `server.ts: createRuntimeContext()/startServer()` — pool boot.
- `routes/health.ts` — `/api/oauth/pool` + health pool fields.

