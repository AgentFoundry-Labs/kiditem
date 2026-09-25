import type { OperationKind } from '@kiditem/shared/operation';
import { collectorFor } from '../collectors';
import { createSiteCaller, type SiteCallerDeps } from '../core/site-caller';
import type { BrowserSites } from '../core/browser';
import { WING_SITE, createWingSite } from '../sites/wing';
import { WING_REVIEW_CALLER, createWingReviewsSite } from '../sites/wing/reviews';
import { COUPANG_REVIEWS_KIND } from '@kiditem/shared/reviews';

/** 브라우저 자원이 탭을 여는 사이트 표(이름 → origin). `account:<id>` 잠금은 wing 탭을 쓴다. */
export const ENTRY_SITES: BrowserSites = { [WING_SITE.name]: { origin: WING_SITE.origin } };
export const ACCOUNT_SITE = WING_SITE.name;

/**
 * kind → 그 kind의 수집기에 넘길 사이트 핸들. 수집기가 선언한 `site` 이름으로 `sites/<site>`를 조립한다.
 * 실행마다 새 호출기를 만든다(간격 기록은 실행 안에서만 — 한 계정의 실행은 서버 잠금으로 하나다).
 */
export function createSiteHandles(deps: SiteCallerDeps): (kind: OperationKind, lease: { tabId: number | null }) => unknown {
  return (kind) => {
    // 소싱 kind는 자기 사이트 핸들을 쓴다(같은 wing이라도 pre-matching 검색, KID-360) — 여기서는 답하지 않는다.
    if (kind.startsWith('sourcing.')) return null;
    // 상품평은 서비스워커에서 Wing 쿠키로 부른다(탭 없음, KID-359).
    if (kind === COUPANG_REVIEWS_KIND) return createWingReviewsSite(createSiteCaller(WING_REVIEW_CALLER, deps));
    const site = collectorFor(kind)?.site ?? null;
    if (site === WING_SITE.name) return createWingSite(createSiteCaller(WING_SITE.caller, deps), { sleep: deps.sleep });
    return null;
  };
}
