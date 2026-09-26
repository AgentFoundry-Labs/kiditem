import type { SiteSignIn } from './site-login';
import { isRuntimeError } from '../core/errors';
import { leftForOperator, OPERATOR_ACTION_REQUIRED, type TabPage, type TabPages } from './tab-page';

const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * 운영자 탭은 건드리지 않고 백그라운드 탭을 새로 열어 `url`로 옮긴 뒤 읽고 닫는다(옛 주문 수집기의 탭 규칙, KID-359 H3).
 * 로그인 화면·예상 밖 주소·운영자 조치로 끝나면 운영자가 볼 수 있게 탭을 남긴다(운영자 조치면 앞으로 가져온다). `signIn`이 있으면 읽기가 로그인 화면에서 멈출 때
 * 그 탭에서 한 번 로그인하고 `url`로 돌아가 다시 읽는다(KID-377). `reuseTabMatching`이 있으면 그 주소 무늬의 열린
 * 탭을 먼저 찾아 그 탭에서 읽는다 — 세션이 탭에 묶인 사이트(롯데ON, KID-380). 그 탭은 운영자 것이라 옮기지도 닫지도
 * 않는다(읽기는 그 탭의 API 호출로만 하고 `url`은 새 탭을 열 때만 쓴다).
 */
export async function withFreshTab<T>(
  tabs: TabPages,
  url: string,
  read: (page: TabPage) => Promise<T>,
  options: { navigationTimeoutMs?: number; signIn?: SiteSignIn; reuseTabMatching?: string } = {},
): Promise<T> {
  const reused = options.reuseTabMatching ? await tabs.find(options.reuseTabMatching) : null;
  const page = reused ?? (await tabs.open('about:blank'));
  let keepOpen = false;
  try {
    // 재사용한 운영자 탭은 옮기지 않는다(옛 `borrowOpenTab`과 같다) — 그 탭의 세션으로 지금 화면에서 읽는다.
    if (!reused) await page.navigate(url, { timeoutMs: options.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS });
    return await (options.signIn ? options.signIn.onPage(page, url, () => read(page)) : read(page));
  } catch (error) {
    if (leftForOperator(error)) keepOpen = true;
    // 운영자 조치(GS샵 SMS 인증 시간 초과·보리보리 다운로드 비밀번호, KID-380)는 그 탭에서 한다 — 앞으로 가져온다.
    if (isRuntimeError(error) && error.code === OPERATOR_ACTION_REQUIRED) await page.focus().catch(() => undefined);
    throw error;
  } finally {
    if (!keepOpen) await page.close();
  }
}
