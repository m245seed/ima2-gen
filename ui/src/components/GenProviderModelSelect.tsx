import type { Provider } from "../types";
import { getImageModelOptionsForProvider } from "../lib/imageModels";
import { REASONING_EFFORT_OPTIONS, type ReasoningEffort } from "../lib/reasoning";
import { Select, type SelectGroup } from "./controls/Select";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";

const CORE_PROVIDER_OPTIONS: ReadonlyArray<{ value: Provider; label: string }> = [
  { value: "oauth", label: "GPT" },
  { value: "api", label: "GPT API" },
];

const EFFORT_PREFIX = "effort:";

export function GenProviderModelSelect({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useI18n();
  const provider = useAppStore((state) => state.provider);
  const imageModel = useAppStore((state) => state.imageModel);
  const setProvider = useAppStore((state) => state.setProvider);
  const setImageModel = useAppStore((state) => state.setImageModel);
  const setReasoningEffort = useAppStore((state) => state.setReasoningEffort);
  const reasoningEffort = useAppStore((state) => state.reasoningEffort);

  const coreModels = getImageModelOptionsForProvider(provider);
  const providerGroups: SelectGroup<string>[] = [{
    items: CORE_PROVIDER_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  }];
  const modelGroups: SelectGroup<string>[] = [
    {
      label: t("sidebar.imageSectionLabel"),
      items: coreModels.map((option) => ({
        value: option.value,
        label: option.shortLabel,
      })),
    },
    {
      label: t("sidebar.reasoningLabel"),
      items: REASONING_EFFORT_OPTIONS.map((option) => ({
        value: `${EFFORT_PREFIX}${option.value}`,
        label: option.shortLabel,
        sub: option.value === reasoningEffort ? "●" : undefined,
      })),
    },
  ];
  const currentEffort = REASONING_EFFORT_OPTIONS.find((option) => option.value === reasoningEffort);

  return (
    <div className={`image-model-select image-model-select--sidebar gen-provider-model${compact ? " is-compact" : ""}`}>
      <Select
        id="sidebar-generation-provider"
        className="gen-provider-model__select gen-provider-model__select--provider"
        groups={providerGroups}
        value={provider}
        onChange={(value) => setProvider(value as Provider)}
        ariaLabel={t("provider.authTitle")}
        portal
      />
      <Select
        id="sidebar-generation-model"
        className="gen-provider-model__select gen-provider-model__select--model"
        groups={modelGroups}
        value={imageModel}
        onChange={(value) => {
          if (value.startsWith(EFFORT_PREFIX)) {
            setReasoningEffort(value.slice(EFFORT_PREFIX.length) as ReasoningEffort);
            return;
          }
          setImageModel(value as Parameters<typeof setImageModel>[0]);
        }}
        ariaLabel={t("sidebar.imageSectionLabel")}
        triggerSub={currentEffort?.shortLabel}
        portal
      />
    </div>
  );
}
