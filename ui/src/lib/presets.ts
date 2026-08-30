import style from "../../../presets/style.json";
import lighting from "../../../presets/lighting.json";
import type { PresetDefinition } from "../../../lib/presetCompiler";

const ALL_PRESETS: PresetDefinition[] = [
  ...(style as PresetDefinition[]),
  ...(lighting as PresetDefinition[]),
];

export function getPresetById(id: string): PresetDefinition | undefined {
  return ALL_PRESETS.find((preset) => preset.id === id);
}

export function getAllPresets(): PresetDefinition[] {
  return [...ALL_PRESETS];
}
