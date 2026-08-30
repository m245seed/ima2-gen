import { useCallback, useEffect, useId, useState } from "react";
import { useI18n } from "../../i18n";
import type { GenerateItem } from "../../types";
import { useAgentDialogFocus } from "../agent/useAgentDialogFocus";

type Props = {
  item: GenerateItem;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}


export function AssetMediaLightbox({ item, onClose }: Props) {
  const { t } = useI18n();
  const [zoomed, setZoomed] = useState(false);
  const titleId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  const panelRef = useAgentDialogFocus(true, close);
  const fallback = t("assetGen.imageFallback");
  const prompt = item.prompt?.trim() || fallback;


  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  return (
    <div className="assetgen-lightbox" role="presentation">
      <button
        type="button"
        className="assetgen-lightbox__backdrop"
        aria-label={t("assetGen.closePreview")}
        onClick={close}
      />
      <section
        ref={panelRef}
        className="assetgen-lightbox__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="assetgen-lightbox__header">
          <h2 id={titleId}>{t("assetGen.previewDialogTitle", { prompt })}</h2>
          <button
            type="button"
            className="assetgen-lightbox__control"
            aria-label={t("assetGen.closePreview")}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </header>
        <div
          className={[
            "assetgen-lightbox__stage",
            item.kind === "edit" ? "is-keyed" : "",
            zoomed ? "is-zoomed" : "",
          ].filter(Boolean).join(" ")}
          tabIndex={zoomed ? 0 : undefined}
        >
          <img src={item.url || item.image} alt={prompt} />
        </div>
        <footer className="assetgen-lightbox__footer">
            <button type="button" className="assetgen-lightbox__zoom" onClick={() => setZoomed((value) => !value)}>
              {zoomed ? t("assetGen.zoomOut") : t("assetGen.zoomIn")}
            </button>
            <button type="button" className="assetgen-lightbox__close" onClick={onClose}>
              {t("common.close")}
            </button>
          </footer>
      </section>
    </div>
  );
}
