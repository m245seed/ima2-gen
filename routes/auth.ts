import type { Express } from "express";
import type { RouteRuntimeContext } from "../lib/runtimeContext.js";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { codexFileLoginArgs, detectCodexAuth } from "../lib/codexDetect.js";
import { packageCliCommand } from "../lib/packageCli.js";



interface AuthSession {
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
  status: "pending" | "complete" | "error" | "expired";
  error?: string;
  child?: ChildProcess;
}

const MAX_CONCURRENT_SESSIONS = 20;
const sessions = new Map<string, AuthSession>();

function sid(): string {
  return randomBytes(16).toString("hex");
}

function cleanup(id: string) {
  const s = sessions.get(id);
  if (s?.child && !s.child.killed) s.child.kill();
  setTimeout(() => sessions.delete(id), 120_000);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*m/g, "");
}


function startCodexDeviceCode(): Promise<{ sessionId: string; userCode: string; verificationUrl: string; expiresIn: number }> {
  return new Promise((resolve, reject) => {
    // Don't hand other providers' secrets to the codex child — it only needs
    // PATH/HOME/codex config to run the ChatGPT device-code login.
    const childEnv = { ...process.env };
    for (const k of ["OPENAI_API_KEY"]) {
      delete childEnv[k];
    }
    const codex = packageCliCommand(
      "@openai/codex",
      "codex",
      codexFileLoginArgs({ deviceAuth: true }),
    );
    const child = spawn(codex.command, codex.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv,
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let resolved = false;
    const id = sid();

    const session: AuthSession = {
      userCode: "",
      verificationUrl: "",
      expiresAt: Date.now() + 15 * 60 * 1000,
      status: "pending",
      child,
    };
    sessions.set(id, session);

    // Server-side reaper: if the client abandons the flow (closes browser, stops
    // polling), kill the lingering codex child instead of waiting for it to self-exit.
    const reaper = setTimeout(() => {
      if (session.status === "pending") {
        session.status = "expired";
        cleanup(id);
      }
    }, 16 * 60 * 1000);
    reaper.unref?.();

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (resolved) return;

      const clean = stripAnsi(stdout);
      const urlMatch = clean.match(/https:\/\/auth\.openai\.com\/codex\/device/);
      const codeMatch = clean.match(/^\s+([A-Z0-9]{4}-[A-Z0-9]{4,5})\s*$/m);

      if (urlMatch && codeMatch) {
        resolved = true;
        const userCode = codeMatch[1];
        if (!userCode) return;
        session.userCode = userCode;
        session.verificationUrl = urlMatch[0];
        resolve({
          sessionId: id,
          userCode,
          verificationUrl: urlMatch[0],
          expiresIn: 900,
        });
      }
    });

    child.stderr?.on("data", () => { /* ignore */ });

    child.on("close", (code) => {
      if (!resolved) {
        sessions.delete(id);
        reject(new Error(`codex login exited with code ${code} before providing device code`));
        return;
      }
      const proxyReady = code === 0 && detectCodexAuth().proxyReady;
      session.status = proxyReady ? "complete" : "error";
      if (code !== 0) session.error = `codex exited with code ${code}`;
      else if (!proxyReady) session.error = "Codex login did not create a file-backed GPT OAuth session";
      cleanup(id);
    });

    child.on("error", (err) => {
      if (!resolved) {
        sessions.delete(id);
        reject(new Error(`codex not found: ${err.message}`));
        return;
      }
      session.status = "error";
      session.error = err.message;
      cleanup(id);
    });

    setTimeout(() => {
      if (!resolved) {
        sessions.delete(id);
        if (!child.killed) child.kill();
        reject(new Error("Timed out waiting for codex device code output"));
      }
    }, 30000);
  });
}

export function registerAuthRoutes(app: Express, _ctx?: RouteRuntimeContext) {
  app.post("/api/auth/switch", async (req, res) => {
    const provider = req.body?.provider;
    if (provider !== "codex") {
      return res.status(400).json({ error: "provider must be codex" });
    }
    if (sessions.size >= MAX_CONCURRENT_SESSIONS) {
      return res.status(429).json({ error: "Too many pending auth sessions" });
    }
    try {
      const result = await startCodexDeviceCode();
      res.json(result);
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
  });

  app.get("/api/auth/switch/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ status: "expired" });
    if (session.status === "complete") return res.json({ status: "complete" });
    if (session.status === "error") return res.json({ status: "error", error: session.error });
    if (Date.now() > session.expiresAt) {
      session.status = "expired";
      cleanup(req.params.sessionId);
      return res.json({ status: "expired" });
    }
    res.json({ status: "pending" });
  });
}
