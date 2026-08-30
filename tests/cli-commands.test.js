import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PORT = String(3900 + Math.floor(Math.random() * 80));
const FAKE_HOME = mkdtempSync(join(tmpdir(), "ima2-cmd-home-"));

function runCLI(args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", ["--import", "tsx", "bin/ima2.ts", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: FAKE_HOME, USERPROFILE: FAKE_HOME, ...extraEnv },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

const HEALTH_TIMEOUT = process.platform === "win32" ? 30000 : 8000;

async function waitForHealth(base, timeoutMs = HEALTH_TIMEOUT) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server not healthy");
}

describe("ima2 CLI commands (live server)", () => {
  let server;
  let serverStderr = "";

  before(async () => {
    server = spawn("node", ["--import", "tsx", "server.ts"], {
      env: {
        ...process.env,
        PORT,
        HOME: FAKE_HOME,
        USERPROFILE: FAKE_HOME,
        IMA2_NO_OAUTH_PROXY: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stderr.on("data", (d) => {
      serverStderr += d.toString();
      if (process.env.DEBUG_TEST) process.stderr.write(d);
    });
    try {
      await waitForHealth(`http://localhost:${PORT}`);
    } catch (err) {
      process.stderr.write(`\n[server stderr on health-timeout]\n${serverStderr}\n`);
      throw err;
    }
  });

  after(async () => {
    if (server && !server.killed) {
      server.kill("SIGTERM");
      await new Promise((r) => server.on("exit", r));
    }
    try { rmSync(FAKE_HOME, { recursive: true, force: true }); } catch {}
  });

  it("ima2 ping reaches advertised server", async () => {
    const { stdout, code } = await runCLI(["ping"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /http:\/\/(?:localhost|127\.0\.0\.1):/);
    assert.match(stdout, /v\d/);
  });

  it("ima2 ping --json returns parseable shape", async () => {
    const { stdout, code } = await runCLI(["ping", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.strictEqual(obj.ok, true);
    assert.strictEqual(obj.provider, "oauth");
    assert.ok(Number.isFinite(obj.activeJobs));
  });

  it("ima2 ps --json returns empty jobs", async () => {
    const { stdout, code } = await runCLI(["ps", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.ok(Array.isArray(obj.jobs));
  });

  it("ima2 ps --terminal --json includes terminal jobs", async () => {
    const { stdout, code } = await runCLI(["ps", "--terminal", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.ok(Array.isArray(obj.jobs));
    assert.ok(Array.isArray(obj.terminalJobs));
  });

  it("ima2 gen without prompt exits 2", async () => {
    const { code, stderr } = await runCLI(["gen"]);
    assert.strictEqual(code, 2, String(stderr).slice(0, 800));
    assert.match(stderr, /prompt/i);
  });

  it("ima2 gen --help prints usage", async () => {
    const { stdout, code } = await runCLI(["gen", "--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /ima2 gen/);
    assert.match(stdout, /--quality/);
    assert.match(stdout, /--model/);
    assert.match(stdout, /--provider/);
    assert.match(stdout, /--mode/);
    assert.match(stdout, /--moderation/);
    assert.match(stdout, /--session/);
    assert.match(stdout, /--ref <file>/);
    assert.match(stdout, /Batch\/async note:/);
    assert.match(stdout, /Use -n <N>/);
    assert.match(stdout, /ima2 ps --json/);
    assert.match(stdout, /ima2 cancel <requestId>/);
    assert.match(stdout, /lane\/model/);
    assert.match(stdout, /ima2 models/);
  });

  it("bare gen fails closed without defaults.image", async () => {
    const { stdout, code, stderr } = await runCLI(["gen", "hi", "--json"]);
    assert.strictEqual(code, 2, String(stderr).slice(0, 800));
    const payload = JSON.parse(stdout);
    assert.strictEqual(payload.code, "NO_DEFAULT_MODEL");
    assert.ok(payload.models);
    assert.deepStrictEqual(payload.fix, ["ima2 defaults set image <lane>/<model>", "ima2 models"]);
    assert.strictEqual(stdout.trim().split("\n").length, 1);
  });

  it("gen rejects the removed provider auto with a typed envelope", async () => {
    const { stdout, code, stderr } = await runCLI(["gen", "hi", "--provider", "auto", "--json"]);
    assert.strictEqual(code, 2, String(stderr).slice(0, 800));
    assert.strictEqual(JSON.parse(stdout).code, "PROVIDER_AUTO_REMOVED");
  });

  it("passes namespaced core lane/model through to the existing generate body", async () => {
    let requestBody = null;
    const fake = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/health") { res.end('{"ok":true}'); return; }
      if (req.url === "/api/models") {
        res.end(JSON.stringify({ ok: true, lanes: { oauth: { status: "ready", defaults: { image: "gpt-5.6-luna" },
          models: { image: [{ id: "gpt-5.6-luna" }] } } } })); return;
      }
      if (req.url === "/api/generate" && req.method === "POST") {
        let raw = ""; req.on("data", (chunk) => { raw += chunk; }); req.on("end", () => {
          requestBody = JSON.parse(raw);
          res.end(JSON.stringify({ requestId: "req_test", images: [{ image: "data:image/png;base64,aQ==", filename: "x.png" }] }));
        }); return;
      }
      res.writeHead(404).end();
    });
    await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${fake.address().port}`;
    try {
      const target = join(FAKE_HOME, "core.png");
      const result = await runCLI(["gen", "hi", "--model", "oauth/luna", "--out", target, "--json", "--server", base]);
      assert.strictEqual(result.code, 0);
      assert.strictEqual(requestBody.provider, "oauth");
      assert.strictEqual(requestBody.model, "gpt-5.6-luna");
      assert.strictEqual(JSON.parse(result.stdout).images[0].path, target);
    } finally {
      await new Promise((resolve) => fake.close(resolve));
    }
  });


  it("ima2 edit --help prints current payload options", async () => {
    const { stdout, code } = await runCLI(["edit", "--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /ima2 edit/);
    assert.match(stdout, /--model/);
    assert.match(stdout, /--provider/);
    assert.match(stdout, /--mode/);
    assert.match(stdout, /--moderation/);
    assert.match(stdout, /--session/);
  });

  it("ima2 ls --json works when history empty", async () => {
    const { stdout, code } = await runCLI(["ls", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.ok(Array.isArray(obj.items));
  });

  it("ima2 multimode --help prints parity options", async () => {
    const { stdout, code } = await runCLI(["multimode", "--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /ima2 multimode/);
    assert.match(stdout, /--provider/);
    assert.match(stdout, /--mode/);
    assert.match(stdout, /--ref/);
  });

  it("ima2 ps --help documents multimode jobs", async () => {
    const { stdout, code } = await runCLI(["ps", "--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /classic\|node\|multimode/);
  });

  it("ima2 gen with unreachable --server exits 3", async () => {
    const { code, stderr } = await runCLI(["gen", "hi", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "", // clear env
    });
    assert.strictEqual(code, 3);
    assert.match(stderr, /Hint:/);
    assert.match(stderr, /ima2 serve/);
  });

  it("ima2 gen --json keeps stdout parseable when server is unreachable", async () => {
    const { stdout, stderr, code } = await runCLI(["gen", "hi", "--json", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "",
    });
    assert.strictEqual(code, 3);
    const obj = JSON.parse(stdout.trim());
    assert.strictEqual(obj.ok, false);
    assert.strictEqual(obj.code, "SERVER_UNREACHABLE");
    assert.match(stderr, /Hint:/);
  });

  it("ima2 edit with unreachable --server prints a hint", async () => {
    const { code, stderr } = await runCLI(["edit", "input.png", "--prompt", "hi", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "",
    });
    assert.strictEqual(code, 3);
    assert.match(stderr, /Hint:/);
  });

  it("ima2 ps with unreachable --server prints a hint", async () => {
    const { code, stderr } = await runCLI(["ps", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "",
    });
    assert.strictEqual(code, 3);
    assert.match(stderr, /Hint:/);
  });

  it("ima2 cancel with unreachable --server prints a hint", async () => {
    const { code, stderr } = await runCLI(["cancel", "req_nope", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "",
    });
    assert.strictEqual(code, 3);
    assert.match(stderr, /Hint:/);
  });

  it("ima2 cancel without requestId exits 2", async () => {
    const { code, stderr } = await runCLI(["cancel"]);
    assert.strictEqual(code, 2, String(stderr).slice(0, 800));
    assert.match(stderr, /requestId/i);
  });

  it("ima2 cancel marks a request id canceled", async () => {
    const { stdout, code } = await runCLI(["cancel", "req_cli_test_cancel"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /canceled req_cli_test_cancel/);
  });

  it("ima2 cancel --json returns parseable shape", async () => {
    const { stdout, code } = await runCLI(["cancel", "req_cli_test_cancel_json", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.deepStrictEqual(obj, { ok: true, requestId: "req_cli_test_cancel_json" });
  });

  it("ima2 --help lists new commands", async () => {
    const { stdout, code } = await runCLI([]);
    assert.ok(code === 0 || code === 1);
    assert.match(stdout, /gen <prompt>/);
    assert.match(stdout, /ping/);
    assert.match(stdout, /cancel <id>/);
    assert.match(stdout, /models\s+List available image models/);
    assert.match(stdout, /Generation workflow:/);
    assert.match(stdout, /ima2 gen -n <N>/);
    assert.match(stdout, /ima2 ps --json/);
    assert.match(stdout, /ima2 cancel <id>/);
  });
});
