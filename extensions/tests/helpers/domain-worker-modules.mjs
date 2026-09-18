import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 세 확장을 kiditem-os 하나로 합치면서, 도메인 워커는 더 이상 스스로
// importScripts 를 호출하지 않는다. 통합 서비스워커(background/service-worker.js)
// 가 공용 모듈과 도메인 모듈을 순서대로 싣고, 마지막에 도메인 워커를 싣는다.
// ping 과 수집 세션 공통 액션은 external-dispatch.js 가 단독으로 처리한다.
//
// 테스트 하니스는 그 배선을 그대로 재현해야 하므로 목록과 설치 절차를 여기에
// 한 번만 둔다.

// 도메인 워커 디렉터리(background/<domain>/) 기준 상대 경로.
const SHARED_MODULES = [
  '../domain-registry.js',
  '../environment-context.js',
  '../collection-session.js',
  '../interactive-tabs.js',
  '../external-dispatch.js',
  '../worker-globals.js',
];

export const ORDERS_WORKER_MODULES = [
  ...SHARED_MODULES,
  '../sourcing/source-attempt-wire.js',
  'collection-failure.js',
  'order-collection-lifecycle.js',
  'order-collection-server-converter.js',
  'order-collection-source-owner.js',
  'sellpia-inventory.js',
  'sellpia-inventory-source-owner.js',
  'sellpia-sales-collector.js',
  'sellpia-product-profit-collector.js',
  'sellpia-shipment-tracking-collector.js',
  'sellpia-product-profitability-source-owner.js',
  'sellpia-sales-source-owner.js',
  'sellpia-shipment-tracking-source-owner.js',
  'sellpia-manual-match.js',
  'sellpia-manual-match-source-owner.js',
  'sabangnet-mall-listings.js',
  'sabangnet-mall-listings-source-owner.js',
  'mall-admin-listings.js',
  'mall-admin-listings-source-owner.js',
  'sellpia-post-processing.js',
  'coupang-po-session.js',
  'mall-availability-send.js',
  'rocket-po-collection.js',
  'rocket-po-source-owner.js',
  'coupang-directship-source-owner.js',
  'coupang-shipment-summary-source-owner.js',
];

export const SOURCING_WORKER_MODULES = [
  ...SHARED_MODULES,
  'url-policy.js',
  'source-attempt-wire.js',
  'product-extension-collector.js',
  '1688-trend-collector.js',
  'live-commerce-collector.js',
  'tiktok-cc-collector.js',
];

// 통합 서비스워커가 하는 배선과 동일하다. 도메인 워커를 실행한 뒤에 호출해야
// 도메인이 KidItemDomains 에 등록된 상태로 dispatch 가 설치된다.
//
// 공용 인스턴스는 worker-globals.js 가 만든 것을 그대로 쓴다. 최상위 `const` 는
// 전역 렉시컬 스코프에만 들어가고 컨텍스트 객체의 프로퍼티가 되지 않으므로,
// 실제 서비스워커와 같이 컨텍스트 안에서 식으로 평가해 배선한다.
export function installExternalDispatch(context, chrome) {
  vm.runInContext(
    `KidItemExternalDispatch.create({
      chrome,
      environmentContext: sharedEnvironmentContext,
      sessions: collectionSessions,
      domains: KidItemDomains,
    }).install();`,
    context,
    { filename: 'kiditem-os/background/service-worker.js (test wiring)' },
  );
}

// 하나의 확장에 외부 메시지 리스너가 여럿 등록된다(통합 dispatch + 도메인 워커).
// Chrome 은 모든 리스너에 같은 메시지를 넘기고 가장 먼저 sendResponse 한 쪽의
// 응답만 쓴다. 테스트도 같은 규칙으로 돌려야 실제 동작을 검증할 수 있다.
export function dispatchExternalMessage(listeners, message, sender) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let keptAlive = false;
    const sendResponse = (response) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    for (const listener of listeners) {
      if (listener(message, sender, sendResponse) === true) keptAlive = true;
    }
    if (!settled && !keptAlive) {
      reject(new Error(`No extension listener handled ${message?.action}`));
    }
  });
}

// 세 확장을 합친 kiditem-os 의 manifest 버전. 개별 확장 버전(0.1.95 / 1.2.x /
// 2.3.x)을 잇는 값이 아니라 합친 확장 자신의 버전이다.
//
// 매니페스트에서 읽는다. 여기 숫자를 따로 적어두면 버전을 올릴 때마다 관계없는
// 테스트 네 개가 같이 깨진다 — 그 깨짐은 "버전이 틀렸다"가 아니라 "복사본이 낡았다"
// 라서 아무것도 지켜주지 않는다. 지켜야 할 것은 **모든 도메인이 한 버전을 말한다**
// 는 쪽이고, 그건 하나의 출처를 읽어야 지켜진다.
export const MERGED_EXTENSION_VERSION = JSON.parse(
  readFileSync(new URL('../../kiditem-os/manifest.json', import.meta.url), 'utf8'),
).version;
