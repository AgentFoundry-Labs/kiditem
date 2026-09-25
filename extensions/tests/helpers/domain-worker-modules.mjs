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

// 서비스워커를 실제로 실행해 `importScripts` 가 받은 인자를 그대로 기록한다 — 소스
// 텍스트를 정규식으로 읽으면 같은 줄 주석 · 따옴표 모양 · 한 줄 여러 항목을 조용히
// 놓친다. 기록한 뒤 표식 예외로 멈춰 나머지 배선은 돌리지 않는다.
// 돌려주는 경로는 서비스워커 기준(background/)이고 쿼리 문자열을 포함한다.
function serviceWorkerImportScripts() {
  const stop = Symbol('importScripts recorded');
  let recorded = null;
  const sandbox = {
    importScripts(...files) {
      recorded = files;
      throw stop;
    },
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(readFileSync(SERVICE_WORKER_URL, 'utf8'), sandbox, {
      filename: SERVICE_WORKER_URL.pathname,
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  if (!recorded) throw new Error('service-worker.js 가 importScripts(...) 를 부르지 않았다');
  return recorded;
}

const DOMAIN_PREFIXES = ['coupang/', 'orders/', 'sourcing/'];
const isDomainModule = (entry) => DOMAIN_PREFIXES.some((prefix) => entry.startsWith(prefix));

const SERVICE_WORKER_IMPORTS = serviceWorkerImportScripts();

// 첫 도메인 모듈보다 먼저 싣는 공용 파운데이션(레지스트리·채널 목록·폼 관문·
// 세션·dispatch·worker-globals). 모든 도메인 워커가 이 전역을 전제한다.
const FIRST_DOMAIN_MODULE = SERVICE_WORKER_IMPORTS.findIndex(isDomainModule);
if (FIRST_DOMAIN_MODULE === -1) {
  throw new Error('service-worker.js 의 importScripts(...) 에 도메인 모듈이 없다');
}
const FOUNDATION = SERVICE_WORKER_IMPORTS.slice(0, FIRST_DOMAIN_MODULE);

// 파운데이션 + 고른 모듈을 서비스워커 순서 그대로, 도메인 워커 디렉터리
// (background/<domain>/) 기준 상대 경로로 돌려준다. 워커 자신은 빼고, 테스트가
// 모듈을 실은 뒤 따로 실행한다.
function domainWorkerModules(domain, includes) {
  const worker = `${domain}/worker.js`;
  return SERVICE_WORKER_IMPORTS
    .filter((entry) => FOUNDATION.includes(entry) || (entry !== worker && includes(entry)))
    .map((entry) => path.posix.relative(domain, entry.split('?')[0]));
}

// 주문 워커: 파운데이션, 소싱과 공유하는 attempt wire, orders/* 전부.
export const ORDERS_WORKER_MODULES = domainWorkerModules(
  'orders',
  (entry) => entry === 'sourcing/source-attempt-wire.js' || entry.startsWith('orders/'),
);

// 소싱 워커: 파운데이션과 sourcing/* 전부. 서비스워커가 소싱 칸에 싣는 coupang/*
// 수집기는 쿠팡 워커가 쓰므로 소싱 워커 하니스에는 필요 없다.
export const SOURCING_WORKER_MODULES = domainWorkerModules(
  'sourcing',
  (entry) => entry.startsWith('sourcing/'),
);

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
