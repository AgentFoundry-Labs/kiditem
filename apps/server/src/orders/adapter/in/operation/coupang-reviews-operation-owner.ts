import { Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import {
  COUPANG_REVIEWS_CHUNK_KIND,
  COUPANG_REVIEWS_KIND,
  COUPANG_REVIEWS_WINDOW_CHUNK_KIND,
  CoupangReviewsChunkItemSchema,
  CoupangReviewsResultSchema,
  CoupangReviewsScopeSchema,
  CoupangReviewsWindowDoneSchema,
  CoupangReviewsWindowSchema,
  type CoupangReviewsResult,
} from '@kiditem/shared/reviews';
import { z } from 'zod';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { ReviewIngestService } from '../../../application/service/review-ingest.service';
import {
  completeCoupangReviews,
  coupangReviewMonthWindows,
  coupangReviewOperationWindow,
} from '../../../domain/coupang-reviews-operation';

const CoupangReviewsPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  windows: z.array(CoupangReviewsWindowSchema).min(1),
  maxPagesPerWindow: z.number().int().min(1),
}).strict();

/**
 * 쿠팡 상품평 수집(ADR-0025 kind `orders.coupang_reviews`, KID-359). 확장이 plan의 월 창대로 Wing 상품평을 읽어
 * `reviews` 청크(항목마다 windowIndex)와 창마다 `review_windows` 표식을 올린다. finish 트랜잭션에서 창별 완결을
 * 확인한 뒤 리뷰당 operation 행 하나로 upsert한다. 미완결이면 VALIDATION_FAILED — 실행은 failed로 끝나고 원장에
 * 아무것도 남지 않는다. `onFailed` 없음(실패를 원장에 적지 않는다).
 */
@OperationOwner()
@Injectable()
export class CoupangReviewsOperationOwner implements OperationOwnerPort {
  readonly kind = COUPANG_REVIEWS_KIND;

  constructor(private readonly reviews: ReviewIngestService) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parse(CoupangReviewsScopeSchema, scope, 'invalid_scope');
    const channelAccountId = parsed.channelAccountId.toLowerCase();
    await this.reviews.assertCoupangAccount(context.organizationId, channelAccountId);
    const windows = coupangReviewMonthWindows(parsed.months, new Date());
    return {
      lockKeys: [accountLockKey(channelAccountId)],
      plan: { channelAccountId, windows, maxPagesPerWindow: parsed.maxPagesPerWindow },
      window: coupangReviewOperationWindow(windows),
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: CoupangReviewsResult }> {
    const plan = CoupangReviewsPlanSchema.parse(context.plan);
    const reviews = chunkItems(chunks, COUPANG_REVIEWS_CHUNK_KIND, CoupangReviewsChunkItemSchema);
    const windowDones = chunkItems(chunks, COUPANG_REVIEWS_WINDOW_CHUNK_KIND, CoupangReviewsWindowDoneSchema);
    const unknown = chunks.find((chunk) => chunk.chunkKind !== COUPANG_REVIEWS_CHUNK_KIND && chunk.chunkKind !== COUPANG_REVIEWS_WINDOW_CHUNK_KIND);
    if (unknown) throw invalid('unknown_chunk_kind', { chunkKind: unknown.chunkKind });
    const items = completeCoupangReviews({ windows: plan.windows, maxPagesPerWindow: plan.maxPagesPerWindow, reviews, windowDones });
    const published = await this.reviews.publishOperation(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      publishedAt: new Date(),
      items: items.map(({ windowIndex: _windowIndex, ...item }) => item),
    });
    return {
      result: CoupangReviewsResultSchema.parse({
        windows: plan.windows.length,
        reviews: items.length,
        inserted: published.inserted,
        updated: published.updated,
      }),
    };
  }
}

function chunkItems<S extends z.ZodTypeAny>(chunks: readonly OperationStagedChunk[], chunkKind: string, schema: S): Array<z.output<S>> {
  const items: Array<z.output<S>> = [];
  for (const chunk of chunks) {
    if (chunk.chunkKind !== chunkKind) continue;
    for (const raw of chunk.payload) items.push(parse(schema, raw, 'invalid_chunk_item', { chunkKind }));
  }
  return items;
}

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, reason: string, details: Record<string, unknown> = {}): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invalid(reason, {
    ...details,
    errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
  });
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
