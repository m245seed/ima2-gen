import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { useI18n } from "../../i18n";
import { deleteAsset, promoteToElement } from "../../lib/api-assets";
import { elementSourceTag, findElementForSource, loadAllElementAssets } from "../../lib/elementMembership";
import type { AssetItem } from "../../store/storeTypes";
import { useAppStore } from "../../store/useAppStore";

type MembershipSnapshot = {
  status: "idle" | "loading" | "ready" | "error";
  elements: readonly AssetItem[];
};

let membershipSnapshot: MembershipSnapshot = { status: "idle", elements: [] };
let membershipLoad: Promise<boolean> | null = null;
const membershipListeners = new Set<() => void>();

function emitMemberships(next: MembershipSnapshot): void {
  membershipSnapshot = next;
  membershipListeners.forEach((listener) => listener());
}

function subscribeMemberships(listener: () => void): () => void {
  membershipListeners.add(listener);
  return () => membershipListeners.delete(listener);
}

function loadMemberships(force = false): Promise<boolean> {
  if (!force && membershipSnapshot.status === "ready") return Promise.resolve(true);
  if (membershipLoad) return membershipLoad;
  emitMemberships({ ...membershipSnapshot, status: "loading" });
  membershipLoad = loadAllElementAssets()
    .then((elements) => { emitMemberships({ status: "ready", elements }); return true; })
    .catch((error) => { console.error("[ElementMembership] load failed", error); emitMemberships({ ...membershipSnapshot, status: "error" }); return false; })
    .finally(() => { membershipLoad = null; });
  return membershipLoad;
}

function upsertMembership(element: AssetItem): void {
  const elements = [element, ...membershipSnapshot.elements.filter((item) => item.id !== element.id)];
  emitMemberships({ status: "ready", elements });
}

function removeMembership(elementId: string): void {
  emitMemberships({ status: "ready", elements: membershipSnapshot.elements.filter((item) => item.id !== elementId) });
}

function stopPointer(event: PointerEvent<HTMLButtonElement>): void { event.stopPropagation(); }
function stopMouse(event: MouseEvent<HTMLButtonElement>): void { event.stopPropagation(); }
function stopKey(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}

async function mutateMembership(item: AssetItem, linked: AssetItem | null): Promise<void> {
  if (linked) {
    await deleteAsset(linked.id);
    removeMembership(linked.id);
    return;
  }
  const { asset } = await promoteToElement({
    result: { filePath: item.filePath ?? undefined },
    sourceAssetId: item.id,
    elementKind: "character",
    name: item.name,
    notes: item.notes ?? undefined,
    folderId: item.folderId,
    tags: [elementSourceTag(item.id)],
  });
  upsertMembership(asset);
}

function ElementToggleButton({ active, busy, label, onToggle }: {
  active: boolean;
  busy: boolean;
  label: string;
  onToggle: () => void;
}) {
  return <button type="button" className={`asset-element-toggle${active ? " is-active" : ""}`}
    title={label} aria-label={label} aria-pressed={active} aria-busy={busy || undefined} disabled={busy}
    onPointerDown={stopPointer} onDoubleClick={stopMouse} onKeyDown={stopKey}
    onClick={(event) => { event.stopPropagation(); onToggle(); }}>
    <span className="asset-element-toggle__glyph" aria-hidden="true">@</span>
  </button>;
}

export function AssetElementToggle({ item }: { item: AssetItem }) {
  const { t } = useI18n();
  const showToast = useAppStore((state) => state.showToast);
  const deleteAssetItem = useAppStore((state) => state.deleteAssetItem);
  const [pending, setPending] = useState(false);
  const isElement = item.kind === "element";
  const supported = isElement || ((item.kind === "image" || false) && Boolean(item.filePath));
  const label = t("assets.elementLibrary");
  const memberships = useSyncExternalStore(subscribeMemberships, () => membershipSnapshot, () => membershipSnapshot);
  const linked = !isElement && supported ? findElementForSource(memberships.elements, item.id) : null;
  const busy = pending || memberships.status === "loading" || memberships.status === "idle";

  useEffect(() => { if (supported && !isElement) void loadMemberships(); }, [supported, isElement]);

  // Element items: active toggle — pressing it removes the element from the
  // library (the counterpart of toggling the source asset on).
  if (isElement) {
    const demote = async (): Promise<void> => {
      if (pending) return;
      setPending(true);
      try {
        if (await deleteAssetItem(item.id)) removeMembership(item.id);
        else showToast(t("assets.actionFailed"), true);
      } finally {
        setPending(false);
      }
    };
    return <ElementToggleButton active busy={pending} label={t("assets.removeFromElements")} onToggle={() => void demote()} />;
  }

  if (!supported) return null;

  async function toggle(): Promise<void> {
    if (pending || memberships.status === "loading") return;
    if (memberships.status !== "ready" && !await loadMemberships(true)) {
      showToast(t("assets.actionFailed"), true);
      return;
    }
    const currentLinked = findElementForSource(membershipSnapshot.elements, item.id);
    setPending(true);
    try {
      await mutateMembership(item, currentLinked);
    } catch (error) {
      console.error("[ElementMembership] toggle failed", error);
      showToast(t("assets.actionFailed"), true);
    } finally {
      setPending(false);
    }
  }

  return <ElementToggleButton active={Boolean(linked)} busy={busy} label={label} onToggle={() => void toggle()} />;
}
