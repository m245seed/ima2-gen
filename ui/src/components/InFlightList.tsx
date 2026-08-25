import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import type { PersistedInFlight } from "../store/storeTypes";

type InFlightListProps =
  | { variant?: "compact" }
  | { variant: "popup" | "inline"; panelId: string };
type Translator = (key: string, vars?: Record<string, string | number>) => string;
type CancelAction = (requestId: string) => Promise<void>;
type PhaseLabels = Record<string, string>;

function truncate(value: string, max = 28): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

export function InFlightList(props: InFlightListProps = {}) {
  const inFlight = useAppStore((s) => s.inFlight);
  const cancelInFlightJob = useAppStore((s) => s.cancelInFlightJob);
  const { t } = useI18n();
  const phaseLabels: PhaseLabels = {
    queued: t("inflight.queued"),
    planning: t("inflight.planning"),
    streaming: t("inflight.streaming"),
    decoding: t("inflight.decoding"),
    canceling: t("inflight.canceling"),
  };

  if (inFlight.length === 0) return null;
  if (!("panelId" in props)) {
    return <CompactList jobs={inFlight} phaseLabels={phaseLabels} cancelInFlightJob={cancelInFlightJob} t={t} />;
  }
  return <RichList jobs={inFlight} phaseLabels={phaseLabels} cancelInFlightJob={cancelInFlightJob} t={t} variant={props.variant} panelId={props.panelId} />;
}

type SharedListProps = {
  jobs: PersistedInFlight[];
  phaseLabels: PhaseLabels;
  cancelInFlightJob: CancelAction;
  t: Translator;
};

function CompactList(props: SharedListProps) {
  return (
    <ul className="in-flight-list">
      {props.jobs.map((job) => <CompactRow key={job.id} f={job} {...props} />)}
    </ul>
  );
}

function CompactRow({ f, phaseLabels, cancelInFlightJob, t }: SharedListProps & { f: PersistedInFlight }) {
  const phaseLabel = f.phase ? phaseLabels[f.phase] ?? f.phase : t("inflight.queued");
  const promptLabel = f.prompt.trim().replace(/\s+/g, " ") || t("inflight.noPrompt");
  return (
    <li className="in-flight-item" data-phase={f.phase ?? "queued"} title={promptLabel} aria-label={`${phaseLabel}: ${promptLabel}`}>
      <span className="in-flight-prompt">{truncate(f.prompt)}</span>
      <span className="in-flight-phase">{phaseLabel}</span>
      <button
        type="button"
        className="in-flight-cancel"
        onClick={() => void cancelInFlightJob(f.id)}
        disabled={f.phase === "canceling"}
        aria-label={t("inflight.cancelAria", { prompt: promptLabel })}
        title={t("common.cancel")}
      >
        ×
      </button>
      <span className="in-flight-spinner" aria-hidden="true" data-motion-essential />
    </li>
  );
}

function RichList(props: SharedListProps & { variant: "popup" | "inline"; panelId: string }) {
  return (
    <ul id={props.panelId} className={`in-flight-list in-flight-list--${props.variant}`}>
      {props.jobs.map((job) => <RichRow key={job.id} f={job} {...props} />)}
    </ul>
  );
}

function RichRow({ f, phaseLabels, cancelInFlightJob, t }: SharedListProps & { f: PersistedInFlight }) {
  const phaseLabel = f.phase ? phaseLabels[f.phase] ?? f.phase : t("inflight.queued");
  const promptLabel = f.prompt.trim().replace(/\s+/g, " ") || t("inflight.noPrompt");
  const modelLabel = f.kind === "multimode" ? t("inflight.multimode") : f.kind === "node" ? t("inflight.node") : t("inflight.classic");
  return (
    <li className="in-flight-rich-item" data-phase={f.phase ?? "queued"} title={promptLabel} aria-label={`${modelLabel}, ${phaseLabel}: ${promptLabel}`}>
      <span className="in-flight-placeholder" aria-hidden="true"><PlaceholderIcon /></span>
      <span className="in-flight-rich-copy">
        <span className="in-flight-rich-title">{modelLabel}</span>
        <span className="in-flight-rich-prompt" title={promptLabel}>{truncate(f.prompt, 54)}</span>
        <span className="in-flight-rich-status">
          <span className="in-flight-phase">{phaseLabel}</span>
          <ProgressTrack t={t} />
        </span>
      </span>
      <button type="button" className="in-flight-cancel" onClick={() => void cancelInFlightJob(f.id)} disabled={f.phase === "canceling"} aria-label={t("inflight.cancelAria", { prompt: promptLabel })} title={t("common.cancel")}>
        ×
      </button>
    </li>
  );
}

function ProgressTrack({ t }: { t: Translator }) {
  return (
    <span className="in-flight-progress in-flight-progress--indeterminate" role="progressbar" data-motion-essential aria-label={t("inflight.progressAria", { n: 0 })}>
      <span />
    </span>
  );
}

function PlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m5.5 17 4.2-4 2.7 2.4 2.2-2 3.9 3.6" />
    </svg>
  );
}
