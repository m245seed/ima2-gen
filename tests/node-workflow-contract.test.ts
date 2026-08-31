import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  planWorkflow,
  countGenerateStages,
} from "../ui/src/lib/nodeWorkflowPlan.ts";
import {
  runWorkflowBatch,
  workflowStageRequestId,
  type WorkflowStageExecutor,
} from "../ui/src/lib/nodeWorkflowRun.ts";
import type { GraphEdge, GraphNode, ImageNodeData } from "../ui/src/store/useAppStore.ts";

function makeNode(id: string, patch: Partial<ImageNodeData> = {}): GraphNode {
  return {
    id,
    type: "imageNode",
    position: { x: 0, y: 0 },
    data: {
      clientId: id,
      serverNodeId: null,
      parentServerNodeId: null,
      prompt: "",
      imageUrl: null,
      status: "empty",
      pendingRequestId: null,
      ...patch,
    },
  } as GraphNode;
}

function makeEdge(source: string, target: string): GraphEdge {
  return { id: `e_${source}_${target}`, source, target } as GraphEdge;
}

type Call = { runIndex: number; clientId: string; parentServerNodeId: string | null };

/** Two-party settle (timer resolve vs abort reject) needs the executor form. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}


/** Fake executor: resolves after a macrotask, records lineage, tracks live concurrency, honors abort. */
function makeExecutor(options: {
  fail?: (call: Call) => boolean;
  onSettled?: (call: Call) => void;
}) {
  const calls: Call[] = [];
  let live = 0;
  let peak = 0;
  const execute: WorkflowStageExecutor = (args) => {
    const call: Call = {
      runIndex: args.runIndex,
      clientId: args.stage.clientId,
      parentServerNodeId: args.parentServerNodeId,
    };
    calls.push(call);
    live += 1;
    peak = Math.max(peak, live);
    // Macrotask tick (plan-mandated): lets the scheduler interleave runs.
    const { promise, resolve, reject } = deferred<{
      serverNodeId: string;
      imageUrl: string;
      elapsed: number;
    }>();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      live -= 1;
      fn();
      options.onSettled?.(call);
    };
    const timer = setTimeout(() => {
      finish(() => {
        if (options.fail?.(call)) {
          reject(new Error("boom"));
          return;
        }
        resolve({
          serverNodeId: `srv_r${args.runIndex}_${args.stage.clientId}`,
          imageUrl: `img_r${args.runIndex}_${args.stage.clientId}`,
          elapsed: 1,
        });
      });
    }, 0);
    args.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    });
    return promise;
  };
  return { execute, calls, peak: () => peak };
}

function aToBNodes(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: [
      makeNode("A", { prompt: "a prompt" }),
      makeNode("B", { prompt: "b prompt" }),
    ],
    edges: [makeEdge("A", "B")],
  };
}

describe("workflow stage request ids", () => {
  it("keeps request ids within the server id charset", () => {
    const id = workflowStageRequestId("wf_lx2f_k3x9", 7, "nc_ab12cd34");
    assert.match(id, /^[A-Za-z0-9._:-]{1,128}$/);
    assert.equal(id, "wf_lx2f_k3x9_r7_nc_ab12cd34");
  });
});

