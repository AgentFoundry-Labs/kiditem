import type { OperationKind } from '@kiditem/shared/operation';
import { collectorFor } from '../collectors';
import type { BrowserSites } from '../core/browser';
import { registeredSites, siteFactoryFor, type SiteDeps, type SiteLease } from '../sites/registry';

/**
 * 브라우저 자원이 탭을 여는 사이트 표(이름 → origin). 등록표에서 origin을 둔 사이트만 모은다. 등록은 사이트 모듈을
 * import할 때 일어나므로 조립 시점에 부른다(모듈 최상위 상수로 두면 등록 전의 빈 표가 된다).
 */
export function entrySites(): BrowserSites {
  return Object.fromEntries(registeredSites().flatMap((site) => (site.origin ? [[site.name, { origin: site.origin }]] : [])));
}

/** 탭을 스스로 여는 사이트 이름들(브라우저 자원이 그 실행에 탭을 잡지 않는다). 조립 시점에 부른다. */
export function ownTabSites(): ReadonlySet<string> {
  return new Set(registeredSites().filter((site) => site.opensOwnTabs === true).map((site) => site.name));
}

/** `account:<id>` 잠금이 기본으로 여는 사이트(수집기가 origin을 둔 사이트를 선언하지 않았을 때). */
export const ACCOUNT_SITE = 'wing';

/**
 * kind → 그 kind의 수집기에 넘길 사이트 핸들. 수집기가 선언한 `site` 이름으로 등록표(`sites/registry`)에서 찾아
 * 조립한다(KID-355). 실행마다 새 핸들을 만든다(간격 기록은 실행 안에서만 — 한 계정의 실행은 서버 잠금으로 하나다).
 */
export function createSiteHandles(deps: SiteDeps): (kind: OperationKind, lease: SiteLease) => unknown {
  return (kind, lease) => siteFactoryFor(collectorFor(kind)?.site ?? '')?.create(deps, lease) ?? null;
}
