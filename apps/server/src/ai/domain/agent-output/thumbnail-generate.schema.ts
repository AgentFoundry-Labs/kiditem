/**
 * thumbnail_generate agent output contract.
 *
 * Phase 1 PR: schema 만 정의한다. /api/thumbnail-editor/generate 의 동기 응답
 * 계약은 그대로 유지하며, 본 schema 는 향후 Agent OS 전환 시 bridge 가 enforce 한다.
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

export const ThumbnailGenerateAgentInputSchema = z
  .object({
    mode: z.enum(['creative', 'edit']),
    editCase: z
      .enum(['single', 'compose', 'color-variants', 'bundle'])
      .optional(),
    purpose: z.enum(['compliance', 'quality']).optional(),
    productName: z.string().optional(),
    productDescription: z.string().optional(),
    sceneType: z.string().optional(),
    styleType: z.string().optional(),
    supplementaryLabel: z.string().optional(),
    pieceCount: z.number().int().nonnegative().optional(),
    colorCount: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const ThumbnailGenerateAgentOutputSchema = z.object({
  candidates: z.array(ThumbnailCandidateSchema).min(1),
});

export type ThumbnailCandidate = z.infer<typeof ThumbnailCandidateSchema>;
export type ThumbnailGenerateAgentInput = z.infer<
  typeof ThumbnailGenerateAgentInputSchema
>;
export type ThumbnailGenerateAgentOutput = z.infer<
  typeof ThumbnailGenerateAgentOutputSchema
>;
