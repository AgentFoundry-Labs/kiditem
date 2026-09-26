import { RuntimeError } from '../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../core/site-caller';
import { withFreshTab } from './fresh-tab';
import type { SiteSignIn } from './site-login';
import { callPage } from './page-call';
import type { PageGuard, TabPages } from './tab-page';

/** 몰 관리자 목록 읽기 하나(몰마다 `sites/<mall>/listings.ts`가 정한다). */
export interface MallListingsSpec {
  mallKey: string;
  displayName: string;
  /** 읽기를 시작하는 몰 관리자 화면(옛 읽기기의 `origin + startPath`). */
  startUrl: string;
  /** 처리기 파일과 그 호출 이름. */
  file: string;
  call: string;
  /** 화면 함수·페이지 변수로 읽는 몰(롯데ON·스마트스토어)은 MAIN world 처리기다. 없으면 ISOLATED. */
  world?: 'main';
  /**
   * 세션이 탭에 묶인 몰(롯데ON의 탭별 sessionStorage 토큰)은 이 주소 무늬의 열린 탭을 먼저 찾아 그 탭에서 읽는다
   * (`withFreshTab`, KID-380 골격). 그 탭은 운영자 것이라 닫지 않는다.
   */
  reuseTabMatching?: string;
  guard: PageGuard;
}

/** 옛 읽기기가 돌려주던 모양 그대로(`content/orders/<mall>-listings.js`). */
type ListingsAnswer =
  | { success: true; snapshot: { collection: Record<string, unknown>; rows: unknown[]; proof: Record<string, unknown> } }
  | { success: false; errorCode?: string; stage?: string };

/**
 * 목록 전체 + 아이스크림몰은 상품마다 상세 한 번(옛 시도 임대 20분과 같은 상한). 이 한 번의 호출 동안 `report()`를 올리지
 * 않지만 실행 임대(30분)가 이 상한보다 길어 끊기지 않는다.
 */
const READ_TIMEOUT_MS = 20 * 60_000;
const NAVIGATION_TIMEOUT_MS = 45_000;
const MALL_CONTRACT_CHANGED = 'MALL_CONTRACT_CHANGED' as const;
const SOURCE_SNAPSHOT_INVALID = 'SOURCE_SNAPSHOT_INVALID' as const;

/**
 * 몰 관리자 목록 읽기(KID-363 L2·KID-381, `channels.mall_admin_listings`). 백그라운드 탭을 새로 열어(롯데ON만 열린
 * 판매자센터 탭을 재사용 — `reuseTabMatching`) 몰 관리자 화면에서 처리기 파일 하나로 목록 전체를 읽고 닫는다.
 * 로그인 화면이면 실행 자격(`signIn`, KID-377 — 몰 주문 읽기와 같은 로그인 입구)으로 그 탭에서 한 번 로그인하고 시작
 * 화면으로 돌아가 다시 읽는다. 자격이 없거나 그래도 로그인 화면이면 탭을 남긴다. 목록이 완전한지는 서버 finalize가 `listing_scan`으로 판정한다.
 */
export function readMallListings(
  tabs: TabPages,
  spec: MallListingsSpec,
  plan: Record<string, unknown>,
  signIn?: SiteSignIn,
): Promise<{ collection: Record<string, unknown>; rows: unknown[]; proof: Record<string, unknown> }> {
  const login = `${spec.displayName} 로그인이 필요합니다. 열린 ${spec.displayName} 화면에서 로그인한 뒤 다시 가져와 주세요.`;
  return withFreshTab(tabs, spec.startUrl, async (page) => {
    const answer = await callPage<ListingsAnswer>(page, spec.call, { plan }, {
      timeoutMs: READ_TIMEOUT_MS,
      guard: spec.guard,
      ...(spec.world === 'main' ? { main: [spec.file] } : { isolated: [spec.file] }),
      displayName: spec.displayName,
    });
    if (answer?.success === true) return answer.snapshot;
    const stage = answer?.stage ?? null;
    switch (answer?.errorCode) {
      case 'mall_login_required':
        throw new RuntimeError(SITE_LOGIN_REQUIRED, login, { url: spec.startUrl });
      case 'mall_contract_drift':
        throw new RuntimeError(MALL_CONTRACT_CHANGED, `${spec.displayName} 상품 목록 형식이 바뀌어 가져오기를 멈췄습니다.${stage ? ` [${stage}]` : ''}`, { stage, mallKey: spec.mallKey });
      case 'mall_total_changed':
        throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, `읽는 사이 ${spec.displayName} 상품 목록이 바뀌었습니다. 잠시 뒤 다시 가져와 주세요.`, { stage: 'total_changed', mallKey: spec.mallKey });
      case 'mall_invalid_snapshot':
        throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, `${spec.displayName} 상품 목록이 올바르지 않아 저장하지 않았습니다.`, { stage, mallKey: spec.mallKey });
      case 'mall_timeout':
        throw new RuntimeError(SITE_REQUEST_FAILED, `${spec.displayName} 응답이 늦어 가져오기를 멈췄습니다.`, { status: null, url: spec.startUrl, reason: 'timeout', bodyHead: null });
      default:
        throw new RuntimeError(SITE_REQUEST_FAILED, `${spec.displayName} 상품 목록을 읽지 못했습니다.`, { status: null, url: spec.startUrl, reason: 'network', bodyHead: null });
    }
  }, {
    navigationTimeoutMs: NAVIGATION_TIMEOUT_MS,
    ...(signIn ? { signIn } : {}),
    ...(spec.reuseTabMatching ? { reuseTabMatching: spec.reuseTabMatching } : {}),
  });
}
