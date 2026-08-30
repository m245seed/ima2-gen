import { mkdir, unlink } from "node:fs/promises";
import { atomicWriteJson } from "./atomicWrite.js";
import { join } from "node:path";
import { ulid } from "ulid";
import { buildFilename, writeFileUnique } from "./filename.js";
import { embedImageMetadataBestEffort } from "./imageMetadataStore.js";
import { invalidateHistoryIndex } from "./historyIndex.js";
import { logEvent } from "./logger.js";
import { resolveProviderOptions } from "./providerOptions.js";
import { generateViaResponses } from "./responsesImageAdapter.js";
import { appendAgentTurn, importAgentImage } from "./agentStore.js";
import { type RuntimeContext } from "./runtimeContext.js";
import { type AgentRunOptions, forceImagePrompt, isTextOnlyResult, textOnlyError } from "./agentRuntime.js";


export async function generateAgentImageWithRetry(
  ctx: RuntimeContext,
  sessionId: string,
  prompt: string,
  manifest: string,
  webSearchEnabled: boolean,
  options: AgentRunOptions,
) {
  options.onProgressStage?.("requesting");
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const forcedPrompt = attempt === 0 ? prompt : forceImagePrompt(prompt);
      const result = await generateAgentImage(ctx, sessionId, forcedPrompt, manifest, webSearchEnabled, options);
      if (result.image) return result;
    } catch (error) {
      lastError = error;
      if (!isTextOnlyResult(error)) throw error;
      if (attempt === 1) break;
      appendAgentTurn({
        sessionId,
        role: "tool",
        text: "ima2.generate_image retry: text-only result rejected",
        status: "error",
      });
    }
  }
  throw textOnlyError(lastError);
}

async function generateAgentImage(
  ctx: RuntimeContext,
  sessionId: string,
  prompt: string,
  manifest: string,
  webSearchEnabled: boolean,
  options: AgentRunOptions,
) {
  const requestId = options.requestId ?? `agent_${ulid()}`;
  const providerOptions = resolveProviderOptions(ctx, {
    provider: options.provider ?? "oauth",
    rawModel: options.model,
    rawReasoningEffort: options.reasoningEffort,
    rawSize: options.size ?? "1024x1024",
    rawWebSearchEnabled: webSearchEnabled,
    searchMode: webSearchEnabled ? "on" : "off",
  });
  if (providerOptions.error) {
    const err = new Error(providerOptions.error) as Error & { code?: string | undefined; status?: number | undefined };
    err.code = providerOptions.code;
    err.status = providerOptions.status;
    throw err;
  }
  const response = await generateViaResponses(
    providerOptions.provider,
    `${manifest}\n\nUser request:\n${prompt}`,
    options.quality ?? "medium",
    providerOptions.size,
    options.moderation ?? "low",
    [],
    requestId,
    "auto",
    ctx,
    {
      model: providerOptions.model,
      reasoningEffort: providerOptions.reasoningEffort,
      webSearchEnabled,
      signal: options.signal,
    },
  );
  const image = await persistAgentImage(ctx, sessionId, prompt, options.format ?? "png", providerOptions.size, requestId, response, {
    provider: String(providerOptions.provider),
    model: String(providerOptions.model),
  });
  const responseText = "text" in response && typeof response.text === "string" ? response.text : null;
  return { image, webSearchCalls: response.webSearchCalls || 0, text: responseText, provider: providerOptions.provider };
}



async function persistAgentImage(
  ctx: RuntimeContext,
  sessionId: string,
  prompt: string,
  format: string,
  size: string,
  requestId: string,
  response: { b64: string; revisedPrompt?: string | null | undefined; usage?: unknown | undefined; webSearchCalls?: number | undefined; mime?: string | undefined; text?: string | null | undefined },
  generation: { provider: string; model: string },
) {
  await mkdir(ctx.config.storage.generatedDir, { recursive: true });
  const createdAt = Date.now();
  const baseName = buildFilename({ model: generation.model, size, createdAt, prompt, ext: format });
  const meta = {
    kind: "agent",
    requestId,
    sessionId,
    prompt,
    userPrompt: prompt,
    revisedPrompt: response.revisedPrompt ?? null,
    provider: generation.provider,
    model: generation.model,
    createdAt,
    usage: response.usage ?? null,
    webSearchCalls: response.webSearchCalls ?? 0,
  };
  const embedded = await embedImageMetadataBestEffort(Buffer.from(response.b64, "base64"), format, meta, {
    version: ctx.packageVersion,
  });
  const filename = await writeFileUnique(ctx.config.storage.generatedDir, baseName, embedded.buffer);
  const filePath = join(ctx.config.storage.generatedDir, filename);
  try {
    await atomicWriteJson(`${filePath}.json`, meta);
  } catch (err) {
    await unlink(filePath).catch(() => {});
    throw err;
  }
  invalidateHistoryIndex();
  logEvent("agent", "saved", { requestId, sessionId, filename });
  return importAgentImage(sessionId, {
    id: `ai_${ulid()}`,
    filename,
    url: `/generated/${filename}`,
    prompt,
    revisedPrompt: response.revisedPrompt ?? null,
    createdAt,
  });
}



