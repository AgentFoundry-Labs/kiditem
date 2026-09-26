import type { SiteSignIn } from './site-login';
import { leftForOperator, type TabPage, type TabPages } from './tab-page';

const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * 운영자 탭은 건드리지 않고 백그라운드 탭을 새로 열어 `url`로 옮긴 뒤 읽고 닫는다(옛 주문 수집기의 탭 규칙, KID-359 H3).
 * 로그인 화면·예상 밖 주소로 끝나면 운영자가 볼 수 있게 탭을 남긴다. `signIn`이 있으면 읽기가 로그인 화면에서 멈출 때
 * 그 탭에서 한 번 로그인하고 `url`로 돌아가 다시 읽는다(KID-377).
 */
export async function withFreshTab<T>(
  tabs: TabPages,
  url: string,
  read: (page: TabPage) => Promise<T>,
  options: { navigationTimeoutMs?: number; signIn?: SiteSignIn } = {},
): Promise<T> {
  const page = await tabs.open('about:blank');
  let keepOpen = false;
  try {
    await page.navigate(url, { timeoutMs: options.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS });
    return await (options.signIn ? options.signIn.onPage(page, url, () => read(page)) : read(page));
  } catch (error) {
    if (leftForOperator(error)) keepOpen = true;
    throw error;
  } finally {
    if (!keepOpen) await page.close();
  }
}
