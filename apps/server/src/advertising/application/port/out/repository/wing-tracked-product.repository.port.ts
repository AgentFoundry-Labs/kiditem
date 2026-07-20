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
}

export interface WingTrackedProductRepositoryPort {
  /** 추적상품 목록(각 상품의 최신 스냅샷 포함). */
  list(organizationId: string): Promise<WingTrackedProductWithLatest[]>;
  /** (org, productId) upsert — 이미 있으면 전달 필드만 갱신하고 enabled=true 로 되살린다. */
  upsertByProductId(
    input: UpsertWingTrackedProductInput,
    organizationId: string,
  ): Promise<WingTrackedProductRow>;
  /** `{ id, organizationId }` 스코프 hard delete(스냅샷 cascade); 없으면 throws. */
  delete(id: string, organizationId: string): Promise<WingTrackedProductRow>;
  /** `{ id, organizationId }` 스코프 단건 조회. */
  findById(
    id: string,
    organizationId: string,
  ): Promise<WingTrackedProductRow | null>;
  /**
   * productId 로 org 의 추적상품을 매칭해 당일(businessDate) 스냅샷을 upsert 하고
   * 매칭된 추적상품의 lastCapturedAt 을 갱신한다. 매칭 안 된 입력은 무시. 처리 수 반환.
   */
  upsertSnapshotsByProductId(
    rows: UpsertWingSnapshotByProductIdInput[],
    organizationId: string,
  ): Promise<number>;
  /** 한 추적상품(id, org 스코프)의 최근 days 일 스냅샷 — businessDate asc. */
  findHistory(
    id: string,
    organizationId: string,
    days: number,
  ): Promise<WingTrackedSnapshotRow[]>;
}
