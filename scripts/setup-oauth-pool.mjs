#!/usr/bin/env node
/**
 * setup-oauth-pool.mjs — helper to configure 2 Codex OAuth accounts for round-robin image generation.
 *
 * Usage:
 *   node scripts/setup-oauth-pool.mjs --check        # show current pool discovery status (fast, no server needed)
 *   node scripts/setup-oauth-pool.mjs --init         # guided setup for second account
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", RED = "\x1b[31m", RESET = "\x1b[0m";

function printCheck() {
  console.log(`\n${CYAN}── OAuth Pool Discovery ──${RESET}`);
  console.log(`\nEnv:`);
  console.log(`  IMA2_OAUTH_ACCOUNTS=${process.env.IMA2_OAUTH_ACCOUNTS || "(not set)"}`);
  console.log(`  IMA2_CODEX_HOMES=${process.env.IMA2_CODEX_HOMES || "(not set)"}`);
  console.log(`  IMA2_OAUTH_EXTRA_AUTH_FILES=${process.env.IMA2_OAUTH_EXTRA_AUTH_FILES || "(not set)"}`);
  console.log(`  IMA2_OAUTH_POOL_STRATEGY=${process.env.IMA2_OAUTH_POOL_STRATEGY || "round-robin (default)"}`);
  console.log(`\nPrimary auth:`);
  for (const p of [join(HOME, ".codex/auth.json"), join(HOME, ".codex-2/auth.json"), join(HOME, ".config/codex/auth.json")]) {
    const hit = existsSync(p);
    console.log(`  ${hit ? GREEN + "✓" : RED + "✗"} ${p} ${RESET}${hit ? "" : RED + "(missing)" + RESET}`);
  }
  if (process.env.IMA2_OAUTH_ACCOUNTS) {
    console.log(`\nIMA2_OAUTH_ACCOUNTS parsed:`);
    for (const entry of process.env.IMA2_OAUTH_ACCOUNTS.split(",").map((s) => s.trim()).filter(Boolean)) {
      const [f, port] = entry.split(":").map((s) => s.trim());
      const expanded = f.startsWith("~/") ? join(HOME, f.slice(2)) : f;
      const hit = existsSync(expanded);
      console.log(`  ${hit ? GREEN + "✓" : RED + "✗"} ${f} :${port || "?"} → ${expanded}`);
    }
  }
  if (process.env.IMA2_CODEX_HOMES) {
    console.log(`\nIMA2_CODEX_HOMES parsed:`);
    for (const h of process.env.IMA2_CODEX_HOMES.split(",").map((s) => s.trim()).filter(Boolean)) {
      const expanded = h.startsWith("~/") ? join(HOME, h.slice(2)) : h;
      const auth = join(expanded, "auth.json");
      const hit = existsSync(auth);
      console.log(`  ${hit ? GREEN + "✓" : YELLOW + "·"} ${h} → ${auth}`);
    }
  }
  console.log(`\ncodex-switch registry:`);
  for (const p of [join(HOME, ".telex-codex-switcher/registry.json"), join(HOME, ".telex-codex-switcher/homes")]) {
    console.log(`  ${existsSync(p) ? GREEN + "✓" : YELLOW + "·"} ${p}`);
  }
  if (existsSync(join(HOME, ".telex-codex-switcher/homes"))) {
    try {
      const homes = readdirSync(join(HOME, ".telex-codex-switcher/homes"), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      console.log(`    homes: ${homes.join(", ") || "(empty)"}`);
      for (const h of homes.slice(0, 8)) {
        const cands = [join(HOME, ".telex-codex-switcher/homes", h, "auth.json"), join(HOME, ".telex-codex-switcher/homes", h, ".codex/auth.json")];
        for (const c of cands) if (existsSync(c)) console.log(`      ${GREEN}✓${RESET} ${c}`);
      }
    } catch {}
  }
  console.log(`\n${CYAN}Next:${RESET} start server and verify pool:`);
  console.log(`  ${CYAN}ima2 serve${RESET}`);
  console.log(`  ${CYAN}curl http://127.0.0.1:3333/api/oauth/pool | jq${RESET}  # size should be 2`);
  console.log(`  ${CYAN}curl http://127.0.0.1:3333/api/health | jq .runtime.oauth${RESET}`);
  console.log("");
}

function printInit() {
  console.log(`\n${CYAN}── Dual OAuth Setup ──${RESET}\n`);
  console.log(`Goal: 2 ChatGPT/Codex accounts → image requests alternate A→B→A→B (reduces per-account quota pressure)`);
  console.log(`\n${YELLOW}Method A — Isolated CODEX_HOME (recommended, no codex-switch):${RESET}`);
  console.log(`  1. Keep current login in ${GREEN}~/.codex/auth.json${RESET} (account 1).`);
  console.log(`  2. Create second home and login with a DIFFERENT ChatGPT account:`);
  console.log(`     ${CYAN}CODEX_HOME=~/.codex2 npx @openai/codex login${RESET}`);
  console.log(`     (or) ${CYAN}CODEX_HOME=~/.codex2 codex login${RESET}`);
  console.log(`     Follow browser OAuth; use account 2.`);
  console.log(`  3. Verify both exist:`);
  console.log(`     ${CYAN}ls -l ~/.codex/auth.json ~/.codex2/auth.json${RESET}`);
  console.log(`  4. Start ima2 — auto-discovers ~/.codex-2/auth.json as sibling:`);
  console.log(`     ${CYAN}ima2 serve${RESET}`);
  console.log(`     Explicit: ${CYAN}IMA2_CODEX_HOMES=~/.codex,~/.codex2 ima2 serve${RESET}`);
  console.log(`\n${YELLOW}Method B — Explicit ports:${RESET}`);
  console.log(`  ${CYAN}IMA2_OAUTH_ACCOUNTS=~/.codex/auth.json:10531,~/.codex2/auth.json:10532 ima2 serve${RESET}`);
  console.log(`\n${YELLOW}Method C — via codex-switch (already using it):${RESET}`);
  console.log(`  ${CYAN}codex-switch add${RESET}  (do twice for 2 identities)`);
  console.log(`  ${CYAN}codex-switch identities list${RESET}`);
  console.log(`  Auto-discovered from ~/.telex-codex-switcher/homes/*/auth.json on next ${CYAN}ima2 serve${RESET}`);
  console.log(`\n${YELLOW}Verification:${RESET}`);
  console.log(`  ${CYAN}curl http://127.0.0.1:3333/api/oauth/pool | jq${RESET}  # size:2, strategy:round-robin`);
  console.log(`  ${CYAN}ima2 gen "test 1" --model oauth/gpt-5.6-luna & ima2 gen "test 2" --model oauth/gpt-5.6-luna${RESET}`);
  console.log(`  Watch logs: ${CYAN}[oauth:pool]${RESET} and ${CYAN}pool_pick${RESET} show A→B alternation.`);
  console.log(`  ${CYAN}ima2 serve --dev${RESET} shows per-request accountId.`);
  console.log(`\nDocs: ${CYAN}docs/OAUTH_POOL.md${RESET}`);
  console.log(`Config env: IMA2_OAUTH_POOL_COOLDOWN_MS=60000, IMA2_OAUTH_POOL_MAX_FAILURES=3\n`);
}

const arg = process.argv[2];
if (arg === "--init" || arg === "--help" || arg === "-h") printInit();
else printCheck();
