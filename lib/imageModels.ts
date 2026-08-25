import type { RouteRuntimeContext } from "./runtimeContext.js";
import { deriveSupportedImageModels, deriveUnsupportedImageModels } from "./providers/derive.js";

export const FALLBACK_IMAGE_MODEL = "gpt-5.6-luna";
const VALID_IMAGE_MODELS = deriveSupportedImageModels("oauth");
const UNSUPPORTED_IMAGE_MODELS = deriveUnsupportedImageModels();
const FALLBACK_REASONING_EFFORT = "none";
const VALID_REASONING_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max"]);

export function normalizeReasoningEffort(ctx: RouteRuntimeContext | null | undefined, rawEffort: unknown) {
  const configured = (ctx?.config as { imageModels?: { reasoningEffort?: string; validReasoningEfforts?: Set<string> } } | undefined)?.imageModels;
  const fallback = configured?.reasoningEffort ?? FALLBACK_REASONING_EFFORT;
  const valid = configured?.validReasoningEfforts ?? VALID_REASONING_EFFORTS;

  if (typeof rawEffort !== "string" || rawEffort.length === 0) {
    return { effort: valid.has(fallback) ? fallback : FALLBACK_REASONING_EFFORT };
  }
  if (!valid.has(rawEffort)) {
    return {
      error: "reasoningEffort must be one of: none, low, medium, high, xhigh, max",
      code: "INVALID_REASONING_EFFORT",
      status: 400,
    };
  }
  return { effort: rawEffort };
}

export function normalizeImageModel(ctx: RouteRuntimeContext | null | undefined, rawModel: unknown) {
  const configured = (ctx?.config as { imageModels?: { default?: string; valid?: Set<string>; unsupported?: Set<string> } } | undefined)?.imageModels;
  const fallback = configured?.default ?? FALLBACK_IMAGE_MODEL;
  const valid = configured?.valid ?? VALID_IMAGE_MODELS;
  const unsupported = configured?.unsupported ?? UNSUPPORTED_IMAGE_MODELS;

  if (typeof rawModel !== "string" || rawModel.length === 0) {
    return { model: valid.has(fallback) ? fallback : FALLBACK_IMAGE_MODEL };
  }

  if (unsupported.has(rawModel)) {
    return {
      error: "model is listed by OAuth but does not support image_generation: gpt-5.3-codex-spark",
      code: "IMAGE_MODEL_UNSUPPORTED",
      status: 400,
    };
  }

  if (!valid.has(rawModel)) {
    return {
      error: "model must be one of: gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna",
      code: "INVALID_IMAGE_MODEL",
      status: 400,
    };
  }

  return { model: rawModel };
}
