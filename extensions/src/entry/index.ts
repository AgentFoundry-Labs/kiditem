import '../collectors/sourcing.coupang_keyword_suggestion';
import '../collectors/sourcing.live_commerce';
import '../collectors/sourcing.product_extension';
import '../collectors/sourcing.tiktok_creative';
import '../collectors/sourcing.trend_1688';
import '../collectors/sourcing.wing_catalog';
import '../collectors/test.echo';
import { createBrowserResources } from '../core/browser';
import { createTabPages } from '../sites/tab-page';
import { WING_SEARCH_SITE } from '../sites/wing/pre-matching-search';
import { legacyApiPort, legacyGlobalsPresent, legacyKeepAlive, registerWithLegacyDomains } from './legacy-bridge';
import { createOperationActions } from './operation-actions';
import { installProductCollect } from './sourcing-product-collect';
import { createSourcingSiteHandles, type SourcingSiteDeps } from './sourcing-site-handles';

/**
 * 새 런타임을 옛 워커의 외부 메시지 표(`KidItemDomains`)에 건다. 옛 전역이 없으면(Vitest·번들 스펙) 아무것도 하지 않고
 * false. 수집기는 위 import로 등록된다(kind 하나 = 줄 하나).
 */
export function installEntry(): boolean {
  if (!legacyGlobalsPresent()) return false;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const site: SourcingSiteDeps = {
    fetch: (input, init) => fetch(input, init),
    cookies: { get: (details) => chrome.cookies.get(details) },
    now: () => Date.now(),
    sleep,
    tabs: createTabPages({ chrome, fetch: (input, init) => fetch(input, init), sleep, now: () => Date.now() }),
    randomId: () => crypto.randomUUID(),
  };
  // `account:<id>` 잠금은 그 계정의 Wing 탭을 쓴다. DOM을 읽는 소싱 사이트는 탭을 스스로 열고 닫는다(KID-360).
  const browser = createBrowserResources(chrome, { [WING_SEARCH_SITE.name]: { origin: WING_SEARCH_SITE.origin } }, { accountSite: WING_SEARCH_SITE.name });
  const externalActions = createOperationActions({
    apiFor: legacyApiPort,
    browser,
    siteFor: createSourcingSiteHandles(site),
    keepAlive: legacyKeepAlive,
  });
  // sourcingOperationKindsV1: 이 빌드가 소싱 kind 6종을 돈다(KID-360) — 웹은 이것으로 옛 빌드를 가려낸다.
  registerWithLegacyDomains({ externalActions, capabilities: { operationRuntime: true, sourcingOperationKindsV1: true } });
  installProductCollect(chrome, { apiFor: legacyApiPort, browser, site, getTab: (tabId) => chrome.tabs.get(tabId), keepAlive: legacyKeepAlive });
  return true;
}
