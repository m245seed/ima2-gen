import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { generateImageThumbnail, imageThumbExists } from "./imageThumb.js";

export type ThumbBackfillFailure = {
  file: string;
  kind: "image";
  reason: string;
};

export type ThumbBackfillResult = {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  failures: ThumbBackfillFailure[];
};

const FAILURE_DETAIL_LIMIT = 20;

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Recursively scan `dir` (up to `maxDepth` levels, matching historyList's walk
 * depth) and generate missing `.thumb.jpg` thumbnails for every image.
 * Images live both at the top level and inside subdirectories
 * so a flat readdir misses them — this walks the tree so the gallery never
 * shows a thumbless media tile.
 */
export async function backfillThumbnails(
  dir: string,
  maxDepth = 2,
): Promise<ThumbBackfillResult> {
  const result: ThumbBackfillResult = { total: 0, created: 0, skipped: 0, failed: 0, failures: [] };

  function recordFailure(file: string, kind: "image", reason: string): void {
    result.failed++;
    if (result.failures.length >= FAILURE_DETAIL_LIMIT) return;
    result.failures.push({ file, kind, reason });
  }

  async function walk(current: string, depth: number): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth > 0 && entry.name !== "trash") await walk(full, depth - 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".thumb.jpg")) continue;
      if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;

      result.total++;
      const kind = "image" as const;
      try {
        if (await imageThumbExists(full)) { result.skipped++; continue; }
        await generateImageThumbnail(full);
        result.created++;
      } catch (error) {
        recordFailure(full, kind, errorReason(error));
      }
    }
  }

  await walk(dir, maxDepth);
  return result;
}
