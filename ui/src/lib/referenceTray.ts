export type AttachmentOrigin =
  | "file"
  | "paste"
  | "drop"
  | "gallery"
  | "canvas"
  | "metadata";

export type AttachmentMimeType = "image/png" | "image/jpeg" | "image/webp";

export type AttachmentInput = {
  dataUrl: string;
  mimeType: AttachmentMimeType;
  originalName?: string;
  byteSize?: number;
  origin: AttachmentOrigin;
};

type TrayItemBase = {
  tokenId: string;
  tag: string;
  insertedAt: number;
};

export type AttachmentTrayItem = TrayItemBase & {
  kind: "attachment";
  source: AttachmentInput;
};

export type ElementTrayItem = TrayItemBase & {
  kind: "element";
  source: {
    elementId: string;
    nameAtInsertion: string;
    referenceFilenames: string[];
    thumbnailUrl?: string;
  };
};

export type TrayItem = AttachmentTrayItem | ElementTrayItem;

export type ReferenceTraySlice = {
  trayItems: TrayItem[];
  nextAttachmentOrdinal: number;
  retiredTags: Record<string, number>;
  referenceImages: string[];
  selectedElementIds: string[];
  activeReferenceLimit: () => number;
  physicalSourceCount: () => number;
  addTrayAttachments: (inputs: AttachmentInput[]) => Promise<TrayItem[]>;
  addTrayAttachmentDataUrl: (
    dataUrl: string,
    origin: AttachmentOrigin,
  ) => TrayItem | null;
  addTrayElement: (elementId: string) => TrayItem | null;
  removeTrayItem: (tokenId: string) => void;
  clearTray: () => void;
};

type TrayState = { trayItems: TrayItem[] };

const MAX_TAG_LENGTH = 32;
const ATTACHMENT_TAG_PREFIX = "Image_";
const TRAY_TAG_PATTERN = /@([\p{L}\p{N}_-]+)/gu;
// Keep this set aligned with elementMention.ts. That module intentionally
// accepts only whitespace/newline and the two composer opening delimiters.
const MENTION_BOUNDARIES = new Set([" ", "\t", "\n", "(", "["]);

export function allocateAttachmentTag(
  nextOrdinal: number,
  usedTags: Iterable<string>,
): { tag: string; nextAttachmentOrdinal: number } {
  const used = new Set(usedTags);
  let ordinal = Math.max(1, Math.trunc(nextOrdinal) || 1);
  while (used.has(`${ATTACHMENT_TAG_PREFIX}${ordinal}`)) ordinal += 1;
  return {
    tag: `${ATTACHMENT_TAG_PREFIX}${ordinal}`,
    nextAttachmentOrdinal: ordinal + 1,
  };
}

export function uniquifyElementTag(
  requestedTag: string,
  usedTags: Iterable<string>,
): string {
  const used = new Set(usedTags);
  const base = requestedTag.slice(0, MAX_TAG_LENGTH) || "Element";
  if (!used.has(base)) return base;

  let suffixOrdinal = 2;
  while (true) {
    const suffix = `_${suffixOrdinal}`;
    const candidate = `${base.slice(0, MAX_TAG_LENGTH - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
    suffixOrdinal += 1;
  }
}

export function selectAttachmentItems(state: TrayState): AttachmentTrayItem[] {
  return state.trayItems.filter(
    (item): item is AttachmentTrayItem => item.kind === "attachment",
  );
}

export function selectElementItems(state: TrayState): ElementTrayItem[] {
  return state.trayItems.filter(
    (item): item is ElementTrayItem => item.kind === "element",
  );
}

export function selectReferenceImages(state: TrayState): string[] {
  return selectAttachmentItems(state).map((item) => item.source.dataUrl);
}

export function selectSelectedElementIds(state: TrayState): string[] {
  return selectElementItems(state).map((item) => item.source.elementId);
}

export function materializeLegacyFields(items: TrayItem[]): {
  referenceImages: string[];
  selectedElementIds: string[];
} {
  const state = { trayItems: items };
  return {
    referenceImages: selectReferenceImages(state),
    selectedElementIds: selectSelectedElementIds(state),
  };
}

export function indexTrayTags(items: TrayItem[]): Map<string, TrayItem> {
  return new Map(items.map((item) => [item.tag, item]));
}

export function hasTrayCapacity(items: TrayItem[], activeLimit: number): boolean {
  return items.length < activeLimit;
}

export function retireTrayTags(
  retiredTags: Record<string, number>,
  items: TrayItem[],
  retiredAt = Date.now(),
): Record<string, number> {
  const next = { ...retiredTags };
  for (const item of items) {
    Object.defineProperty(next, item.tag, {
      value: retiredAt,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return next;
}

export function isRetiredTrayTag(retiredTags: Record<string, number>, tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(retiredTags, tag);
}

export function reviveTrayTag(
  retiredTags: Record<string, number>,
  tag: string,
): Record<string, number> {
  if (!isRetiredTrayTag(retiredTags, tag)) return retiredTags;
  const next = { ...retiredTags };
  delete next[tag];
  return next;
}

export function findTrayTagTokens(prompt: string): Array<{
  tag: string;
  start: number;
  end: number;
}> {
  const tokens: Array<{ tag: string; start: number; end: number }> = [];
  for (const match of prompt.matchAll(TRAY_TAG_PATTERN)) {
    const start = match.index;
    const previous = start > 0 ? prompt[start - 1] : undefined;
    if (previous !== undefined && !MENTION_BOUNDARIES.has(previous)) continue;
    tokens.push({ tag: match[1], start, end: start + match[0].length });
  }
  return tokens;
}

export function physicalSourceCount(items: TrayItem[]): number {
  return items.reduce(
    (count, item) => count + (item.kind === "attachment" ? 1 : item.source.referenceFilenames.length),
    0,
  );
}
