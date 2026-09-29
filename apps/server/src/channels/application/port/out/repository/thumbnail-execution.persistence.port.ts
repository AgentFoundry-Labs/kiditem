import type { ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';

export const THUMBNAIL_EXECUTION_PERSISTENCE_PORT = Symbol('THUMBNAIL_EXECUTION_PERSISTENCE_PORT');

/**
 * 대표이미지 반영의 Channels 쪽 읽기(KID-364). 실행은 `channels.registration` 실행(`executionKind = 'thumbnail_update'`)이고
 * 실행 계약의 읽기 함수로만 본다 — 옛 등록 실행 표는 읽지 않는다.
 */
export interface ThumbnailExecutionPersistencePort {
  /**
   * 판매 상품과 반영할 계정 · listing. 판매 상품이 이 조직 것이 아니면 없음 오류. 운영자가 고른 listing 은
   * 이 조직의 살아 있는 대표이미지 지원 listing 이면서 이 판매상품의 것이어야 한다(아니면 입력 오류).
   * 고르지 않았으면 판매상품의 대표이미지 지원 listing 이다.
   */
  readAccountEvidence(input: {
    organizationId: string;
    pickedListingId: string | null;
    salesProductId: string;
  }): Promise<{
    /** 판매 상품 이름. listing 이름이 없을 때 몰 관리자에서 상품을 찾는 이름이다. */
    salesProductName: string;
    listingAccountId: string | null;
    channelListingId: string | null;
    /** 반영할 listing 의 몰 상품명. 몰 관리자에서 상품을 찾는 이름이다. */
    listingChannelName: string | null;
    /** 반영할 listing 의 몰 상품 id. 없으면 null. */
    listingExternalId: string | null;
    /** 고르지 않았을 때 판매상품의 살아 있는 대표이미지 지원 listing 수(2 는 "여럿"). */
    productListingCount: number;
    /** 대표이미지 반영을 지원하는 채널의 활성 계정 id 들. */
    activeAccountIds: string[];
    /** 위 listing 계정과 활성 계정들의 채널 키. */
    channelByAccountId: Record<string, string>;
  }>;
  /** 그 판매 상품 · 계정의 등록 대상이 고른 대표이미지 자산. 대상이 없거나 고르지 않았으면 null. */
  findTargetThumbnailAssetId(input: {
    organizationId: string;
    salesProductId: string;
    channelAccountId: string;
  }): Promise<string | null>;
  /** 판매상품의 살아 있는 대표이미지 지원 listing. 운영자가 고를 목록이다. */
  findListingChoices(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<Array<{ id: string; channelName: string | null; channelAccountName: string; externalId: string }>>;
  /** 판매 상품마다 가장 최근 대표이미지 반영 실행. */
  findLatest(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ThumbnailExecutionStatus[]>;
}
