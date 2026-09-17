import type {
  SabangnetMallListingsBegin,
  SabangnetMallListingsControl,
  SabangnetMallListingsSource,
  SabangnetMallListingsSubmission,
} from '@kiditem/shared/sabangnet-mall-listings';

/**
 * 사방넷 송신 기록으로 몰 등록 상품을 가져오는 원천 owner(KID-246).
 *
 * 가져오기 한 번은 조직 단위 시도 하나다. 완료 스냅샷은 사방넷 송신 기록 전체이고,
 * 발행은 받을 몰 계정 행마다 리스팅을 바꾼다. 마스터 상품과 레시피는 만들지 않는다.
 */
export interface SabangnetMallListingsPort {
  begin(input: {
    organizationId: string;
    userId: string;
    idempotencyKey: string;
    request: SabangnetMallListingsBegin;
  }): Promise<SabangnetMallListingsControl>;
  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SabangnetMallListingsControl>;
  readSource(input: { organizationId: string }): Promise<SabangnetMallListingsSource>;
  complete(input: {
    organizationId: string;
    attemptId: string;
    token: string;
    submission: SabangnetMallListingsSubmission;
  }): Promise<SabangnetMallListingsControl>;
  fail(input: {
    organizationId: string;
    attemptId: string;
    token: string;
    code: string;
    message: string;
  }): Promise<SabangnetMallListingsControl>;
  /** 토큰 없는 운영자 중단. 끝난 시도는 그대로 돌려준다. */
  cancel(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SabangnetMallListingsControl>;
}

export const SABANGNET_MALL_LISTINGS_PORT = Symbol('SABANGNET_MALL_LISTINGS_PORT');
