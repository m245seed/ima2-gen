import { useState } from "react";
import { useBilling } from "../hooks/useBilling";
import { useOAuthStatus } from "../hooks/useOAuthStatus";
import { useI18n } from "../i18n";
import { ApiKeyInput } from "./ApiKeyInput";
import { useKeyStatus } from "../hooks/useKeyStatus";
import { useQuotaData, CodexQuota } from "./settings/QuotaCard";

function OpenAIIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.049 6.049 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.612-1.5z" />
    </svg>
  );
}

function statusLabel(t: (key: string) => string, status?: string): string {
  if (status === "ready") return t("settings.account.status.ready");
  if (status === "auth_required") return t("settings.account.status.authRequired");
  if (status === "starting") return t("settings.account.status.starting");
  if (status === "offline") return t("settings.account.status.offline");
  return t("settings.account.status.checking");
}

function statusTone(status?: string): "ok" | "warn" | "err" {
  if (status === "ready") return "ok";
  if (status === "offline") return "err";
  return "warn";
}

export function AccountSettings() {
  const { t } = useI18n();
  const oauth = useOAuthStatus();
  const { data, error } = useBilling();
  const { data: keyStatus, mutate: mutateKeys } = useKeyStatus();
  const quota = useQuotaData();
  const [keysOpen, setKeysOpen] = useState(false);
  const showApiKeyCard = data?.apiKeySource === "env" || data?.apiKeySource === "config" || data?.apiKeyValid === true;
  const apiSource = data?.apiKeySource === "config"
    ? t("settings.account.apiSourceConfig")
    : t("settings.account.apiSourceEnv");
  const apiReady = data?.apiKeyValid === true;

  return (
    <>
      <article className="provider-card">
        <div className="provider-card__head">
          <span className="provider-card__brand"><OpenAIIcon /></span>
          <h4>{t("settings.account.oauthTitle")}</h4>
          <span className="provider-card__eyebrow">{t("settings.account.primaryEyebrow")}{quota.data?.pool?.size && quota.data.pool.size > 1 ? ` · ${quota.data.pool.size} accounts · round-robin` : ""}</span>
          <span className={`provider-chip provider-chip--${statusTone(oauth?.status)}`}>{statusLabel(t, oauth?.status)}</span>
          {quota.data?.pool?.size && quota.data.pool.size > 1 ? <span className="provider-chip provider-chip--info" title={quota.data.pool.distribution ?? "Round-robin"}>⚡ pool ×{quota.data.pool.size}</span> : null}
        </div>
        <div className="settings-row__copy"><p>{t("settings.account.oauthBody")}</p></div>
        <CodexQuota data={quota.data} loading={quota.loading} onRefresh={quota.refreshQuota} />
      </article>

      {showApiKeyCard ? (
        <article className="provider-card">
          <div className="provider-card__head">
            <span className="provider-card__brand"><OpenAIIcon /></span>
            <h4>{t("settings.account.apiTitle")}</h4>
            <span className="provider-card__eyebrow">{apiSource}</span>
            <span className={`provider-chip provider-chip--${error ? "err" : apiReady ? "ok" : "warn"}`}>
              {error ? t("settings.account.apiUnknown") : apiReady ? t("settings.account.apiReady") : t("settings.account.apiUnavailable")}
            </span>
          </div>
          <div className="settings-row__copy"><p>{t("settings.account.apiBody")}</p></div>
        </article>
      ) : null}

      {keyStatus ? (
        <article className="settings-row settings-accordion">
          <button type="button" className="settings-accordion__trigger" onClick={() => setKeysOpen(!keysOpen)}>
            <h4>{t("settings.apiKeys.accordionTitle")}</h4>
            <span className={`settings-accordion__arrow${keysOpen ? " is-open" : ""}`}>▼</span>
          </button>
          {keysOpen ? (
            <div className="settings-accordion__body">
              <ApiKeyInput
                provider="openai"
                label={t("settings.apiKeys.openai.label")}
                placeholder={t("settings.apiKeys.openai.placeholder")}
                maskedKey={keyStatus.openai?.maskedKey ?? null}
                source={keyStatus.openai?.source ?? "none"}
                configured={keyStatus.openai?.configured ?? false}
                onSaved={mutateKeys}
              />
            </div>
          ) : null}
        </article>
      ) : null}
    </>
  );
}
