import type {
  MallAdminListingsBegin,
  MallAdminListingsControl,
  MallAdminListingsSource,
  MallAdminListingsSubmission,
} from '@kiditem/shared/mall-admin-listings';

/**
 * 몰 관리자 화면에서 등록 상품을 직접 가져오는 원천 owner(KID-246 2단계).
 *
 * 가져오기 한 번은 몰 계정 행 하나의 시도 하나다. 완료 스냅샷은 그 몰의 상품 목록 전체이고,
 * 발행은 그 계정의 리스팅만 바꾼다. 마스터 상품과 레시피는 만들지 않는다.
 */
export interface MallAdminListingsPort {
  begin(input: {
    organizationId: string;
    userId: string;
    idempotencyKey: string;
    request: MallAdminListingsBegin;
  }): Promise<MallAdminListingsControl>;
  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<MallAdminListingsControl>;
  /**
   * 몰마다의 현재. 실행 kind로 옮긴 1차 몰은 이 kind의 최근 200개 실행(상태별) 안에서 그 몰 계정의 실행을 고른다 —
   * 그 창 밖으로 밀린 몰은 실행이 없는 것처럼 보인다(`MallAdminListingsService.RECENT_OPERATIONS`).
   */
  readSource(input: { organizationId: string }): Promise<MallAdminListingsSource>;
  complete(input: {
    organizationId: string;
    attemptId: string;
    token: string;
    submission: MallAdminListingsSubmission;
  }): Promise<MallAdminListingsControl>;
  fail(input: {
    organizationId: string;
    attemptId: string;
    token: string;
    code: string;
    message: string;
  }): Promise<MallAdminListingsControl>;
  /** 토큰 없는 운영자 중단. 끝난 시도는 그대로 돌려준다. */
  cancel(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<MallAdminListingsControl>;
}

export const MALL_ADMIN_LISTINGS_PORT = Symbol('MALL_ADMIN_LISTINGS_PORT');
