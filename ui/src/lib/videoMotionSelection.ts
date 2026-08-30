
export interface MotionSelectionState {
  ids: string[];
  rejected?: { id: string; reason: "LIMIT" | "EXCLUSIVE" };
}

export function toggleMotionPreset(): MotionSelectionState {
  return { ids: [] };
}
