import { postForm, registerMallAvailability, type AvailabilityContext, type AvailabilitySendAnswer } from '../mall-write/availability';
import { availabilityGuard } from '../mall-write/guard';
import { ONCH_LOGIN, ONCH_PAGE_GUARD } from './index';

/**
 * 온채널 품절·재개(옛 `mall-availability-send.js` `onch` · `post`, KID-256). 폼이 아니라 ajax 한 방이다 — 상품코드를 `/`로 이어
 * 한 번에 보낸다. 4 = 일시품절(되돌릴 수 있는 값), 1 = 재입고. 화면을 열지 않는다(서비스워커가 판매자 쿠키로 보낸다).
 *
 * ⚠️ 관리자에게 가는 요청이다. 200이 와도 승인 전까지 반영이 아니다(`requestOnly`) — 다시 읽을 길도 없다.
 */
const ORIGIN = 'https://www.onch3.co.kr';
const PATH = '/access/product_access.php?ubr=option_state_modi';
const LABEL = '온채널';

async function send(context: AvailabilityContext, input: { codes: string[]; resume: boolean }): Promise<AvailabilitySendAnswer> {
  const body = input.resume
    ? { prd_code_str: input.codes.join('/'), sec: '1', comment: '재입고' }
    : { prd_code_str: input.codes.join('/'), sec: '4', comment: '재고 소진' };
  const answer = await postForm(context.fetch, ORIGIN, PATH, Object.entries(body));
  if (answer.loggedOut) return { success: false, error: `${LABEL} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
  return {
    success: true,
    sent: answer.accepted ? input.codes.length : 0,
    failed: answer.accepted ? 0 : input.codes.length,
    requestOnly: true,
    warnings: [`${LABEL}은 관리자 승인을 거칩니다 — 보낸 것이 곧 반영은 아닙니다.`],
  };
}

registerMallAvailability({
  mallKey: 'onch',
  displayName: LABEL,
  guard: availabilityGuard(ONCH_PAGE_GUARD, LABEL),
  dialogHosts: ['onch3.co.kr'],
  login: ONCH_LOGIN,
  send,
});
