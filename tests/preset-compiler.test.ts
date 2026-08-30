import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compilePresets,
  type PresetDefinition,
  type PresetProvider,
} from "../lib/presetCompiler.ts";
import { buildIma2MetadataPayload, buildIma2Xmp, parseIma2Xmp } from "../lib/imageMetadata.ts";

const catalog: PresetDefinition[] = [
  {
    id: "camera",
    name: "Camera",
    category: "style",
    promptFragment: "default camera",
    perProvider: {
      gpt: { fragment: "gpt camera: orbit", params: { strength: 1, camera: true } },
    },
    modes: [] as unknown as ("image" | "both")[],
  },
  {
    id: "style",
    name: "Style",
    category: "style",
    promptFragment: "default style",
    perProvider: {
      gpt: { fragment: "gpt style", params: { strength: 2, style: true } },
    },
    modes: ["both"],
  },
  {
    id: "lighting",
    name: "Lighting",
    category: "lighting",
    promptFragment: "default lighting",
    perProvider: {
      gpt: { fragment: "gpt lighting" },
    },
    modes: ["both"],
  },
];

describe("compilePresets", () => {
  it("concatenates fragments", () => {
    const result = compilePresets({ catalog, presetIds: ["style", "lighting"], provider: "gpt", mode: "image" });
    assert.equal(result.promptFragment, "gpt style gpt lighting");
  });

  it("uses the provider fragment instead of the default", () => {
    const result = compilePresets({ catalog, presetIds: ["style"], provider: "gpt", mode: "image" });
    assert.equal(result.promptFragment, "gpt style");
  });

  it("shallow-merges params with later presets taking precedence", () => {
    const result = compilePresets({ catalog, presetIds: ["style", "lighting"], provider: "gpt", mode: "image" });
    assert.deepEqual(result.params, { strength: 2, style: true });
  });

  it("skips presets that do not support the requested mode", () => {
    const result = compilePresets({ catalog, presetIds: ["camera", "style"], provider: "gpt", mode: "image" });
    assert.deepEqual(result.appliedPresetIds, ["style"]);
    assert.deepEqual(result.skipped, ["camera"]);
  });

  it("records unknown IDs as skipped", () => {
    const result = compilePresets({ catalog, presetIds: ["missing", "style"], provider: "gpt", mode: "image" });
    assert.deepEqual(result.appliedPresetIds, ["style"]);
    assert.deepEqual(result.skipped, ["missing"]);
  });

  it("preserves selection order", () => {
    const result = compilePresets({ catalog, presetIds: ["lighting", "style"], provider: "gpt", mode: "image" });
    assert.equal(result.promptFragment, "gpt lighting gpt style");
    assert.deepEqual(result.appliedPresetIds, ["lighting", "style"]);
  });

  it("returns empty output for no selected presets", () => {
    const result = compilePresets({ catalog, presetIds: [], provider: "gpt", mode: "image" });
    assert.deepEqual(result, { promptFragment: "", params: {}, appliedPresetIds: [], skipped: [] });
  });

  it("matches the gpt-only provider snapshot", () => {
    const providers: PresetProvider[] = ["gpt"];
    const snapshot = providers.flatMap((provider) => catalog.map((preset) => {
      const result = compilePresets({
        catalog,
        presetIds: [preset.id],
        provider,
        mode: "image",
      });
      return {
        provider,
        presetId: preset.id,
        fragment: result.promptFragment,
      };
    }));

    assert.deepEqual(snapshot, [
      { provider: "gpt", presetId: "camera", fragment: "" },
      { provider: "gpt", presetId: "style", fragment: "gpt style" },
      { provider: "gpt", presetId: "lighting", fragment: "gpt lighting" },
    ]);
  });

  it("preserves preset IDs through the XMP payload round-trip", () => {
    const payload = buildIma2MetadataPayload({ prompt: "test", presetIds: ["style", 1, "lighting", "style"] });
    const parsed = parseIma2Xmp(buildIma2Xmp(payload));
    assert.deepEqual(parsed?.presetIds, ["style", "lighting"]);
  });
});
