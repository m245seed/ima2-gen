import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "ima2-models-cli-"));
let server: Server;
let base = "";

const catalog = {
  ok: true,
  lanes: {
    oauth: {
      status: "ready", defaults: { image: "gpt-5.6-luna" },
      models: { image: [{ id: "gpt-5.6-luna", label: "Luna", capabilities: { parameters: [], inputRoles: ["text"] } }] },
    },
    api: {
      status: "key-missing", defaults: { image: "gpt-5.6-luna" },
      models: { image: [{ id: "gpt-5.6-luna", label: "Luna", capabilities: { parameters: [], inputRoles: ["text"] } }] },
    },
  },
};

function runCli(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "bin/ima2.ts", ...args], {
      cwd: process.cwd(), env: { ...process.env, NO_COLOR: "1", IMA2_SERVER: "", IMA2_CONFIG_DIR: HOME },
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/api/health") { res.setHeader("Content-Type", "application/json"); res.end('{"ok":true}'); return; }
    if (req.url === "/api/models") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(catalog)); return; }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(HOME, { recursive: true, force: true });
});

describe("ima2 models command", () => {
  it("renders a lane/model/status/capability table", async () => {
    const result = await runCli(["models", "--server", base]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /lane\s+kind\s+model-id\s+status\s+caps/);
    assert.match(result.stdout, /oauth\s+image\s+gpt-5\.6-luna\s+ready/);
    assert.match(result.stdout, /api\s+image\s+gpt-5\.6-luna\s+key-missing/);
  });

  it("keeps the stable JSON shape and applies lane filters", async () => {
    const result = await runCli(["models", "--lane", "oauth", "--json", "--server", base]);
    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.deepEqual(Object.keys(payload.kinds.image[0]), ["lane", "id", "label", "status", "capabilities"]);
    assert.equal(payload.kinds.image[0].lane, "oauth");
    assert.equal(payload.kinds.image[0].status, "ready");
  });

  it("returns exit 3 and one JSON document when the server is unreachable", async () => {
    const result = await runCli(["models", "--json", "--server", "http://127.0.0.1:1"]);
    assert.equal(result.code, 3);
    assert.equal(JSON.parse(result.stdout).code, "SERVER_UNREACHABLE");
    assert.equal(result.stdout.trim().split("\n").length, 1);
  });

});
