/**
 * Thumbnail direct generation input/output contract.
 *
 * The /api/thumbnail-editor/generate endpoint creates workspace-bound,
 * candidate-bound, workspace-bound, or direct-upload generation rows. The
 * direct job runs Gemini image generation, validates the output, and the sink
 * applies candidates onto the originating `ThumbnailGeneration` row.
 *
 * candidate 의 모양은 ai 도메인 `domain/model/thumbnail-editor.ts` 의
 * `ThumbnailEditorCandidate` 와 1:1 대응한다.
 *
 * Domain 계층이라 Nest/Prisma/HTTP 의존이 없다. Zod 만 사용한다.
 */
import { z } from 'zod';

const dataOrHttpsUrl = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('data:image/') || value.startsWith('https://') || value.startsWith('http://localhost'), // dev fallback only
    {
      message:
        'thumbnail_generate.url must be a data:image URL or https:// URL (dev http://localhost allowed for local provider stubs).',
    },
  );

export const ThumbnailCandidateSchema = z.object({
  url: dataOrHttpsUrl,
  filename: z.string().nullable().optional(),
  storageKey: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().int().nullable().optional(),
});

/**
 * Each input image carries both the storage URL (for downstream lookup
 * + UI history) and the base64 `data` the Gemini call needs as inline
 * binary. Producer side resolves these from upload payloads / hub URLs
 * via `ThumbnailEditorAiService.resolveInputImage` before enqueueing, so the
 * direct job can run the LLM step without re-downloading.
 */
export const ThumbnailGenerateDirectInputImageSchema = z.object({
  data: z.string().min(1),
  mimeType: z.string().min(1),
  label: z.string(),
  url: z.string().min(1),
  storageKey: z.string().nullable(),
  role: z.enum(['product', 'box', 'color_variant', 'detail']),
  sortOrder: z.number().int(),
  source: z.string(),
  fileSize: z.number().int().nullable(),
});

export const ThumbnailGenerateDirectInputSchema = z.object({
  mode: z.enum(['creative', 'edit']),
  editCase: z.enum(['single', 'compose', 'color-variants', 'bundle']).optional(),
  purpose: z.enum(['compliance', 'quality']).optional(),
  productName: z.string().nullable().optional(),
  productDescription: z.string().optional(),
  category: z.string().nullable().optional(),
  sceneType: z.string().optional(),
  styleType: z.string().optional(),
  supplementaryLabel: z.string().optional(),
  pieceCount: z.number().int().nonnegative().optional(),
  colorCount: z.number().int().nonnegative().optional(),
  layout: z.enum(['auto', 'fan', 'arch', 'grid', 'stack', 'radial']).optional(),
  composition: z.string().optional(),
  userPrompt: z.string().optional(),
  hasStyleReference: z.boolean().optional(),
  inputs: z.array(ThumbnailGenerateDirectInputImageSchema).min(1),
});

export const ThumbnailGenerateDirectOutputSchema = z.object({
  candidates: z.array(ThumbnailCandidateSchema).min(1),
});

export type ThumbnailCandidate = z.infer<typeof ThumbnailCandidateSchema>;
export type ThumbnailGenerateDirectInputImage = z.infer<typeof ThumbnailGenerateDirectInputImageSchema>;
export type ThumbnailGenerateDirectInput = z.infer<typeof ThumbnailGenerateDirectInputSchema>;
export type ThumbnailGenerateDirectOutput = z.infer<typeof ThumbnailGenerateDirectOutputSchema>;
