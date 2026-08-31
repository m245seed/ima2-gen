import { Panel } from "@xyflow/react";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import {
  getUnselectedDownstreamIds,
  nodeHasImage,
  type NodeBatchMode,
} from "../lib/nodeBatch";

export function NodeBatchBar() {
  const { t } = useI18n();
  const nodes = useAppStore((s) => s.graphNodes);
  const edges = useAppStore((s) => s.graphEdges);
  const nodeSelectionMode = useAppStore((s) => s.nodeSelectionMode);
  const nodeBatchRunning = useAppStore((s) => s.nodeBatchRunning);
  const nodeBatchStopping = useAppStore((s) => s.nodeBatchStopping);
  const toggleNodeSelectionMode = useAppStore((s) => s.toggleNodeSelectionMode);
  const selectAllGraphNodes = useAppStore((s) => s.selectAllGraphNodes);
  const clearNodeSelection = useAppStore((s) => s.clearNodeSelection);
  const runNodeBatch = useAppStore((s) => s.runNodeBatch);
  const cancelNodeBatch = useAppStore((s) => s.cancelNodeBatch);
  const disconnectEdges = useAppStore((s) => s.disconnectEdges);
  const nodeWorkflowRunning = useAppStore((s) => s.nodeWorkflowRunning);
  const nodeWorkflowRunCount = useAppStore((s) => s.nodeWorkflowRunCount);
  const nodeWorkflowParallelism = useAppStore((s) => s.nodeWorkflowParallelism);
  const runNodeWorkflow = useAppStore((s) => s.runNodeWorkflow);
  const cancelNodeWorkflow = useAppStore((s) => s.cancelNodeWorkflow);
  const setNodeWorkflowRunCount = useAppStore((s) => s.setNodeWorkflowRunCount);
  const setNodeWorkflowParallelism = useAppStore((s) => s.setNodeWorkflowParallelism);

  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
  const selectedEdgeIds = edges.filter((edge) => edge.selected).map((edge) => edge.id);
  const selectedSet = new Set(selectedIds);
  // Element reference nodes are inputs, not generation targets — exclude from
  // the missing-image count (Socrates B4).
  const missingCount = nodes.filter((n) => selectedSet.has(n.id) && n.type !== "elementReferenceNode" && !nodeHasImage(n)).length;
  const staleImpact = getUnselectedDownstreamIds(edges, selectedIds).length;

  const run = (mode: NodeBatchMode) => {
    void runNodeBatch(mode);
  };

  return (
    <Panel position="top-center" className="node-batch-bar nodrag">
      {/* Workflow controls lead the bar: they need no selection. */}
      <span className="node-batch-bar__meta">{t("nodeWorkflow.label")}</span>
      <label className="node-batch-bar__field">
        {t("nodeWorkflow.runs")}
        <input
          type="number"
          min={1}
          max={20}
          value={nodeWorkflowRunCount}
          onChange={(e) => setNodeWorkflowRunCount(Number(e.target.value))}
          disabled={nodeWorkflowRunning}
          aria-label={t("nodeWorkflow.runs")}
        />
      </label>
      <label className="node-batch-bar__field">
        {t("nodeWorkflow.parallel")}
        <input
          type="number"
          min={1}
          max={12}
          value={nodeWorkflowParallelism}
          onChange={(e) => setNodeWorkflowParallelism(Number(e.target.value))}
          disabled={nodeWorkflowRunning}
          aria-label={t("nodeWorkflow.parallel")}
        />
      </label>
      <button
        type="button"
        onClick={() => void runNodeWorkflow()}
        disabled={nodeWorkflowRunning || nodeBatchRunning}
      >
        {t("nodeWorkflow.run")}
      </button>
      {nodeWorkflowRunning ? (
        <button type="button" onClick={cancelNodeWorkflow}>
          {t("nodeWorkflow.cancel")}
        </button>
      ) : null}
      <button type="button" onClick={toggleNodeSelectionMode} aria-pressed={nodeSelectionMode}>
        {nodeSelectionMode ? t("nodeBatch.selectionOn") : t("nodeBatch.selectionOff")}
      </button>
      <button type="button" onClick={selectAllGraphNodes} disabled={nodes.length === 0}>
        {t("nodeBatch.selectAll")}
      </button>
      {selectedEdgeIds.length > 0 ? (
        <button
          type="button"
          className="node-batch-bar__danger"
          onClick={() => disconnectEdges(selectedEdgeIds)}
          title={t("edge.disconnectTitle")}
          aria-label={t("edge.disconnectTitle")}
        >
          {t("edge.disconnect")}
        </button>
      ) : null}
      {selectedIds.length > 0 ? (
        <>
          <span className="node-batch-bar__meta">
            {t("nodeBatch.summary", {
              selected: selectedIds.length,
              missing: missingCount,
              stale: staleImpact,
            })}
          </span>
          <button type="button" onClick={() => run("missing-only")} disabled={nodeBatchRunning}>
            {t("nodeBatch.generateMissing")}
          </button>
          <button type="button" onClick={() => run("regenerate-all")} disabled={nodeBatchRunning}>
            {t("nodeBatch.regenerateSelected")}
          </button>
          {nodeBatchRunning ? (
            <button type="button" onClick={cancelNodeBatch} disabled={nodeBatchStopping}>
              {nodeBatchStopping ? t("nodeBatch.stopping") : t("nodeBatch.stopRemaining")}
            </button>
          ) : null}
          <button type="button" onClick={clearNodeSelection} disabled={nodeBatchRunning}>
            {t("nodeBatch.clear")}
          </button>
        </>
      ) : null}
    </Panel>
  );
}
