import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  compileElements,
  ELEMENT_CAPACITY_DEFAULTS,
  ElementNotesTooLongError,
  ElementRefsEmptyError,
  UnknownElementIdError,
  type ElementDefinition,
} from "../lib/elementCompiler.ts";
import { compilePresets, type PresetDefinition } from "../lib/presetCompiler.ts";

function element(id: string, overrides: Partial<ElementDefinition> = {}): ElementDefinition {
  return {
    id,
    name: id,
    kind: "character",
    refs: [`/${id}.png`],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function compile(elementIds: string[], elements: ElementDefinition[], overrides = {}) {
  return compileElements({
    elementIds,
    elements: new Map(elements.map((item) => [item.id, item])),
    existingRefs: [],
    provider: "gpt",
    mode: "image",
    capacity: ELEMENT_CAPACITY_DEFAULTS.gpt.image,
    ...overrides,
  });
}

describe("compileElements", () => {
  it("expands a six-reference character element into six slots", () => {
    const result = compile(["hero"], [element("hero", { refs: Array.from({ length: 6 }, (_, index) => `/hero-${index}.png`) })]);
    assert.equal(result.referenceSlots.length, 6);
    assert.deepEqual(result.referenceSlots.map((slot) => slot.path), Array.from({ length: 6 }, (_, index) => `/hero-${index}.png`));
  });

  it("orders slots by selected element order", () => {
    const result = compile(["second", "first"], [element("first"), element("second")]);
    assert.deepEqual(result.referenceSlots.map((slot) => slot.elementId), ["second", "first"]);
  });


  it("preserves continuity references in edit mode", () => {
    const result = compile(["hero"], [element("hero", { refs: ["/hero-1.png", "/hero-2.png"] })], {
      existingRefs: [{ source: "continuity", path: "/previous.png" }],
      provider: "gpt", mode: "edit", capacity: { maxTotalRefs: 2, maxRefsPerElement: 6 },
    });
    // retainedExistingRefs are canonicalized via path.resolve — platform-aware (260719).
    assert.deepEqual(result.retainedExistingRefs, [{ source: "continuity", path: resolve("/previous.png") }]);
    assert.equal(result.referenceSlots.length, 1);
  });

  it("rejects notes-only elements without usable reference slots", () => {
    assert.throws(
      () => compile(["mood"], [element("mood", { refs: [], notes: "Use a quiet, noir mood." })]),
      ElementRefsEmptyError,
    );
  });

  it("deduplicates selected element IDs", () => {
    const result = compile(["hero", "hero"], [element("hero")]);
    assert.deepEqual(result.elementIds, ["hero"]);
    assert.equal(result.referenceSlots.length, 1);
  });

  it("deduplicates duplicate reference paths", () => {
    const result = compile(["hero"], [element("hero", { refs: ["/same.png", " /same.png "] })]);
    assert.equal(result.referenceSlots.length, 1);
    assert.deepEqual(result.droppedRefs, [{ path: " /same.png ", reason: "duplicate_higher_priority_source", elementId: "hero" }]);
  });

  it("throws for unknown element IDs under the error policy", () => {
    assert.throws(() => compile(["missing"], []), UnknownElementIdError);
  });

  it("collects unknown element IDs under the collect policy", () => {
    const result = compile(["missing", "hero"], [element("hero")], { missingPolicy: "collect" });
    assert.deepEqual(result.missingElementIds, ["missing"]);
    assert.deepEqual(result.elementIds, ["missing", "hero"]);
  });

  it("throws when a referenced element has no usable refs", () => {
    assert.throws(() => compile(["hero"], [element("hero", { refs: ["", " "] })]), ElementRefsEmptyError);
  });

  it("gives direct composer refs priority over duplicate element refs", () => {
    const result = compile(["hero"], [element("hero", { refs: ["/same.png"] })], {
      existingRefs: [{ source: "composer", path: "/same.png" }],
    });
    assert.deepEqual(result.retainedExistingRefs, [{ source: "composer", path: resolve("/same.png") }]);
    assert.deepEqual(result.referenceSlots, []);
    assert.deepEqual(result.droppedRefs, [{ path: "/same.png", reason: "duplicate_higher_priority_source", elementId: "hero" }]);
  });

  it("preserves preset and element note fragments together", () => {
    const catalog: PresetDefinition[] = [{ id: "film", name: "Film", category: "style", promptFragment: "cinematic grain", perProvider: {}, modes: ["both"] }];
    const preset = compilePresets({ catalog, presetIds: ["film"], provider: "gpt", mode: "image" });
    const compiled = compile(["hero"], [element("hero", { notes: "Keep the red coat." })]);
    assert.equal(`${preset.promptFragment}\n${compiled.notesFragment}`, "cinematic grain\n[Element: hero] Keep the red coat.");
  });

  it("omits whitespace-only notes", () => {
    const result = compile(["hero"], [element("hero", { notes: "  \n " })]);
    assert.equal(result.notesFragment, "");
  });

  it("rejects notes longer than 800 characters", () => {
    assert.throws(() => compile(["hero"], [element("hero", { notes: "x".repeat(801) })]), ElementNotesTooLongError);
  });

  it("preserves selection order in the compiled element IDs", () => {
    const result = compile(["style", "product", "hero"], [element("hero"), element("product"), element("style")]);
    assert.deepEqual(result.elementIds, ["style", "product", "hero"]);
  });
});
