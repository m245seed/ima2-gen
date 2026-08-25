import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { exportImageToComfy } from "../lib/api";
import { continueFromItem, continueFromItemAsUrl } from "../lib/continueFromItem";
import { ResultMetadataModal } from "./ResultMetadataModal";
import type { GenerateItem } from "../types";

interface ResultActionsProps {
  imageOverride?: GenerateItem | null;
  onAfterDeleteFocus?: () => void;
}

const CANVAS_MODE_PROMPT_ID = "canvas-mode-context";
const CANVAS_MODE_PROMPT_NAME = "Canvas Mode";
const PROVIDER_URL_TTL_MS = 3_600_000;
const CANVAS_MODE_PROMPT_TEXT = [
  "Canvas Mode context:",
  "The user edited or annotated the reference image on a canvas.",
  "If the image is a blank white canvas or paper with user-drawn strokes, treat those strokes as source content and preserve/complete them.",
  "If the image is an existing picture with circles, arrows, sticky notes, handwritten marks, or memo notes over it, treat those marks as edit instructions. Apply the instruction, then remove the marks from the final image unless explicitly asked to keep them.",
  "Infer the intended edit from the canvas marks and memo text. Preserve unrelated image content.",
].join("\n");

export function ResultActions({ imageOverride = null, onAfterDeleteFocus }: ResultActionsProps) {
  const { t } = useI18n();
  const currentImage = useAppStore((s) => s.currentImage);
  const showToast = useAppStore((s) => s.showToast);
  const insertPromptToComposer = useAppStore((s) => s.insertPromptToComposer);
  const createRootNodeFromHistoryItem = useAppStore((s) => s.createRootNodeFromHistoryItem);
  const trashHistoryItem = useAppStore((s) => s.trashHistoryItem);
  const saveToAssetsAction = useAppStore((s) => s.saveToAssets);
  const permanentlyDeleteHistoryItemByClick = useAppStore((s) => s.permanentlyDeleteHistoryItemByClick);
  const canvasOpen = useAppStore((s) => s.canvasOpen);
  const openCanvas = useAppStore((s) => s.openCanvas);
  const [comfyExporting, setComfyExporting] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);

  const actionImage = imageOverride ?? currentImage;
  if (!actionImage) return null;
  const providerUrlAlive = Boolean(
    actionImage.providerUrl
    && actionImage.createdAt
    && Date.now() - actionImage.createdAt < PROVIDER_URL_TTL_MS,
  );

  const download = () => {
    const anchor = document.createElement("a");
    anchor.href = actionImage.image;
    anchor.download = actionImage.filename || "generated.png";
    anchor.click();
  };

  const copyDataUrlToClipboard = async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    let pngBlob: Blob;
    if (blob.type === "image/png") {
      pngBlob = blob;
    } else {
      const image = new Image();
      image.crossOrigin = "anonymous";
      const objectUrl = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = objectUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      URL.revokeObjectURL(objectUrl);
      pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to encode image")), "image/png");
      });
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  };

  const copyImage = async () => {
    try {
      await copyDataUrlToClipboard(actionImage.image);
      showToast(t("toast.imageCopied"));
    } catch {
      showToast(t("toast.copyFailed"), true);
    }
  };

  const copyPrompt = async () => {
    if (!actionImage.prompt) return;
    try {
      await navigator.clipboard.writeText(actionImage.prompt);
      showToast(t("toast.promptCopied"));
    } catch {
      showToast(t("clipboard.writeFailed"), true);
    }
  };

  const copyMetadataValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(t("toast.metadataCopied"));
    } catch {
      showToast(t("clipboard.writeFailed"), true);
    }
  };

  const newFromHere = async () => {
    let hasPrompt = false;
    try {
      const result = await continueFromItem(actionImage);
      hasPrompt = result.hasPrompt;
    } catch {
      // non-fatal — fall back to prompt-only fork
    }
    if (canvasOpen && imageOverride) {
      insertPromptToComposer({
        id: CANVAS_MODE_PROMPT_ID,
        name: CANVAS_MODE_PROMPT_NAME,
        text: CANVAS_MODE_PROMPT_TEXT,
      });
    }
    const promptElement = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="prompt"], textarea#prompt, .sidebar textarea',
    );
    if (promptElement) {
      promptElement.focus();
      promptElement.setSelectionRange(promptElement.value.length, promptElement.value.length);
    }
    showToast(t(hasPrompt ? "toast.forkStarted" : "toast.forkStartedNoPrompt"));
  };

  const newFromHereAsUrl = async () => {
    if (!providerUrlAlive) {
      showToast(t("toast.continueAsUrlExpired"), true);
      return;
    }
    try {
      await continueFromItemAsUrl(actionImage);
    } catch {
      // non-fatal
    }
    const promptElement = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="prompt"], textarea#prompt, .sidebar textarea',
    );
    if (promptElement) {
      promptElement.focus();
      promptElement.setSelectionRange(promptElement.value.length, promptElement.value.length);
    }
    showToast(t("toast.continueAsUrlStarted"));
  };

  const sendToComfyUI = async () => {
    if (!actionImage.filename || comfyExporting) return;
    setComfyExporting(true);
    try {
      const result = await exportImageToComfy({ filename: actionImage.filename });
      showToast(t("toast.comfyExported", { filename: result.uploadedFilename }));
    } catch (error) {
      const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
      const key = code === "COMFY_URL_NOT_LOCAL"
        ? "toast.comfyExportInvalidUrl"
        : code === "COMFY_IMAGE_INVALID"
          ? "toast.comfyExportInvalidImage"
          : code === "COMFY_IMAGE_NOT_FOUND"
            ? "toast.comfyExportImageNotFound"
            : "toast.comfyExportFailed";
      showToast(t(key), true);
    } finally {
      setComfyExporting(false);
    }
  };

  const generateAsFirstNode = () => {
    createRootNodeFromHistoryItem(actionImage);
    showToast(t("toast.nodeRootCreated"));
  };

  const deleteToTrash = async () => {
    try {
      await trashHistoryItem(actionImage);
    } finally {
      onAfterDeleteFocus?.();
    }
  };

  const deletePermanently = async () => {
    try {
      await permanentlyDeleteHistoryItemByClick(actionImage);
    } finally {
      onAfterDeleteFocus?.();
    }
  };

  return (
    <div className="result-actions">
      <button type="button" className="action-btn" onClick={download}>{t("result.download")}</button>
      <button type="button" className="action-btn" onClick={() => void copyImage()}>{t("result.copyImage")}</button>
      <button type="button" className="action-btn" onClick={() => void copyPrompt()}>{t("result.copyPrompt")}</button>
      <button
        type="button"
        className="action-btn"
        onClick={() => {
          void (async () => {
            const ok = await saveToAssetsAction(actionImage);
            showToast(t(ok ? "chain.savedToAssets" : "chain.saveToAssetsFailed"), !ok);
          })();
        }}
        title={t("chain.saveToAssets")}
      >
        {t("chain.saveToAssets")}
      </button>
      <button type="button" className="action-btn action-btn--primary" onClick={newFromHere} title={t("result.continueHereTitle")}>
        {t("result.continueHere")}
      </button>
      {providerUrlAlive && (
        <button type="button" className="action-btn" onClick={() => void newFromHereAsUrl()} title={t("result.continueAsUrlTitle")}>
          {t("result.continueAsUrl")}
        </button>
      )}
      <button type="button" className="action-btn" onClick={generateAsFirstNode} title={t("result.firstNodeTitle")}>
        {t("result.firstNode")}
      </button>
      <button type="button" className="action-btn" onClick={() => setMetadataOpen(true)} title={t("result.infoTitle")}>
        {t("result.info")}
      </button>
      {!canvasOpen && (
        <button type="button" className="action-btn" onClick={openCanvas} title={t("canvas.open")} aria-label={t("canvas.openAria")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 4h8v8M12 4l-8 8" />
          </svg>
        </button>
      )}
      {actionImage.filename && (
        <>
          <button type="button" className="action-btn action-btn--danger" onClick={() => void deleteToTrash()} title={t("result.deleteTitle")}>
            {t("result.delete")}
          </button>
          <details className="result-actions__more">
            <summary className="action-btn">{t("result.more")}</summary>
            <div className="result-actions__menu">
              <button type="button" className="result-actions__menu-item" onClick={() => void sendToComfyUI()} title={t("result.sendToComfyUITitle")} disabled={comfyExporting}>
                {t("result.sendToComfyUI")}
              </button>
              <button type="button" className="result-actions__menu-item result-actions__danger-item" onClick={() => void deletePermanently()}>
                {t("result.permanentDelete")}
              </button>
            </div>
          </details>
        </>
      )}
      {metadataOpen && (
        <ResultMetadataModal item={actionImage} onClose={() => setMetadataOpen(false)} onCopy={(value) => void copyMetadataValue(value)} />
      )}
    </div>
  );
}
