import { createHash } from 'node:crypto';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SELLPIA_PROFIT_CHUNK_KIND,
  SellpiaProductProfitabilityScopeSchema,
  SellpiaProfitProductSchema,
  type SellpiaProfitProduct,
} from '@kiditem/shared/sellpia-operations';
import { z } from 'zod';
import { addDays, businessDateKey, evidenceCutoffDate, parseBusinessDate } from '../../../common/kst';

/** 원가 근거가 교정된 수집 계약(구매기간 합계 매입가). 옛 v1 그래프 원가는 ABC 근거가 아니다. */
export const SELLPIA_PROFITABILITY_PARSER_VERSION = 'sellpia-profitability-v2' as const;
/** 상품 손익 수집은 어제(KST)까지 401일(양 끝 포함)을 읽는다(ARCHITECTURE.md). */
export const SELLPIA_PROFITABILITY_WINDOW_DAYS = 401;

export interface SellpiaProfitabilityPlan {
  parserVersion: typeof SELLPIA_PROFITABILITY_PARSER_VERSION;
  from: string;
  to: string;
  coveredMonths: string[];
  /** 시작할 때의 상품 매핑 세대. finish가 같은 세대에서만 발행한다(옛 attempt와 같다). */
  mappingGeneration: string;
}

const PlanSchema = z.object({
  parserVersion: z.literal(SELLPIA_PROFITABILITY_PARSER_VERSION),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coveredMonths: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).min(1).max(15),
  mappingGeneration: z.string().regex(/^\d+$/),
}).strict();

/**
 * scope → plan. 기본은 어제(KST)까지 401일이고, 원천 가용일을 주면 그날부터(창 안일 때만) 읽는다 — 옛
 * `buildSellpiaProfitabilityPlan` 규칙 그대로.
 */
export function sellpiaProfitabilityPlan(scope: unknown, now: Date, mappingGeneration: bigint): SellpiaProfitabilityPlan {
  const parsed = SellpiaProductProfitabilityScopeSchema.safeParse(scope);
  if (!parsed.success) throw invalid('invalid_scope', { errors: issues(parsed.error) });
  const end = evidenceCutoffDate(now);
  const earliest = addDays(end, -(SELLPIA_PROFITABILITY_WINDOW_DAYS - 1));
  let from = earliest;
  const availabilityValue = parsed.data.normalizedSourceAvailabilityDate;
  if (availabilityValue !== undefined) {
    const availability = parseBusinessDate(availabilityValue);
    if (!availability || availability > end) {
      throw invalid('availability_outside_plan', { normalizedSourceAvailabilityDate: availabilityValue });
    }
    if (availability > earliest) from = availability;
  }
  const fromKey = businessDateKey(from);
  const toKey = businessDateKey(end);
  return {
    parserVersion: SELLPIA_PROFITABILITY_PARSER_VERSION,
    from: fromKey,
    to: toKey,
    coveredMonths: monthsBetween(fromKey, toKey),
    mappingGeneration: mappingGeneration.toString(),
  };
}

export function storedSellpiaProfitabilityPlan(plan: unknown): SellpiaProfitabilityPlan {
  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) throw invalid('invalid_plan', { errors: issues(parsed.error) });
  return parsed.data;
}

/**
 * 청크 → 상품 손익 제출(옛 v2 `products[]`). 청크는 `profit_months`만, 항목은 상품 하나다. 받은 본문의 체크섬·바이트는
 * 옛 제출과 같은 정규화(범위·덮은 달·빈 증명·출처·상품)로 잰다 — ABC 근거가 세대의 품질 값을 이것으로 검증한다.
 */
export function sellpiaProfitabilitySubmission(
  chunks: readonly OperationStagedChunk[],
  plan: SellpiaProfitabilityPlan,
): { products: SellpiaProfitProduct[]; contentChecksum: string; contentByteCount: number } {
  const products: SellpiaProfitProduct[] = [];
  for (const chunk of [...chunks].sort((left, right) => left.sequence - right.sequence)) {
    if (chunk.chunkKind !== SELLPIA_PROFIT_CHUNK_KIND) throw invalid('unexpected_chunk_kind', { chunkKind: chunk.chunkKind });
    const parsed = SellpiaProfitProductSchema.array().safeParse(chunk.payload);
    if (!parsed.success) throw invalid('invalid_profit_products', { sequence: chunk.sequence, errors: issues(parsed.error) });
    products.push(...parsed.data);
  }
  const canonical = JSON.stringify({
    parserVersion: plan.parserVersion,
    coveredMonths: plan.coveredMonths,
    providerBackedEmptyProof: products.length === 0,
    provenance: { source: 'sellpia_stat_prd_profit', costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
    products,
  });
  return {
    products,
    contentChecksum: createHash('sha256').update(canonical).digest('hex'),
    contentByteCount: Buffer.byteLength(canonical),
  };
}

export function monthsBetween(from: string, to: string): string[] {
  const fromDate = parseBusinessDate(from);
  const toDate = parseBusinessDate(to);
  if (!fromDate || !toDate || fromDate > toDate) throw invalid('invalid_plan', { from, to });
  const values: string[] = [];
  for (
    let index = fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth();
    index <= toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();
    index += 1
  ) {
    values.push(`${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`);
  }
  return values;
}

function issues(error: z.ZodError) {
  return error.issues.slice(0, 5).map((issue) => ({ field: issue.path.join('.'), reason: issue.message }));
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
