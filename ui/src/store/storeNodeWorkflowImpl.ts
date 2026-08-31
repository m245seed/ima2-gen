/**
 * "Run flow" orchestration: plans the component, replays it N times through
 * runWorkflowBatch, mirrors progress into WorkflowBatchState and persists
 * run records. The definition graph is never mutated by a run — per-run
 * outputs live only in the batch state (localStorage-backed).
 */
import { t } from "../i18n";
import { planWorkflow, countGenerateStages } from "../lib/nodeWorkflowPlan";
import {
  runWorkflowBatch,
  type WorkflowRunTotals,
  type WorkflowStagePhase,
} from "../lib/nodeWorkflowRun";
import {
  clampParallelism,
  clampRunCount,
  clearWorkflowBatches,
  saveWorkflowBatch,
  saveWorkflowSettings,
} from "../lib/nodeWorkflowStorage";
import { mergeAbortSignals } from "../lib/asyncJobSubmit";
import { postNodeGenerateStream } from "../lib/api";
import { buildNodeRunRequest } from "./storeNodeRunRequest";
import { clearFlightAbort, registerFlightAbort } from "./flightAbortRegistry";
import type {
  ImageNodeStatus,
  StoreGet,
  StoreSet,
  WorkflowBatchState,
  WorkflowRunState,
  WorkflowStageState,
} from "./storeTypes";

/** Abort handle for the in-flight workflow batch (cancel + session switch). */
let activeWorkflowAbort: AbortController | null = null;

function projectedStatus(phase: WorkflowStagePhase): ImageNodeStatus {
  switch (phase) {
    case "queued":
    case "running":
      return "pending";
    case "done":
      return "ready";
    case "error":
      return "error";
    case "skipped":
      return "stale";
    case "canceled":
      return "empty";
  }
}

function patchStage(
  set: StoreSet,
  get: StoreGet,
  batchId: string,
  runIndex: number,
  clientId: string,
  patch: Partial<WorkflowStageState>,
): void {
  const current = get().nodeWorkflow;
  // Stale batch (cleared or replaced by a session switch): drop the patch.
  if (!current || current.batchId !== batchId) return;
  const run = current.runs[runIndex - 1];
  if (!run || run.index !== runIndex) return;
  const stage = run.stages[clientId];
  if (!stage) return;
  const nextRun: WorkflowRunState = {
    ...run,
    stages: { ...run.stages, [clientId]: { ...stage, ...patch } },
  };
  const runs = current.runs.slice();
  runs[runIndex - 1] = nextRun;
  set({ nodeWorkflow: { ...current, runs } });
}

