import { listProviders } from "../../lib/providers/registry.js";
import type { CoreProviderManifest, ProviderCredential } from "../../lib/providers/types.js";
import { detectCodexAuth } from "../../lib/codexDetect.js";
import type { DoctorCheckLine } from "./doctor-checks.js";

export type ProviderDoctorLine = DoctorCheckLine & { lane: string };
type ApiCredential = Extract<ProviderCredential, { kind: "api-key" }>;

function firstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function configString(fileConfig: Record<string, unknown>, key?: string): string | undefined {
  if (!key) return undefined;
  const value = fileConfig[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inspectApiKey(lane: string, credential: ApiCredential, fileConfig: Record<string, unknown>): ProviderDoctorLine {
  const value = firstEnv(credential.envVars) || configString(fileConfig, credential.configKey);
  if (!value) return { lane, kind: "warn", text: `${lane}: api-key unset` };
  if (credential.keyPrefix && !value.startsWith(credential.keyPrefix)) {
    return { lane, kind: "fail", text: `${lane}: api-key prefix mismatch (expected ${credential.keyPrefix})` };
  }
  return { lane, kind: "pass", text: `${lane}: api-key present` };
}

function inspectOauth(lane: string): ProviderDoctorLine {
  if (lane !== "oauth") return { lane, kind: "warn", text: `${lane}: oauth-proxy has no lane-specific checker` };
  const auth = detectCodexAuth();
  if (auth.proxyReady) return { lane, kind: "pass", text: `${lane}: file-backed Codex session ready` };
  return { lane, kind: "fail", text: `${lane}: no file-backed Codex session; run ima2 login` };
}

export function inspectProviderLane(provider: CoreProviderManifest, fileConfig: Record<string, unknown>): ProviderDoctorLine[] {
  return provider.credentials.map((credential) => {
    if (credential.kind === "api-key") return inspectApiKey(provider.id, credential, fileConfig);
    if (credential.kind === "oauth-proxy") return inspectOauth(provider.id);
    return { lane: provider.id, kind: "warn", text: `${provider.id}: unsupported credential kind` };
  });
}

export function buildProviderDoctorLines(fileConfig: Record<string, unknown>): ProviderDoctorLine[] {
  return listProviders().flatMap((provider) => inspectProviderLane(provider, fileConfig));
}

export function resolveValidateUrl(credential: ApiCredential): string | undefined {
  return credential.validateUrl;
}

export function listedValidateUrls(): string[] {
  return listProviders().flatMap((provider) => provider.credentials.flatMap((credential) => {
    if (credential.kind !== "api-key") return [];
    const url = resolveValidateUrl(credential);
    return url ? [url] : [];
  }));
}

export async function verifyConfiguredKeys(
  fileConfig: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderDoctorLine[]> {
  const lines: ProviderDoctorLine[] = [];
  for (const provider of listProviders()) {
    for (const credential of provider.credentials) {
      if (credential.kind !== "api-key") continue;
      const url = resolveValidateUrl(credential);
      if (!url) continue;
      const value = firstEnv(credential.envVars) || configString(fileConfig, credential.configKey);
      if (!value) continue;
      try {
        const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${value}` } });
        if (response.ok) {
          lines.push({ lane: provider.id, kind: "pass", text: `${provider.id}: validateUrl ok` });
        } else {
          lines.push({ lane: provider.id, kind: "fail", text: `${provider.id}: AUTH_INVALID (${response.status})` });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lines.push({ lane: provider.id, kind: "fail", text: `${provider.id}: AUTH_INVALID (${message})` });
      }
    }
  }
  return lines;
}
