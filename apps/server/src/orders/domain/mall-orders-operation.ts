import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  isMallOrderOperationMall,
  MALL_ORDERS_CHUNK_KIND,
  MALL_ORDERS_CONTINUATION_CHUNK_KIND,
  MallOrdersCollectionModeSchema,
  MallOrdersScopeSchema,
  MallOrdersSelectionModeSchema,
  type MallOrderOperationMall,
  type MallOrdersScope,
} from '@kiditem/shared/orders-operations';
import { z } from 'zod';
import { canonicalOwnerInputJson } from '../../common/owner-idempotency-key';

/**
 * 몰 주문 수집(`orders.mall_orders`, KID-359 H3)의 plan — 옛 attempt plan의 칸 그대로(몰 키·이름·계정·수집일·
 * 수집 방식·자동 선택과 본 행 키). owner가 begin에서 Channels 몰 식별로 계정을 확인한 뒤 적는다.
 */
export const MallOrdersPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  mallKey: z.string().refine(isMallOrderOperationMall, '몰 주문 kind로 옮긴 몰이 아닙니다'),
  mallName: z.string().min(1),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  collectionMode: MallOrdersCollectionModeSchema,
  selectionMode: MallOrdersSelectionModeSchema.optional(),
  seenRowKeys: z.array(z.string()).optional(),
}).strict();
export type MallOrdersPlan = z.infer<typeof MallOrdersPlanSchema> & { mallKey: MallOrderOperationMall };

/** 보관할 캡처 한 벌과 그 원소 수. 0이면 "걷었는데 없었다" — 변환하지 않고 주문 수 0이다. */
export interface MallOrdersCapture {
  source: { bytes: Buffer; fileName: string | null; contentType: string };
  captured: number;
}

/**
 * 몰마다 청크를 옛 변환 라우트가 받던 본문으로 모으는 규칙. 청크 원소 모양은 몰의 확장 수집기와 같다.
 * 여기 없는 몰은 아직 옮기지 않은 몰이라 plan이 거절한다(1차 몰을 하나씩 옮긴다).
 */
interface MallCaptureRule {
  /** `continuation` 청크를 받는 몰(아이스크림몰). */
  continuation?: z.ZodTypeAny;
  assemble(input: { rows: unknown[]; continuation: unknown | null; plan: MallOrdersPlan }): MallOrdersCapture;
}

const OrderObjectSchema = z.record(z.string(), z.unknown());

/** 목록 하나를 JSON 본문의 한 칸으로 보관하는 몰(키드키즈 `orders`, 아트공구 `rows`). 옛 서버 변환 본문과 같다. */
function jsonList(field: string, item: z.ZodTypeAny): MallCaptureRule {
  return {
    assemble({ rows }) {
      const parsed = item.array().safeParse(rows);
      if (!parsed.success) throw invalid('invalid_order_rows', { errors: issues(parsed.error) });
      return {
        source: { bytes: Buffer.from(canonicalOwnerInputJson({ [field]: parsed.data }), 'utf8'), fileName: null, contentType: 'application/json' },
        captured: parsed.data.length,
      };
    },
  };
}

const MALL_CAPTURE_RULES: Partial<Record<MallOrderOperationMall, MallCaptureRule>> = {
  kidkids: jsonList('orders', OrderObjectSchema.and(z.object({ items: z.array(z.unknown()) }))),
  art09: jsonList('rows', OrderObjectSchema.and(z.object({ orderId: z.string() }))),
};

export function mallCaptureReady(mallKey: MallOrderOperationMall): boolean {
  return MALL_CAPTURE_RULES[mallKey] !== undefined;
}

/**
 * scope 검증. 옮긴 몰(1차 4곳 중 규칙이 있는 몰)만, 자동 선택이면 본 행 키가 있어야 한다(옛 begin 규칙).
 */
export function mallOrdersScope(scope: unknown): MallOrdersScope & { mallKey: MallOrderOperationMall } {
  const parsed = MallOrdersScopeSchema.safeParse(scope);
  if (!parsed.success) throw invalid('invalid_scope', { errors: issues(parsed.error) });
  const value = parsed.data;
  if (!isMallOrderOperationMall(value.mallKey) || !mallCaptureReady(value.mallKey)) {
    throw invalid('mall_not_operation_kind', { mallKey: value.mallKey });
  }
  if (value.selectionMode === 'automatic' && !value.seenRowKeys) {
    throw invalid('automatic_selection_requires_seen_rows', { mallKey: value.mallKey });
  }
  return { ...value, mallKey: value.mallKey, channelAccountId: value.channelAccountId.toLowerCase() };
}

export function readMallOrdersPlan(value: unknown): MallOrdersPlan {
  const parsed = MallOrdersPlanSchema.safeParse(value);
  if (!parsed.success) throw invalid('invalid_plan', { errors: issues(parsed.error) });
  return parsed.data as MallOrdersPlan;
}

/** 청크 → 보관 캡처. `order_rows`는 순번대로 이어 붙이고, `continuation`은 받는 몰에서 한 장만. */
export function mallOrdersCapture(plan: MallOrdersPlan, chunks: readonly OperationStagedChunk[]): MallOrdersCapture {
  const rule = MALL_CAPTURE_RULES[plan.mallKey];
  if (!rule) throw invalid('mall_not_operation_kind', { mallKey: plan.mallKey });
  const rows: unknown[] = [];
  let continuation: unknown | null = null;
  for (const chunk of [...chunks].sort((a, b) => a.sequence - b.sequence)) {
    if (chunk.chunkKind === MALL_ORDERS_CHUNK_KIND) {
      rows.push(...chunk.payload);
      continue;
    }
    if (chunk.chunkKind === MALL_ORDERS_CONTINUATION_CHUNK_KIND && rule.continuation && continuation === null && chunk.payload.length === 1) {
      const parsed = rule.continuation.safeParse(chunk.payload[0]);
      if (!parsed.success) throw invalid('invalid_continuation', { errors: issues(parsed.error) });
      continuation = parsed.data;
      continue;
    }
    throw invalid('unexpected_chunk_kind', { chunkKind: chunk.chunkKind, sequence: chunk.sequence });
  }
  return rule.assemble({ rows, continuation, plan });
}

function issues(error: z.ZodError): Array<{ field: string; reason: string }> {
  return error.issues.slice(0, 5).map((issue) => ({ field: issue.path.join('.'), reason: issue.message }));
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
