import '../collectors/channels.wing_catalog_details';
import '../collectors/channels.wing_catalog_excel';
import '../collectors/channels.wing_catalog_list';
import '../collectors/test.echo';
import { createBrowserResources } from '../core/browser';
import { ACCOUNT_SITE, ENTRY_SITES, createSiteHandles } from './site-handles';
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
    // `account:<id>` 잠금은 그 계정의 Wing 탭을 쓴다(KID-354). 로그인 확인은 사이트 호출기의 SITE_LOGIN_REQUIRED.
    browser: createBrowserResources(chrome, ENTRY_SITES, { accountSite: ACCOUNT_SITE }),
    siteFor: createSiteHandles({
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
