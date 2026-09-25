import '../collectors/test.echo';
import { createBrowserResources } from '../core/browser';
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
    keepAlive: legacyKeepAlive,
  });
  registerWithLegacyDomains({ externalActions, capabilities: { operationRuntime: true } });
  return true;
}
