/**
 * localStorage persistence for workflow run records (ima2.nodeWorkflow.v1):
 * settings blob plus the newest batches per session. Every access is
 * try/catch-guarded with silent fallback — runs are a convenience record;
 * the images themselves live in generated/ + history.
 */
import type {
  WorkflowBatchState,
  WorkflowRunState,
  WorkflowStageState,
} from "../store/storeTypes";

const STORAGE_KEY = "ima2.nodeWorkflow.v1";

export const MAX_STORED_BATCHES_PER_SESSION = 5;

type WorkflowBlob = {
  settings: { runCount: number; parallelism: number };
  batches: Record<string, WorkflowBatchState[]>;
};

const DEFAULT_SETTINGS = { runCount: 1, parallelism: 4 };

export function clampRunCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(20, Math.floor(value));
}

export function clampParallelism(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(12, Math.floor(value));
}

function readBlob(): WorkflowBlob {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, batches: {} };
    const parsed = JSON.parse(raw) as Partial<WorkflowBlob> | null;
    if (!parsed || typeof parsed !== "object") {
      return { settings: { ...DEFAULT_SETTINGS }, batches: {} };
    }
    return {
      settings: {
        runCount: clampRunCount(Number(parsed.settings?.runCount ?? DEFAULT_SETTINGS.runCount)),
        parallelism: clampParallelism(Number(parsed.settings?.parallelism ?? DEFAULT_SETTINGS.parallelism)),
      },
      batches: parsed.batches && typeof parsed.batches === "object" ? parsed.batches : {},
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, batches: {} };
  }
}

function writeBlob(blob: WorkflowBlob): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch { /* storage full or blocked: run records are non-critical */ }
}

export function loadWorkflowSettings(): { runCount: number; parallelism: number } {
  return readBlob().settings;
}

export function saveWorkflowSettings(next: { runCount: number; parallelism: number }): void {
  const blob = readBlob();
  blob.settings = {
    runCount: clampRunCount(next.runCount),
    parallelism: clampParallelism(next.parallelism),
  };
  writeBlob(blob);
}

/**
 * Partial images and pending phases are transient — never persisted. A
 * stored stage whose process is gone (queued/running) reads as canceled.
 */
function normalizeStoredStage(stage: WorkflowStageState): WorkflowStageState {
  const gone = stage.phase === "queued" || stage.phase === "running";
  return {
    ...stage,
    partialImageUrl: null,
    pendingPhase: null,
    phase: gone ? "canceled" : stage.phase,
    status: gone ? "empty" : stage.status,
  };
}

function normalizeStoredRun(run: WorkflowRunState): WorkflowRunState {
  const gone = run.phase === "queued" || run.phase === "running";
  const stages: Record<string, WorkflowStageState> = {};
  for (const [id, stage] of Object.entries(run.stages)) stages[id] = normalizeStoredStage(stage);
  return { ...run, phase: gone ? "canceled" : run.phase, stages };
}

function normalizeStoredBatch(batch: WorkflowBatchState): WorkflowBatchState {
  return {
    ...batch,
    phase: batch.phase === "running" ? "canceled" : batch.phase,
    runs: batch.runs.map(normalizeStoredRun),
  };
}

export function loadLatestWorkflowBatch(sessionId: string | null): WorkflowBatchState | null {
  if (!sessionId) return null;
  const batches = readBlob().batches[sessionId];
  const latest = Array.isArray(batches) ? batches[0] : undefined;
  return latest ? normalizeStoredBatch(latest) : null;
}

export function saveWorkflowBatch(sessionId: string | null, batch: WorkflowBatchState): void {
  if (!sessionId) return;
  const all = readBlob();
  const sessionBatches = Array.isArray(all.batches[sessionId]) ? [...all.batches[sessionId]] : [];
  all.batches[sessionId] = [batch, ...sessionBatches].slice(0, MAX_STORED_BATCHES_PER_SESSION);
  writeBlob(all);
}

export function clearWorkflowBatches(sessionId: string | null): void {
  if (!sessionId) return;
  const all = readBlob();
  if (!(sessionId in all.batches)) return;
  delete all.batches[sessionId];
  writeBlob(all);
}
