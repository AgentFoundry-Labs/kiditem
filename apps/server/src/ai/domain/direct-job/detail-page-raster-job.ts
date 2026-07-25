import { createHash } from 'node:crypto';
import { z } from 'zod';

export const DETAIL_PAGE_RASTER_JOB_TYPE = 'detail_page_rasterize' as const;
export const DETAIL_PAGE_RASTER_VARIANT_VERSION = 'wing-jpeg-v1' as const;

export const DetailPageRasterJobInputSchema = z
  .object({
    revisionId: z.string().uuid(),
    artifactId: z.string().uuid(),
    outputWidth: z.number().int().min(320).max(1600),
  })
  .strict();

export const DetailPageRasterJobOutputSchema = z
  .object({
    revisionId: z.string().uuid(),
    artifactId: z.string().uuid(),
    imageUrl: z.string().url(),
    outputWidth: z.number().int().min(320).max(1600),
    contentType: z.literal('image/jpeg'),
    byteLength: z.number().int().positive(),
  })
  .strict();

export type DetailPageRasterJobInput = z.infer<
  typeof DetailPageRasterJobInputSchema
>;
export type DetailPageRasterJobOutput = z.infer<
  typeof DetailPageRasterJobOutputSchema
>;

/**
 * `AiDirectJob.sourceResourceId` is UUID-backed. Derive an RFC-4122 v5-shaped
 * identity from the immutable revision plus render variant so concurrent
 * requests converge on one durable job and renderer-version changes do not
 * reuse stale bytes.
 */
export function detailPageRasterJobSourceId(
  revisionId: string,
  outputWidth: number,
): string {
  const bytes = createHash('sha1')
    .update(`${DETAIL_PAGE_RASTER_VARIANT_VERSION}:${revisionId}:${outputWidth}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
