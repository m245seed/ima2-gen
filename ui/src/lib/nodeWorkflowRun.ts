/**
 * Dependency-aware bulk execution ("Run flow"): replays a WorkflowPlan N
 * times with a parallelism cap. Per run the plan's stages execute in
 * topological order; each stage sees the outputs produced by the same run,
 * never another run's. The scheduler never touches the graph or the store —
 * it only emits phase events and returns totals.
 */
import type { WorkflowPlan, WorkflowPlanStage } from "./nodeWorkflowPlan";

export type WorkflowStagePhase =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "skipped"
  | "canceled";

export type WorkflowStageExecutor = (args: {
  /** 1-based run number. */
  runIndex: number;
  stage: WorkflowPlanStage;
  parentServerNodeId: string | null;
  requestId: string;
  signal: AbortSignal;
}) => Promise<{ serverNodeId: string; imageUrl: string; elapsed: number }>;

export type WorkflowRunEvents = {
  onStagePhase(
    runIndex: number,
    clientId: string,
    phase: WorkflowStagePhase,
    detail?: {
      serverNodeId?: string;
      imageUrl?: string;
      elapsed?: number;
      error?: string;
    },
  ): void;
  onRunPhase(runIndex: number, phase: "running" | "done" | "failed" | "canceled"): void;
};

export type WorkflowRunTotals = {
  done: number;
  failed: number;
  skipped: number;
  canceled: number;
};

export function workflowStageRequestId(batchId: string, runIndex: number, clientId: string): string {
  // batchId is `wf_<base36 ts>_<4 base36 rand>` and clientId is `nc_xxxxxxxx`,
  // so the result matches /^[A-Za-z0-9._:-]{1,128}$/.
  return `${batchId}_r${runIndex}_${clientId}`;
}

type RunState = {
  results: Map<string, string>;
  failed: boolean;
  canceled: boolean;
  pending: number;
  startedAnnounced: boolean;
  /** Client ids that reached a terminal phase (done/error/skipped/canceled). */
  settled: Set<string>;
};

