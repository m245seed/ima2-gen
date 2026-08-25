import type { GenerateItem, GenerateResponse } from "../types";
import { isMultiResponse } from "../types";
import { postGenerateStream } from "../lib/api";
import { createAsset } from "../lib/api-assets";
import { handleError } from "../lib/errorHandler";
import { t } from "../i18n";
import {
  type PersistedInFlight,
  saveInFlight,
  isCanceledGenerationError,
} from "./storeHelpers";
import { addHistory } from "./storeGraphSave";
import type { StoreGet, StoreSet } from "./storeTypes";
import { clearFlightAbort, registerFlightAbort } from "./flightAbortRegistry";

export async function registerAssetGenResult(item: GenerateItem, set: StoreSet, get: StoreGet): Promise<void> {
  if (!item.filename) return;
  const state = get();
  try {
    await createAsset({
      filePath: item.filename,
      kind: "image",
      name: (item.prompt || "").trim().slice(0, 80) || item.filename,
      folderId: state.selectedProjectId ?? undefined,
      tags: [],
      metadata: {
        source: "asset-gen",
        backgroundPreset: item.backgroundPreset ?? state.assetGenBackground,
        prompt: item.prompt,
        provider: item.provider,
        requestId: item.requestId,
      },
    });
    set((current) => ({ assetGenSaveFailures: current.assetGenSaveFailures.filter((id) => id !== item.requestId) }));
  } catch {
    set((current) => ({
      assetGenSaveFailures: current.assetGenSaveFailures.includes(item.requestId ?? "")
        ? current.assetGenSaveFailures
        : [...current.assetGenSaveFailures, item.requestId ?? ""],
    }));
  }
}

export async function retryAssetGenSaveImpl(requestId: string, set: StoreSet, get: StoreGet): Promise<void> {
  const item = get().assetGenItems.find((entry) => entry.requestId === requestId);
  if (item) await registerAssetGenResult(item, set, get);
}

export async function generateAssetGenImpl(set: StoreSet, get: StoreGet): Promise<void> {
  const state = get();
  const prompt = state.assetGenPrompt.trim();
  if (!prompt) return;

  const flightId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const controller = new AbortController();
  registerFlightAbort(flightId, controller);
  const startedAt = Date.now();
  const nextInFlight: PersistedInFlight[] = [
    ...state.inFlight,
    { id: flightId, prompt, startedAt },
  ];
  saveInFlight(nextInFlight);
  set({
    assetGenLastError: null,
    activeGenerations: state.activeGenerations + 1,
    inFlight: nextInFlight,
  });
  get().startInFlightPolling();

  try {
    const payload = {
      prompt,
      quality: state.quality,
      size: "1024x1024",
      format: "png" as const,
      moderation: state.moderation,
      provider: state.assetGenProvider,
      n: 1,
      model: state.imageModel,
      requestId: flightId,
      mode: state.promptMode,
      backgroundPreset: state.assetGenBackground,
    };
    const response: GenerateResponse = await postGenerateStream(payload, { signal: controller.signal });
    const first = isMultiResponse(response) ? response.images[0] : null;
    const item: GenerateItem = {
      image: first ? first.image : (response as Extract<GenerateResponse, { image: string }>).image,
      filename: first ? first.filename : (response as Extract<GenerateResponse, { filename?: string | null }>).filename,
      reasoningEffort: response.reasoningEffort,
      prompt,
      elapsed: response.elapsed,
      provider: response.provider,
      providerUrl: (first ? first.providerUrl : (response as { providerUrl?: string | null }).providerUrl) ?? null,
      usage: response.usage,
      requestId: response.requestId ?? flightId,
      quality: response.quality,
      size: response.size,
      model: response.model ?? null,
      backgroundPreset: state.assetGenBackground,
      createdAt: (first ? first.createdAt : (response as { createdAt?: number }).createdAt) ?? Date.now(),
    };
    await addHistory(item, set, get, { autoSelectStartedAt: startedAt });
    set((current) => ({ assetGenItems: [item, ...current.assetGenItems] }));
    await registerAssetGenResult(item, set, get);
    get().showToast(t("toast.generatedSingle", { elapsed: response.elapsed }));
  } catch (err) {
    if (!isCanceledGenerationError(err)) {
      handleError(err, get());
      const message = err instanceof Error ? err.message : String(err);
      set({ assetGenLastError: message });
    }
  } finally {
    const remaining = get().inFlight.filter((flight) => flight.id !== flightId);
    saveInFlight(remaining);
    clearFlightAbort(flightId);
    set({
      activeGenerations: Math.max(0, get().activeGenerations - 1),
      inFlight: remaining,
    });
  }
}
