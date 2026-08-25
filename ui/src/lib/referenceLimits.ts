import type { Provider } from "../types";
import { PROVIDER_REFERENCE_LIMITS } from "../generated/providers";

type LaneLimits = { readonly image?: number };

function laneLimit(provider: Provider): number | undefined {
  const limits = (PROVIDER_REFERENCE_LIMITS as Record<string, LaneLimits | undefined>)[provider];
  return limits?.image;
}

export function effectiveReferenceLimit(input: { provider: Provider; serverLimit: number }): number {
  const lane = laneLimit(input.provider);
  return lane === undefined ? input.serverLimit : Math.min(input.serverLimit, lane);
}
