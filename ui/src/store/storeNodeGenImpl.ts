import type { ClientNodeId } from "../lib/graph";
import { postNodeGenerateStream } from "../lib/api";
import { deriveParentServerNodeIds } from "../lib/nodeGraph";
import {
  getSelectedNodeIds,
} from "../lib/nodeSelection";
import {
  getDirectUnselectedChildren,
  getUnselectedDownstreamIds,
  collectDownstream,
  findCycleNodeIds,
  nodeHasImage,
  topologicalSortSelected,
  validateBatchDependencies,
  type NodeBatchMode,
} from "../lib/nodeBatch";
import { handleError } from "../lib/errorHandler";
import { buildNodeErrorInfo } from "../lib/nodeErrorInfo";
import { t } from "../i18n";
import {
  type PersistedInFlight,
  isCanceledGenerationError,
} from "./storeHelpers";
import type { AppState } from "./storeTypes";
import { clearFlightAbort, registerFlightAbort } from "./flightAbortRegistry";
import { collectElementInputs } from "../lib/nodeElementInputs";
import { buildNodeRunRequest } from "./storeNodeRunRequest";

type StoreSet = (p: Partial<AppState>) => void;
type StoreGet = () => AppState;

const nodeGenerationLocks = new Set<string>();

export async function runGenerateNodeInPlaceImpl(
  clientId: ClientNodeId,
  options: {
    sizeOverride?: string;
    parentServerNodeIdOverride?: string | null;
    suppressToast?: boolean;
  },
  set: StoreSet,
  get: StoreGet,
  saveInflightFn: (list: PersistedInFlight[]) => void,
): Promise<string | null> {
  if (nodeGenerationLocks.has(clientId)) return null;
  nodeGenerationLocks.add(clientId);
  const beforeRepair = get().graphNodes;
  const repairedNodes = deriveParentServerNodeIds(beforeRepair, get().graphEdges);
  if (repairedNodes.some((n, i) => n.data.parentServerNodeId !== beforeRepair[i]?.data.parentServerNodeId)) {
    set({ graphNodes: repairedNodes });
  }
  const requestSessionId = get().activeSessionId;
  const startedAt = Date.now();
  const randSuffix = Math.random().toString(36).slice(2, 6);
  const flightId = `fn_${clientId}_${startedAt}_${randSuffix}`;
  const controller = new AbortController();
  registerFlightAbort(flightId, controller);
  const built = await buildNodeRunRequest(clientId, {
    requestId: flightId,
    ...(options.sizeOverride !== undefined ? { sizeOverride: options.sizeOverride } : {}),
    ...(options.parentServerNodeIdOverride !== undefined
      ? { parentServerNodeId: options.parentServerNodeIdOverride }
      : {}),
    requireParentWhenIncoming: true,
  }, set, get);
  if (built.ok === false) {
    if (built.reason === "missing-node") {
      // Node vanished mid-flight: silent bail, same as the pre-build check.
      clearFlightAbort(flightId);
      nodeGenerationLocks.delete(clientId);
      return null;
    }
    if (built.reason === "missing-prompt") {
      get().showToast(t("toast.promptRequired"), true);
      clearFlightAbort(flightId);
      nodeGenerationLocks.delete(clientId);
      return null;
    }
    if (built.reason === "element-missing") {
      get().showToast(t("node.elementMissing", { name: built.name }), true);
      clearFlightAbort(flightId);
      nodeGenerationLocks.delete(clientId);
      return null;
    }
    get().showToast(t("node.parentImageRequired"), true);
    clearFlightAbort(flightId);
    nodeGenerationLocks.delete(clientId);
    return null;
  }
  const prompt = built.request.prompt;
  const nextInFlight: PersistedInFlight[] = [
    ...get().inFlight,
    {
      id: flightId,
      prompt,
      startedAt,
      kind: "node",
      sessionId: requestSessionId,
      clientNodeId: clientId,
    },
  ];
  saveInflightFn(nextInFlight);
  set({
    graphNodes: get().graphNodes.map((n) =>
      n.id === clientId
        ? {
            ...n,
            data: {
              ...n.data,
              status: "pending",
              pendingRequestId: flightId,
              recoveryRequestId: flightId,
              pendingPhase: "queued",
              pendingStartedAt: startedAt,
              partialImageUrl: null,
              error: undefined,
              errorInfo: null,
              size: built.size,
            },
          }
        : n,
    ),
    activeGenerations: get().activeGenerations + 1,
    inFlight: nextInFlight,
  });
  get().startInFlightPolling();

  let graphMutated = true;

  try {
    const res = await postNodeGenerateStream(built.request, {
        onPartial: (partial) => {
          if (get().activeSessionId !== requestSessionId) return;
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: "pending",
                      partialImageUrl: partial.image,
                      pendingPhase: "partial",
                    },
                  }
                : n,
            ),
          });
        },
        onPhase: (phase) => {
          if (get().activeSessionId !== requestSessionId) return;
          if (!phase.phase) return;
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      pendingPhase: phase.phase ?? n.data.pendingPhase,
                    },
                  }
                : n,
            ),
          });
        },
      },
      { signal: controller.signal },
    );
    if (get().activeSessionId === requestSessionId) {
      set({
        graphNodes: get().graphNodes.map((n) => {
          if (n.id !== clientId) return n;
          const nextData = { ...n.data };
          delete nextData.partialImageUrl;
          return {
            ...n,
            data: {
              ...nextData,
              serverNodeId: res.nodeId,
              imageUrl: res.url,
              status: "ready",
              pendingRequestId: null,
              recoveryRequestId: null,
              pendingPhase: null,
              pendingStartedAt: null,
              elapsed: res.elapsed,
              reasoningEffort: res.reasoningEffort,
              webSearchCalls: res.webSearchCalls,
              model: res.model ?? null,
              size: res.size ?? null,
              errorInfo: null,
            },
          };
        }),
      });
      graphMutated = true;
      if (!options.suppressToast) {
        get().showToast(t("toast.nodeCreated", { id: res.nodeId.slice(0, 8), elapsed: res.elapsed }));
      }
    }
    return res.nodeId;
    // cross-session: result will be restored via recoverGraphNodesFromHistory
    // when the user returns to the originating session.
  } catch (err) {
    if (isCanceledGenerationError(err)) {
      if (get().activeSessionId === requestSessionId) {
        set({
          graphNodes: get().graphNodes.map((n) =>
            n.id === clientId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: n.data.imageUrl ? "ready" : "empty",
                    pendingRequestId: null,
                    recoveryRequestId: null,
                    pendingPhase: null,
                    pendingStartedAt: null,
                    partialImageUrl: null,
                    error: undefined,
                    errorInfo: null,
                  },
                }
              : n,
          ),
        });
        graphMutated = true;
      }
      return null;
    }
    const msg = err instanceof Error ? err.message : t("toast.nodeCreateFailed");
    if (get().activeSessionId === requestSessionId) {
      set({
        graphNodes: get().graphNodes.map((n) =>
          n.id === clientId
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "error",
                  pendingRequestId: null,
                  pendingPhase: null,
                  pendingStartedAt: null,
                  partialImageUrl: null,
                  error: msg,
                  errorInfo: buildNodeErrorInfo(err),
                },
              }
            : n,
        ),
      });
      graphMutated = true;
      handleError(err, get());
    }
    // cross-session: silent — user is on a different graph
    return null;
  } finally {
    nodeGenerationLocks.delete(clientId);
    const remaining = get().inFlight.filter((f) => f.id !== flightId);
    saveInflightFn(remaining);
    clearFlightAbort(flightId);
    set({
      activeGenerations: Math.max(0, get().activeGenerations - 1),
      inFlight: remaining,
    });
    if (get().activeSessionId === requestSessionId && graphMutated) {
      get().scheduleGraphSave();
      void get().flushGraphSave("node-complete");
    }
  }
}

