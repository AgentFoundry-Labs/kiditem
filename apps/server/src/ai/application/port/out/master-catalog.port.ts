/**
 * Outgoing port for `products` domain (master catalog) access from `ai` domain.
 *
 * AGENTS.md (apps/server): "no casual direct imports of other domain Services.
 * Cross-domain orchestration goes through an application service, explicit
 * port, or existing platform/runtime boundary."
 *
 * 이 port 는 ai 도메인의 application service (예: CoupangImageSyncService) 가
 * MasterProduct + ChannelListing + MasterProductImage 를 조회/생성/이미지 첨부
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

export interface AttachPrimaryImageInput {
  organizationId: string;
  masterId: string;
  storageKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
  /** Coupang Wing 원본 페이지 URL (sourceUrl 갱신용) */
  sourceUrl: string;
}

export interface MasterCatalogPort {
  /**
   * Coupang inventoryId 에 대응하는 ChannelListing 이 있으면 그 master 반환,
   * 없으면 새 master + listing 1쌍 생성. 조직 스코프 enforce 는 adapter 책임.
   */
  ensureCoupangMaster(input: {
    organizationId: string;
    inventoryId: string;
    name: string;
    sourceUrl: string;
  }): Promise<CoupangListingHandle>;

  /**
   * master 가 아직 어떤 image 도 없으면 primary image 첨부 + master.imageUrl
   * 갱신. 트랜잭션 내부에서 다시 한번 image 존재 여부 체크 (멱등 보장).
   * 이미 image 가 있으면 false 반환 (no-op).
   */
  attachPrimaryImage(input: AttachPrimaryImageInput): Promise<boolean>;
}
