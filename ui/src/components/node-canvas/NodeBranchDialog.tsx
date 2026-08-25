import { useRef, useState } from "react";
import type { BranchVariant } from "../../lib/nodeBranching";
import { useI18n } from "../../i18n";

type VariantDraft = {
  id: string;
  label: string;
  provider: string;
  model: string;
  size: string;
};

export interface NodeBranchDialogProps {
  sourceLabel: string;
  onApply(variants: BranchVariant[]): void;
  onClose(): void;
}

const providers = ["oauth", "api"] as const;

function createDraft(index: number, label: string): VariantDraft {
  return { id: `variant-${index + 1}`, label, provider: providers[index % providers.length], model: "", size: "" };
}

function toVariant(draft: VariantDraft): BranchVariant {
  return {
    id: draft.id,
    label: draft.label.trim(),
    provider: draft.provider,
    settingsPatch: {
      ...(draft.model.trim() ? { model: draft.model.trim() } : {}),
      ...(draft.size.trim() ? { size: draft.size.trim() } : {}),
    },
  };
}

export function NodeBranchDialog({ sourceLabel, onApply, onClose }: NodeBranchDialogProps) {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<VariantDraft[]>(() => [0, 1].map((index) => createDraft(index, t("nodeStudio.branch.defaultVariant", { index: index + 1 }))));
  const nextVariant = useRef(2);
  const update = (index: number, patch: Partial<VariantDraft>) => {
    setDrafts((current) => current.map((draft, itemIndex) => itemIndex === index ? { ...draft, ...patch } : draft));
  };
  const remove = (index: number) => setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const add = () => setDrafts((current) => {
    if (current.length >= 4) return current;
    const index = nextVariant.current++;
    const draft = createDraft(index, t("nodeStudio.branch.defaultVariant", { index: index + 1 }));
    return [...current, draft];
  });
  const apply = () => onApply(drafts.map(toVariant));

  return <section className="node-template-picker" role="document">
    <header><div><p className="node-template-picker__eyebrow">{t("nodeStudio.branch.eyebrow")}</p><h2 id="node-branch-dialog-title">{t("nodeStudio.branch.title")}</h2><p>{sourceLabel}</p></div><button type="button" aria-label={t("nodeStudio.branch.close")} onClick={onClose}>×</button></header>
    <div className="node-template-picker__sections">
      {drafts.map((draft, index) => <fieldset key={draft.id} className="node-template-picker__card">
        <legend>{t("nodeStudio.branch.variantLegend", { index: index + 1 })}</legend>
        <label className="node-template-picker__search"><span>{t("nodeStudio.branch.label")}</span><input autoFocus={index === 0} value={draft.label} onChange={(event) => update(index, { label: event.target.value })} /></label>
        <label className="node-template-picker__search"><span>{t("nodeStudio.branch.provider")}</span><select value={draft.provider} onChange={(event) => update(index, { provider: event.target.value })}>{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
        <label className="node-template-picker__search"><span>{t("nodeStudio.branch.modelOverride")}</span><input value={draft.model} onChange={(event) => update(index, { model: event.target.value })} placeholder={t("nodeStudio.branch.currentModel")} /></label>
        <label className="node-template-picker__search"><span>{t("nodeStudio.branch.sizeOverride")}</span><input value={draft.size} onChange={(event) => update(index, { size: event.target.value })} placeholder={t("nodeStudio.branch.currentSize")} /></label>
        <button type="button" disabled={drafts.length <= 2} onClick={() => remove(index)}>{t("nodeStudio.branch.remove")}</button>
      </fieldset>)}
    </div>
    <footer><button type="button" disabled={drafts.length >= 4} onClick={add}>{t("nodeStudio.branch.add")}</button><span /><button type="button" onClick={onClose}>{t("nodeStudio.branch.cancel")}</button><button type="button" className="node-template-picker__copy" disabled={drafts.some((draft) => !draft.label.trim())} onClick={apply}>{t("nodeStudio.branch.create")}</button></footer>
  </section>;
}
