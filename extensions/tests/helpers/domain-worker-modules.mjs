import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// 세 확장을 kiditem-os 하나로 합치면서, 도메인 워커는 더 이상 스스로
// importScripts 를 호출하지 않는다. 통합 서비스워커(background/service-worker.js)
// 가 공용 모듈과 도메인 모듈을 순서대로 싣고, 마지막에 도메인 워커를 싣는다.
// ping 과 수집 세션 공통 액션은 external-dispatch.js 가 단독으로 처리한다.
//
// 테스트 하니스는 그 배선을 그대로 재현해야 하므로 목록과 설치 절차를 여기에
// 한 번만 둔다.

// 싣는 순서의 정본은 통합 서비스워커의 `importScripts(...)` 목록 하나다.
// 여기에 손으로 사본을 적어 두면 서비스워커에 모듈이 늘 때(#547·#556 의
// mall-form-register.js 처럼) 하니스만 낡아, 도메인 워커가 최상위에서 읽는
// 전역이 없어 테스트 수십 건이 ReferenceError 로 한꺼번에 죽는다. 그래서
// 목록을 서비스워커 소스에서 읽어 만든다.
const SERVICE_WORKER_URL = new URL(
  '../../kiditem-os/background/service-worker.js',
  import.meta.url,
);

// 서비스워커 기준(background/) 경로, 쿼리 문자열 포함, 실제 로드 순서.
export function serviceWorkerImportScripts() {
  const source = readFileSync(SERVICE_WORKER_URL, 'utf8');
  const call = source.match(/importScripts\(([\s\S]*?)\);/);
  if (!call) throw new Error('service-worker.js 에서 importScripts(...) 를 찾지 못했다');
  return [...call[1].matchAll(/^\s*"([^"]+)",?\s*$/gm)].map((match) => match[1]);
}

const DOMAIN_PREFIXES = ['coupang/', 'orders/', 'sourcing/'];
const isDomainModule = (entry) => DOMAIN_PREFIXES.some((prefix) => entry.startsWith(prefix));

// 서비스워커 기준 경로를 도메인 워커 디렉터리(background/<domain>/) 기준으로 바꾼다.
function relativeToDomain(domain, entry) {
  return path.posix.relative(domain, entry.split('?')[0]);
}

const SERVICE_WORKER_IMPORTS = serviceWorkerImportScripts();

// 첫 도메인 모듈보다 먼저 싣는 공용 파운데이션(레지스트리·채널 목록·폼 관문·
// 세션·dispatch·worker-globals). 모든 도메인 워커가 이 전역을 전제한다.
const FOUNDATION = SERVICE_WORKER_IMPORTS.slice(
  0,
  SERVICE_WORKER_IMPORTS.findIndex(isDomainModule),
);

// 도메인 워커 디렉터리(background/<domain>/) 기준 상대 경로.
const SHARED_MODULES = FOUNDATION.map((entry) => relativeToDomain('orders', entry));

// 주문 워커가 쓰는 모듈: 파운데이션, 소싱과 공유하는 attempt wire, 그리고
// 서비스워커가 싣는 orders/* 전부(워커 자신 제외)를 서비스워커 순서 그대로.
export const ORDERS_WORKER_MODULES = SERVICE_WORKER_IMPORTS.filter(
  (entry) =>
    FOUNDATION.includes(entry)
    || entry === 'sourcing/source-attempt-wire.js'
    || (entry.startsWith('orders/') && entry !== 'orders/worker.js'),
).map((entry) => relativeToDomain('orders', entry));

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
