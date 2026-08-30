import type { GenerateItem } from "../types";

const STARRED_TAG = "starred";

type StarredAssetItem = { filename: string } & Partial<
  Pick<GenerateItem, "prompt" | "mediaType" | "url" | "image">
>;

type SyncedAsset = { id: string; tags: string[] };

export type StarAssetSyncApi = {
  getAssets: (input: {
    kind: null;
    folderId: null;
    tag: null;
    q: string;
    filePath: string;
    limit: number;
  }) => Promise<{ assets: SyncedAsset[] }>;
  createAsset: (input: {
    filePath: string;
    kind: "image";
    name: string;
    tags: string[];
    metadata: Record<string, unknown>;
  }) => Promise<{ asset: SyncedAsset }>;
  updateAsset: (id: string, patch: { tags: string[] }) => Promise<{ asset: SyncedAsset }>;
};

export async function syncStarredAsset(
  item: StarredAssetItem,
  api: StarAssetSyncApi,
): Promise<"created" | "tagged" | "noop"> {
  const page = await api.getAssets({
    kind: null,
    folderId: null,
    tag: null,
    q: "",
    filePath: item.filename,
    limit: 1,
  });
  const existing = page.assets[0];
  if (existing?.tags.includes(STARRED_TAG)) return "noop";
  if (existing) {
    await api.updateAsset(existing.id, { tags: [...new Set([...existing.tags, STARRED_TAG])] });
    return "tagged";
  }

  const kind = "image";
  await api.createAsset({
    filePath: item.filename,
    kind,
    name: item.prompt?.trim().slice(0, 80) || item.filename,
    tags: [STARRED_TAG],
    metadata: { origin: "star", mediaType: kind },
  });
  return "created";
}
