import { PanelRunItemSchema } from '@kiditem/shared/panel';
import type { PanelRunItem as PanelRunItemType } from '@kiditem/shared/panel';
import type { ThumbnailGeneration } from '@prisma/client';
import type { PanelRunMapper } from './types';

/**
 * Service layer가 ThumbnailGeneration + 최소 Product shape 조인 결과를 이 shape으로 넘김.
 *
 * service 호출 예 (panel.service.ts):
 *   const gen = await prisma.thumbnailGeneration.findFirst({
 *     where: { id, organizationId }, include: { product: { select: { id: true, title: true } } }
 *   });
 *   const input: ImageAdapterInput = { generation: gen, product: { id: gen.product.id, title: gen.product.title } };
 *   const item = imagePanelMapper.mapToItem(input, organizationId);
 */
export interface ImageAdapterInput {
  generation: ThumbnailGeneration;
  product: { id: string; title: string };
}

// shared Zod enum에서 유효 상태 집합을 파생 — 드리프트 시 tsc가 감지
const VALID_STATUS = new Set<PanelRunItemType['status']>(PanelRunItemSchema.shape.status.options);

export const imagePanelMapper: PanelRunMapper<ImageAdapterInput> = {
  source: 'image',
  mapToItem(input, _organizationId) {
    const { generation, product } = input;

    // ADR-0011 Rule 4: NO mapping table — pass-through only.
    // Drift guard: unknown status throws to catch writer regressions.
    if (!VALID_STATUS.has(generation.status as PanelRunItemType['status'])) {
      throw new Error(
        `imagePanelMapper: unknown status "${generation.status}" for ThumbnailGeneration ${generation.id}. ` +
          `Expected one of: ${[...VALID_STATUS].join(', ')}`,
      );
    }

    return {
      id: `image:${generation.id}`,
      kind: 'run',
      source: 'image',
      sourceId: generation.id,
      status: generation.status as PanelRunItemType['status'],
      // ADR-0011 Rule 2: sub-state column — phase pass-through (no enum constraint, Rule 3)
      phase: generation.phase ?? null,
      failureType: null, // image source doesn't use failureType
      title: product.title,
      deepLink: `/product-pipeline/thumbnail-generation?generationId=${encodeURIComponent(generation.id)}`,
      actorUserId: generation.triggeredByUserId ?? null,
      visibility: imagePanelMapper.defaultVisibility(input),
      createdAt: generation.createdAt.toISOString(),
      // Keep the panel item compact; detailed thumbnail error metadata stays on
      // ThumbnailGeneration.errorMessage / registration attempts and is loaded
      // by thumbnail-specific detail endpoints.
    };
  },
  defaultVisibility(input) {
    return input.generation.triggeredByUserId == null ? 'organization' : 'user';
  },
};
