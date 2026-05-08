/**
 * thumbnail_generate agent output contract.
 *
 * The /api/thumbnail-editor/generate endpoint enqueues an Agent OS
 * request when a `productId` is bound; the runtime handler runs the
 * actual Gemini image generation, the bridge validates the output, and
 * the sink applies the candidates onto the originating
 * `ThumbnailGeneration` row. Standalone (no productId) keeps the legacy
 * sync return as a transitional preview.
 *
 * candidate 의 모양은 ai 도메인 `domain/model/thumbnail-editor.ts` 의
 * `ThumbnailEditorCandidate` 와 1:1 대응한다.
 *
 * Domain 계층이라 Nest/Prisma/HTTP 의존이 없다. Zod 만 사용한다.
 */
import { z } from 'zod';

export const THUMBNAIL_GENERATE_AGENT_TYPE = 'thumbnail_generate' as const;

const dataOrHttpsUrl = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith('data:image/') ||
      value.startsWith('https://') ||
      value.startsWith('http://localhost'), // dev fallback only; bridge can tighten
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
 * via `ThumbnailEditorAiService.resolveInputImage` before enqueueing,
 * so the handler can run the LLM step without re-downloading.
 */
export const ThumbnailGenerateAgentInputImageSchema = z.object({
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

export const ThumbnailGenerateAgentInputSchema = z.object({
  mode: z.enum(['creative', 'edit']),
  editCase: z
    .enum(['single', 'compose', 'color-variants', 'bundle'])
    .optional(),
  purpose: z.enum(['compliance', 'quality']).optional(),
  productName: z.string().nullable().optional(),
  productDescription: z.string().optional(),
  category: z.string().nullable().optional(),
  sceneType: z.string().optional(),
  styleType: z.string().optional(),
  supplementaryLabel: z.string().optional(),
  pieceCount: z.number().int().nonnegative().optional(),
  colorCount: z.number().int().nonnegative().optional(),
  layout: z
    .enum(['auto', 'fan', 'arch', 'grid', 'stack', 'radial'])
    .optional(),
  composition: z.string().optional(),
  userPrompt: z.string().optional(),
  hasStyleReference: z.boolean().optional(),
  inputs: z.array(ThumbnailGenerateAgentInputImageSchema).min(1),
});

export const ThumbnailGenerateAgentOutputSchema = z.object({
  candidates: z.array(ThumbnailCandidateSchema).min(1),
});

export type ThumbnailCandidate = z.infer<typeof ThumbnailCandidateSchema>;
export type ThumbnailGenerateAgentInputImage = z.infer<
  typeof ThumbnailGenerateAgentInputImageSchema
>;
export type ThumbnailGenerateAgentInput = z.infer<
  typeof ThumbnailGenerateAgentInputSchema
>;
export type ThumbnailGenerateAgentOutput = z.infer<
  typeof ThumbnailGenerateAgentOutputSchema
>;
