import type {
  CoreProviderManifest as CoreProviderManifestShape,
  CoreProviderManifestBase,
  KeyProviderId,
} from "./types.js";

const RESPONSES = { edit: true, mask: true, streaming: true } as const;
const UNSUPPORTED = { edit: false, mask: false, streaming: false } as const;

export const REGISTRY = [
  {
    id: "oauth",
    vendor: "openai",
    credentials: [{
      kind: "oauth-proxy",
      // ./config.ts accepts the legacy OAUTH_PORT alias too.
      envVars: ["IMA2_OAUTH_PROXY_PORT", "OAUTH_PORT"],
      configKey: "oauth",
    }],
    models: [
      { id: "gpt-5.5", kind: "image", supports: RESPONSES },
      { id: "gpt-5.4", kind: "image", supports: RESPONSES },
      { id: "gpt-5.4-mini", kind: "image", supports: RESPONSES },
      { id: "gpt-5.6-sol", aliases: ["sol"], kind: "image", supports: RESPONSES },
      { id: "gpt-5.6-terra", aliases: ["terra"], kind: "image", supports: RESPONSES },
      { id: "gpt-5.6-luna", aliases: ["luna"], kind: "image", supports: RESPONSES },
      { id: "gpt-5.3-codex-spark", aliases: ["spark"], kind: "image", supports: UNSUPPORTED },
    ],
    referenceLimits: {},
    elementTaxonomy: "gpt",
    limits: { timeoutMs: 400_000 },
    errorPrefix: null,
  },
  {
    id: "api",
    vendor: "openai",
    credentials: [{
      kind: "api-key",
      keyVocabulary: "openai",
      envVars: ["OPENAI_API_KEY"],
      keyPrefix: "sk-",
      validateUrl: "https://api.openai.com/v1/models",
      configKey: "apiKey",
    }],
    models: [
      { id: "gpt-5.5", kind: "image", supports: RESPONSES },
      { id: "gpt-5.4", kind: "image", supports: RESPONSES },
      { id: "gpt-5.4-mini", kind: "image", supports: RESPONSES },
      { id: "gpt-5.6-sol", aliases: ["sol"], kind: "image", supports: RESPONSES },
      { id: "gpt-5.6-terra", aliases: ["terra"], kind: "image", supports: RESPONSES },
      { id: "gpt-5.6-luna", aliases: ["luna"], kind: "image", supports: RESPONSES },
    ],
    referenceLimits: {},
    elementTaxonomy: "gpt",
    limits: { timeoutMs: 400_000 },
    errorPrefix: null,
  },
] as const satisfies readonly CoreProviderManifestBase[];

export type CoreProviderId = (typeof REGISTRY)[number]["id"];
export type CoreProviderManifest = CoreProviderManifestShape<CoreProviderId>;

function assertUniqueProviderIds(): void {
  const ids = REGISTRY.map((provider) => provider.id);
  if (new Set(ids).size !== ids.length) throw new Error("CORE_PROVIDER_ID_DUPLICATE");
}

assertUniqueProviderIds();

export function listProviders(): CoreProviderManifest[] {
  return REGISTRY.map((provider) => provider as CoreProviderManifest);
}

export function getProvider(id: CoreProviderId): CoreProviderManifest {
  const provider = REGISTRY.find((entry) => entry.id === id);
  if (!provider) throw new Error(`CORE_PROVIDER_UNKNOWN:${id}`);
  return provider as CoreProviderManifest;
}

export function byKeyVocabulary(id: KeyProviderId): CoreProviderManifest[] {
  return listProviders().filter((provider) => provider.credentials.some(
    (credential) => credential.kind === "api-key" && credential.keyVocabulary === id,
  ));
}
