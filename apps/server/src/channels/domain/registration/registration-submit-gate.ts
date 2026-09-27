import { findChannel } from '@kiditem/shared/channel-registry';
import { getMallAdapterManifest } from './mall-adapter-manifest';

/**
 * 등록 문서 실행(register · composition_change)의 plan 이 `submit` 을 허락하는가 — ADR-0019 관문의 서버 쪽 조건.
 * 브라우저가 [등록]을 누르는 몰(registry `delivery` 가 form · api)이면서, 송신이 반영이 아니라 몰 관리자 승인 요청인 몰
 * (`hazards.requiresOperatorApproval`)이 아닐 때만. 엑셀 · 전송 없음 몰은 채우기까지다. 가격 수정(update) · 품절 · 재개는 이 관문을 쓰지 않는다.
 */
export function registrationSubmitAllowed(mallKey: string): boolean {
  const delivery = findChannel(mallKey)?.delivery;
  if (delivery !== 'form' && delivery !== 'api') return false;
  return getMallAdapterManifest(mallKey)?.hazards.requiresOperatorApproval !== true;
}
