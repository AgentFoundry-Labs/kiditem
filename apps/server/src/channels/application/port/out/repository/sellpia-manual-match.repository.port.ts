import type {
  SellpiaManualMatchPlan,
  SellpiaManualMatchRow,
  SellpiaManualMatchSnapshotStatus,
} from '@kiditem/shared/sellpia-manual-match';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const SELLPIA_MANUAL_MATCH_REPOSITORY_PORT = Symbol(
  'SELLPIA_MANUAL_MATCH_REPOSITORY_PORT',
);

export type SellpiaManualMatchAliasRecord = {
  masterProductId: string;
  aliasTitle: string;
  normalizedAlias: string;
  itemCount: number;
  matchedType: 'M' | 'P' | 'E';
  evidenceCount: number;
};

/** 수동매칭 kind의 Channels 원장. `publish`는 실행 계약의 finish 트랜잭션 안에서만 부른다. */
export interface SellpiaManualMatchRepositoryPort {
  getCurrentStatus(
    organizationId: string,
  ): Promise<SellpiaManualMatchSnapshotStatus | null>;
  findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ): Promise<SellpiaManualMatchAliasRecord[]>;
  /** 지금 활성인 셀피아 SKU 코드(정렬·중복 없음). 상품 잠금 아래에서 읽는다. */
  readActiveTargetCodes(organizationId: string): Promise<string[]>;
  /**
   * 상품 잠금 아래에서 대상 코드가 plan과 그대로인지 확인하고, 현재 리스팅 이름에 있는 별칭만 모아 조직의 스냅샷
   * 하나를 바꿔 쓴다. 대상이 바뀌었으면 쓰지 않고 거절한다.
   */
  publish(
    tx: OwnerTransaction,
    input: { organizationId: string; plan: SellpiaManualMatchPlan; rows: SellpiaManualMatchRow[] },
  ): Promise<SellpiaManualMatchSnapshotStatus>;
}
