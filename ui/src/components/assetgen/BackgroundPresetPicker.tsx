import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import type { AssetGenBackgroundPreset } from "../../types";

const PRESETS: ReadonlyArray<{ value: AssetGenBackgroundPreset; swatch: string | null; labelKey: string }> = [
  { value: "chroma-green", swatch: "#00c853", labelKey: "assetGen.bgChroma" },
  { value: "white", swatch: "#ffffff", labelKey: "assetGen.bgWhite" },
  { value: "black", swatch: "#111111", labelKey: "assetGen.bgBlack" },
  { value: "transparent", swatch: null, labelKey: "assetGen.bgTransparent" },
];

export function BackgroundPresetPicker() {
  const { t } = useI18n();
  const value = useAppStore((s) => s.assetGenBackground);
  const setValue = useAppStore((s) => s.setAssetGenBackground);
  return (
    <div className="assetgen-field">
      <span className="assetgen-field__label" id="assetgen-bg-label">{t("assetGen.background")}</span>
      <div className="assetgen-bg-picker" role="group" aria-labelledby="assetgen-bg-label">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={value === preset.value ? "is-active" : ""}
            aria-pressed={value === preset.value}
            onClick={() => setValue(preset.value)}
          >
            <span
              className={preset.swatch === null
                ? "assetgen-bg-picker__swatch assetgen-bg-picker__swatch--alpha"
                : "assetgen-bg-picker__swatch"}
              {...(preset.swatch === null ? {} : { style: { background: preset.swatch } })}
              aria-hidden="true"
            />
            {t(preset.labelKey)}
          </button>
        ))}
      </div>
      <p className="assetgen-field__hint">
        {value === "transparent" ? t("assetGen.backgroundHintTransparent") : t("assetGen.backgroundHint")}
      </p>
    </div>
  );
}
