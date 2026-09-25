import '../collectors/channels.wing_catalog_details';
import '../collectors/channels.wing_catalog_excel';
import '../collectors/channels.wing_catalog_list';
import '../collectors/orders.coupang_reviews';
import '../collectors/sourcing.coupang_keyword_suggestion';
import '../collectors/sourcing.live_commerce';
import '../collectors/sourcing.product_extension';
import '../collectors/sourcing.tiktok_creative';
import '../collectors/sourcing.trend_1688';
import '../collectors/sourcing.wing_catalog';
import '../collectors/test.echo';
import { createBrowserResources } from '../core/browser';
import { createTabPages } from '../sites/tab-page';
import { ACCOUNT_SITE, ENTRY_SITES, createSiteHandles } from './site-handles';
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
  const browser = createBrowserResources(chrome, ENTRY_SITES, { accountSite: ACCOUNT_SITE });
  const channelSites = createSiteHandles({ fetch: site.fetch, cookies: site.cookies, now: site.now, sleep: site.sleep });
  const sourcingSites = createSourcingSiteHandles(site);
  const externalActions = createOperationActions({
    apiFor: legacyApiPort,
    // `account:<id>` 잠금은 그 계정의 Wing 탭을 쓴다(KID-354). 로그인 확인은 사이트 호출기의 SITE_LOGIN_REQUIRED.
    // DOM을 읽는 소싱 사이트는 탭을 스스로 열고 닫는다(KID-360).
    browser,
    siteFor: (kind, lease) => channelSites(kind, lease) ?? sourcingSites(kind),
    keepAlive: legacyKeepAlive,
  });
  // sourcingOperationKindsV1: 이 빌드가 소싱 kind 6종을 돈다(KID-360) — 웹은 이것으로 옛 빌드를 가려낸다.
  registerWithLegacyDomains({ externalActions, capabilities: { operationRuntime: true, sourcingOperationKindsV1: true } });
  installProductCollect(chrome, { apiFor: legacyApiPort, browser, site, getTab: (tabId) => chrome.tabs.get(tabId), keepAlive: legacyKeepAlive });
  return true;
}

