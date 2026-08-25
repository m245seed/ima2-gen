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

const CAMERA_MOVEMENT_GROUPS = [
  "dolly-direction",
  "orbit-direction",
  "crane-direction",
  "pan-style",
  "camera-rig",
];

export const MOTION_EXCLUSIVE_GROUPS = new Map<string, readonly string[]>([
  ["dolly-direction", ["dolly-direction", "static-camera"]],
  ["orbit-direction", ["orbit-direction", "static-camera"]],
  ["crane-direction", ["crane-direction", "static-camera"]],
  ["pan-style", ["pan-style", "static-camera"]],
  ["camera-rig", ["camera-rig", "static-camera"]],
  ["temporal-style", ["temporal-style"]],
  ["static-camera", [...CAMERA_MOVEMENT_GROUPS, "static-camera"]],
]);

const presets: VideoMotionPreset[] = [
  { id: "motion-dolly-in", label: "Dolly in", fragment: "slow dolly toward the subject", exclusiveGroup: "dolly-direction", intensity: "subtle", perProvider: { gpt: "Use a slow dolly-in camera move toward the subject." } },
  { id: "motion-dolly-out", label: "Dolly out", fragment: "dolly away revealing the scene", exclusiveGroup: "dolly-direction", intensity: "medium", perProvider: { gpt: "Dolly the camera away to reveal the scene." } },
  { id: "motion-orbit-left", label: "Orbit left", fragment: "orbit left around the subject", exclusiveGroup: "orbit-direction", intensity: "medium", perProvider: { gpt: "Orbit the camera left around the subject." } },
  { id: "motion-orbit-right", label: "Orbit right", fragment: "orbit right around the subject", exclusiveGroup: "orbit-direction", intensity: "medium", perProvider: { gpt: "Orbit the camera right around the subject." } },
  { id: "motion-crane-up", label: "Crane up", fragment: "crane upward into a wide reveal", exclusiveGroup: "crane-direction", intensity: "medium", perProvider: { gpt: "Crane the camera upward into a wide reveal." } },
  { id: "motion-crane-down", label: "Crane down", fragment: "crane downward toward the subject", exclusiveGroup: "crane-direction", intensity: "medium", perProvider: { gpt: "Crane the camera downward toward the subject." } },
  { id: "motion-whip-pan", label: "Whip pan", fragment: "rapid whip pan transition", exclusiveGroup: "pan-style", intensity: "strong", perProvider: { gpt: "Use a rapid whip-pan camera transition." } },
  { id: "motion-fpv", label: "FPV", fragment: "dynamic FPV flight path", exclusiveGroup: "camera-rig", intensity: "strong", perProvider: { gpt: "Follow a dynamic FPV camera flight path." } },
  { id: "motion-handheld", label: "Handheld", fragment: "natural handheld camera movement", exclusiveGroup: "camera-rig", intensity: "subtle", perProvider: { gpt: "Use natural, restrained handheld camera movement." } },
  { id: "motion-bullet-time", label: "Bullet time", fragment: "dramatic bullet-time orbit", exclusiveGroup: "temporal-style", intensity: "strong", perProvider: { gpt: "Create a dramatic bullet-time orbit around the subject." } },
  { id: "motion-hyperlapse", label: "Hyperlapse", fragment: "accelerated hyperlapse movement", exclusiveGroup: "temporal-style", intensity: "strong", perProvider: { gpt: "Use accelerated hyperlapse camera movement." } },
  { id: "motion-static", label: "Static", fragment: "locked-off static camera", exclusiveGroup: "static-camera", intensity: "subtle", perProvider: { gpt: "Keep the camera locked off and static." } },
];

export const MOTION_PRESETS = new Map(presets.map((preset) => [preset.id, preset]));

export function getMotionFragment(id: string, provider: PresetProvider): string | undefined {
  const preset = MOTION_PRESETS.get(id);
  return preset?.perProvider?.[provider] ?? preset?.fragment;
}
