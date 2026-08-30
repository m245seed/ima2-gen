
export type FramePosition = "first" | "mid" | "last";
export type FrameSource = { kind: "generated"; filename: string } | { kind: "url"; url: string };
export type FrameResult = { dataUrl: string; via: "server-ffmpeg" | "browser-canvas"; };
export interface FrameExtractionService {
  extractFrame(source: FrameSource, position: FramePosition, options?: { signal?: AbortSignal }): Promise<FrameResult>;
}
export const frameExtraction = {
  extractFrame: () => Promise.reject(new Error("video not supported")),
} as unknown as FrameExtractionService;
