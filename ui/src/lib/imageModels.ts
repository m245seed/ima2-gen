import type { ImageModel, OpenAIImageModel, Provider, UnsupportedImageModel } from "../types";

export const DEFAULT_IMAGE_MODEL: ImageModel = "gpt-5.6-luna";
export const IMAGE_MODEL_STORAGE_KEY = "ima2.imageModel";

export const IMAGE_MODEL_OPTIONS: Array<{
  value: OpenAIImageModel;
  shortLabel: string;
  fullLabelKey: string;
}> = [
  { value: "gpt-5.6-luna", shortLabel: "5.6l", fullLabelKey: "settings.imageModel.gpt56Luna" },
  { value: "gpt-5.6-terra", shortLabel: "5.6t", fullLabelKey: "settings.imageModel.gpt56Terra" },
  { value: "gpt-5.6-sol", shortLabel: "5.6s", fullLabelKey: "settings.imageModel.gpt56Sol" },
  { value: "gpt-5.5", shortLabel: "5.5", fullLabelKey: "settings.imageModel.gpt55" },
  { value: "gpt-5.4", shortLabel: "5.4", fullLabelKey: "settings.imageModel.gpt54" },
  { value: "gpt-5.4-mini", shortLabel: "5.4m", fullLabelKey: "settings.imageModel.gpt54Mini" },
];

export const OPENAI_IMAGE_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS;

export const UNSUPPORTED_IMAGE_MODELS: Array<{
  value: UnsupportedImageModel;
  fullLabelKey: string;
}> = [
  { value: "gpt-5.3-codex-spark", fullLabelKey: "settings.imageModel.gpt53CodexSpark" },
];

export function isImageModel(value: unknown): value is ImageModel {
  return IMAGE_MODEL_OPTIONS.some((option) => option.value === value);
}

export function getImageModelOptionsForProvider(_provider: Provider) {
  return OPENAI_IMAGE_MODEL_OPTIONS;
}

export function getImageModelShortLabel(value: string | null | undefined, _provider?: string | null): string | null {
  if (!value) return null;
  return IMAGE_MODEL_OPTIONS.find((option) => option.value === value)?.shortLabel ?? value;
}
