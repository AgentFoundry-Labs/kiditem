import type { MallAdminListingsSource } from '@kiditem/shared/mall-admin-listings';

/**
 * 몰 관리자 화면에서 등록 상품을 직접 가져오는 원천의 읽기(KID-246 2단계). 가져오기는 실행 kind
 * `channels.mall_admin_listings`(KID-363·381, `MallAdminListingsOperationPort`)이고, 화면은 몰마다의 현재를 이 읽기로 본다.
 */
export interface MallAdminListingsPort {
  /**
   * 몰마다의 현재 — 이 kind의 최근 200개 실행(상태별) 안에서 그 몰 계정의 실행을 고른다. 그 창 밖으로 밀린 몰은 실행이
   * 없는 것처럼 보인다(`MallAdminListingsService.RECENT_OPERATIONS`).
   */
  readSource(input: { organizationId: string }): Promise<MallAdminListingsSource>;
}

export const MALL_ADMIN_LISTINGS_PORT = Symbol('MALL_ADMIN_LISTINGS_PORT');
