import { useCallback, useState } from "react";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import type { GenerateItem } from "../../types";
import { InFlightList } from "../InFlightList";
import { AssetMediaLightbox } from "./AssetMediaLightbox";
import { AssetGenProjectRail } from "./AssetGenProjectRail";
import { BackgroundPresetPicker } from "./BackgroundPresetPicker";
import { AssetGenModelPicker } from "./AssetGenModelPicker";
import { ProjectSelect } from "./ProjectSelect";
import { KeyingPanel } from "./KeyingPanel";

export function AssetGenWorkspace() {
  const { t } = useI18n();
  const prompt = useAppStore((s) => s.assetGenPrompt);
  const setPrompt = useAppStore((s) => s.setAssetGenPrompt);
  const activeGens = useAppStore((s) => s.activeGenerations);
  const items = useAppStore((s) => s.assetGenItems);
  const generate = useAppStore((s) => s.generateAssetGen);
  const saveFailures = useAppStore((s) => s.assetGenSaveFailures);
  const retrySave = useAppStore((s) => s.retryAssetGenSave);
  const setKeyingTarget = useAppStore((s) => s.setKeyingTarget);
  const lastError = useAppStore((s) => s.assetGenLastError);
  const setLastError = useAppStore((s) => s.setAssetGenLastError);
  const setUIMode = useAppStore((s) => s.setUIMode);
  const [previewItem, setPreviewItem] = useState<GenerateItem | null>(null);
  const [railSelectedId, setRailSelectedId] = useState<string | null>(null);
  const [projectAssetCount, setProjectAssetCount] = useState(0);
  const closePreview = useCallback(() => {
    setPreviewItem(null);
    setRailSelectedId(null);
  }, []);
  const openRailPreview = useCallback((item: GenerateItem, assetId: string) => {
    setRailSelectedId(assetId);
    setPreviewItem(item);
  }, []);
  const focusPrompt = useCallback(() => {
    document.getElementById("assetgen-prompt")?.focus();
  }, []);


  const canGenerate = prompt.trim().length > 0;
  return (
    <section className="assetgen-workspace" aria-labelledby="assetgen-title">
      <aside className="assetgen-form">
        <h1 id="assetgen-title">{t("assetGen.title")}</h1>
        <p className="assetgen-form__lede">{t("assetGen.lede")}</p>
        <ProjectSelect />
        <div className="assetgen-field">
          <label className="assetgen-field__label" htmlFor="assetgen-prompt">{t("assetGen.prompt")}</label>
          <textarea
            id="assetgen-prompt"
            value={prompt}
            rows={4}
            placeholder={t("assetGen.promptPlaceholder")}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>
        <BackgroundPresetPicker />
        <AssetGenModelPicker />
        <button
          type="button"
          className="assetgen-generate"
          disabled={!canGenerate}
          onClick={() => void generate()}
        >
          {activeGens > 0 ? t("assetGen.generating") : t("assetGen.generate")}
        </button>
        {!canGenerate ? <p className="assetgen-generate__hint">{t("assetGen.generateHint")}</p> : null}
        <InFlightList />
      </aside>
      <main className="assetgen-results">
        <div className="assetgen-results__main">
          {lastError ? (
            <div className="assetgen-error" role="alert">
              <div className="assetgen-error__text">
                <strong>{t("assetGen.errorTitle")}</strong>
                <span>{lastError}</span>
                <span className="assetgen-error__hint">{t("assetGen.errorHint")}</span>
              </div>
              <button type="button" className="assetgen-error__dismiss" onClick={() => setLastError(null)}>
                {t("assetGen.errorDismiss")}
              </button>
            </div>
          ) : null}
          {items.length === 0 ? (
            <div className="assetgen-empty">
              {projectAssetCount > 0 ? (
                <>
                  <h2>{t("assetGen.emptySessionTitle")}</h2>
                  <p>{t("assetGen.emptySessionBody")}</p>
                  <button type="button" className="assetgen-empty__cta" onClick={() => setUIMode("assets")}>
                    {t("assetGen.emptySessionCta")}
                  </button>
                </>
              ) : (
                <>
                  <h2>{t("assetGen.emptyTitle")}</h2>
                  <p>{t("assetGen.emptyBody")}</p>
                  <button type="button" className="assetgen-empty__cta" onClick={focusPrompt}>
                    {t("assetGen.emptyCta")}
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="assetgen-saved-hint">
                {t("assetGen.savedHint")} {" "}
                <button type="button" className="assetgen-saved-hint__link" onClick={() => setUIMode("assets")}>
                  {t("assetGen.savedLink")}
                </button>
              </p>
              <div className="assetgen-grid">
                {items.map((item) => {
                  const isKeyed = item.kind === "edit";
                  const isAlpha = item.backgroundPreset === "transparent";
                  const fallback = t("assetGen.imageFallback");
                  return (
                    <figure key={`${item.requestId}-${item.filename ?? item.createdAt}`} className={`assetgen-tile${isKeyed ? " is-keyed" : ""}${isAlpha ? " is-alpha" : ""}`}>
                      {isKeyed ? <span className="assetgen-tile__badge">{t("keying.resultBadge")}</span> : null}
                      <button
                        type="button"
                        className="assetgen-tile__media"
                        aria-label={t("assetGen.previewImage", { prompt: item.prompt?.trim() || fallback })}
                        onClick={() => setPreviewItem(item)}
                      >
                        <img src={item.url || item.image} alt="" loading="lazy" />
                        <span className="assetgen-tile__open-hint" aria-hidden="true">{t("assetGen.openHintImage")}</span>
                      </button>
                      <figcaption title={item.prompt}>{item.prompt}</figcaption>
                      {!isKeyed && !isAlpha ? (
                        <button type="button" className="assetgen-tile__key" onClick={() => setKeyingTarget(item)}>
                          {t("keying.open")}
                        </button>
                      ) : null}
                      {!isKeyed && item.requestId && saveFailures.includes(item.requestId) ? (
                        <button type="button" className="assetgen-tile__retry" onClick={() => void retrySave(item.requestId!)}>
                          {t("project.saveRetry")}
                        </button>
                      ) : null}
                    </figure>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <AssetGenProjectRail selectedAssetId={railSelectedId} onPreview={openRailPreview} onAssetsLoaded={setProjectAssetCount} />
      </main>
      <KeyingPanel />
      {previewItem ? <AssetMediaLightbox item={previewItem} onClose={closePreview} /> : null}
    </section>
  );
}
