import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";

interface QuotaWindow {
  label: string;
  percent: number;
  resetsAt: string | null;
}

interface QuotaResult {
  provider: string;
  account?: { email: string | null; plan: string | null } | null;
  windows: QuotaWindow[];
  error?: boolean;
  authenticated?: boolean;
  billing?: { usedUsd: number; limitUsd: number };
}

interface CodexAccountQuota {
  id: string;
  label: string;
  port: number;
  url: string;
  readyState: string;
  healthy: boolean;
  successCount: number;
  failureCount: number;
  disabledUntil: number | null;
  quota: QuotaResult;
}

interface PoolMeta {
  size: number;
  strategy: string;
  healthy: number;
  ready: number;
  cursor: number;
  distribution: string;
}

interface QuotaResponse {
  codex?: QuotaResult;
  codexAccounts?: CodexAccountQuota[];
  pool?: PoolMeta;
}

interface SwitchState {
  phase: "idle" | "starting" | "waiting" | "complete" | "error";
  userCode?: string;
  verificationUrl?: string;
  sessionId?: string;
  error?: string;
}

function barColor(pct: number): string {
  if (pct > 80) return "var(--error, #e53935)";
  if (pct > 50) return "var(--warning, #f59e0b)";
  return "var(--info, #3b82f6)";
}

