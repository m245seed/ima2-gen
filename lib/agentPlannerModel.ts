import { normalizeAgentGenerationPlan } from "./agentGenerationPlanner.js";
import { readResponsesTextPayload } from "./agentQuestionResponder.js";
import { formatToolManifestForPrompt } from "./agentToolManifest.js";
import { getAgentSession } from "./agentStore.js";
import { errInfo } from "./errInfo.js";
import { logEvent } from "./logger.js";
import { waitForOAuthReady } from "./oauthProxy/runtime.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "./runtimeContext.js";
import type { AgentGenerationPlan, AgentGenerationSettings } from "./agentTypes.js";

type AgentPlanRequest = {
  sessionId: string;
  prompt: string;
  settings: AgentGenerationSettings;
  requestId?: string;
  signal?: AbortSignal | null;
};


function buildPlannerDeveloperPrompt(_hasSourceImage: boolean, imageCount: number): string {
  return [
    "You are the generation planner for the ima2 Agent. Decide how to fulfill the user's request using the available tools.",
    "",
    "Available tools (name, purpose, parameter schema):",
    formatToolManifestForPrompt(),
    "",
    "Tool execution contract:",
    "- You do not call provider image APIs directly. You choose a plan; the ima2 runtime executes the corresponding ima2.* tools.",
    "- The session model is the planner/LLM model, not an image model. Image generation still uses ima2.generate_image with the configured OpenAI backend.",
    "- For image creation/edit requests choose mode single or fanout, which maps to ima2.get_image_context followed by ima2.generate_image.",
    "- Choose sourceImagePolicy: none for a fresh image, current to use the session's current image as an edit/reference input, or auto only when genuinely ambiguous.",
    "- For failure questions choose mode errors, which maps to ima2.get_generation_errors.",
    "",
    "Session context:",
    `- Images in session: ${imageCount}`,
    "",
    "Decide ONE plan and respond with ONLY a JSON object (no prose, no code fences):",
    '{"mode":"single|fanout|question|errors","prompts":["..."],"plannedVariants":1,"plannedParallelism":1,"sourceImagePolicy":"none|current|auto","assistantText":"...","reason":"short reason"}',
    "",
    "Rules:",
    "- You are a conversational assistant first. Generate media ONLY when the user clearly asks you to create or edit an image. Everything else (questions, chat, greetings, feedback, follow-ups) is mode question.",
    "- mode single: one image. prompts has exactly 1 entry (the generation prompt, user language preserved).",
    "- mode fanout: multiple image variants. prompts has one entry per variant; respect any count the user asked for.",
    "- sourceImagePolicy for single/fanout: use none for new/fresh/separate/from-scratch requests, including '새로', '별도', 'i2i 말고', '새로운 방식', 'new image', 'from scratch', 'without reference'.",
    "- sourceImagePolicy for single/fanout: use current only when the user explicitly asks to use/edit/modify/transform/reference the current image, including '이 이미지', '현재 이미지', '방금 그거', '참조', 'reference', 'i2i', 'image-to-image', '유지해서'.",
    "- sourceImagePolicy for plain image requests with no explicit reference wording is none.",
    "- mode question is for questions, small talk, greetings, feedback, or follow-ups; prompts must be []. Write the full answer in assistantText.",
    "- mode errors is for asking why a previous generation failed or about recent errors; prompts must be [].",
    "- assistantText is REQUIRED for every mode, written in the user's language. For question/errors it is the full reply. For single/fanout it is a short natural chat reply telling the user what you are creating (1-2 sentences, no markdown headings).",
    "- Preserve the user's prompt content; do not censor, embellish, or translate it.",
    "- reason: one short sentence explaining the decision.",
  ].join("\n");
}

export async function requestAgentPlanFromModel(
  ctxRaw: RouteRuntimeContext,
  input: AgentPlanRequest,
): Promise<AgentGenerationPlan | null> {
  const ctx = requireRuntimeContext(ctxRaw);
  const plannerCfg = (ctx.config as { agentPlanner?: { enabled?: boolean; timeoutMs?: number } }).agentPlanner;
  if (!plannerCfg?.enabled) return null;
  const timeoutMs = plannerCfg.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
  try {
    const session = getAgentSession(input.sessionId);
    const developerPrompt = buildPlannerDeveloperPrompt(Boolean(session?.lastImageId), session?.imageCount ?? 0);
    const rawText = await requestResponsesPlan(ctx, developerPrompt, input.prompt, input.settings, signal);
    const parsed = extractJsonObject(rawText);
    if (!parsed) {
      logEvent("agent_planner", "parse_failed", { requestId: input.requestId, provider: input.settings.provider, chars: rawText.length });
      return null;
    }
    const plan = normalizeAgentGenerationPlan(input.prompt, { ...parsed, source: "llm-planner" }, input.settings);
    logEvent("agent_planner", "planned", {
      requestId: input.requestId,
      provider: input.settings.provider,
      mode: plan.mode,
      plannedVariants: plan.plannedVariants,
      source: plan.source,
    });
    return plan;
  } catch (error) {
    const err = errInfo(error);
    logEvent("agent_planner", "fallback", {
      requestId: input.requestId,
      provider: input.settings.provider,
      code: err.name === "AbortError" ? "AGENT_PLANNER_TIMEOUT" : err.code,
      message: err.message,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}


async function requestResponsesPlan(
  ctx: ReturnType<typeof requireRuntimeContext>,
  developerPrompt: string,
  userPrompt: string,
  settings: AgentGenerationSettings,
  signal: AbortSignal,
): Promise<string> {
  let url: string;
  let headers: Record<string, string>;
  if (settings.provider === "api") {
    if (!ctx.apiKey) throw plannerError("API key is required for Agent planner", "API_KEY_REQUIRED", 401);
    url = "https://api.openai.com/v1/responses";
    headers = { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${ctx.apiKey}` };
  } else {
    await waitForOAuthReady(ctx);
    url = `${ctx.oauthUrl}/v1/responses`;
    headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  }
  // stream:true is required — the bundled OAuth proxy returns an empty
  // `output` array for non-streaming Responses calls, which used to make the
  // planner silently fall back to the regex-derived image plan.
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model: settings.model,
      input: [
        { role: "developer", content: developerPrompt },
        { role: "user", content: userPrompt },
      ],
      reasoning: { effort: "low" },
      stream: true,
    }),
  });
  if (!res.ok) throw plannerHttpError(settings.provider, res.status);
  const payload = await readResponsesTextPayload(res);
  return payload.text;
}

export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function plannerHttpError(provider: string, status: number): Error {
  return plannerError(
    `Agent planner upstream rejected the request (${provider})`,
    "AGENT_PLANNER_UPSTREAM_FAILED",
    status >= 400 && status < 600 ? status : 502,
  );
}

function plannerError(message: string, code: string, status: number) {
  const err = new Error(message) as Error & { code?: string; status?: number };
  err.code = code;
  err.status = status;
  return err;
}
