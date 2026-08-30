import type { PresetProvider } from "./presetCompiler.js";

export interface VideoMotionPreset {
  id: string;
  label: string;
  fragment: string;
  perProvider?: Partial<Record<PresetProvider, string>>;
  exclusiveGroup?: string;
  intensity?: "subtle" | "medium" | "strong";
  maxWith?: number;
}

export const MOTION_EXCLUSIVE_GROUPS = new Map<string, readonly string[]>([]);

export const VIDEO_MOTION_PRESETS: VideoMotionPreset[] = [];
export const VIDEO_MOTION_CATALOG = new Map<string, VideoMotionPreset>();
