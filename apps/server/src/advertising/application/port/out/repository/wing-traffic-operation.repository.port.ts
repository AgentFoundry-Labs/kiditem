import type { WingTrafficDay, WingTrafficPlan, WingTrafficRow } from '@kiditem/shared/advertising-operations';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const WING_TRAFFIC_OPERATION_REPOSITORY_PORT = Symbol('WingTrafficOperationRepositoryPort');

export interface WingTrafficPublication {
  matchedCount: number;
  unmatchedCount: number;
  /** 날짜마다 카탈로그에 맞지 않은 Wing 옵션 id(KID-217). */
  unmatchedOptionIdsByDate: Record<string, string[]>;
}

/**
 * `advertising.wing_traffic`의 원장 쓰기(KID-362). listing-day 트래픽 열(`ChannelListingDailySnapshot.traffic*`)의
 * 유일한 쓰기 길이다. 쓰기는 finish 트랜잭션 안에서만, 원시 스냅샷·스테이징 없이 실행 청크에서 바로 쓴다.
 */
export interface WingTrafficOperationRepositoryPort {
  /** 활성 쿠팡 계정과 그 Wing 판매자 식별자. 없으면 null. */
  readAccount(
    organizationId: string,
    channelAccountId: string,
    transaction?: OwnerTransaction,
  ): Promise<{ id: string; vendorId: string | null } | null>;
  publish(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      operationId: string;
      /** 실행이 시작된 시각: 그 뒤 카탈로그에 들어온 리스팅은 빠진 날을 0으로 채우지 않는다. */
      startedAt: Date;
      plan: WingTrafficPlan;
      confirmedDays: readonly WingTrafficDay[];
      rows: readonly WingTrafficRow[];
    },
  ): Promise<WingTrafficPublication>;
}
