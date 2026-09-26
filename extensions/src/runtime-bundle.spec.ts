import { describe, expect, it } from 'vitest';
import { OPERATION_STATUSES } from '@kiditem/shared/operation';
import bundleSource from '../kiditem-os/runtime/kiditem-runtime.js?raw';

// 커밋된 번들(서비스워커가 싣는 바로 그 파일)을 classic script 처럼 실행한다.
// `extension:check` 가 이 파일이 src 의 새 빌드와 바이트까지 같은지 따로 본다.
function loadRuntime(chrome: unknown, legacy: Record<string, unknown> = {}): Record<string, unknown> {
  // 옛 전역은 서비스워커에서 최상위 이름이다. 여기서는 같은 이름의 매개변수로 넘긴다(없으면 undefined).
  const names = ['KidItemDomains', 'sourceOwnerEnvironmentContext', 'KidItemWorkerKeepAlive'];
  return new Function('chrome', ...names, `${bundleSource}\nreturn KidItemRuntime;`)(chrome, ...names.map((name) => legacy[name]));
}

describe('committed runtime bundle', () => {
  it('bundles @kiditem/shared sources into the one KidItemRuntime global', () => {
    const runtime = loadRuntime({});

    // shared 소스의 현재 값과 비교한다 — 목록을 여기 베껴 두면 shared 가 바뀔 때마다(#573 의 prepared) 깨진다.
    expect(runtime.OPERATION_STATUSES).toEqual([...OPERATION_STATUSES]);
    expect(OPERATION_STATUSES.length).toBeGreaterThanOrEqual(4);
  });

  it('reads the version from the installed manifest, so a version bump needs no rebuild', () => {
    const runtime = loadRuntime({ runtime: { getManifest: () => ({ version: '9.8.7' }) } });

    expect((runtime.version as () => string)()).toBe('9.8.7');
  });

  it('exposes the registered operation kinds and skips installing without the old globals', () => {
    const runtime = loadRuntime({});

    expect((runtime.runtime as { kinds(): string[] }).kinds()).toEqual([
      'advertising.wing_itemwinner',
      'channels.wing_catalog_details',
      'channels.wing_catalog_excel',
      'channels.wing_catalog_list',
      'orders.coupang_directship',
      'orders.coupang_reviews',
      'orders.coupang_rocket_po',
      'orders.coupang_shipment_summary',
      'orders.mall_orders',
      'orders.sellpia_shipment_tracking',
      'sourcing.coupang_keyword_suggestion',
      'sourcing.live_commerce',
      'sourcing.product_extension',
      'sourcing.tiktok_creative',
      'sourcing.trend_1688',
      'sourcing.wing_catalog',
      'test.echo',
    ]);
  });

  it('registers operation.start / operation.cancel and the operationRuntime capability with the old domain registry', async () => {
    const registered: Array<{ externalActions: Record<string, { validate(msg: unknown): unknown; handle(input: unknown, env: string): Promise<unknown> }>; capabilities: Record<string, boolean> }> = [];
    const authedCalls: string[] = [];
    const runtimeListeners: string[] = [];
    loadRuntime(
      {
        tabs: {},
        // 팝업 `COLLECT_CURRENT`와 KidItem 페이지 keepalive 포트(KID-360, 옛 sourcing 워커가 받던 것).
        runtime: {
          onMessage: { addListener: () => runtimeListeners.push('onMessage') },
          onConnect: { addListener: () => runtimeListeners.push('onConnect') },
        },
      },
      {
        KidItemDomains: { register: (domain: (typeof registered)[number]) => registered.push(domain) },
        sourceOwnerEnvironmentContext: {
          authedFetch: async (environmentId: string, path: string) => {
            authedCalls.push(`${environmentId} ${path}`);
            return new Response('{}', { status: 500 });
          },
        },
      },
    );

    expect(registered).toHaveLength(1);
    expect(runtimeListeners).toEqual(['onMessage', 'onConnect']);
    expect(Object.keys(registered[0].externalActions).sort()).toEqual(['operation.cancel', 'operation.start']);
    // 소싱 kind(KID-360)를 도는 빌드만 sourcingOperationKindsV1을 싣는다 — 웹이 옛 빌드를 가려낸다.
    expect(registered[0].capabilities).toEqual({ operationRuntime: true, sourcingOperationKindsV1: true, orderCaptureOperationKindsV1: true, wingDailyOperationKindsV1: true });

    const start = registered[0].externalActions['operation.start'];
    await expect(start.handle(start.validate({ action: 'operation.start', kind: 'Bad' }), 'local')).resolves.toMatchObject({
      success: false,
      errorCode: 'VALIDATION_FAILED',
    });
    await expect(start.handle(start.validate({ action: 'operation.start', kind: 'test.echo' }), 'office')).resolves.toMatchObject({
      success: false,
      errorCode: 'RUNTIME_API_UNREACHABLE',
    });
    expect(authedCalls).toEqual(['office /api/operations']);
  });
});
