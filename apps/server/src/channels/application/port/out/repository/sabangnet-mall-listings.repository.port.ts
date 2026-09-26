import type {
  SabangnetMallListingRow,
  SabangnetMallListingsPlan,
  SabangnetMallListingsPublication,
  SabangnetMallListingsSourceMall,
} from '@kiditem/shared/sabangnet-mall-listings';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';

/** 사방넷 몰 목록 kind의 Channels 원장. `publish`는 실행 계약의 finish 트랜잭션 안에서만 부른다. */
export interface SabangnetMallListingsRepositoryPort {
  /** 사방넷 쇼핑몰이 오는 몰마다 쇼핑몰 현황이 보는 계정 행(없으면 null). 상태는 가리지 않는다. */
  readMalls(organizationId: string): Promise<SabangnetMallListingsSourceMall[]>;
  /**
   * 계획의 몰 계정 행이 그대로인지 확인하고, 몰마다 리스팅을 쓰고 이 원천이 만든 행 중 목록에 없는 것을 끈다.
   * 계정 행이 바뀌었으면 아무것도 쓰지 않고 거절한다.
   */
  publish(
    tx: OwnerTransaction,
    input: { organizationId: string; operationId: string; plan: SabangnetMallListingsPlan; rows: SabangnetMallListingRow[] },
  ): Promise<SabangnetMallListingsPublication[]>;
}

export const SABANGNET_MALL_LISTINGS_REPOSITORY_PORT = Symbol(
  'SABANGNET_MALL_LISTINGS_REPOSITORY_PORT',
);
