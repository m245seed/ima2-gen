// WP2 (020): contract catalog SoT — projection regression + snapshot mapping.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENT_TOOL_MANIFEST, formatToolManifestForPrompt } from "../lib/agentToolManifest.js";
import { buildCatalog, catalogSummary } from "../lib/contracts/catalog.js";
import { BUILTIN_TOOL_CONTRACTS } from "../lib/contracts/builtins.js";

const manifestSnapshot = JSON.parse(readFileSync("tests/fixtures/contracts/agent-manifest.snapshot.json", "utf8")) as {
  manifest: unknown;
  prompt: string;
};

test("AGENT_TOOL_MANIFEST projection is byte-identical to the pre-migration snapshot", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(AGENT_TOOL_MANIFEST)), manifestSnapshot.manifest);
  assert.equal(formatToolManifestForPrompt(), manifestSnapshot.prompt);
});

test("builtin contracts carry catalog invariants", () => {
  for (const contract of BUILTIN_TOOL_CONTRACTS) {
    assert.equal(contract.namespace, "ima2");
    assert.equal(contract.trust, "builtin");
    assert.equal(contract.executionOwner, "ima2-server");
    assert.equal(contract.id, contract.name);
  }
});

test("buildCatalog with no snapshots returns only builtins", () => {
  const catalog = buildCatalog({ snapshots: [] });
  assert.equal(catalog.length, BUILTIN_TOOL_CONTRACTS.length);
  for (const contract of catalog) {
    assert.equal(contract.namespace, "ima2");
    assert.equal(contract.trust, "builtin");
  }
});
test("buildCatalog with no snapshots has unique builtin ids", () => {
  const catalog = buildCatalog({ snapshots: [] });
  const ids = catalog.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("catalogSummary reports namespace/availability distribution", () => {
  const summary = catalogSummary(buildCatalog({ snapshots: [] }));
  assert.equal(summary.total, BUILTIN_TOOL_CONTRACTS.length);
  assert.equal(summary.namespaces["ima2"].byAvailability["callable"], BUILTIN_TOOL_CONTRACTS.length);
});
