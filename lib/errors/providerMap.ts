import type { GenerationErrorClass } from "./classes.js";

export const PROVIDER_ERROR_MAP = {
} as const satisfies Record<string, GenerationErrorClass>;

export type ProviderErrorCode = keyof typeof PROVIDER_ERROR_MAP;

export type DynamicProviderCodeSite = {
  file: string;
  prefixVariable: string;
  prefixDomain: readonly string[];
  suffix: string;
  expandedCodes: readonly ProviderErrorCode[];
};

export const DYNAMIC_PROVIDER_CODE_SITES = [] as const satisfies readonly DynamicProviderCodeSite[];

export function providerErrorClass(code: unknown, _status?: unknown): GenerationErrorClass | undefined {
  if (typeof code !== "string") return undefined;
  return (PROVIDER_ERROR_MAP as Record<string, GenerationErrorClass>)[code];
}
