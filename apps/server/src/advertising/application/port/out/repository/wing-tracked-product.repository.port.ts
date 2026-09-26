import type { OwnerTransaction } from '../../../../../common/owner-transaction';
// Outgoing port for Coupang Wing 카탈로그 상품 추적 persistence
// (`CoupangWingTrackedProduct`, `CoupangWingTrackedProductDailySnapshot`).
// WingTrackedProductService depends on this contract; the Prisma-backed adapter
// lives in `adapter/out/repository/wing-tracked-product.repository.adapter.ts`.
export const WING_TRACKED_PRODUCT_REPOSITORY_PORT = Symbol(
  'WingTrackedProductRepositoryPort',
);

export interface WingTrackedProductRow {
  id: string;
  organizationId: string;
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  imagePath: string | null;
  brandName: string | null;
  categoryHierarchy: string | null;
  sourceKeyword: string | null;
  enabled: boolean;
  lastCapturedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WingTrackedSnapshotValues {
  salePriceKrw: number | null;
  ratingCount: number | null;
  ratingAverage: number | null;
  pvLast28Day: number | null;
  salesLast28d: number | null;
  estimatedRevenue28d: number | null;
  conversionRate28d: number | null;
}

export interface WingTrackedSnapshotRow extends WingTrackedSnapshotValues {
  trackedProductId: string;
  businessDate: Date;
  capturedAt: Date;
}

export interface WingTrackedProductWithLatest extends WingTrackedProductRow {
  latestSnapshot: WingTrackedSnapshotRow | null;
}

export interface WingTrackedHistory {
  trackedProductId: string;
  productName: string;
  points: WingTrackedSnapshotRow[];
}

export interface UpsertWingTrackedProductInput {
  productId: string;
  itemId?: string | null;
  vendorItemId?: string | null;
  productName: string;
  imagePath?: string | null;
  brandName?: string | null;
  categoryHierarchy?: string | null;
  sourceKeyword?: string | null;
}

/** productId 로 매칭할 당일 스냅샷 입력(추적 등록/지표 갱신 공용). */
export interface UpsertWingSnapshotByProductIdInput extends WingTrackedSnapshotValues {
  productId: string;
  businessDate: Date;
  sourceKeyword: string | null;
  capturedAt: Date;
  /** 이 행을 쓴 실행(ADR-0025). 추적 등록 때의 첫 스냅샷은 없다. */
  operationId?: string | null;
}

/** 추적 대상 하나(켜진 추적 상품과 그 수집 키워드). */
export interface WingTrackedTargetRow {
  productId: string;
  sourceKeyword: string | null;
}

export interface WingTrackedProductRepositoryPort {
  /** 추적상품 목록(각 상품의 최신 스냅샷 포함). */
  list(organizationId: string): Promise<WingTrackedProductWithLatest[]>;
  /** 추적 등록/재활성화와 최초 당일 스냅샷을 한 owner transaction으로 저장한다. */
  registerWithInitialSnapshot(
    input: UpsertWingTrackedProductInput & WingTrackedSnapshotValues,
    organizationId: string,
  ): Promise<WingTrackedProductRow>;
  /** `{ id, organizationId }` 스코프 hard delete(스냅샷 cascade); 없으면 throws. */
  delete(id: string, organizationId: string): Promise<WingTrackedProductRow>;
  /** `{ id, organizationId }` 스코프 단건 조회. */
  findById(
    id: string,
    organizationId: string,
  ): Promise<WingTrackedProductRow | null>;
  /** 한 추적상품(id, org 스코프)의 최근 days 일 스냅샷 — businessDate asc. */
  findHistory(
    id: string,
    organizationId: string,
    days: number,
  ): Promise<WingTrackedSnapshotRow[]>;
  /** 조직의 모든 추적상품 최근 이력을 단일 bounded read 로 조회한다. */
  findBulkHistory(
    organizationId: string,
    days: number,
  ): Promise<WingTrackedHistory[]>;
  /** 지금 켜진 추적 대상(productId 순). 수집 실행의 plan이 이것을 고정한다. */
  listEnabledTargets(organizationId: string): Promise<WingTrackedTargetRow[]>;
  /**
   * 수집 실행 finish 트랜잭션(`tx`)에서 그 업무일 스냅샷을 실행 ID와 함께 바꿔 쓴다. 추적 대상이 계획 때와 달라졌으면
   * `ADVERTISING_TRACKED_TARGETS_CHANGED`(추적 등록·해제와 같은 잠금으로 줄 세운다).
   */
  publishOperationSnapshots(tx: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    businessDate: Date;
    plannedTargets: readonly WingTrackedTargetRow[];
    captures: readonly (WingTrackedSnapshotValues & { productId: string; sourceKeyword: string })[];
  }): Promise<{ captured: number }>;
}
