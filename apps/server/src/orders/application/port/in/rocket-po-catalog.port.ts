import type {
  CoupangRocketPoPlan,
  CoupangRocketPoResult,
  CoupangRocketPoScan,
  CoupangRocketPoScope,
} from '@kiditem/shared/orders-operations';
import type {
  RocketPoCatalogPublication,
  RocketPoCatalogRow,
  RocketSavedPoSnapshot,
  RocketSavedPoSummary,
} from '@kiditem/shared/rocket-purchase-preview';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

/** 옛 attempt run의 원천 유형·파서(N까지). Channels 판정이 옛 완료 run이 쓴 리스팅을 계속 인정할 때만 읽는다. */
export const ROCKET_PO_CATALOG_SOURCE_TYPE = 'coupang_rocket_po_catalog';
export const ROCKET_PO_CATALOG_PARSER_VERSION = 'rocket-po-v1';
/** 채널 목록 관측에 적는 원천 표시(옛 source type과 같은 글자 — 목록 raw의 출처 표시로만 쓴다). */
export const ROCKET_PO_CATALOG_RAW_SOURCE = ROCKET_PO_CATALOG_SOURCE_TYPE;
export type RocketPoCatalogIdentity = { poLineId: string; channelSkuId: string };
export type RocketPoCompleteCollection = RocketSavedPoSnapshot & { catalog: RocketPoCatalogPublication; identities: RocketPoCatalogIdentity[] };

/**
 * 로켓 PO 원천(Orders, KID-359). 수집은 실행 kind `orders.coupang_rocket_po`다 — begin의 plan과 finish의 발행이
 * 이 포트를 거친다. Supply는 발행된 수집을 실행 ID(`rocketPoOperationId`)로 읽는다.
 */
export interface RocketPoCatalogPort {
  /** begin: 계정이 활성 로켓 계정인지 확인하고 지금의 공급자 기대값을 plan에 고정한다. */
  planOperation(input: { organizationId: string; scope: CoupangRocketPoScope }): Promise<CoupangRocketPoPlan>;
  /** finish 트랜잭션: 완결을 확인하고 공급자 식별 → Channels 관측 식별 → 스냅샷 순으로 발행한다. */
  publishOperation(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      operationId: string;
      plan: CoupangRocketPoPlan;
      rows: readonly RocketPoCatalogRow[];
      scan: CoupangRocketPoScan;
    },
  ): Promise<CoupangRocketPoResult>;
  readComplete(input: {
    organizationId: string;
    channelAccountId: string;
    rocketPoOperationId: string;
  }): Promise<RocketPoCompleteCollection>;
  /** 호출자 트랜잭션 안에서 그 계정의 발행된 수집인지 확인한다. 아니면 SUPPLY_ROCKET_COLLECTION_INCOMPLETE. */
  assertPublished(
    transaction: OwnerTransaction,
    input: { organizationId: string; channelAccountId: string; rocketPoOperationId: string },
  ): Promise<void>;
  listSavedPos(input: {
    organizationId: string;
    channelAccountId: string;
    from: string;
    to: string;
    status?: string;
  }): Promise<RocketSavedPoSummary[]>;
  loadSavedCollection(input: {
    organizationId: string;
    channelAccountId: string;
    rocketPoOperationId: string;
  }): Promise<RocketSavedPoSnapshot | null>;
}
export const ROCKET_PO_CATALOG_PORT = Symbol('ROCKET_PO_CATALOG_PORT');
