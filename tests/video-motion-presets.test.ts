import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMotionFragment,
  MOTION_PRESETS,
} from "../lib/videoMotionPresets.ts";
import { toggleMotionPreset } from "../ui/src/lib/videoMotionSelection.ts";

const emptySelection = { ids: [] };

describe("video motion preset selection", () => {
  it("VM-01 adds dolly-in when toggled", () => {
    assert.deepEqual(
      toggleMotionPreset(emptySelection, "motion-dolly-in", MOTION_PRESETS),
      { ids: ["motion-dolly-in"] },
    );
  });

  it("VM-02 removes a selected preset when toggled again", () => {
    assert.deepEqual(
      toggleMotionPreset({ ids: ["motion-dolly-in"] }, "motion-dolly-in", MOTION_PRESETS),
      emptySelection,
    );
  });

  it("VM-03 rejects opposing dolly directions", () => {
    assert.deepEqual(
      toggleMotionPreset({ ids: ["motion-dolly-in"] }, "motion-dolly-out", MOTION_PRESETS),
      { ids: ["motion-dolly-in"], rejected: { id: "motion-dolly-out", reason: "EXCLUSIVE" } },
    );
  });

  it("VM-04 permits orbit with hyperlapse", () => {
    assert.deepEqual(
      toggleMotionPreset({ ids: ["motion-orbit-left"] }, "motion-hyperlapse", MOTION_PRESETS),
      { ids: ["motion-orbit-left", "motion-hyperlapse"] },
    );
  });

  it("VM-05 rejects handheld when static is selected", () => {
    assert.deepEqual(
      toggleMotionPreset({ ids: ["motion-static"] }, "motion-handheld", MOTION_PRESETS),
      { ids: ["motion-static"], rejected: { id: "motion-handheld", reason: "EXCLUSIVE" } },
    );
  });

  it("VM-06 rejects a fourth selection at the default limit", () => {
    const state = { ids: ["motion-dolly-in", "motion-hyperlapse", "motion-whip-pan"] };
    assert.deepEqual(
      toggleMotionPreset(state, "motion-crane-up", MOTION_PRESETS),
      { ids: state.ids, rejected: { id: "motion-crane-up", reason: "LIMIT" } },
    );
  });

  it("keeps the prior selection immutable when a limit rejection occurs", () => {
    const state = { ids: ["motion-dolly-in", "motion-hyperlapse", "motion-whip-pan"] };
    toggleMotionPreset(state, "motion-crane-up", MOTION_PRESETS);
    assert.deepEqual(state, { ids: ["motion-dolly-in", "motion-hyperlapse", "motion-whip-pan"] });
  });

  it("VM-07 throws for an unknown motion preset", () => {
    assert.throws(
      () => toggleMotionPreset(emptySelection, "motion-unknown", MOTION_PRESETS),
      /Unknown video motion preset: motion-unknown/,
    );
  });

  it("VM-08 compiles the GPT dolly-in fragment", () => {
    assert.equal(
      getMotionFragment("motion-dolly-in", "gpt"),
      "Use a slow dolly-in camera move toward the subject.",
    );
  });


  it("clears a prior rejection after a successful toggle", () => {
    assert.deepEqual(
      toggleMotionPreset(
        { ids: ["motion-dolly-in"], rejected: { id: "motion-dolly-out", reason: "EXCLUSIVE" } },
        "motion-hyperlapse",
        MOTION_PRESETS,
      ),
      { ids: ["motion-dolly-in", "motion-hyperlapse"] },
    );
  });

  it("VM-11 preserves persisted selection order when restoring and extending it", () => {
    const restored = { ids: ["motion-hyperlapse", "motion-orbit-left"] };
    assert.deepEqual(
      toggleMotionPreset(restored, "motion-crane-up", MOTION_PRESETS),
      { ids: ["motion-hyperlapse", "motion-orbit-left", "motion-crane-up"] },
    );
  });

  it("VM-12 applies a lower provider limit dynamically", () => {
    assert.deepEqual(
      toggleMotionPreset({ ids: ["motion-hyperlapse"] }, "motion-orbit-left", MOTION_PRESETS, 1),
      { ids: ["motion-hyperlapse"], rejected: { id: "motion-orbit-left", reason: "LIMIT" } },
    );
  });
});
