import { KiditemConflictError, KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  COMPETITOR_SELLER_IDENTITY_CHUNK_KIND,
  COMPETITOR_SELLER_IDENTITY_MAX_TARGETS,
  CompetitorSellerIdentityItemSchema,
  advertisingKeywordIdentity,
  type CompetitorSellerIdentityItem,
  type CompetitorSellerIdentityPlan,
  type CompetitorSellerIdentityTarget,
} from '@kiditem/shared/advertising-operations';
import type { OperationStagedChunk } from '@kiditem/shared/operation';

/** 상품 상세 주소(www.coupang.com/vp/products/<id>)인 대상만 연다(옛 attempt `eligible`). */
export function isProductDetailLink(link: string): boolean {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && url.hostname === 'www.coupang.com' && /^\/vp\/products\/\d+/.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * 경쟁 판매자 확인 계획(`advertising.competitor_seller_identity`, KID-362): 서버 선택(최근 SERP에서 판매자를 모르는 경쟁
 * 상품, 겹침 점수·순위 순, 200개)을 그대로 쓰고, 키워드를 주면 그 키워드의 대상만 남긴다. 상품 상세 주소가 아닌 대상은
 * 계획에서 빼고 그 수를 남긴다.
 */
export function planSellerIdentity(input: {
  selected: ReadonlyArray<{ keyword: string; productKey: string; productId: string | null; vendorItemId: string | null; name: string | null; link: string; rank: number; matchScore: number }>;
  keywords?: readonly string[];
}): CompetitorSellerIdentityPlan {
  const requested = input.keywords ? new Set(input.keywords.map(advertisingKeywordIdentity)) : null;
  const scoped = input.selected.filter((target) => requested === null || requested.has(advertisingKeywordIdentity(target.keyword)));
  const targets: CompetitorSellerIdentityTarget[] = scoped
    .filter((target) => isProductDetailLink(target.link) && target.rank > 0)
    .slice(0, COMPETITOR_SELLER_IDENTITY_MAX_TARGETS)
    .map((target) => ({
      keyword: target.keyword,
      productKey: target.productKey,
      productId: target.productId?.slice(0, 40) ?? null,
      vendorItemId: target.vendorItemId?.slice(0, 40) ?? null,
      name: (target.name ?? '').slice(0, 300),
      link: target.link,
      rank: target.rank,
      matchScore: target.matchScore,
    }));
  return { targets, excludedTargetCount: Math.min(scoped.length, COMPETITOR_SELLER_IDENTITY_MAX_TARGETS) - targets.length };
}

/**
 * 청크 → 판매자 확인. 모든 원소가 계획한 대상(키워드·상품키·링크·상품/옵션 ID)과 맞아야 하고, 계획한 대상을 모두 확인해야
 * 발행한다(옛 attempt와 같다 — 하나라도 못 읽으면 실패, 이전 판매자 정보는 그대로).
 */
export function assembleSellerIdentities(plan: CompetitorSellerIdentityPlan, chunks: readonly OperationStagedChunk[]): CompetitorSellerIdentityItem[] {
  const targets = new Map(plan.targets.map((target) => [targetKey(target), target]));
  const seen = new Map<string, CompetitorSellerIdentityItem>();
  for (const chunk of chunks) {
    if (chunk.chunkKind !== COMPETITOR_SELLER_IDENTITY_CHUNK_KIND) invalid('unexpected_chunk_kind');
    for (const raw of chunk.payload) {
      const parsed = CompetitorSellerIdentityItemSchema.safeParse(raw);
      if (!parsed.success) invalid('invalid_chunk_item');
      const key = targetKey(parsed.data);
      const target = targets.get(key);
      if (!target || seen.has(key) || target.link !== parsed.data.link
        || target.productId !== parsed.data.productId || target.vendorItemId !== parsed.data.vendorItemId) {
        invalid('identity_target_mismatch');
      }
      seen.set(key, parsed.data);
    }
  }
  if (seen.size !== targets.size) {
    throw new KiditemConflictError('ADVERTISING_COLLECTION_INCOMPLETE', { details: { reason: 'identity_evidence_incomplete' } });
  }
  return [...seen.values()];
}

function targetKey(target: { keyword: string; productKey: string }): string {
  return JSON.stringify([target.keyword, target.productKey]);
}

function invalid(reason: string): never {
  throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason } });
}
