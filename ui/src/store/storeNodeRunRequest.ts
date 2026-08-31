/**
 * Shared node run-request builder: the single-node path and the workflow
 * path both come through here so the wire payload is byte-identical (no
 * second convention). Never toasts; the caller owns run-state mutation and
 * error UX.
 */
import type { ClientNodeId } from "../lib/graph";
import { getAssetById } from "../lib/api-assets";
import { assetMediaUrl } from "../lib/assetPreview";
import { elementReferenceFilenames, upsertElementCatalog } from "../lib/elementCatalog";
import { fetchAsDataUrl } from "../lib/image";
import { effectiveReferenceLimit } from "../lib/referenceLimits";
import { collectElementInputs, type ElementInputNode } from "../lib/nodeElementInputs";
import type { NodeGenerateRequest } from "../lib/nodeApi";
import { stripDataUrlPrefix } from "./storeHelpers";
import type { AppState } from "./storeTypes";

type StoreSet = (p: Partial<AppState>) => void;
type StoreGet = () => AppState;

/**
 * Resolve every upstream element input before a run (higgsfield 120 EN,
 * Socrates B3): missing/deleted elements block; existing elements are
 * re-fetched so the run uses the LATEST refs/notes and records a revision
 * snapshot on the element node. Returns ref dataURLs to merge into the
 * request, or the blocking element's display name.
 */
async function resolveElementInputsForRun(
  inputs: ElementInputNode[],
  set: StoreSet,
  get: StoreGet,
): Promise<{ ok: true; referenceDataUrls: string[]; notes: string[]; elementIds: string[]; revisions: Record<string, unknown> } | { ok: false; name: string }> {
  const dataUrls: string[] = [];
  const notes: string[] = [];
  const elementIds: string[] = [];
  const revisions: Record<string, unknown> = {};
  for (const input of inputs) {
    if (input.missing || !input.elementId) {
      if (input.missing) return { ok: false, name: input.name };
      continue;
    }
    let asset;
    try {
      asset = (await getAssetById(input.elementId)).asset;
    } catch {
      return { ok: false, name: input.name };
    }
    // Keep the catalog fresh and snapshot the resolved revision on the node.
    const catalog = upsertElementCatalog(get().elementCatalog, asset);
    const revision = (asset as unknown as Record<string, unknown>).updatedAt ?? asset.createdAt;
    elementIds.push(asset.id);
    revisions[asset.id] = revision;
    if (typeof asset.notes === "string" && asset.notes.trim()) notes.push(`${asset.name}: ${asset.notes.trim()}`);
    set({
      elementCatalog: catalog,
      graphNodes: get().graphNodes.map((n) => n.id === input.nodeId
        ? { ...n, data: { ...n.data, resolvedRevision: revision, missing: false } as typeof n.data }
        : n),
    });
    for (const file of elementReferenceFilenames(asset)) {
      try {
        const dataUrl = await fetchAsDataUrl(assetMediaUrl(file));
        if (!dataUrls.includes(dataUrl)) dataUrls.push(dataUrl);
      } catch { /* an unreadable ref is dropped, not fatal */ }
    }
  }
  return { ok: true, referenceDataUrls: dataUrls, notes, elementIds, revisions };
}

function mergeRunReferences(nodeRefs: string[], elementRefs: string[], activeLimit: number): string[] {
  const merged: string[] = [];
  for (const ref of [...nodeRefs, ...elementRefs]) {
    if (!merged.includes(ref)) merged.push(ref);
    if (merged.length >= activeLimit) break;
  }
  return merged;
}

export type NodeRunRequestResult =
  | { ok: true; request: NodeGenerateRequest; size: string }
  | { ok: false; reason: "missing-node" }
  | { ok: false; reason: "missing-prompt" }
  | { ok: false; reason: "element-missing"; name: string }
  | { ok: false; reason: "parent-required" };

export async function buildNodeRunRequest(
  clientId: ClientNodeId,
  options: {
    requestId: string;
    sizeOverride?: string;
    /** undefined = take the node's own parentServerNodeId; null = explicitly parentless. */
    parentServerNodeId?: string | null;
    /** undefined = send `clientId`; null = detach from graph recovery (workflow runs). */
    clientNodeId?: string | null;
    /** true = keep today's "incoming edge but no parent image" rejection. */
    requireParentWhenIncoming: boolean;
  },
  set: StoreSet,
  get: StoreGet,
): Promise<NodeRunRequestResult> {
  const s = get();
  const node = s.graphNodes.find((n) => n.id === clientId);
  if (!node) return { ok: false, reason: "missing-node" };
  // Element inputs (upstream traversal): missing/deleted blocks; existing
  // elements are re-fetched and their latest refs merge into the request.
  const elementInputs = collectElementInputs(s.graphNodes, s.graphEdges, [clientId]);
  const elementResolution = await resolveElementInputsForRun(elementInputs, set, get);
  if (elementResolution.ok === false) {
    return { ok: false, reason: "element-missing", name: elementResolution.name };
  }
  const { prompt, parentServerNodeId } = node.data;
  if (!prompt.trim()) return { ok: false, reason: "missing-prompt" };
  // Branch variants carry per-node provider/model/size (settingsPatch).
  // Prefer them over global settings.
  const nodeProvider = (typeof node.data.provider === "string" && node.data.provider ? node.data.provider : s.provider) as AppState["provider"];
  const variantRefLimit = effectiveReferenceLimit({
    provider: nodeProvider,
    serverLimit: s.referenceLimit,
  });
  const nodeRefs = mergeRunReferences(node.data.referenceImages ?? [], elementResolution.referenceDataUrls, variantRefLimit);
  const nodeModel = (typeof node.data.model === "string" && node.data.model ? node.data.model : s.imageModel) as AppState["imageModel"];
  const size = options.sizeOverride ?? (typeof node.data.size === "string" && node.data.size ? node.data.size : s.getResolvedSize());
  const effectiveParentServerNodeId =
    options.parentServerNodeId !== undefined
      ? options.parentServerNodeId
      : parentServerNodeId;
  const incoming = s.graphEdges.find((edge) => edge.target === clientId);
  if (options.requireParentWhenIncoming && incoming && !effectiveParentServerNodeId) {
    return { ok: false, reason: "parent-required" };
  }
  const request: NodeGenerateRequest = {
    parentNodeId: effectiveParentServerNodeId,
    prompt,
    quality: s.quality,
    size,
    format: s.format,
    moderation: s.moderation,
    provider: nodeProvider,
    model: nodeModel,
    reasoningEffort: s.reasoningEffort,
    storyboard: s.storyboardActive || undefined,
    requestId: options.requestId,
    sessionId: s.activeSessionId,
    clientNodeId: options.clientNodeId !== undefined ? options.clientNodeId : clientId,
    contextMode: "parent-plus-refs",
    searchMode: s.webSearchEnabled ? "on" : "off",
    webSearchEnabled: s.webSearchEnabled,
    ...(nodeRefs.length
      ? { references: nodeRefs.map(stripDataUrlPrefix) }
      : {}),
    ...(elementResolution.elementIds.length
      ? { elementIds: elementResolution.elementIds, elementRevisions: elementResolution.revisions, elementNotes: elementResolution.notes }
      : {}),
  };
  return { ok: true, request, size };
}
