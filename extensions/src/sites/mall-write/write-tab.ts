import { isRuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import type { SiteSignIn } from '../site-login';
import { OPERATOR_ACTION_REQUIRED, type TabPage, type TabPages } from '../tab-page';

const NAVIGATION_TIMEOUT_MS = 45_000;
/** 로딩이 끝나도 SPA는 한 박자 뒤에 폼을 그린다(옛 1.2초). */
const SETTLE_MS = 1_200;

/** 몰 쓰기 탭 하나. `run`으로 채우고(로그인 문턱 포함) 끝나면 `done`으로 운영자에게 넘긴다. */
export interface WriteTab {
  readonly page: TabPage;
  run<T>(work: (page: TabPage) => Promise<T>): Promise<T>;
  /** 두 번 불러도 한 번. 등록 화면에 닿은 탭은 닫지 않고 운영자에게 넘기고(`leave`), 빈 탭은 닫는다. 가드를 푼다. */
  done(): Promise<void>;
}

/**
 * 몰 쓰기 탭(KID-256). 옛 등록 폼 채우기의 탭 규칙 그대로: 백그라운드 탭을 새로 열어 등록 주소로 옮기고 채운 뒤 **닫지
 * 않는다** — 채운 폼은 성공해도 운영자가 본다(`TabPage.leave`, 진짜 알림 창으로 돌린다). 로그인 입구가 있으면 채우기가 로그인
 * 화면에서 멈출 때 그 탭에서 한 번 로그인하고 등록 주소로 돌아가 다시 채운다(`SiteSignIn.onPage`). 불러오는 중 알림 창
 * 가드를 그 몰 호스트에 건다(KID-380 D4) — 채우는 동안은 쓰기 탭(confirm 거절)이다.
 */
export async function openWriteTab(
  deps: { tabs: TabPages; sleep(ms: number): Promise<void> },
  url: string,
  options: { signIn?: SiteSignIn | null; dialogHosts: readonly string[]; navigationTimeoutMs?: number; bootstrapFile?: string },
): Promise<WriteTab> {
  const signIn = options.signIn ?? null;
  const hosts = signIn?.hosts ?? options.dialogHosts;
  const releaseGuard = hosts.length > 0 ? await deps.tabs.guardDialogs(hosts) : null;
  let reached = false;
  let finished = false;
  let page: TabPage | null = null;
  const done = async () => {
    if (finished) return;
    finished = true;
    if (page) {
      if (reached) await page.leave().catch(() => undefined);
      else await page.close().catch(() => undefined);
    }
    await releaseGuard?.();
  };
  try {
    page = await deps.tabs.open('about:blank');
    const stopAt = signIn ? (landed: string) => signIn.isLoginUrl(landed) : undefined;
    await page.navigate(url, {
      timeoutMs: options.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS,
      ...(stopAt ? { stopAt } : {}),
      ...(options.bootstrapFile ? { bootstrapFile: options.bootstrapFile } : {}),
    });
    reached = true;
    await deps.sleep(SETTLE_MS);
  } catch (error) {
    await done();
    throw error;
  }
  const opened = page;
  return {
    page: opened,
    async run(work) {
      try {
        return await (signIn ? signIn.onPage(opened, url, () => work(opened)) : work(opened));
      } catch (error) {
        // 운영자가 그 탭에서 할 일(본인확인·운영자 조치)이면 앞으로 가져온다.
        const operatorStep = isRuntimeError(error)
          && (error.code === OPERATOR_ACTION_REQUIRED || (error.code === SITE_LOGIN_REQUIRED && error.details?.reason === 'verification_required'));
        if (operatorStep) await opened.focus().catch(() => undefined);
        throw error;
      }
    },
    done,
  };
}
