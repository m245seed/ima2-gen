// Built-in ima2 tool contracts — canonical definitions (WP2 / 020).
// AGENT_TOOL_MANIFEST in lib/agentToolManifest.ts is a projection of this list;
// edit tool definitions HERE, not in the projection.
import type { ToolContract } from "./types.js";

const BUILTIN_AVAILABILITY = { state: "callable" as const, evidence: "builtin" };
const BUILTIN_ERRORS: ToolContract["errorContract"] = ["invalid_input", "upstream_error"];

function builtin(name: string, description: string, inputSchema: Record<string, unknown>): ToolContract {
  return {
    id: name,
    namespace: "ima2",
    name,
    description,
    trust: "builtin",
    inputSchema,
    errorContract: BUILTIN_ERRORS,
    executionOwner: "ima2-server",
    availability: { ...BUILTIN_AVAILABILITY },
  };
}

export const BUILTIN_TOOL_CONTRACTS: readonly ToolContract[] = [
  builtin(
    "ima2.get_image_context",
    "Load the session image context manifest (previous images, current image, locks). Runs automatically before image generation.",
    { type: "object", properties: {}, additionalProperties: false },
  ),
  builtin(
    "ima2.web_search",
    "Search the web for factual visual references before generating. Only available when web search is enabled for the session.",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for factual visual accuracy." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  ),
  builtin(
    "ima2.generate_image",
    "Generate one or more images. Supports fanout: provide one prompt per variant.",
    {
      type: "object",
      properties: {
        prompts: {
          type: "array",
          items: { type: "string" },
          description: "One generation prompt per planned variant (1 to the configured image limit).",
        },
        plannedVariants: { type: "integer", minimum: 1, description: "Number of images to generate." },
        plannedParallelism: { type: "integer", minimum: 1, description: "Concurrent generation calls." },
        sourceImagePolicy: {
          type: "string",
          enum: ["auto", "none", "current"],
          description: "none creates a fresh image and ignores the current session image; current uses the current session image as edit/reference input; auto lets the runtime choose.",
        },
      },
      required: ["prompts"],
      additionalProperties: false,
    },
  ),
  builtin(
    "ima2.get_generation_errors",
    "Read-only lookup of the session's recent generation failures (failed queue jobs and error turns). Use when the user asks why a generation failed.",
    {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum error records to return. Default 10." },
      },
      additionalProperties: false,
    },
  ),
];