export async function runWorkflowBatch(input: {
  plan: WorkflowPlan;
  batchId: string;
  runCount: number;
  parallelism: number;
  signal: AbortSignal;
  execute: WorkflowStageExecutor;
  events: WorkflowRunEvents;
}): Promise<WorkflowRunTotals> {
  const { plan, batchId, runCount, parallelism, signal, execute, events } = input;

  // childrenOf preserves plan (topological) order; descendantsOf is BFS over it.
  const childrenOf = new Map<string, WorkflowPlanStage[]>();
  for (const stage of plan.stages) {
    if (!stage.parentClientId) continue;
    const list = childrenOf.get(stage.parentClientId) ?? [];
    list.push(stage);
    childrenOf.set(stage.parentClientId, list);
  }
  const descendantsOf = (clientId: string): string[] => {
    const out: string[] = [];
    const frontier = (childrenOf.get(clientId) ?? []).map((s) => s.clientId);
    const seen = new Set(frontier);
    while (frontier.length > 0) {
      const id = frontier.shift()!;
      out.push(id);
      for (const child of childrenOf.get(id) ?? []) {
        if (!seen.has(child.clientId)) {
          seen.add(child.clientId);
          frontier.push(child.clientId);
        }
      }
    }
    return out;
  };

  const totals: WorkflowRunTotals = { done: 0, failed: 0, skipped: 0, canceled: 0 };
  const runs = new Map<number, RunState>();
  for (let r = 1; r <= runCount; r += 1) {
    runs.set(r, {
      results: new Map(),
      failed: false,
      canceled: false,
      pending: plan.stages.length,
      startedAnnounced: false,
      settled: new Set(),
    });
  }
  const emitStage: WorkflowRunEvents["onStagePhase"] = (runIndex, clientId, phase, detail) => {
    if (phase === "done") totals.done += 1;
    else if (phase === "error") totals.failed += 1;
    else if (phase === "skipped") totals.skipped += 1;
    else if (phase === "canceled") totals.canceled += 1;
    if (phase !== "queued" && phase !== "running") runs.get(runIndex)?.settled.add(clientId);
    events.onStagePhase(runIndex, clientId, phase, detail);
  };
  const finishRun = (runIndex: number) => {
    const st = runs.get(runIndex)!;
    if (st.pending > 0) return;
    events.onRunPhase(runIndex, st.canceled ? "canceled" : st.failed ? "failed" : "done");
  };

  const queue: Array<{ runIndex: number; stage: WorkflowPlanStage }> = [];
  for (let r = 1; r <= runCount; r += 1) {
    for (const stage of plan.stages) {
      if (stage.parentClientId === null) queue.push({ runIndex: r, stage });
    }
  }

  const enqueueChildren = (runIndex: number, stage: WorkflowPlanStage) => {
    for (const child of childrenOf.get(stage.clientId) ?? []) {
      queue.push({ runIndex, stage: child });
    }
  };
  const removeDescendants = (runIndex: number, clientId: string) => {
    const st = runs.get(runIndex)!;
    const dead = descendantsOf(clientId);
    if (dead.length === 0) return;
    const deadSet = new Set(dead);
    // Unqueued descendants will never launch (children are only enqueued on
    // success), so skip them here rather than relying on queue removal.
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      const entry = queue[i]!;
      if (entry.runIndex !== runIndex || !deadSet.has(entry.stage.clientId)) continue;
      queue.splice(i, 1);
    }
    for (const id of dead) {
      st.pending -= 1;
      emitStage(runIndex, id, "skipped");
    }
    finishRun(runIndex);
  };

  const active = new Set<Promise<void>>();
  let drainDone = false;
  const drainQueueSkipped = () => {
    while (queue.length > 0) {
      const entry = queue.shift()!;
      const st = runs.get(entry.runIndex)!;
      st.pending -= 1;
      emitStage(entry.runIndex, entry.stage.clientId, "skipped");
      finishRun(entry.runIndex);
    }
  };

  const launch = (runIndex: number, stage: WorkflowPlanStage) => {
    const st = runs.get(runIndex)!;
    // Seed stages resolve inline without consuming a concurrency slot.
    if (stage.kind === "source") {
      const source = stage.source!;
      st.results.set(stage.clientId, source.serverNodeId);
      emitStage(runIndex, stage.clientId, "done", {
        serverNodeId: source.serverNodeId,
        imageUrl: source.imageUrl ?? undefined,
      });
      enqueueChildren(runIndex, stage);
      st.pending -= 1;
      finishRun(runIndex);
      return;
    }
    const parentServerNodeId = stage.parentClientId
      ? st.results.get(stage.parentClientId)!
      : stage.fixedParentServerNodeId;
    if (!st.startedAnnounced) {
      st.startedAnnounced = true;
      events.onRunPhase(runIndex, "running");
    }
    emitStage(runIndex, stage.clientId, "running");
    const requestId = workflowStageRequestId(batchId, runIndex, stage.clientId);
    const promise = (async () => {
      try {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const res = await execute({ runIndex, stage, parentServerNodeId, requestId, signal });
        st.results.set(stage.clientId, res.serverNodeId);
        emitStage(runIndex, stage.clientId, "done", {
          serverNodeId: res.serverNodeId,
          imageUrl: res.imageUrl,
          elapsed: res.elapsed,
        });
        enqueueChildren(runIndex, stage);
        st.pending -= 1;
        finishRun(runIndex);
      } catch (err) {
        const aborted = signal.aborted || (err instanceof Error && err.name === "AbortError");
        if (aborted) {
          st.canceled = true;
          emitStage(runIndex, stage.clientId, "canceled");
          st.pending -= 1;
          finishRun(runIndex);
          return;
        }
        st.failed = true;
        const message = err instanceof Error ? err.message : String(err);
        emitStage(runIndex, stage.clientId, "error", { error: message });
        removeDescendants(runIndex, stage.clientId);
        st.pending -= 1;
        finishRun(runIndex);
      }
    })();
    const tracked = promise.finally(() => {
      active.delete(tracked);
    });
    active.add(tracked);
  };

  const cap = Math.max(1, parallelism);
  while (queue.length > 0 || active.size > 0) {
    if (signal.aborted && !drainDone) {
      drainDone = true;
      drainQueueSkipped();
    }
    while (queue.length > 0 && active.size < cap) {
      const entry = queue.shift()!;
      launch(entry.runIndex, entry.stage);
    }
    if (active.size === 0) continue;
    await Promise.race([...active]);
  }

  // Terminal sweep: after an abort, stages whose lineage was severed (their
  // parent was skipped/canceled, so they were never enqueued) must still
  // reach a terminal phase or their run never completes.
  for (const [runIndex, st] of runs) {
    let swept = false;
    for (const stage of plan.stages) {
      if (st.settled.has(stage.clientId)) continue;
      st.settled.add(stage.clientId);
      st.pending -= 1;
      emitStage(runIndex, stage.clientId, "skipped");
      swept = true;
    }
    if (swept) finishRun(runIndex);
  }

  return totals;
}
