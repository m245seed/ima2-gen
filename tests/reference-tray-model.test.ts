import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allocateAttachmentTag,
  findTrayTagTokens,
  hasTrayCapacity,
  indexTrayTags,
  isRetiredTrayTag,
  materializeLegacyFields,
  physicalSourceCount,
  retireTrayTags,
  reviveTrayTag,
  uniquifyElementTag,
  type TrayItem,
} from "../ui/src/lib/referenceTray.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function attachment(tag: string, dataUrl = `data:image/png;base64,${tag}`): TrayItem {
  return {
    kind: "attachment",
    tokenId: `token-${tag}`,
    tag,
    insertedAt: 1,
    source: { dataUrl, mimeType: "image/png", origin: "file" },
  };
}

function element(tag: string, elementId: string, refs: string[] = []): TrayItem {
  return {
    kind: "element",
    tokenId: `token-${elementId}`,
    tag,
    insertedAt: 1,
    source: {
      elementId,
      nameAtInsertion: tag,
      referenceFilenames: refs,
    },
  };
}

test("attachment tags skip occupied ordinals and element tags stay unique within 32 chars", () => {
  assert.deepEqual(
    allocateAttachmentTag(1, ["Image_1", "Image_3"]),
    { tag: "Image_2", nextAttachmentOrdinal: 3 },
  );
  assert.deepEqual(
    allocateAttachmentTag(3, ["Image_1", "Image_3"]),
    { tag: "Image_4", nextAttachmentOrdinal: 5 },
  );

  const base = "가".repeat(32);
  const unique = uniquifyElementTag(base, [base, `${"가".repeat(30)}_2`]);
  assert.equal(unique, `${"가".repeat(30)}_3`);
  assert.equal(unique.length, 32);

  const indexed = indexTrayTags([attachment("Image_1"), element(unique, "element-1")]);
  assert.equal(indexed.get(unique)?.kind, "element");
});

test("retired tag join detects only real tombstones without email, handle, or CJK false positives", () => {
  const removed = element("지피", "element-cjk");
  const retiredTags = retireTrayTags({}, [removed], 1234);
  const prompt = "mail a@b.com @runwayml (@지피), foo,@지피 그리고 [@Image_9].";
  const tokens = findTrayTagTokens(prompt);

  assert.deepEqual(tokens.map((token) => token.tag), ["runwayml", "지피", "Image_9"]);
  const dead = tokens.filter((token) => isRetiredTrayTag(retiredTags, token.tag));
  assert.deepEqual(dead.map((token) => token.tag), ["지피"]);

  const revived = reviveTrayTag(retiredTags, "지피");
  assert.equal(isRetiredTrayTag(revived, "지피"), false);
  assert.deepEqual(reviveTrayTag(revived, "runwayml"), revived);

  const prototypeNamed = findTrayTagTokens("@constructor @__proto__");
  assert.equal(prototypeNamed.some((token) => isRetiredTrayTag({}, token.tag)), false);

  const retiredAgain = retireTrayTags(revived, [removed], 5678);
  assert.equal(retiredAgain.지피, 5678);
});

test("legacy fields materialize synchronously from the tray after every mutation", () => {
  let items: TrayItem[] = [];
  assert.deepEqual(materializeLegacyFields(items), {
    referenceImages: [],
    selectedElementIds: [],
  });

  items = [...items, attachment("Image_1", "data:image/png;base64,one")];
  assert.deepEqual(materializeLegacyFields(items), {
    referenceImages: ["data:image/png;base64,one"],
    selectedElementIds: [],
  });

  items = [...items, element("hero", "element-hero", ["hero-a.png", "hero-b.png"])];
  assert.deepEqual(materializeLegacyFields(items), {
    referenceImages: ["data:image/png;base64,one"],
    selectedElementIds: ["element-hero"],
  });

  items = items.filter((item) => item.kind !== "attachment");
  assert.deepEqual(materializeLegacyFields(items), {
    referenceImages: [],
    selectedElementIds: ["element-hero"],
  });

  items = [];
  assert.deepEqual(materializeLegacyFields(items), {
    referenceImages: [],
    selectedElementIds: [],
  });
});

test("logical N+M capacity blocks additions without truncating an over-limit tray", () => {
  const items = [
    attachment("Image_1"),
    attachment("Image_2"),
    element("hero", "element-hero", ["hero.png"]),
  ];
  assert.equal(hasTrayCapacity(items.slice(0, 2), 3), true);
  assert.equal(hasTrayCapacity(items, 3), false);
  assert.equal(hasTrayCapacity(items, 2), false);
  assert.equal(items.length, 3);
});

test("physical source count expands element reference snapshots", () => {
  const items = [
    attachment("Image_1"),
    element("hero", "element-hero", ["hero-a.png", "hero-b.png", "hero-c.png"]),
    element("empty", "element-empty"),
  ];
  assert.equal(physicalSourceCount(items), 4);
});

test("store compatibility actions converge on the single tray mutation writer", () => {
  const referenceStore = readFileSync(join(root, "ui/src/store/storeReferenceImpl.ts"), "utf8");
  const appStore = readFileSync(join(root, "ui/src/store/useAppStore.ts"), "utf8");

  assert.equal((referenceStore.match(/materializeLegacyFields\(trayItems\)/g) ?? []).length, 1);
  assert.doesNotMatch(referenceStore, /referenceImages\s*:/);
  assert.doesNotMatch(referenceStore, /selectedElementIds\s*:/);
  assert.match(referenceStore, /function mutateTray</);
  assert.match(referenceStore, /addPreparedAttachments\(valid, set\)/);
  assert.match(referenceStore, /addTrayAttachmentDataUrlImpl\(dataUrl, "gallery", set, get\)/);
  assert.match(referenceStore, /removeTrayItemImpl\(item\.tokenId, set, get\)/);
  assert.match(referenceStore, /removed\.source\.dataUrl === state\.canvasReferenceImage/);
  assert.match(appStore, /addElementId: \(id\) => \{ addTrayElementImpl\(id, set, get\); \}/);
  assert.match(appStore, /removeElementId: \(id\) => removeTrayElementImpl\(id, set, get\)/);
  assert.match(appStore, /clearTray: \(\) => clearTrayImpl\(set, get\)/);
  assert.match(appStore, /physicalSourceCount: \(\) => countPhysicalSources\(get\(\)\.trayItems\)/);
  assert.match(referenceStore, /clearTrayImpl[\s\S]*?trayItems: \[\],[\s\S]*?retiredTags: \{\}/);
});
