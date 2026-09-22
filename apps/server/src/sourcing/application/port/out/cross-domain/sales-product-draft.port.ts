import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { SalesProduct } from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_DRAFT_PORT = Symbol('SALES_PRODUCT_DRAFT_PORT');

/** 원천 한 줄이 초안에 넘기는 사실. 원천 기록은 Sourcing 것이고 초안은 Channels 것이다. */
export interface SalesProductDraftSourceFacts {
  candidateId: string;
  name: string;
  description?: string;
  imageUrls?: readonly string[];
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
  optionNames?: readonly string[];
  costCny?: number | null;
  rawBasics?: Record<string, unknown> | null;
}

/**
 * 수집한 상품의 편집 정본은 Channels 의 판매상품 초안이다(KID-310). 후보를 담으면 초안 하나가
 * 생기고, 후보를 거절 · 삭제하면 그 초안이 `unused` 로 내려간다. Sourcing 은 초안 행을 직접
 * 쓰지 않고 이 계약으로만 부탁한다.
 */
export interface SalesProductDraftPort {
  /** 후보당 초안 하나. 같은 후보를 다시 담아도 초안은 늘지 않는다. */
  createFromSource(organizationId: string, input: SalesProductDraftSourceFacts): Promise<{ salesProductId: string }>;
  /** 그 후보에서 만든 초안 id. 없으면 null. */
  findDraftIdForSource(organizationId: string, candidateId: string): Promise<string | null>;
  /** 배치판. 목록 한 쪽의 후보를 한 번에 초안으로 옮긴다. 초안이 없는 후보는 맵에 없다. */
  findDraftIdsForSources(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<Map<string, string>>;
  /** 초안 한 줄. 생성 prompt 가 쓰는 값(설명 · 대상 · 크기 · 색상 · 박스)은 여기서 온다. */
  getDraft(organizationId: string, salesProductId: string): Promise<SalesProduct>;
  /**
   * 후보 거절 · 삭제. 몰에 올라가 있으면 초안을 그대로 두고 이유를 돌려준다(거절을 막지 않는다).
   * 후보를 종료하는 트랜잭션 안에서 부른다 — 후보만 거절되고 초안이 살아 있는 중간 상태를
   * 두지 않는다.
   */
  retireForSource(transaction: OwnerTransaction, organizationId: string, candidateId: string): Promise<{
    salesProductId: string | null;
    retired: boolean;
    blockedReason: string | null;
  }>;
}
