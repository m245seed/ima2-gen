import { config as runtimeConfigDefault } from "../config.js";
import { AGENT_ALLOWED_TOOLS } from "./agentTypes.js";
import { AGENT_TOOL_MANIFEST } from "./agentToolManifest.js";
import { buildCatalog, catalogSummary } from "./contracts/catalog.js";
import { KEY_TO_ENV, WRITABLE_CONFIG_KEYS } from "./configKeys.js";
import { DEFAULT_IMAGE_QUALITY, VALID_IMAGE_QUALITIES } from "./oauthNormalize.js";
import type { AppConfig } from "./runtimeContext.js";
import { deriveProviderIds } from "./providers/derive.js";

type CapabilitySource = "local" | "server";

const VALID_MODES = ["auto", "direct"] as const;
const VALID_PROVIDERS = ["auto", ...deriveProviderIds()] as const;
const AGENT_COMMANDS = [
  "skill",
  "capabilities",
  "defaults",
  "gen",
  "edit",
  "multimode",
  "node generate",
  "inflight ls",
  "providers",
  "oauth status",
  "prompt build",
];

function toArray<T>(value: Iterable<T> | T[] | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return [...value];
  return Array.from(value);
}

export function buildIma2Capabilities({
  appConfig = runtimeConfigDefault,
  packageVersion,
  source,
  server = null,
}: {
  appConfig?: AppConfig;
  packageVersion: string;
  source: CapabilitySource;
  server?: string | null;
}) {
  return {
    ok: true,
    name: "ima2",
    source,
    server,
    version: packageVersion,
    commands: AGENT_COMMANDS,
    defaults: {
      oauth: {
        model: appConfig.imageModels.default,
        reasoningEffort: appConfig.imageModels.reasoningEffort,
      },
      api: {
        model: appConfig.apiProvider.defaultImageModel,
        reasoningEffort: appConfig.apiProvider.defaultReasoningEffort,
        size: appConfig.apiProvider.defaultSize,
        webSearchEnabled: appConfig.apiProvider.allowWebSearch,
      },
    },
    valid: {
      imageModels: {
        supported: toArray(appConfig.imageModels.valid),
        unsupported: toArray(appConfig.imageModels.unsupported),
      },
      reasoningEfforts: toArray(appConfig.imageModels.validReasoningEfforts),
      quality: toArray(VALID_IMAGE_QUALITIES),
      moderation: toArray(appConfig.oauth.validModeration),
      modes: [...VALID_MODES],
      providers: [...VALID_PROVIDERS],
    },
    configKeys: {
      writable: toArray(WRITABLE_CONFIG_KEYS),
      envOverrides: { ...KEY_TO_ENV },
    },
    defaultsMeta: {
      quality: DEFAULT_IMAGE_QUALITY,
    },
    limits: {
      maxRefCount: appConfig.limits.maxRefCount,
      maxGeneratedImages: appConfig.limits.maxGeneratedImages,
      maxParallel: {
        value: appConfig.limits.maxParallel,
        enforced: true,
        note: "server-side inflight capacity guard uses this runtime limit",
      },
    },
    promptBuilder: {
      available: true,
      route: "/api/prompt-builder/chat",
      cliCommand: "ima2 prompt build",
      structuredOutput: ["intentSummary", "finalPrompt.ko", "finalPrompt.en", "notes"],
      uiOnly: false,
    },
    agentMode: {
      available: true,
      route: "/api/agent/sessions",
      allowedTools: [...AGENT_ALLOWED_TOOLS],
      toolManifest: [...AGENT_TOOL_MANIFEST],
      finalArtifact: "image",
      uiOnly: true,
      cliCommand: null,
    },
    // Additive contract-catalog summary (020 WP2 + 040 WP4). Snapshots were
    // served by the MCP transport, which has been removed; the catalog keeps
    // its built-in contracts only.
    contracts: catalogSummary(buildCatalog({ snapshots: [] })),
    guidance: {
      highQuality: "Use --quality high for requests where output fidelity matters.",
      parallelGeneration: "Run multiple ima2 gen commands as separate queued jobs; no --parallel flag is required.",
      i2i: "Use --ref for reference generation, or ima2 edit <file> --prompt \"<text>\" for image edits.",
      defaults: "Use ima2 defaults set model/reasoning for persistent defaults; request flags remain per-call overrides.",
      promptBuilder: "Use ima2 prompt build --message \"...\" to refine prompt intent. Use ima2 gen / ima2 multimode to generate images. Workspace profile settings are UI-only.",
    },
  };
}