describe("runWorkflowBatch scheduling", () => {
  it("executes every stage per run with per-run lineage at parallelism 10", async () => {
    const { nodes, edges } = aToBNodes();
    const planned = planWorkflow(nodes, edges);
    assert.ok(planned.ok);
    const fake = makeExecutor({});
    const totals = await runWorkflowBatch({
      plan: planned.plan,
      batchId: "wf_test1",
      runCount: 10,
      parallelism: 10,
      signal: new AbortController().signal,
      execute: fake.execute,
      events: { onStagePhase() {}, onRunPhase() {} },
    });
    assert.equal(fake.calls.length, 20);
    assert.ok(fake.peak() <= 10);
    for (let r = 1; r <= 10; r += 1) {
      const bCall = fake.calls.find((c) => c.runIndex === r && c.clientId === "B");
      assert.ok(bCall);
      assert.equal(bCall.parentServerNodeId, `srv_r${r}_A`);
    }
    assert.deepEqual(totals, { done: 20, failed: 0, skipped: 0, canceled: 0 });
  });

  it("caps live concurrency and keeps lineage intact at parallelism 3", async () => {
    const { nodes, edges } = aToBNodes();
    const planned = planWorkflow(nodes, edges);
    assert.ok(planned.ok);
    const fake = makeExecutor({});
    const totals = await runWorkflowBatch({
      plan: planned.plan,
      batchId: "wf_test2",
      runCount: 10,
      parallelism: 3,
      signal: new AbortController().signal,
      execute: fake.execute,
      events: { onStagePhase() {}, onRunPhase() {} },
    });
    assert.equal(fake.calls.length, 20);
    assert.ok(fake.peak() <= 3);
    for (let r = 1; r <= 10; r += 1) {
      const bCall = fake.calls.find((c) => c.runIndex === r && c.clientId === "B");
      assert.equal(bCall?.parentServerNodeId, `srv_r${r}_A`);
    }
    assert.deepEqual(totals, { done: 20, failed: 0, skipped: 0, canceled: 0 });
  });

  it("skips only the failed stage's descendants and fails that run", async () => {
    const { nodes, edges } = aToBNodes();
    const planned = planWorkflow(nodes, edges);
    assert.ok(planned.ok);
    const fake = makeExecutor({ fail: (c) => c.runIndex === 4 && c.clientId === "A" });
    const runPhases: Record<number, string> = {};
    const stagePhases: Array<{ run: number; clientId: string; phase: string }> = [];
    const totals = await runWorkflowBatch({
      plan: planned.plan,
      batchId: "wf_test3",
      runCount: 10,
      parallelism: 10,
      signal: new AbortController().signal,
      execute: fake.execute,
      events: {
        onStagePhase(run, clientId, phase) {
          stagePhases.push({ run, clientId, phase });
        },
        onRunPhase(run, phase) {
          runPhases[run] = phase;
        },
      },
    });
    assert.deepEqual(totals, { done: 18, failed: 1, skipped: 1, canceled: 0 });
    assert.equal(runPhases[4], "failed");
    for (const r of [1, 2, 3, 5, 6, 7, 8, 9, 10]) assert.equal(runPhases[r], "done");
    assert.ok(stagePhases.some((s) => s.run === 4 && s.clientId === "B" && s.phase === "skipped"));
    // A4 itself errored exactly once; no other stage failed.
    assert.equal(stagePhases.filter((s) => s.phase === "error").length, 1);
  });

  it("drains queued stages as skipped and cancels in-flight on abort", async () => {
    const { nodes, edges } = aToBNodes();
    const planned = planWorkflow(nodes, edges);
    assert.ok(planned.ok);
    const controller = new AbortController();
    let aborted = false;
    const fake = makeExecutor({
      onSettled: (call) => {
        if (!aborted && call.runIndex === 1 && call.clientId === "A") {
          aborted = true;
          controller.abort();
        }
      },
    });
    const stagePhases: Array<{ run: number; clientId: string; phase: string }> = [];
    const totals = await runWorkflowBatch({
      plan: planned.plan,
      batchId: "wf_test4",
      runCount: 10,
      parallelism: 2,
      signal: controller.signal,
      execute: fake.execute,
      events: {
        onStagePhase(run, clientId, phase) {
          stagePhases.push({ run, clientId, phase });
        },
        onRunPhase() {},
      },
    });
    // Every stage of every run must reach exactly one terminal phase.
    assert.equal(totals.done + totals.failed + totals.skipped + totals.canceled, 20);
    assert.ok(totals.canceled > 0);
    assert.ok(totals.skipped > 0);
    assert.equal(totals.done, 1);
    // runWorkflowBatch only resolves once the queue and every in-flight
    // stage have settled, so no executor call can trail its return.
    assert.equal(fake.calls.length, 2, "executor must never be called again after abort");
    assert.ok(stagePhases.some((s) => s.phase === "canceled"));
  });
});

