import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { elementPreviewPath, elementSourceTag, findElementForSource, loadAllElementAssets } from "../ui/src/lib/elementMembership.ts";
import type { AssetItem } from "../ui/src/store/storeTypes.ts";

const read = (path: string): string => readFileSync(path, "utf8");

function asset(overrides: Partial<AssetItem>): AssetItem {
  return {
    id: "a_default",
    kind: "element",
    name: "Element",
    filePath: null,
    folderId: null,
    notes: null,
    metadata: null,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("asset Element quick-register contract", () => {
  it("loads every Element page once and removes duplicate ids", async () => {
    const calls: Array<string | null> = [];
    const items = await loadAllElementAssets(async (input) => {
      calls.push(input.cursor ?? null);
      if (!input.cursor) return { assets: [asset({ id: "e1" })], nextCursor: "next" };
      return { assets: [asset({ id: "e1" }), asset({ id: "e2" })], nextCursor: null };
    });
    assert.deepEqual(calls, [null, "next"]);
    assert.deepEqual(items.map((item) => item.id), ["e1", "e2"]);
  });

  it("restores membership from source metadata or its server-owned marker without touching starred", () => {
    const linked = asset({ id: "e1", metadata: { sourceAssetId: "source", refs: ["hero.png"] }, tags: [elementSourceTag("source")] });
    assert.equal(findElementForSource([linked], "source")?.id, "e1");
    assert.equal(findElementForSource([asset({ id: "e2", tags: [elementSourceTag("fallback"), "starred"] })], "fallback")?.id, "e2");
    assert.equal(elementSourceTag("source"), "element-source:source");
    assert.deepEqual(linked.tags, ["element-source:source"]);
    assert.equal(elementPreviewPath(linked), "hero.png");
  });

  it("renders an isolated pressed-state button only for file-backed image sources", () => {
    const control = read("ui/src/components/assets/AssetElementToggle.tsx");
    const grid = read("ui/src/components/assets/AssetsGrid.tsx");
    const css = read("ui/src/styles/assets-workspace.css");
    assert.match(control, /item\.kind === "image"/);
    assert.match(control, /if \(!supported\) return null/);
    assert.match(control, /aria-pressed=\{active\}/);
    assert.match(control, /sourceAssetId: item\.id/);
    assert.match(control, /elementKind: "character"/);
    assert.match(control, /onPointerDown=\{stopPointer\}/);
    assert.match(control, /removeFromElements/);
    assert.doesNotMatch(control, /is-readonly/);
    assert.match(grid, /<FavoriteStarButton[\s\S]*?<AssetElementToggle item=\{item\} \/>/);
    assert.match(css, /\.assets-tile \.asset-element-toggle \{[^}]*border: 1px solid[^}]*background: color-mix/);
    assert.match(css, /\.assets-tile \.asset-element-toggle\.is-active \{ color: var\(--red\); \}/);
    assert.doesNotMatch(css, /\.assets-tile \.asset-element-toggle\.is-active \{[^}]*background/);
    assert.doesNotMatch(css, /\.assets-tile \.asset-element-toggle\.is-active,[^{]*\{ opacity: 1; \}/);
    assert.match(css, /\.assets-tile \.asset-element-toggle:hover[^}]*\.assets-tile \.asset-element-toggle:focus-visible[^}]*\{ opacity: 1; \}/);
    assert.match(css, /\.assets-tile \.asset-element-toggle:disabled \{ cursor: wait; opacity: \.56; \}/);
    assert.match(css, /@media \(hover: none\), \(pointer: coarse\) \{\s*\.assets-tile \.asset-element-toggle \{ left: 55px; width: 44px; height: 44px/);
    assert.match(css, /prefers-reduced-motion:[\s\S]*?\.assets-tile \.asset-element-toggle \{ transition: none; \}/);
    assert.match(css, /forced-colors:[\s\S]*?\.assets-tile \.asset-element-toggle \{ border-color: ButtonText; \}/);
    assert.match(css, /forced-colors:[\s\S]*?\.assets-tile \.asset-element-toggle\.is-active \{ color: Highlight; \}/);
  });

  it("hydrates Create from the Element-only loader and uses metadata refs for thumbnails", () => {
    const composer = read("ui/src/components/PromptComposer.tsx");
    assert.match(composer, /loadAllElementAssets\(\)/);
    assert.match(composer, /setElements\(items\)/);
    assert.match(composer, /elementPreviewPath\(asset\)/);
    assert.doesNotMatch(composer, /allAssets\.filter\(\(asset\) => asset\.kind === "element"\)/);
  });
});
