/**
 * Outgoing port for `products` catalog access from `sourcing` domain.
 *
 * apps/server/AGENTS.md (Backend Architecture Contract): "Self-contained owner
 * domains — no casual direct imports of other domain Services. Cross-domain
 * orchestration goes through an application service, explicit port, or
 * existing platform/runtime boundary."
 *
 * sourcing 의 application service (SourcingService) 가 master_products 를
 * upsert 하기 위해 products 도메인의 MastersService 를 직접 import 하지 않도록
 * 차단하는 boundary. 새 master 생성은 MasterCodeService → code 발급 →
 * masterProduct 트랜잭션 까지 products 도메인 캡슐화에 위임된다.
 *
 * Bound in `sourcing.module.ts` to the concrete `SourcingProductsCatalogAdapter`
 * provider via `SOURCING_PRODUCTS_CATALOG_PORT` token.
 */

export const SOURCING_PRODUCTS_CATALOG_PORT = Symbol('SOURCING_PRODUCTS_CATALOG_PORT');

/**
 * Image role 은 `@kiditem/shared/product` 의 `MasterImageRoleSchema` 와 동일한
 * enum 이다. sourcing extension 은 사실상 모두 `'product'` 만 emit 하지만, 향후
 * box/color_variant 등 mid-pipeline 확장을 막지 않기 위해 동일한 enum 을 그대로
 * 노출.
 */
export type SourcingMasterImageRole =
  | 'box'
  | 'product'
  | 'color_variant'
  | 'size_chart'
  | 'detail';

export interface SourcingMasterImageInput {
  url: string;
  role: SourcingMasterImageRole;
  sortOrder: number;
  source: string;
  isPrimary: boolean;
  label?: string | null;
}

export interface SourcingCreateMasterInput {
  name: string;
  description?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  images?: SourcingMasterImageInput[];
  costCny?: number;
  category?: string;
  tags?: string[];
  sourceUrl?: string;
  sourcePlatform?: string;
  pipelineStep?: string;
}

export interface SourcingMasterHandle {
  /** master.id (UUID) */
  id: string;
}

export interface SourcingProductsCatalogPort {
  /**
   * sourcing extension ingest 가 새 master 를 생성할 때 호출.
   *
   * products 도메인의 `MastersService.create` 에 위임된다 — MasterCodeService
   * 가 트랜잭션 내부에서 `MasterCodeCounter` 를 increment 하여 family code
   * (`M-00000001` 형식) 를 발급한다. 따라서 이 port 의 호출자는 code 생성
   * 책임을 갖지 않는다.
   */
  createMaster(
    organizationId: string,
    input: SourcingCreateMasterInput,
  ): Promise<SourcingMasterHandle>;
}
