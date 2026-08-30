import type { GenerateItem } from "../types";

export const ACTIVE_VIDEO_PROMPT_GUIDANCE = "";

export type VideoContinuityEntry = {
  id: string;
  ordinal: number;
  role: string;
  filename: string | null;
  userPrompt: string | null;
  revisedPrompt: string;
  createdAt: number;
};

export type VideoContinuityLineage = {
  lineageId: string;
  parentFilename: string | null;
  sourceFrame: "last" | null;
  maxEntries: 4;
  retention: string;
  entries: VideoContinuityEntry[];
};

export type VideoReferenceDragPayload = {
  image: string;
  url?: string;
  filename?: string;
  prompt?: string | null;
  userPrompt?: string | null;
  revisedPrompt?: string | null;
  createdAt?: number;
  mediaType?: string;
  videoContinuity?: VideoContinuityLineage | null;
};

export function trimLineageEntries(entries: VideoContinuityEntry[]): VideoContinuityEntry[] {
  return entries;
}

export function buildVideoContinuityFromItem(): VideoContinuityLineage | null {
  return null;
}

export function buildVideoDragPayload(item: GenerateItem): VideoReferenceDragPayload {
  return {
    image: item.url || item.image,
    url: item.url,
    filename: item.filename,
    prompt: item.prompt ?? null,
    userPrompt: item.userPrompt ?? null,
    revisedPrompt: item.revisedPrompt ?? null,
    createdAt: item.createdAt,
    mediaType: item.mediaType,
    videoContinuity: null,
  };
}

export function buildContinuityPromptChip(): { id: string; name: string; text: string } {
  return { id: "video-continuity", name: "Video", text: "" };
}

export function continuitySummary(_lineage?: unknown): string | null {
  return null;
}
