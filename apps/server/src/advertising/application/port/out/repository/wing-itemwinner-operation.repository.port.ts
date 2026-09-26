import type { WingItemwinnerListingObservation, WingItemwinnerRow } from '@kiditem/shared/advertising-operations';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const WING_ITEMWINNER_OPERATION_REPOSITORY_PORT = Symbol('WingItemwinnerOperationRepositoryPort');

export interface WingItemwinnerPublication {
  matchedCount: number;
  listingObservations: WingItemwinnerListingObservation[];
}

/**
 * `advertising.wing_itemwinner`의 원장 쓰기(KID-362). Advertising이 Channels 일별 사실(`ChannelListingDailySnapshot`·
 * `ChannelListingOptionDailySnapshot`)의 위너 열을 쓰는 유일한 길이다(advertising/CLAUDE.md). 쓰기는 finish 트랜잭션 안에서만.
 */
export interface WingItemwinnerOperationRepositoryPort {
  /** 활성 쿠팡 계정인가. `transaction`이 없으면 자기 읽기로 본다(plan). */
  isActiveCoupangAccount(organizationId: string, channelAccountId: string, transaction?: OwnerTransaction): Promise<boolean>;
  /** 행을 listing·option에 맞춰 그날 행에 upsert하고 실행 id를 찍는다. 맞지 않는 행은 세기만 한다. */
  publish(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      operationId: string;
      channelAccountId: string;
      businessDate: string;
      observedAt: Date;
      rows: readonly WingItemwinnerRow[];
    },
  ): Promise<WingItemwinnerPublication>;
  /** 최종 실패를 계정마다 하나인 원천 실패 알림으로 남긴다(`*_CANCELLED`는 남기지 않는다 — 옛 attempt와 같다). */
  recordFailure(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; channelAccountId: string; errorCode: string; errorMessage: string | null },
  ): Promise<void>;
  /** 성공한 실행이 그 계정의 열린 실패 알림을 닫는다. */
  resolveFailure(transaction: OwnerTransaction, input: { organizationId: string; operationId: string; channelAccountId: string }): Promise<void>;
}