describe("planWorkflow", () => {
  it("treats an image-bearing unprompted node as a source and never executes it", async () => {
    const nodes = [
      makeNode("A", { serverNodeId: "srv_seed", imageUrl: "seed.png", status: "ready" }),
      makeNode("B", { prompt: "b prompt" }),
    ];
    const edges = [makeEdge("A", "B")];
    const planned = planWorkflow(nodes, edges);
    assert.ok(planned.ok);
    const seed = planned.plan.stages.find((s) => s.clientId === "A");
    assert.equal(seed?.kind, "source");
    assert.deepEqual(seed?.source, { serverNodeId: "srv_seed", imageUrl: "seed.png" });
    assert.equal(countGenerateStages(planned.plan), 1);
    const fake = makeExecutor({});
    const totals = await runWorkflowBatch({
      plan: planned.plan,
      batchId: "wf_test5",
      runCount: 3,
      parallelism: 3,
      signal: new AbortController().signal,
      execute: fake.execute,
      events: { onStagePhase() {}, onRunPhase() {} },
    });
    assert.equal(fake.calls.length, 3);
    assert.ok(fake.calls.every((c) => c.clientId === "B"));
    assert.ok(fake.calls.every((c) => c.parentServerNodeId === "srv_seed"));
    // 3 generate stages + 3 inline source resolutions = 6 done.
    assert.deepEqual(totals, { done: 6, failed: 0, skipped: 0, canceled: 0 });
  });

  it("runs a stage fed by an element reference parent without a parent image", () => {
    const nodes: GraphNode[] = [
      {
        id: "E",
        type: "elementReferenceNode",
        position: { x: 0, y: 0 },
        data: {
          elementId: "el_1",
          elementName: "Wood",
          missing: false,
        },
      } as unknown as GraphNode,
      makeNode("B", { prompt: "b prompt" }),
    ];
    const edges = [makeEdge("E", "B")];
    const planned = planWorkflow(nodes, edges);
    assert.ok(planned.ok);
    const stage = planned.plan.stages.find((s) => s.clientId === "B");
    assert.ok(stage);
    assert.equal(stage.kind, "generate");
    assert.equal(stage.parentClientId, null);
    assert.equal(stage.fixedParentServerNodeId, null);
  });

  it("rejects two disconnected flows with no selection as ambiguous", () => {
    const nodes = [
      makeNode("A", { prompt: "a" }),
      makeNode("B", { prompt: "b" }),
      makeNode("C", { prompt: "c" }),
    ];
    const edges = [makeEdge("A", "B")];
    const planned = planWorkflow(nodes, edges);
    // Explicit === false: union narrowing must survive strictNullChecks:false.
    if (planned.ok === false) {
      if (planned.failure.code !== "AMBIGUOUS_FLOW") throw new Error(planned.failure.code);
      assert.equal(planned.failure.count, 2);
    } else throw new Error("expected AMBIGUOUS_FLOW");
  });

  it("rejects cyclic flows", () => {
    const nodes = [
      makeNode("A", { prompt: "a" }),
      makeNode("B", { prompt: "b" }),
    ];
    const edges = [makeEdge("A", "B"), makeEdge("B", "A")];
    const planned = planWorkflow(nodes, edges);
    if (planned.ok === false) {
      if (planned.failure.code !== "CYCLE") throw new Error(planned.failure.code);
      assert.ok(planned.failure.count >= 2);
    } else throw new Error("expected CYCLE");
  });

  it("rejects an empty-prompt node without an image as source-without-image", () => {
    const nodes = [makeNode("A")];
    const planned = planWorkflow(nodes, []);
    if (planned.ok === false) {
      if (planned.failure.code !== "SOURCE_WITHOUT_IMAGE") throw new Error(planned.failure.code);
      assert.equal(planned.failure.count, 1);
    } else throw new Error("expected SOURCE_WITHOUT_IMAGE");
  });
});

describe("nodeWorkflow dictionary", () => {
  const locales = ["en", "ko", "zh-Hant", "zh-Hans"] as const;

  it("defines every nodeWorkflow key as a non-empty string in all four locales", () => {
    const dicts = locales.map((locale) =>
      JSON.parse(readFileSync(new URL(`../ui/src/i18n/${locale}.json`, import.meta.url), "utf-8")) as Record<string, Record<string, string>>,
    );
    const keys = new Set<string>();
    for (const dict of dicts) {
      assert.ok(dict.nodeWorkflow, "nodeWorkflow namespace missing");
      for (const key of Object.keys(dict.nodeWorkflow)) keys.add(key);
    }
    assert.ok(keys.size >= 19, `expected the full nodeWorkflow key set, got ${keys.size}`);
    for (const dict of dicts) {
      for (const key of keys) {
        const value = dict.nodeWorkflow[key];
        assert.ok(typeof value === "string" && value.length > 0, `empty nodeWorkflow.${key}`);
      }
    }
  });
});

