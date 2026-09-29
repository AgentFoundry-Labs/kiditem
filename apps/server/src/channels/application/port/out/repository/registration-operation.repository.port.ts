import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { RegistrationAvailabilityListing } from '@kiditem/shared/channels-operations';
import type { TargetExecutionSnapshot } from '@kiditem/shared/sales-product';

/**
 * 애플리케이션이 모은 실행 의도 — 동결 스냅샷에서 채널 어댑터가 plan 트랜잭션 안에서 채우는
 * `adapterPayload` 만 빠진다(KID-321). `representativeImage` 는 등록 · 구성 전환이 몰에 보낼 대표이미지 자산이고
 * (KID-313 W3a), 저장소가 `adapterPayload.representativeImage` 로 얼린다 — 몰 어댑터가 그 사진을 대표이미지로 쓴다.
 */
export type TargetExecutionIntent = Omit<TargetExecutionSnapshot, 'adapterPayload'> & {
  representativeImage?: { assetId: string; url: string } | null;
};

export const REGISTRATION_OPERATION_REPOSITORY_PORT = Symbol('REGISTRATION_OPERATION_REPOSITORY_PORT');

export interface PlannedTargetExecution {
  snapshot: TargetExecutionSnapshot;
  mallKey: string;
  expectedProviderAccountId: string | null;
  /** 실행이 붙는 기존 몰 상품의 외부 id(없으면 null). */
  externalListingId: string | null;
}

export interface RegistrationAccountFacts {
  id: string;
  channel: string;
  expectedProviderAccountId: string | null;
}

/** 몰이 확정한 등록의 증거. 확장 청크(`registration_evidence`)나 운영자 확인에서 온다. */
export interface RegistrationConfirmationEvidence {
  channelAccountId: string;
  externalListingId: string;
  observedUrl: string | null;
  providerAccountId: string | null;
  observedStatus: string | null;
  options: Array<{ salesProductOptionId: string; externalOptionId: string; sellerSku: string | null }>;
}

/**
 * `channels.registration` 의 Channels 쪽 영속 조합(KID-364). 실행 자체는 실행 계약이 갖고, 여기서는 대상 · 계정 ·
 * 리스팅 · 옵션만 확인하고 쓴다.
 */
export interface RegistrationOperationRepositoryPort {
  /** 대상 · 계정 · 상품 · 옵션 · 리스팅을 잠가 확인하고 어댑터 사실을 얼린 문서를 돌려준다. 쓰지 않는다. */
  planTarget(input: { organizationId: string; intent: TargetExecutionIntent; expectedVersion: number }): Promise<PlannedTargetExecution>;
  /** 이 조직의 활성 계정. 없으면 없음 · 꺼져 있으면 비활성 오류. */
  readActiveAccount(organizationId: string, channelAccountId: string): Promise<RegistrationAccountFacts>;
  /** 품절 · 재개 묶음: 리스팅 id · 옵션 id 를 이 계정의 살아 있는 리스팅 · 옵션으로 풀고 몰 규칙을 확인한다. */
  planAvailability(input: {
    organizationId: string;
    channelAccountId: string;
    action: 'sold_out' | 'resume';
    items: ReadonlyArray<{ channelListingId?: string; channelListingOptionIds?: readonly string[] }>;
  }): Promise<{ account: RegistrationAccountFacts; listings: RegistrationAvailabilityListing[] }>;
  /**
   * 몰이 확정한 등록(register · update · composition_change)을 finish 트랜잭션 안에서 반영한다: 증거 확인,
   * 리스팅 연결 · 생성, 옵션 연결, 구성 레시피, 첫 등록의 셀피아 레시피.
   */
  /** 확인된 리스팅 단위 품절 · 재개: 몰이 다시 보여 준 리스팅 상태를 finish 트랜잭션 안에서 적는다. */
  recordListingStatuses(transaction: OwnerTransaction, input: {
    organizationId: string;
    channelAccountId: string;
    listings: ReadonlyArray<{ channelListingId: string; externalListingId: string; status: string }>;
  }): Promise<void>;
  confirmTarget(transaction: OwnerTransaction, input: {
    organizationId: string;
    channelAccountId: string;
    expectedProviderAccountId: string | null;
    snapshot: TargetExecutionSnapshot;
    evidence: RegistrationConfirmationEvidence;
    /** 운영자 확인은 계정 식별자 · 관리자 URL 없이 몰 상품 id 형식만 본다(사람이 몰에서 읽은 값). */
    confirmedByOperator: boolean;
  }): Promise<{ channelListingId: string }>;
}