export async function runNodeBatchImpl(
  mode: NodeBatchMode,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  if (get().nodeBatchRunning) return;
  if (get().nodeWorkflowRunning) { get().showToast(t("nodeWorkflow.busy"), true); return; }
  // Element reference nodes are inputs, never generation targets (Socrates B4).
  const selectedIds = getSelectedNodeIds(get().graphNodes)
    .filter((id) => get().graphNodes.find((n) => n.id === id)?.type !== "elementReferenceNode");
  if (selectedIds.length === 0) {
    get().showToast(t("nodeBatch.noneSelected"), true);
    return;
  }
  const blocked = validateBatchDependencies(get().graphNodes, get().graphEdges, selectedIds);
  if (blocked.length > 0) {
    get().showToast(t("nodeBatch.parentRequired", { count: blocked.length }), true);
    return;
  }
  const cycleIds = findCycleNodeIds(get().graphNodes, get().graphEdges, selectedIds);
  if (cycleIds.length > 0) {
    get().showToast(t("nodeBatch.cycleBlocked", { count: cycleIds.length }), true);
    return;
  }
  const orderedIds = topologicalSortSelected(get().graphNodes, get().graphEdges, selectedIds);
  const selectedSet = new Set(selectedIds);
  const candidates = orderedIds.filter((id) => {
    if (mode === "regenerate-all") return true;
    const node = get().graphNodes.find((n) => n.id === id);
    return node ? !nodeHasImage(node) : false;
  });
  if (candidates.length === 0) {
    get().showToast(t("nodeBatch.nothingToRun"));
    return;
  }
  // Missing element inputs block the whole batch (upstream traversal —
  // per-candidate re-fetch happens inside each runGenerateNodeInPlace).
  const batchElementInputs = collectElementInputs(get().graphNodes, get().graphEdges, candidates);
  const batchMissing = batchElementInputs.find((input) => input.missing);
  if (batchMissing) {
    get().showToast(t("node.elementMissing", { name: batchMissing.name }), true);
    return;
  }

  set({ nodeBatchRunning: true, nodeBatchStopping: false });
  const latestServerNodeIdByClientId = new Map<string, string>();
  let completed = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const skipIds = new Set<string>();
  try {
    for (const candidateId of candidates) {
      if (get().nodeBatchStopping) break;
      if (skipIds.has(candidateId)) {
        skippedCount += 1;
        continue;
      }
      const incoming = get().graphEdges.find((e) => e.target === candidateId);
      const parentOverride = incoming
        ? latestServerNodeIdByClientId.get(incoming.source)
          ?? get().graphNodes.find((n) => n.id === candidateId)?.data.parentServerNodeId
          ?? null
        : null;
      const nodeId = await get().runGenerateNodeInPlace(candidateId as ClientNodeId, {
        parentServerNodeIdOverride: parentOverride,
        suppressToast: true,
      });
      if (!nodeId) {
        // Partial failure (020, wp2): skip everything downstream of the
        // failed node but keep independent candidates running.
        failedCount += 1;
        for (const id of collectDownstream(get().graphEdges, candidateId)) skipIds.add(id);
        continue;
      }
      completed += 1;
      latestServerNodeIdByClientId.set(candidateId, nodeId);
      const directChildren = getDirectUnselectedChildren(get().graphEdges, candidateId, selectedSet);
      // Selected direct children too (020, wp2 audit blocker #2): the
      // batch path resolves lineage from the stored parentServerNodeId, so
      // propagate the fresh server id to every direct child.
      const selectedDirectChildren = get().graphEdges
        .filter((e) => e.source === candidateId && selectedSet.has(e.target))
        .map((e) => e.target);
      const downstream = new Set(getUnselectedDownstreamIds(get().graphEdges, selectedSet));
      set({
        graphNodes: get().graphNodes.map((n) => {
          if (selectedDirectChildren.includes(n.id)) {
            return { ...n, data: { ...n.data, parentServerNodeId: nodeId } };
          }
          if (!downstream.has(n.id)) return n;
          return {
            ...n,
            data: {
              ...n.data,
              status: "stale",
              parentServerNodeId: directChildren.includes(n.id)
                ? nodeId
                : n.data.parentServerNodeId,
              error: t("nodeBatch.staleBecauseParentChanged"),
            },
          };
        }),
      });
    }
    if (failedCount > 0) {
      get().showToast(
        t("nodeBatch.partialFinished", {
          done: completed,
          failed: failedCount,
          skipped: skippedCount,
          total: candidates.length,
        }),
        true,
      );
    } else {
      get().showToast(t("nodeBatch.finished", { done: completed, total: candidates.length }));
    }
    get().scheduleGraphSave();
  } finally {
    set({ nodeBatchRunning: false, nodeBatchStopping: false });
  }
}
