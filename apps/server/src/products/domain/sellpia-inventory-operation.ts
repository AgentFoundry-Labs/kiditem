import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SELLPIA_INVENTORY_CHUNK_KIND,
  SellpiaInventoryChunkHeaderSchema,
  SellpiaInventoryScopeSchema,
} from '@kiditem/shared/sellpia-operations';
import {
  SellpiaInventoryBrowserSnapshotRowSchema,
  SellpiaInventoryBrowserSnapshotSchema,
  type SellpiaInventoryBrowserSnapshot,
} from '@kiditem/shared/source-import';
import { SellpiaInventoryCollectionTriggerSchema } from '@kiditem/shared/sellpia-inventory-freshness';
import { z } from 'zod';

/** 셀피아 재고를 시작할 수 있는 계기(옛 owner begin과 같다). 없으면 finalize가 첫 수집/수동 요청으로 정한다. */
const PLAN_TRIGGERS = ['initial_snapshot', 'manual_request', 'retry'] as const;
const PlanTriggerSchema = SellpiaInventoryCollectionTriggerSchema.extract(PLAN_TRIGGERS);
export type SellpiaInventoryPlanTrigger = z.infer<typeof PlanTriggerSchema>;

export interface SellpiaInventoryPlan {
  parserVersion: 'sellpia-inventory-v1';
  sourceOrigin: 'https://kiditem.sellpia.com';
  sourceAccountKey: 'kiditem';
  trigger: SellpiaInventoryPlanTrigger | null;
}

const PlanSchema = z.object({
  parserVersion: z.literal('sellpia-inventory-v1'),
  sourceOrigin: z.literal('https://kiditem.sellpia.com'),
  sourceAccountKey: z.literal('kiditem'),
  trigger: PlanTriggerSchema.nullable(),
}).strict();

/** scope → plan. 셀피아 상품 목록 전체를 읽는다(옛 `scope: 'inventory'`); 범위 입력은 없다. */
export function sellpiaInventoryPlan(scope: unknown): SellpiaInventoryPlan {
  const parsed = SellpiaInventoryScopeSchema.safeParse(scope);
  if (!parsed.success) throw invalid('invalid_scope', { errors: issues(parsed.error) });
  const trigger = parsed.data.trigger === undefined ? null : PlanTriggerSchema.safeParse(parsed.data.trigger);
  if (trigger && !trigger.success) throw invalid('invalid_trigger', { trigger: parsed.data.trigger });
  return {
    parserVersion: 'sellpia-inventory-v1',
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
    trigger: trigger ? trigger.data : null,
  };
}

/** finish가 돌려주는 저장된 plan을 다시 읽는다. */
export function storedSellpiaInventoryPlan(plan: unknown): SellpiaInventoryPlan {
  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) throw invalid('invalid_plan', { errors: issues(parsed.error) });
  return parsed.data;
}

/**
 * 청크 → 옛 JSON 스냅샷(`sellpia-inventory-snapshot-v1.json`)과 같은 값. 첫 `inventory_rows` 청크의 첫 항목이 머리
 * (`source`·`version`·`rowCount`)이고 나머지는 모두 상품 줄이다. 청크는 순번 순서로 이어 붙이고, 머리의 줄 수와
 * 받은 줄 수가 같아야 한다(빠진 청크를 성공으로 발행하지 않는다). 줄 정렬·중복은 발행 전 스냅샷 규칙이 본다.
 */
export function sellpiaInventorySnapshot(chunks: readonly OperationStagedChunk[]): SellpiaInventoryBrowserSnapshot {
  const ordered = [...chunks].sort((left, right) => left.sequence - right.sequence);
  const items: unknown[] = [];
  for (const chunk of ordered) {
    if (chunk.chunkKind !== SELLPIA_INVENTORY_CHUNK_KIND) throw invalid('unexpected_chunk_kind', { chunkKind: chunk.chunkKind });
    items.push(...chunk.payload);
  }
  const [first, ...rest] = items;
  const header = SellpiaInventoryChunkHeaderSchema.safeParse(first);
  if (!header.success) throw invalid('missing_header', { errors: issues(header.error) });
  const rows = z.array(SellpiaInventoryBrowserSnapshotRowSchema).safeParse(rest);
  if (!rows.success) throw invalid('invalid_inventory_rows', { errors: issues(rows.error) });
  if (rows.data.length !== header.data.rowCount) {
    throw invalid('row_count_mismatch', { expected: header.data.rowCount, received: rows.data.length });
  }
  // 옛 JSON 스냅샷 규칙 그대로: 상품·옵션 코드 순으로 정렬되고 겹치지 않는다(수집기가 정렬해 보낸다).
  const snapshot = SellpiaInventoryBrowserSnapshotSchema.safeParse({ ...header.data, rows: rows.data });
  if (!snapshot.success) throw invalid('invalid_snapshot', { errors: issues(snapshot.error) });
  return snapshot.data;
}

function issues(error: z.ZodError) {
  return error.issues.slice(0, 5).map((issue) => ({ field: issue.path.join('.'), reason: issue.message }));
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
