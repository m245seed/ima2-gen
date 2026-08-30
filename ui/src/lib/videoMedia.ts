import type { GenerateItem } from "../types";

export function isVideoUrl(_src: string | null | undefined): boolean {
  return false;
}

export function isVideoItem(
  _item: Pick<GenerateItem, "filename" | "url" | "image" | "mediaType"> | null | undefined,
): boolean {
  return false;
}

export function extractFrameAtTime(_a?: unknown, _b?: unknown): Promise<string> {
  return Promise.reject(new Error("video not supported"));
}

export function extractLastFrame(_src?: string): Promise<string> {
  return Promise.reject(new Error("video not supported"));
}

export function extractFirstFrame(_src?: string): Promise<string> {
  return Promise.reject(new Error("video not supported"));
}

export function extractMidFrame(_src?: string): Promise<string> {
  return Promise.reject(new Error("video not supported"));
}