function formatReset(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function QuotaBar({ window: w }: { window: QuotaWindow }) {
  const reset = formatReset(w.resetsAt);
  return (
    <div className="quota-bar">
      <span className="quota-bar__label">{w.label}</span>
      <div className="quota-bar__track">
        <div
          className="quota-bar__fill"
          style={{ width: `${Math.min(w.percent, 100)}%`, background: barColor(w.percent) }}
        />
      </div>
      <span className="quota-bar__pct">{w.percent}%</span>
      {reset && <span className="quota-bar__reset">{reset}</span>}
    </div>
  );
}

function SwitchAccountButton({ provider, onComplete }: { provider: "codex"; onComplete: () => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<SwitchState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);
  const switching = useRef(false);

  const startSwitch = useCallback(async () => {
    if (switching.current) return;
    switching.current = true;
    setState({ phase: "starting" });
    try {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t("settings.quota.switchFailed") })) as { error?: string };
        setState({ phase: "error", error: err.error || `HTTP ${res.status}` });
        return;
      }
      const data = await res.json() as { sessionId: string; userCode: string; verificationUrl: string };
      setState({ phase: "waiting", ...data });
      window.open(data.verificationUrl, "_blank");
    } catch (e) {
      switching.current = false;
      setState({ phase: "error", error: (e as Error).message });
    }
  }, [provider, t]);

  useEffect(() => {
    if (state.phase !== "waiting" || !state.sessionId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/auth/switch/${state.sessionId}`);
        const data = await res.json() as { status: string; error?: string };
        if (cancelled) return;
        if (data.status === "complete") {
          setState({ phase: "complete" });
          setTimeout(onComplete, 1000);
          return;
        }
        if (data.status === "error" || data.status === "expired") {
          setState({ phase: "error", error: data.error || data.status });
          return;
        }
      } catch { /* retry */ }
      if (!cancelled) setTimeout(poll, 3000);
    };
    const timer = setTimeout(poll, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [state.phase, state.sessionId, onComplete]);

  if (state.phase === "idle") {
    return (
      <button
        type="button"
        className="settings-action-btn"
        style={{ width: "100%", marginTop: "6px" }}
        onClick={startSwitch}
      >
        {t("settings.quota.switchAccount", { provider: "Codex" })}
      </button>
    );
  }

  if (state.phase === "starting") {
    return (
      <div className="quota-card__hint" style={{ textAlign: "center", marginTop: "6px" }}>
        {t("settings.quota.startingLogin")}
      </div>
    );
  }

  if (state.phase === "waiting") {
    return (
      <div style={{ marginTop: "6px", padding: "8px", background: "var(--surface, #f5f5f5)", borderRadius: "6px", fontSize: "12px" }}>
        <div style={{ textAlign: "center", marginBottom: "4px" }}>
          {t("settings.quota.enterCode")}
        </div>
        <div style={{ textAlign: "center", fontSize: "18px", fontWeight: 700, fontFamily: "monospace", letterSpacing: "2px", margin: "6px 0" }}>
          {state.userCode}
        </div>
        {state.verificationUrl && (
          <div style={{ display: "flex", gap: "4px", margin: "6px 0" }}>
            <button
              type="button"
              className="settings-action-btn"
              style={{ flex: 1, fontSize: "11px" }}
              onClick={() => { switching.current = false; startSwitch(); }}
            >
              {t("settings.quota.retry")}
            </button>
            <button
              type="button"
              className="settings-action-btn"
              style={{ flex: 1, fontSize: "11px" }}
              onClick={() => {
                navigator.clipboard?.writeText(state.verificationUrl!).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? t("settings.quota.copied") : t("settings.quota.copyLink")}
            </button>
          </div>
        )}
        <div style={{ textAlign: "center", color: "var(--text-dim, #888)", fontSize: "11px" }}>
          {t("settings.quota.waitingApproval")}
        </div>
      </div>
    );
  }

  if (state.phase === "complete") {
    return (
      <div className="quota-card__hint" style={{ textAlign: "center", marginTop: "6px", color: "var(--success, #22c55e)" }}>
        {t("settings.quota.switchComplete")}
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={{ marginTop: "6px" }}>
        <div className="quota-card__hint" style={{ color: "var(--error, #e53935)", marginBottom: "4px" }}>
          {state.error || t("settings.quota.switchFailed")}
        </div>
        <button
          type="button"
          className="settings-action-btn"
          style={{ width: "100%", fontSize: "11px" }}
          onClick={() => { switching.current = false; setState({ phase: "idle" }); }}
        >
          {t("settings.quota.tryAgain")}
        </button>
      </div>
    );
  }

  return null;
}

/** Shared quota fetch — call once in the parent and pass results down. */
export function useQuotaData() {
  const [data, setData] = useState<QuotaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<QuotaResponse | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);

  const refreshQuota = useCallback((opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? (dataRef.current !== null);
    if (!silent) setLoading(true);
    fetch("/api/quota")
      .then((r) => r.json() as Promise<QuotaResponse>)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => refreshQuota({ silent: false }), 1500);
    return () => clearTimeout(timer);
  }, [refreshQuota]);

  // Silent background refresh when pool is active — keeps proof live without flashing
  useEffect(() => {
    if (!data?.pool || data.pool.size < 2) return;
    const iv = setInterval(() => refreshQuota({ silent: true }), 30000);
    return () => clearInterval(iv);
  }, [data?.pool?.size, refreshQuota]);

  const refresh = useCallback(() => refreshQuota({ silent: dataRef.current !== null }), [refreshQuota]);
  return { data, loading, refreshQuota: refresh };
}

type QuotaBlockProps = {
  data: QuotaResponse | null;
  loading: boolean;
  onRefresh: () => void;
};

function PoolBalanceProof({ accounts, pool }: { accounts: CodexAccountQuota[]; pool: PoolMeta }) {
  const totalSuccess = accounts.reduce((s, a) => s + a.successCount, 0);
  const totalFailure = accounts.reduce((s, a) => s + a.failureCount, 0);
  const nextIdx = pool.cursor % pool.size;
  const nextAccount = accounts[nextIdx];
  // Proportional widths: if no successes yet, show equal split to prove round-robin intent
  const widths = totalSuccess > 0
    ? accounts.map((a) => (a.successCount / totalSuccess) * 100)
    : accounts.map(() => 100 / accounts.length);

  return (
    <div className="quota-pool-proof">
      <div className="quota-pool-proof__head">
        <span className="quota-pool-proof__title">⚡ Load balancing · {pool.strategy}</span>
        <span className="quota-pool-proof__healthy">{pool.healthy}/{pool.size} healthy · {pool.ready} ready</span>
      </div>
      <div className="quota-pool-proof__desc">{pool.distribution}</div>
      <div className="quota-pool-proof__alternation" aria-hidden="true">
        {accounts.map((a, i) => (
          <span key={a.id} style={{ display: "contents" }}>
            <span className={`quota-pool-proof__chip ${i === nextIdx ? "quota-pool-proof__chip--next" : ""}`} title={`${a.label} :${a.port} · ${a.healthy ? "healthy" : "cooldown"}`}>
              {String.fromCharCode(65 + i)}
            </span>
            {i < accounts.length - 1 && <span className="quota-pool-proof__arrow">→</span>}
          </span>
        ))}
        <span className="quota-pool-proof__arrow">→</span>
        <span className="quota-pool-proof__chip quota-pool-proof__chip--muted">…</span>
      </div>
      {nextAccount && (
        <div className="quota-pool-proof__next">
          Next → <strong>{nextAccount.label}</strong> ({nextAccount.id}, :{nextAccount.port})
          <span className={`quota-pool-proof__dot ${nextAccount.healthy ? "quota-pool-proof__dot--ok" : "quota-pool-proof__dot--cool"}`} />
          {nextAccount.healthy ? "healthy" : "in cooldown"}
        </div>
      )}
      <div className="quota-pool-proof__bar-track" title={`Total served: ${totalSuccess} · failures: ${totalFailure}`}>
        <div className="quota-pool-proof__bar" style={{ display: "flex", width: "100%", height: "100%" }}>
          {accounts.map((a, i) => (
            <div
              key={a.id}
              className={`quota-pool-proof__bar-seg quota-pool-proof__bar-seg--${i % 2 === 0 ? "a" : "b"}`}
              style={{ width: `${widths[i]}%` }}
              title={`${a.label}: ${a.successCount} served · ${a.failureCount} failed`}
            />
          ))}
        </div>
      </div>
      <div className="quota-pool-proof__legend">
        {accounts.map((a, i) => (
          <span key={a.id} className="quota-pool-proof__legend-item">
            <span className={`quota-pool-proof__legend-dot quota-pool-proof__legend-dot--${i % 2 === 0 ? "a" : "b"}`} />
            {String.fromCharCode(65 + i)} {a.label}: {a.successCount} OK · {a.failureCount} fail
            <span className={`quota-pool-proof__state quota-pool-proof__state--${a.healthy ? "ok" : "cool"}`}> {a.healthy ? "●" : "◐"} {a.readyState}</span>
          </span>
        ))}
      </div>
      {totalSuccess === 0 && (
        <div className="quota-pool-proof__hint">No images generated yet — first request will hit {nextAccount?.label ?? "A"}, second will alternate to the other account.</div>
      )}
    </div>
  );
}

function AccountQuotaBlock({ acc }: { acc: CodexAccountQuota }) {
  const { t } = useI18n();
  const q = acc.quota;
  const hasWindows = q.windows && q.windows.length > 0;
  const accountLine = q.account ? [q.account.email, q.account.plan].filter(Boolean).join(" · ") : null;
  const isHealthy = acc.healthy;
  return (
    <div className={`quota-account ${isHealthy ? "" : "quota-account--cooldown"}`}>
      <div className="quota-account__head">
        <span className="quota-account__label">{acc.label}</span>
        <span className="quota-account__id">{acc.id} · :{acc.port}</span>
        <span className={`quota-account__chip quota-account__chip--${isHealthy ? "ok" : "cool"}`} title={`${acc.readyState}${acc.disabledUntil ? " cooldown" : ""}`}>
          {isHealthy ? "●" : "◐"} {acc.readyState}
        </span>
      </div>
      {accountLine && <div className="quota-account__email">{accountLine}</div>}
      <div className="quota-account__counts">Served {acc.successCount} · Failed {acc.failureCount} {acc.disabledUntil ? "· cooling" : ""}</div>
      <div className="quota-account__bars">
        {hasWindows
          ? q.windows.map((w) => <QuotaBar key={`${acc.id}-${w.label}`} window={w} />)
          : q.authenticated === false
            ? <span className="quota-card__hint">{t("settings.quota.codexNotLoggedIn")}</span>
            : q.error
              ? <span className="quota-card__hint">{t("settings.quota.fetchError")}</span>
              : <span className="quota-card__hint">{t("settings.quota.noData")}</span>}
      </div>
    </div>
  );
}

/** Codex rate-limit block — lives inside the GPT OAuth provider card. Now pool-aware. */
export function CodexQuota({ data, loading, onRefresh }: QuotaBlockProps) {
  const { t } = useI18n();
  const poolAccounts = data?.codexAccounts;
  const pool = data?.pool;
  const isPool = poolAccounts && poolAccounts.length > 1 && pool;

  if (isPool) {
    return (
      <div className="quota-card quota-card--pool">
        <PoolBalanceProof accounts={poolAccounts} pool={pool} />
        {loading ? (
          <span className="quota-card__loading">{t("common.loading")}</span>
        ) : (
          <div className="quota-accounts">
            {poolAccounts.map((acc) => (
              <AccountQuotaBlock key={acc.id} acc={acc} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button type="button" className="settings-action-btn" style={{ flex: 1, fontSize: 11 }} onClick={onRefresh}>↻ Refresh quotas</button>
          <SwitchAccountButton provider="codex" onComplete={onRefresh} />
        </div>
      </div>
    );
  }

  const codex = data?.codex;
  const hasCodexWindows = codex?.windows && codex.windows.length > 0;
  const accountLine = codex?.account
    ? [codex.account.email, codex.account.plan].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="quota-card">
      {accountLine ? (
        <div className="quota-card__header">
          <span className="quota-card__account">{accountLine}</span>
        </div>
      ) : null}
      {loading ? (
        <span className="quota-card__loading">{t("common.loading")}</span>
      ) : hasCodexWindows ? (
        codex!.windows.map((w) => <QuotaBar key={w.label} window={w} />)
      ) : codex?.authenticated === false ? (
        <span className="quota-card__hint">{t("settings.quota.codexNotLoggedIn")}</span>
      ) : codex?.error ? (
        <span className="quota-card__hint">{t("settings.quota.fetchError")}</span>
      ) : (
        <span className="quota-card__hint">{t("settings.quota.noData")}</span>
      )}
      <SwitchAccountButton provider="codex" onComplete={onRefresh} />
    </div>
  );
}
