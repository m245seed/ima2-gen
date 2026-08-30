import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { ELEMENT_CAPACITY_DEFAULTS } from "../lib/elementCompiler.js";
import { REGISTRY } from "../lib/providers/registry.ts";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const CORE_IDS = ["oauth", "api"];
const OPENAI_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
const CLI_IMAGE_MODELS = [
  ...OPENAI_MODELS,
  "gpt-5.3-codex-spark",
];

function provider(id: string) {
  return REGISTRY.find((entry) => entry.id === id)!;
}

function models(id: string, kind: "image") {
  return provider(id).models.filter((model) => model.kind === kind).map((model) => model.id);
}

function referenceLimits(mode: "image" | "edit") {
  return Object.fromEntries(REGISTRY.flatMap((entry) => {
    const limits = entry.referenceLimits as Partial<Record<typeof mode, number>>;
    return limits[mode] === undefined ? [] : [[entry.id, limits[mode]]];
  }));
}

describe("core provider registry parity", () => {
  it("preserves core ids and model sets exactly", () => {
    assert.deepEqual(REGISTRY.map((entry) => entry.id), CORE_IDS);
    assert.deepEqual(models("oauth", "image").filter((id) => id !== "gpt-5.3-codex-spark"), OPENAI_MODELS);
    assert.deepEqual(models("oauth", "image").filter((id) => id === "gpt-5.3-codex-spark"), ["gpt-5.3-codex-spark"]);
    assert.deepEqual(models("api", "image"), OPENAI_MODELS);
    const cliModels = [...new Set(REGISTRY.flatMap((entry) => models(entry.id, "image")))];
    assert.deepEqual(cliModels, CLI_IMAGE_MODELS);
    assert.deepEqual([...config.imageModels.valid], OPENAI_MODELS);
  });

  it("preserves reference-capacity layers", () => {
    assert.equal(config.limits.maxRefCount, 5);
    assert.deepEqual(referenceLimits("image"), {});
    assert.deepEqual(ELEMENT_CAPACITY_DEFAULTS, {
      gpt: { image: { maxTotalRefs: 6, maxRefsPerElement: 6 }, edit: { maxTotalRefs: 6, maxRefsPerElement: 6 } },
    });
  });

  it("declares mask support exactly where the edit route allows it", () => {
    const editSource = readFileSync(join(repoRoot, "routes/edit.ts"), "utf8");
    const adapterSource = readFileSync(join(repoRoot, "lib/responsesImageAdapter.ts"), "utf8");
    assert.match(editSource, /editViaResponses\(/);
    assert.match(adapterSource, /\bmask\?: string(?: \| undefined)?;/);

    for (const entry of REGISTRY) {
      for (const model of entry.models) {
        if (model.kind !== "image") continue;
        const expected = Object.values(model.supports).some(Boolean);
        assert.equal(
          model.supports.mask,
          expected,
          `${entry.id}/${model.id} mask capability must match the edit route`,
        );
      }
    }
  });

  it("keeps credential metadata faithful to runtime plumbing", () => {
    const configSource = readFileSync(join(repoRoot, "config.ts"), "utf8");
    const oauthCredential = provider("oauth").credentials[0] as { envVars: readonly string[] };
    assert.match(configSource, /env\.IMA2_OAUTH_PROXY_PORT, env\.OAUTH_PORT/);
    assert.deepEqual([...oauthCredential.envVars], ["IMA2_OAUTH_PROXY_PORT", "OAUTH_PORT"]);

    // Timeouts must match what the runtime actually uses.
    assert.equal(provider("oauth").limits.timeoutMs, config.oauth.generationTimeoutMs);
  });
});
