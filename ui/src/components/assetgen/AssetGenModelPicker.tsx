import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import type { Provider } from "../../types";

const CHOICES: ReadonlyArray<{ value: Provider; label: string }> = [
  { value: "oauth", label: "GPT" },
  { value: "api", label: "GPT API" },
];

export function AssetGenModelPicker() {
  const { t } = useI18n();
  const provider = useAppStore((s) => s.assetGenProvider);
  const setProvider = useAppStore((s) => s.setAssetGenProvider);
  return (
    <div className="assetgen-field">
      <span className="assetgen-field__label" id="assetgen-model-label">{t("assetGen.model")}</span>
      <div className="assetgen-bg-picker" role="group" aria-labelledby="assetgen-model-label">
        {CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className={provider === choice.value ? "is-active" : ""}
            aria-pressed={provider === choice.value}
            onClick={() => setProvider(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
