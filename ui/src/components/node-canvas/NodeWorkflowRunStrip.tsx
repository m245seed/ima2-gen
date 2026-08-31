import { useAppStore } from "../../store/useAppStore";
import { useI18n } from "../../i18n";

/**
 * Floating run strip below the canvas: progress counters plus one chip per
 * run for per-run preview. Rendered outside <ReactFlow> so canvas transforms
 * never move it.
 */
export function NodeWorkflowRunStrip() {
  const { t } = useI18n();
  const batch = useAppStore((s) => s.nodeWorkflow);
  const running = useAppStore((s) => s.nodeWorkflowRunning);
  const previewRun = useAppStore((s) => s.nodeWorkflowPreviewRun);
  const setPreviewRun = useAppStore((s) => s.setNodeWorkflowPreviewRun);
  const clearWorkflow = useAppStore((s) => s.clearNodeWorkflow);

  if (!batch) return null;

  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const run of batch.runs) {
    for (const stage of Object.values(run.stages)) {
      if (stage.phase === "done") done += 1;
      else if (stage.phase === "error") failed += 1;
      else if (stage.phase === "skipped") skipped += 1;
    }
  }
  const total = batch.runCount * batch.generateStageCount;

  return (
    <div className="node-workflow-runs" role="group" aria-label={t("nodeWorkflow.runsTitle", { total })}>
      <span className="node-workflow-runs__progress">
        {t("nodeWorkflow.progress", { done, failed, skipped, total })}
      </span>
      <button
        type="button"
        className="node-workflow-runs__chip node-workflow-runs__chip--definition"
        aria-pressed={previewRun == null}
        onClick={() => setPreviewRun(null)}
      >
        {t("nodeWorkflow.definition")}
      </button>
      {batch.runs.map((run) => (
        <button
          key={run.index}
          type="button"
          className={"node-workflow-runs__chip node-workflow-runs__chip--" + run.phase}
          aria-pressed={previewRun === run.index}
          aria-label={t("nodeWorkflow.runChipAria", { index: run.index })}
          onClick={() => setPreviewRun(run.index)}
        >
          #{run.index}
        </button>
      ))}
      <button
        type="button"
        className="node-workflow-runs__chip node-workflow-runs__chip--dismiss"
        disabled={running}
        onClick={clearWorkflow}
      >
        {t("nodeWorkflow.dismiss")}
      </button>
    </div>
  );
}
