/**
 * Outgoing port for `products` domain (master catalog) access from `ai` domain.
 *
 * AGENTS.md (apps/server): "no casual direct imports of other domain Services.
 * Cross-domain orchestration goes through an application service, explicit
 * port, or existing platform/runtime boundary."
 *
 * 이 port 는 ai 도메인의 application service (예: CoupangImageSyncService) 가
 * MasterProduct + ChannelListing + MasterProductImage 를 조회/이미지 첨부
 * 할 수 있도록 한정된 메서드만 노출한다. products domain 의 service 를 직접
 * import 하는 cross-domain 침범을 차단.
 *
 * Bound in `ai.module.ts` to the concrete `MasterCatalogAdapter` provider via
 * `MASTER_CATALOG_PORT` token.
 */

export const MASTER_CATALOG_PORT = Symbol('MASTER_CATALOG_PORT');

export interface CoupangListingHandle {
  /** master.id (UUID) */
  masterId: string;
  /** master 가 이미 product/thumbnail/image 중 하나라도 있는지 */
  hasImage: boolean;
}

export interface FindCoupangMasterInput {
  organizationId: string;
  inventoryId: string;
  legacyCode?: string | null;
  name: string;
}

export interface CoupangListingImageState {
  /** Coupang Wing inventory id (= ChannelListing.externalId). */
  inventoryId: string;
  /** master 가 이미 product/thumbnail/image 중 하나라도 있는지 */
  hasImage: boolean;
}

export interface AttachPrimaryImageInput {
  organizationId: string;
  masterId: string;
  /** Null when the image is an external source URL such as Coupang CDN. */
  storageKey: string | null;
  url: string;
  mimeType: string | null;
  fileSize: number | null;
}

export interface MasterCatalogPort {
  /**
   * 여러 Coupang inventoryId 에 대응하는 active ChannelListing 들의 이미지 보유
   * 상태를 한 번에 조회. 없는 listing 은 결과에서 빠진다.
   */
  findCoupangListingImageStates(input: {
    organizationId: string;
    inventoryIds: string[];
  }): Promise<CoupangListingImageState[]>;

  /**
   * Coupang inventoryId 에 대응하는 ChannelListing 이 있으면 그 master 반환.
   * 없으면 legacyCode 로 기존 ProductOption 을 찾고, 활성 Coupang 계정이
   * 확인된 경우에만 ChannelListing 을 연결한다.
   * 둘 다 실패하면 매칭 화면에서 사용자가 연결해야 하므로 null 을 반환한다.
   * 새 MasterProduct 는 자동 생성하지 않는다.
   */
  findCoupangMaster(input: FindCoupangMasterInput): Promise<CoupangListingHandle | null>;

  /**
   * master 가 아직 어떤 image 도 없으면 primary image 첨부 + master.imageUrl
   * 갱신. 트랜잭션 내부에서 다시 한번 image 존재 여부 체크 (멱등 보장).
   * 이미 image 가 있으면 false 반환 (no-op).
   */
  attachPrimaryImage(input: AttachPrimaryImageInput): Promise<boolean>;
}
