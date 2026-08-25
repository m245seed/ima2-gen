import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useProviderAvailability } from "../../hooks/useProviderAvailability";
import { Select, type SelectGroup } from "../controls/Select";
import { ApiDisabledModal } from "../ApiDisabledModal";
import type { Provider } from "../../types";
import { useI18n } from "../../i18n";

type CoreEntry = { value: Provider; provider: string; method: string };

const CORE_ENTRIES: ReadonlyArray<CoreEntry> = [
  { value: "oauth", provider: "GPT", method: "OAuth" },
  { value: "api", provider: "GPT", method: "API" },
];

type DotTone = "ok" | "warn" | "bad";

function Dot({ tone }: { tone: DotTone }) {
  return (
    <span
      className={`status-dot status-dot--${tone === "ok" ? "ok" : tone === "warn" ? "warn" : "bad"}`}
      aria-hidden="true"
    />
  );
}

export function ProviderStatusSelect() {
  const { t } = useI18n();
  const provider = useAppStore((s) => s.provider);
  const setProvider = useAppStore((s) => s.setProvider);
  const availability = useProviderAvailability();
  const [blocked, setBlocked] = useState<{ label: string; reason: string; hint?: string } | null>(null);

  const selectedEntry = CORE_ENTRIES.find((entry) => entry.value === provider) ?? CORE_ENTRIES[0];
  const selectedState = availability[selectedEntry.value];
  const statusTone: DotTone = selectedState.ok ? "ok" : "bad";
  const groups: SelectGroup<string>[] = [{
    items: CORE_ENTRIES.map((entry) => {
      const state = availability[entry.value];
      return {
        value: entry.value,
        searchText: `${entry.provider} ${entry.method}`,
        label: (
          <span className="provider-option">
            <Dot tone={state.ok ? "ok" : "bad"} />
            <span>{entry.provider} {entry.method}</span>
          </span>
        ),
        sub: state.ok ? t("provider.statusReady") : state.reason,
      };
    }),
  }];

  const onChange = (value: string) => {
    const next = value as Provider;
    const entry = CORE_ENTRIES.find((candidate) => candidate.value === next);
    const state = availability[next];
    if (!entry || !state.ok) {
      setBlocked({
        label: entry ? `${entry.provider} ${entry.method}` : next,
        reason: state?.reason ?? t("provider.statusDisconnected"),
        hint: state?.hint,
      });
      return;
    }
    setProvider(next);
  };

  return (
    <div className="option-group provider-status-select" data-testid="provider-status-select">
      <div className="section-title">{t("provider.authTitle")}</div>
      <Select
        groups={groups}
        value={provider}
        onChange={onChange}
        portal
        ariaLabel={t("provider.authTitle")}
        className="provider-status-select__select"
      />
      <div className="provider-status-line" data-tone={statusTone}>
        <Dot tone={statusTone} />
        <span className="provider-status-line__key">{t("provider.statusLineTitle")}:</span>
        <span className="provider-status-line__value">
          {selectedState.ok ? t("provider.statusReady") : selectedState.reason}
        </span>
      </div>
      <div className="provider-auth-chip" title={t("provider.authMethodTitle")}>
        <span>{selectedEntry.method}</span>
        {selectedState.ok ? <span className="provider-auth-chip__state">{t("provider.authActive")}</span> : null}
      </div>
      <ApiDisabledModal
        open={!!blocked}
        providerLabel={blocked?.label ?? ""}
        reason={blocked?.reason ?? ""}
        hint={blocked?.hint}
        onClose={() => setBlocked(null)}
      />
    </div>
  );
}
