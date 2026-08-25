import { useAppStore } from "../store/useAppStore";
import type { GenerateItem } from "../types";

export type ContinueableItem = Pick<GenerateItem, "image"> & {
  url?: string;
  filename?: string;
  prompt?: string | null;
  providerUrl?: string | null;
};

export type ContinueResult = {
  ok: boolean;
  isVideo: false;
  hasPrompt: boolean;
};

export async function continueFromItem(item: ContinueableItem): Promise<ContinueResult> {
  const store = useAppStore.getState();
  const hasPrompt = Boolean(item.prompt);
  store.clearReferences();
  store.setPrompt(hasPrompt ? item.prompt ?? "" : "");
  await store.useImageAsReference(item as GenerateItem);
  return { ok: true, isVideo: false, hasPrompt };
}

export async function continueFromItemAsUrl(
  item: ContinueableItem & { providerUrl?: string | null },
): Promise<ContinueResult> {
  const result = await continueFromItem(item);
  if (item.providerUrl) useAppStore.getState().setProviderUrlReference(item.providerUrl);
  return result;
}
