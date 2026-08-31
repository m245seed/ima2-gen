/**
 * Flow planning: resolves the execution root and builds a stage list from a
 * graph's connected component.
 *
 * A "source" stage is a definition node with no prompt — its output is the
 * pre-existing image already on the node.  A "generate" stage needs a live
 * request.  The plan enforces one-incoming-edge per node (graph invariant).
 */
import { getConnectedComponentIds, getSelectedNodeIds } from "./nodeSelection";
import { findCycleNodeIds, topologicalSortSelected } from "./nodeBatch";
import { collectElementInputs } from "./nodeElementInputs";
import type { GraphEdge, GraphNode } from "../store/useAppStore";

export type WorkflowStageKind = "generate" | "source";

export type WorkflowPlanStage = {
  clientId: string;
  kind: WorkflowStageKind;
  /** In-flow image parent whose per-run output feeds this stage; null = run root. */
  parentClientId: string | null;
  /** Parent id used when the parent sits outside the executed stage set. */
  fixedParentServerNodeId: string | null;
  /** Present only for kind === "source": the frozen image this node contributes. */
  source: { serverNodeId: string; imageUrl: string | null } | null;
};

export type WorkflowPlan = { rootId: string; stages: WorkflowPlanStage[] };

export type WorkflowPlanFailure =
  | { code: "EMPTY_FLOW" }
  | { code: "AMBIGUOUS_FLOW"; count: number }
  | { code: "CYCLE"; count: number }
  | { code: "SOURCE_WITHOUT_IMAGE"; count: number }
  | { code: "MISSING_ELEMENT"; name: string };

export function resolveWorkflowRootId(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { ok: true; rootId: string } | { ok: false; failure: WorkflowPlanFailure } {
  // Image nodes only (element reference nodes are inputs, not generation roots)
  const imageIds = nodes
    .filter((n) => n.type !== "elementReferenceNode")
    .map((n) => n.id);

  if (imageIds.length === 0) return { ok: false, failure: { code: "EMPTY_FLOW" } };

  // If the user has explicitly selected image nodes, use the first selected one.
  const selected = getSelectedNodeIds(nodes).filter((id) =>
    nodes.find((n) => n.id === id)?.type !== "elementReferenceNode",
  );
  if (selected.length > 0) {
    return { ok: true, rootId: selected[0] };
  }

  // Enumerate distinct connected components and verify exactly one.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const id of imageIds) {
    if (seen.has(id)) continue;
    const component = getConnectedComponentIds(nodes, edges, id);
    for (const nId of component) seen.add(nId);
    components.push(component);
  }

  if (components.length === 0) return { ok: false, failure: { code: "EMPTY_FLOW" } };
  if (components.length > 1) return { ok: false, failure: { code: "AMBIGUOUS_FLOW", count: components.length } };

  // Exactly one component: use the first image node in document order.
  const componentSet = new Set(components[0]);
  const rootId = imageIds.find((id) => componentSet.has(id));
  if (!rootId) return { ok: false, failure: { code: "EMPTY_FLOW" } };
  return { ok: true, rootId };
}

export function planWorkflow(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { ok: true; plan: WorkflowPlan } | { ok: false; failure: WorkflowPlanFailure } {
  const rootResult = resolveWorkflowRootId(nodes, edges);
  if (rootResult.ok === false) return { ok: false, failure: rootResult.failure };

  const { rootId } = rootResult;

  // Isolate the connected component containing the root.
  const componentIds = getConnectedComponentIds(nodes, edges, rootId);
  const componentSet = new Set(componentIds);
  const stageIds = nodes
    .filter((n) => componentSet.has(n.id) && n.type !== "elementReferenceNode")
    .map((n) => n.id);

  // Cycle check
  const cycleIds = findCycleNodeIds(nodes, edges, stageIds);
  if (cycleIds.length > 0) return { ok: false, failure: { code: "CYCLE", count: cycleIds.length } };

  // Topological order
  const ordered = topologicalSortSelected(nodes, edges, stageIds);

  // Missing element inputs check (upstream traversal across all stages)
  const missingElement = collectElementInputs(nodes, edges, ordered).find((e) => e.missing);
  if (missingElement) {
    return { ok: false, failure: { code: "MISSING_ELEMENT", name: missingElement.name } };
  }

  // Classify stages
  const stages: WorkflowPlanStage[] = [];
  for (const clientId of ordered) {
    const node = nodes.find((n) => n.id === clientId)!;
    const prompt = (node.data as Record<string, unknown>).prompt as string | undefined;
    const kind: WorkflowStageKind = prompt?.trim() ? "generate" : "source";

    // Parent resolution from the single incoming edge
    const incoming = edges.find((e) => e.target === clientId);

    if (incoming) {
      const sourceNode = nodes.find((n) => n.id === incoming.source);
      if (!sourceNode) {
        // Source node missing from graph — treat as no incoming
        stages.push({
          clientId,
          kind,
          parentClientId: null,
          fixedParentServerNodeId: null,
          source: kind === "source" && node.data.serverNodeId
            ? { serverNodeId: node.data.serverNodeId, imageUrl: node.data.imageUrl ?? null }
            : null,
        });
        continue;
      }

      if (sourceNode.type === "elementReferenceNode") {
        // Element data reaches the request through `references`, not as a parent image.
        stages.push({
          clientId,
          kind,
          parentClientId: null,
          fixedParentServerNodeId: null,
          source: kind === "source" && node.data.serverNodeId
            ? { serverNodeId: node.data.serverNodeId, imageUrl: node.data.imageUrl ?? null }
            : null,
        });
      } else if (componentSet.has(sourceNode.id)) {
        // Source is an image node inside the stage set → parentClientId, no fixed id.
        stages.push({
          clientId,
          kind,
          parentClientId: sourceNode.id,
          fixedParentServerNodeId: null,
          source: kind === "source" && node.data.serverNodeId
            ? { serverNodeId: node.data.serverNodeId, imageUrl: node.data.imageUrl ?? null }
            : null,
        });
      } else {
        // Source is an image node outside the stage set → use its server id.
        const fixed = (sourceNode.data as Record<string, unknown>).serverNodeId as string | null | undefined;
        stages.push({
          clientId,
          kind,
          parentClientId: null,
          fixedParentServerNodeId: fixed ?? null,
          source: kind === "source" && node.data.serverNodeId
            ? { serverNodeId: node.data.serverNodeId, imageUrl: node.data.imageUrl ?? null }
            : null,
        });
      }
    } else {
      // No incoming edge
      stages.push({
        clientId,
        kind,
        parentClientId: null,
        fixedParentServerNodeId: null,
        source: kind === "source" && node.data.serverNodeId
          ? { serverNodeId: node.data.serverNodeId, imageUrl: node.data.imageUrl ?? null }
          : null,
      });
    }
  }

  // Collect all source stages that have no prompt and no serverNodeId (hard error)
  const sourceWithoutImage = stages.filter(
    (s) => s.kind === "source" && !s.source,
  );
  if (sourceWithoutImage.length > 0) {
    return { ok: false, failure: { code: "SOURCE_WITHOUT_IMAGE", count: sourceWithoutImage.length } };
  }

  return { ok: true, plan: { rootId, stages } };
}

export function countGenerateStages(plan: WorkflowPlan): number {
  return plan.stages.filter((s) => s.kind === "generate").length;
}