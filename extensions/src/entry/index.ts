import '../collectors/orders.coupang_reviews';
import '../collectors/test.echo';
import { COUPANG_REVIEWS_KIND } from '@kiditem/shared/reviews';
import { createBrowserResources } from '../core/browser';
import { createSiteCaller, type SiteCallerDeps } from '../core/site-caller';
import { WING_REVIEW_CALLER, createWingReviewsSite } from '../sites/wing/reviews';
import { legacyApiPort, legacyGlobalsPresent, legacyKeepAlive, registerWithLegacyDomains } from './legacy-bridge';
import { createOperationActions } from './operation-actions';

/**
 * 새 런타임을 옛 워커의 외부 메시지 표(`KidItemDomains`)에 건다. 옛 전역이 없으면(Vitest·번들 스펙) 아무것도 하지 않고
 * false. 수집기는 위 import로 등록된다(kind 하나 = 줄 하나).
 */
export function installEntry(): boolean {
  if (!legacyGlobalsPresent()) return false;
  const externalActions = createOperationActions({
    apiFor: legacyApiPort,
    // 사이트 탭이 필요한 kind가 옮겨질 때 sites/*의 origin을 여기 모은다(KID-359 이후).
    browser: createBrowserResources(chrome, {}),
    siteFor: siteHandles({
      fetch: (input, init) => fetch(input, init),
      cookies: { get: (details) => chrome.cookies.get(details) },
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }),
    keepAlive: legacyKeepAlive,
  });
  registerWithLegacyDomains({ externalActions, capabilities: { operationRuntime: true } });
  return true;
}

/**
 * kind → 수집기에 넘길 사이트 핸들. 실행마다 새 호출기(간격 기록은 실행 안에서만 — 한 계정의 실행은 서버 잠금으로 하나다).
 * 상품평은 서비스워커에서 Wing 쿠키로 부른다(탭 없음). Wing 사이트 정의는 카탈로그 kind(KID-354)와 합칠 때 옮긴다.
 */
function siteHandles(deps: SiteCallerDeps) {
  return (kind: string): unknown => {
    if (kind === COUPANG_REVIEWS_KIND) return createWingReviewsSite(createSiteCaller(WING_REVIEW_CALLER, deps));
    return null;
  };
}
