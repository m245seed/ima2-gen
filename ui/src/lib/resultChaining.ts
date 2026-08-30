/**
 * Phase 040 — Shared chaining actions for gallery tiles, history strip,
 * result viewer, and any future surface. Each action takes a GenerateItem
 * and performs a context-move using existing store/lib paths (no new server API).
 */
import type { GenerateItem } from "../types";

/* ── Action definitions ── */

export type ChainingActionId = "edit" | "useAsRef" | "rebake" | "saveToAssets" | "saveAsElement";

export interface ChainingAction {
  id: ChainingActionId;
  labelKey: string;
  /** Return false to hide the action for this item. */
  available: (item: GenerateItem) => boolean;
}

export const CHAINING_ACTIONS: ChainingAction[] = [
  {
    id: "edit",
    labelKey: "chain.edit",
    available: (item) => Boolean(item.filename),
  },
  {
    id: "useAsRef",
    labelKey: "chain.useAsRef",
    available: (item) => Boolean(item.image || item.url),
  },
  {
    id: "rebake",
    labelKey: "chain.rebake",
    available: (item) => Boolean(item.prompt || item.filename),
  },
  {
    id: "saveToAssets",
    labelKey: "chain.saveToAssets",
    available: (item) => Boolean(item.filename),
  },
  {
    id: "saveAsElement",
    labelKey: "chain.saveAsElement",
    available: (item) => Boolean(item.filename),
  },
];

/* ── Execution (calls into the Zustand store) ── */

export type ChainingTranslate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Execute a chaining action. Reads the store at call time via getState()
 * to avoid subscribing tiles to the entire store.
 */
export async function executeChaining(
  actionId: ChainingActionId,
  item: GenerateItem,
  getStore: () => {
    openCanvas: () => void;
    selectHistory: (item: GenerateItem) => void;
    addReferences: (files: File[]) => Promise<void>;
    showToast: (message: string, isError?: boolean) => void;
    saveToAssets: (item: GenerateItem) => Promise<boolean>;
    saveAsElement?: (item: GenerateItem) => Promise<boolean>;
  },
  t: ChainingTranslate,
): Promise<void> {
  const store = getStore();
  switch (actionId) {
    case "edit": {
      store.selectHistory(item);
      store.openCanvas();
      break;
    }
    case "useAsRef": {
      const src = item.url || item.image;
      if (!src) return;
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const file = new File([blob], item.filename || "reference.png", { type: blob.type });
        await store.addReferences([file]);
        store.showToast(t("chain.refAdded"));
      } catch {
        store.showToast(t("chain.refFailed"), true);
      }
      break;
    }
    case "rebake": {
      store.selectHistory(item);
      break;
    }
    case "saveToAssets": {
      try {
        const ok = await store.saveToAssets(item);
        store.showToast(ok ? t("chain.saved") : t("chain.saveFailed"), !ok);
      } catch {
        store.showToast(t("chain.saveFailed"), true);
      }
      break;
    }
    case "saveAsElement": {
      if (!store.saveAsElement) return;
      try {
        const ok = await store.saveAsElement(item);
        store.showToast(ok ? t("chain.saved") : t("chain.saveFailed"), !ok);
      } catch {
        store.showToast(t("chain.saveFailed"), true);
      }
      break;
    }
  }
}