export async function runNodeWorkflowImpl(set: StoreSet, get: StoreGet): Promise<void> {
  if (get().nodeWorkflowRunning || get().nodeBatchRunning) {
    get().showToast(t("nodeWorkflow.busy"), true);
    return;
  }
  const planned = planWorkflow(get().graphNodes, get().graphEdges);
  if (planned.ok === false) {
    const failure = planned.failure;
    if (failure.code === "EMPTY_FLOW") get().showToast(t("nodeWorkflow.emptyFlow"), true);
    else if (failure.code === "AMBIGUOUS_FLOW") get().showToast(t("nodeWorkflow.ambiguousFlow", { count: failure.count }), true);
    else if (failure.code === "CYCLE") get().showToast(t("nodeWorkflow.cycleBlocked", { count: failure.count }), true);
    else if (failure.code === "SOURCE_WITHOUT_IMAGE") get().showToast(t("nodeWorkflow.sourceWithoutImage", { count: failure.count }), true);
    else get().showToast(t("node.elementMissing", { name: failure.name }), true);
    return;
  }
  const plan = planned.plan;
  const generateStageCount = countGenerateStages(plan);
  if (generateStageCount === 0) {
    get().showToast(t("nodeWorkflow.nothingToRun"));
    return;
  }
  const runCount = get().nodeWorkflowRunCount;
  const parallelism = get().nodeWorkflowParallelism;
  const requestSessionId = get().activeSessionId;
  const batchId = `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const seedStage = (clientId: string): WorkflowStageState => ({
    clientId,
    phase: "queued",
    status: "pending",
    serverNodeId: null,
    imageUrl: null,
    partialImageUrl: null,
    pendingPhase: null,
    elapsed: null,
    error: null,
  });
  const batch: WorkflowBatchState = {
    batchId,
    sessionId: requestSessionId,
    rootId: plan.rootId,
    stageIds: plan.stages.map((s) => s.clientId),
    generateStageCount,
    runCount,
    parallelism,
    startedAt: Date.now(),
    phase: "running",
    runs: Array.from({ length: runCount }, (_, i) => ({
      index: i + 1,
      phase: "queued" as const,
      stages: Object.fromEntries(plan.stages.map((s) => [s.clientId, seedStage(s.clientId)])),
    })),
    totals: { done: 0, failed: 0, skipped: 0, canceled: 0 },
  };
  set({ nodeWorkflow: batch, nodeWorkflowRunning: true, nodeWorkflowPreviewRun: 1 });
  get().showToast(t("nodeWorkflow.started", { runs: runCount, stages: generateStageCount }));

  const controller = new AbortController();
  activeWorkflowAbort = controller;

  let totals: WorkflowRunTotals = { done: 0, failed: 0, skipped: 0, canceled: 0 };
  try {
    totals = await runWorkflowBatch({
      plan,
      batchId,
      runCount,
      parallelism,
      signal: controller.signal,
      execute: async (args) => {
        // A session switch ends the batch without touching the new session.
        if (get().activeSessionId !== requestSessionId) {
          throw new DOMException("Aborted", "AbortError");
        }
        const stageController = new AbortController();
        const signal = mergeAbortSignals(args.signal, stageController.signal);
        registerFlightAbort(args.requestId, stageController);
        try {
          const built = await buildNodeRunRequest(args.stage.clientId, {
            requestId: args.requestId,
            parentServerNodeId: args.parentServerNodeId,
            clientNodeId: null,
            requireParentWhenIncoming: false,
          }, set, get);
          if (built.ok === false) {
            if (built.reason === "missing-prompt") throw new Error(t("toast.promptRequired"));
            if (built.reason === "element-missing") throw new Error(t("node.elementMissing", { name: built.name }));
            throw new Error(t("nodeWorkflow.stageFailed"));
          }
          const res = await postNodeGenerateStream(built.request, {
            onPartial: (partial) => {
              patchStage(set, get, batchId, args.runIndex, args.stage.clientId, {
                partialImageUrl: partial.image,
                pendingPhase: "partial",
              });
            },
            onPhase: (phase) => {
              if (!phase.phase) return;
              patchStage(set, get, batchId, args.runIndex, args.stage.clientId, {
                pendingPhase: phase.phase,
              });
            },
          }, { signal });
          return { serverNodeId: res.nodeId, imageUrl: res.url, elapsed: res.elapsed };
        } finally {
          clearFlightAbort(args.requestId);
        }
      },
      events: {
        onStagePhase: (runIndex, clientId, phase, detail) => {
          patchStage(set, get, batchId, runIndex, clientId, {
            phase,
            status: projectedStatus(phase),
            serverNodeId: detail?.serverNodeId ?? null,
            imageUrl: detail?.imageUrl ?? null,
            elapsed: detail?.elapsed ?? null,
            error: detail?.error ?? null,
            ...(phase === "done" || phase === "error" || phase === "skipped" || phase === "canceled"
              ? { partialImageUrl: null, pendingPhase: null }
              : {}),
          });
        },
        onRunPhase: (runIndex, phase) => {
          const current = get().nodeWorkflow;
          if (!current || current.batchId !== batchId) return;
          const run = current.runs[runIndex - 1];
          if (!run || run.index !== runIndex) return;
          const runs = current.runs.slice();
          runs[runIndex - 1] = { ...run, phase };
          const next = { ...current, runs };
          set({ nodeWorkflow: next });
          saveWorkflowBatch(requestSessionId, next);
        },
      },
    });
  } finally {
    set({ nodeWorkflowRunning: false });
    const current = get().nodeWorkflow;
    if (current && current.batchId === batchId) {
      const canceled = current.runs.some((r) => r.phase === "canceled") || totals.canceled > 0;
      const failed = current.runs.some((r) => r.phase === "failed");
      const settled: WorkflowBatchState = {
        ...current,
        phase: canceled ? "canceled" : failed ? "failed" : "done",
        totals,
      };
      set({ nodeWorkflow: settled });
      saveWorkflowBatch(requestSessionId, settled);
    }
    activeWorkflowAbort = null;
    if (totals.canceled > 0) {
      get().showToast(t("nodeWorkflow.canceled", { done: totals.done, canceled: totals.canceled }));
    } else {
      get().showToast(t("nodeWorkflow.finished", { done: totals.done, failed: totals.failed, skipped: totals.skipped }));
    }
  }
}

export function cancelNodeWorkflowImpl(_set: StoreSet, get: StoreGet): void {
  if (!get().nodeWorkflowRunning) return;
  activeWorkflowAbort?.abort();
  get().showToast(t("nodeWorkflow.canceling"));
}

export function clearNodeWorkflowImpl(set: StoreSet, get: StoreGet): void {
  if (get().nodeWorkflowRunning) return;
  set({ nodeWorkflow: null, nodeWorkflowPreviewRun: null });
  clearWorkflowBatches(get().activeSessionId);
}

export function setNodeWorkflowPreviewRunImpl(runIndex: number | null, set: StoreSet, get: StoreGet): void {
  if (runIndex == null) {
    set({ nodeWorkflowPreviewRun: null });
    return;
  }
  const batch = get().nodeWorkflow;
  if (!batch) return;
  if (!Number.isInteger(runIndex) || runIndex < 1 || runIndex > batch.runs.length) return;
  set({ nodeWorkflowPreviewRun: runIndex });
}

export function setNodeWorkflowRunCountImpl(value: number, set: StoreSet, get: StoreGet): void {
  const runCount = clampRunCount(value);
  set({ nodeWorkflowRunCount: runCount });
  saveWorkflowSettings({ runCount, parallelism: get().nodeWorkflowParallelism });
}

export function setNodeWorkflowParallelismImpl(value: number, set: StoreSet, get: StoreGet): void {
  const parallelism = clampParallelism(value);
  set({ nodeWorkflowParallelism: parallelism });
  saveWorkflowSettings({ runCount: get().nodeWorkflowRunCount, parallelism });
}
