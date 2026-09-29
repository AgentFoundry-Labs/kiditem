import type { TabPage, TabPages } from './tab-page';

const NAVIGATION_TIMEOUT_MS = 30_000;

/** 운영자 탭 하나. `opened`: 이 실행이 새로 열었는가(찾은 운영자 탭이면 false). */
export interface OperatorTab {
  page: TabPage;
  opened: boolean;
}

/**
 * 쓰기 단계의 운영자 탭(KID-366 wave8b — 옛 워커의 운영자 탭 포커스 규칙). 몰·셀피아에 쓰는 단계는 운영자가 보는 탭에서
 * 한다: 주소 무늬(`matches`, 앞의 것이 먼저)에 맞는 열린 탭이 있으면 그 탭을 쓰고, 없으면 새로 연다. 지금 주소가 `stay`에
 * 맞으면 옮기지 않고(운영자가 보던 화면 그대로), 아니면 `url`로 옮긴 뒤 앞으로 가져온다(`TabPage.focus`). 읽기 단계는 이것을
 * 쓰지 않는다 — `withFreshTab`(백그라운드 새 탭).
 */
export async function openOperatorTab(
  tabs: TabPages,
  input: { matches: readonly string[]; url: string; stay?: (currentUrl: string) => boolean; navigationTimeoutMs?: number },
): Promise<OperatorTab> {
  let found: TabPage | null = null;
  for (const pattern of input.matches) {
    found = await tabs.find(pattern);
    if (found) break;
  }
  const page = found ?? (await tabs.open('about:blank'));
  const here = found ? await page.currentUrl().catch(() => '') : '';
  if (!found || !input.stay?.(here)) await page.navigate(input.url, { timeoutMs: input.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS });
  await page.focus().catch(() => undefined);
  return { page, opened: !found };
}
