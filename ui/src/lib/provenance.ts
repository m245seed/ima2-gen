import { getImageModelShortLabel } from "./imageModels";

/** How a result came to exist, as far as the UI can tell from stored metadata. */
export type ProvenanceDerivation = "t2i" | "i2i";

export type ProvenanceView = {
  modelLabel: string | null;
  derivation: ProvenanceDerivation | null;
  /** Source asset filename, when the result was derived from another one. */
  sourceLabel: string | null;
};

export type ProvenanceInput = {
  model?: string | null;
  provider?: string | null;
  mediaType?: string | null;
  canvasSourceFilename?: string | null;
  sourceImageFilename?: string | null;
};

function deriveKind(item: ProvenanceInput): ProvenanceDerivation | null {
  // video handling removed (image-only)
  if (item.canvasSourceFilename || item.sourceImageFilename) return "i2i";
  return item.model ? "t2i" : null;
}

function sourceOf(item: ProvenanceInput): string | null {
  return (
    item.canvasSourceFilename
    ?? item.sourceImageFilename
    ?? null
  );
}

/**
 * Collapse stored generation metadata into the few facts a chip can show.
 *
 * Deliberately narrow: the full continuity chain belongs in the metadata modal, not on
 * a thumbnail. Provider is folded into the model label rather than shown separately —
 * "GPT-5.5 · openai" says the same thing twice.
 */
export function buildProvenanceView(item: ProvenanceInput): ProvenanceView {
  return {
    modelLabel: getImageModelShortLabel(item.model, item.provider),
    derivation: deriveKind(item),
    sourceLabel: sourceOf(item),
  };
}

/** True when there is nothing worth rendering, so callers can skip the chip entirely. */
export function isEmptyProvenance(view: ProvenanceView): boolean {
  return !view.modelLabel && !view.derivation;
}
