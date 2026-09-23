import type { RegistrationAccountState } from '@kiditem/shared/sales-product';

export const REGISTRATION_STATE_PORT = Symbol('REGISTRATION_STATE_PORT');

/**
 * 판매 상품마다 몰 계정별 등록 상태(KID-313 결정 11, W4 KID-320). `GET …/registration/state`, 판매 상품
 * 목록, 리스팅 요약, 몰 매트릭스가 전부 이 포트로 읽는다 — 등록 상태의 근거는 설정 줄이 아니라 fence 와
 * 몰이 보고한 리스팅이고(ADR-0014), 판정은 `registration-account-state` 도메인 규칙이 한다.
 *
 * 등록 설정을 만들고 고치는 길은 `channels/registration-targets`(resolve · update · archive) 하나다 — 여기에는
 * 그 길이 없다. 실행 행을 쓰는 방법도 없다.
 */
export interface RegistrationStatePort {
  /**
   * 판매 상품마다 계정별 상태. 등록 설정이나 리스팅이 있는 계정만 줄이 있다. 원본 기록이 없는 상품(직접 작성 ·
   * 사방넷)도 같은 모양으로 읽는다. 없는 상품이나 다른 조직의 id 는 맵에 없다. 상품 수와 무관한 쿼리 수로 읽는다.
   */
  readForSalesProducts(organizationId: string, salesProductIds: readonly string[]): Promise<Map<string, SalesProductRegistrationView>>;
}

export interface SalesProductRegistrationView {
  accounts: RegistrationAccountState[];
}
