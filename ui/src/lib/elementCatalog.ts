import {
  hasTrayCapacity,
  materializeLegacyFields,
  retireTrayTags,
  reviveTrayTag,
  uniquifyElementTag,
  type ElementTrayItem,
  type TrayItem,
} from "./referenceTray";
import type { AppState, AssetItem, StoreGet, StoreSet } from "../store/storeTypes";

export type ElementCatalog = AssetItem[] | null;
export type ElementCatalogState = {
  elementCatalog?: ElementCatalog;
  missingElementIds?: string[];
};
export type TrayMutationPatch = Partial<AppState & ElementCatalogState> & {
  trayItems?: TrayItem[];
  nextAttachmentOrdinal?: number;
  retiredTags?: Record<string, number>;
};
export type TrayMutationOutcome<Result> = { result: Result; patch?: TrayMutationPatch };
export type TrayMutation<Result> = (
  state: AppState,
  activeLimit: number,
) => TrayMutationOutcome<Result>;

export function mutateTrayImpl<Result>(set: StoreSet, mutation: TrayMutation<Result>): Result {
  let result!: Result;
  set((state) => {
    const outcome = mutation(state, state.activeReferenceLimit());
    result = outcome.result;
    if (!outcome.patch) return {};
    const trayItems = outcome.patch.trayItems ?? state.trayItems;
    const currentCatalog = (state as AppState & ElementCatalogState).elementCatalog;
    const elementCatalog = outcome.patch.elementCatalog ?? currentCatalog ?? null;
    return {
      ...outcome.patch,
      trayItems,
      elementCatalog,
      missingElementIds: selectMissingElementIds(trayItems, elementCatalog),
      ...materializeLegacyFields(trayItems),
    } as Partial<AppState>;
  });
  return result;
}

export function normalizeElementCatalog(records: readonly AssetItem[]): AssetItem[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (record.kind !== "element" || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

export function upsertElementCatalog(
  catalog: ElementCatalog | undefined,
  record: AssetItem,
): AssetItem[] {
  const current = catalog ?? [];
  const index = current.findIndex((candidate) => candidate.id === record.id);
  if (index < 0) return [...current, record];
  return current.map((candidate, candidateIndex) => candidateIndex === index ? record : candidate);
}

export function resolveElementAsset(
  state: AppState & ElementCatalogState,
  elementId: string,
  snapshot?: AssetItem,
): AssetItem | undefined {
  return snapshot
    ?? state.elementCatalog?.find((candidate) => candidate.id === elementId)
    ?? state.assets.find((candidate) => candidate.id === elementId && candidate.kind === "element");
}

export function elementReferenceFilenames(asset: AssetItem): string[] {
  const refs = asset.metadata?.refs;
  return Array.isArray(refs)
    ? refs.filter((ref): ref is string => typeof ref === "string" && ref.length > 0)
    : [];
}

export function addTrayElementImpl(
  elementId: string,
  set: StoreSet,
  _get: StoreGet,
  snapshot?: AssetItem,
): TrayItem | null {
  if (snapshot && (snapshot.id !== elementId || snapshot.kind !== "element")) return null;
  return mutateTrayImpl(set, (state, activeLimit) => {
    if (!hasTrayCapacity(state.trayItems, activeLimit)) return { result: null };
    if (state.trayItems.some((item) => item.kind === "element" && item.source.elementId === elementId)) {
      return { result: null };
    }
    const catalogState = state as AppState & ElementCatalogState;
    const asset = resolveElementAsset(catalogState, elementId, snapshot);
    const requestedTag = asset?.name
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || null;
    if (!asset || !requestedTag) return { result: null };
    const tag = uniquifyElementTag(requestedTag, state.trayItems.map((item) => item.tag));
    const item: ElementTrayItem = {
      kind: "element",
      tokenId: crypto.randomUUID(),
      tag,
      insertedAt: Date.now(),
      source: {
        elementId,
        nameAtInsertion: asset.name,
        referenceFilenames: elementReferenceFilenames(asset),
      },
    };
    return {
      result: item,
      patch: {
        trayItems: [...state.trayItems, item],
        retiredTags: reviveTrayTag(state.retiredTags, tag),
        elementCatalog: upsertElementCatalog(catalogState.elementCatalog, asset),
      },
    };
  });
}

export function selectMissingElementIds(
  items: readonly TrayItem[],
  catalog: ElementCatalog | undefined,
): string[] {
  if (catalog == null) return [];
  const available = new Set(catalog.map((record) => record.id));
  const seen = new Set<string>();
  return items.reduce<string[]>((missing, item) => {
    if (item.kind !== "element") return missing;
    const id = item.source.elementId;
    if (!available.has(id) && !seen.has(id)) missing.push(id);
    seen.add(id);
    return missing;
  }, []);
}

export function findElementTrayItem(
  items: readonly TrayItem[],
  elementId: string,
): ElementTrayItem | undefined {
  return items.find(
    (item): item is ElementTrayItem => item.kind === "element" && item.source.elementId === elementId,
  );
}

/**
 * Element-only tray removal. Mirrors removeTrayItemImpl's element path
 * (filter + retire tag) without the attachment-specific side effects. Lives
 * here (not storeReferenceImpl) so contract tests and the composer can import
 * it without the Vite-only import.meta.env chain.
 */
export function removeTrayElementImpl(elementId: string, set: StoreSet, _get: StoreGet): void {
  mutateTrayImpl(set, (state) => {
    const removed = findElementTrayItem(state.trayItems, elementId);
    if (!removed) return { result: undefined };
    return {
      result: undefined,
      patch: {
        trayItems: state.trayItems.filter((item) => item.tokenId !== removed.tokenId),
        retiredTags: retireTrayTags(state.retiredTags, [removed]),
      },
    };
  });
}

export function syncElementCatalogImpl(records: AssetItem[], set: StoreSet, _get: StoreGet): void {
  const elementCatalog = normalizeElementCatalog(records);
  set((state) => ({
    elementCatalog,
    missingElementIds: selectMissingElementIds(state.trayItems, elementCatalog),
  }) as Partial<AppState>);
}
