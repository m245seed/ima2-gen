import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { syncStarredAsset } from "../ui/src/lib/starAssetSync.ts";

type SyncApi = Parameters<typeof syncStarredAsset>[1];
type MockAsset = { id: string; tags: string[] };

const read = (path: string) => readFileSync(path, "utf8");
const promptStore = read("ui/src/store/storePromptImpl.ts");
const workspace = read("ui/src/components/assets/AssetsWorkspace.tsx");
const routes = read("routes/assets.ts");
const assetsStore = read("lib/assetsStore.ts");
const apiAssets = read("ui/src/lib/api-assets.ts");
const en = JSON.parse(read("ui/src/i18n/en.json")) as Record<string, Record<string, unknown>>;
const ko = JSON.parse(read("ui/src/i18n/ko.json")) as Record<string, Record<string, unknown>>;

function makeApi(existing: MockAsset[] = []) {
  const getCalls: unknown[] = [];
  const createCalls: unknown[] = [];
  const updateCalls: Array<{ id: string; patch: unknown }> = [];
  const api: SyncApi = {
    getAssets: async (input) => {
      getCalls.push(input);
      return { assets: existing };
    },
    createAsset: async (input) => {
      createCalls.push(input);
      return { asset: { id: "a_new", tags: input.tags } };
    },
    updateAsset: async (id, patch) => {
      updateCalls.push({ id, patch });
      return { asset: { id, tags: patch.tags } };
    },
  };
  return { api, getCalls, createCalls, updateCalls };
}

describe("star-to-assets and asset rename contract", () => {
  it("creates a missing asset with the starred tag", async () => {
    const mock = makeApi();
    const result = await syncStarredAsset(
      { filename: "hero.png", prompt: "Hero portrait", mediaType: "image" },
      mock.api,
    );

    assert.equal(result, "created");
    assert.deepEqual(mock.getCalls, [{
      kind: null, folderId: null, tag: null, q: "", filePath: "hero.png", limit: 1,
    }]);
    assert.deepEqual(mock.createCalls, [{
      filePath: "hero.png",
      kind: "image",
      name: "Hero portrait",
      tags: ["starred"],
      metadata: { origin: "star", mediaType: "image" },
    }]);
    assert.equal(mock.updateCalls.length, 0);
  });

  it("adds starred to an existing asset without discarding its tags", async () => {
    const mock = makeApi([{ id: "a_existing", tags: ["portrait"] }]);
    const result = await syncStarredAsset({ filename: "hero.png" }, mock.api);

    assert.equal(result, "tagged");
    assert.equal(mock.createCalls.length, 0);
    assert.deepEqual(mock.updateCalls, [{
      id: "a_existing",
      patch: { tags: ["portrait", "starred"] },
    }]);
  });

  it("does nothing when the exact asset is already starred", async () => {
    const mock = makeApi([{ id: "a_existing", tags: ["starred", "portrait"] }]);
    const result = await syncStarredAsset({ filename: "hero.png" }, mock.api);

    assert.equal(result, "noop");
    assert.equal(mock.createCalls.length, 0);
    assert.equal(mock.updateCalls.length, 0);
  });


  it("commits the favorite state before sync and never rolls it back on sync failure", () => {
    const favoriteCommit = promptStore.indexOf("const next = new Set(s.galleryFavorites)");
    const historyCommit = promptStore.indexOf("history: s.history.map");
    const syncCall = promptStore.indexOf("await syncStarredAsset");
    assert.ok(favoriteCommit >= 0 && historyCommit > favoriteCommit && syncCall > historyCommit);
    const syncCatch = promptStore.match(
      /try \{\s*const syncResult = await syncStarredAsset[\s\S]*?\} catch \(err\) \{([\s\S]*?)\n  \}/,
    );
    assert.ok(syncCatch, "asset sync must have its own catch boundary");
    assert.doesNotMatch(syncCatch[1], /\bset\s*\(/);
    assert.match(syncCatch[1], /showToast\(t\("assets\.starSaveFailed"\), true\)/);
  });

  it("returns after an OFF transition before asset sync", () => {
    assert.match(
      promptStore,
      /if \(!isFavorite\) return isFavorite;\s*try \{\s*const syncResult = await syncStarredAsset/,
    );
  });

  it("wires AssetMetaDetail rename through the parent and supports blur, Enter, and Escape", () => {
    assert.match(workspace, /function AssetMetaDetail\(\{ asset, onRename \}/);
    assert.match(workspace, /<AssetMetaDetail asset=\{selectedAsset\} onRename=\{/);
    assert.match(workspace, /<input[\s\S]*?autoFocus[\s\S]*?aria-label=\{t\("assets\.renameAsset"\)\}/);
    assert.match(workspace, /onBlur=\{\(\) => void commitRename\(\)\}/);
    assert.match(workspace, /event\.key === "Enter"[\s\S]*?commitRename\(\)/);
    assert.match(workspace, /event\.key === "Escape"[\s\S]*?setEditing\(false\)/);
    assert.match(workspace, /await onRename\(next\)/);
  });

  it("serializes an exact filePath filter and canonicalizes it with the storage helper", () => {
    assert.match(apiAssets, /export type GetAssetsParams = AssetsFilters &[\s\S]*?filePath\?: string/);
    assert.match(apiAssets, /if \(input\.filePath\) params\.set\("filePath", input\.filePath\)/);
    assert.match(routes, /canonicalizeStoredPath/);
    assert.match(routes, /queryStr\(req\.query\.filePath\)/);
    assert.match(routes, /filePath: filePath === undefined \? undefined : canonicalizeStoredPath\(filePath\) \?\? ""/);
    assert.match(assetsStore, /export function canonicalizeStoredPath/);
    assert.match(assetsStore, /filePath\?: string/);
    assert.match(assetsStore, /where\.push\("file_path = \?"\)/);
  });

  it("defines star and rename copy under assets in English and Korean", () => {
    for (const locale of [en, ko]) {
      assert.equal(typeof locale.assets.starSaved, "string");
      assert.equal(typeof locale.assets.starSaveFailed, "string");
      assert.equal(typeof locale.assets.renameAsset, "string");
    }
  });
});
