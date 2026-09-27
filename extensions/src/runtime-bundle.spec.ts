import { MALL_ADMIN_LISTING_MALL_KEYS, mallListingSiteCapability } from '@kiditem/shared/mall-admin-listings';
import { MALL_ORDER_OPERATION_MALLS, mallOrderSiteCapability } from '@kiditem/shared/orders-operations';
import { describe, expect, it } from 'vitest';
import { OPERATION_STATUSES } from '@kiditem/shared/operation';
import bundleSource from '../kiditem-os/runtime/kiditem-runtime.js?raw';

/** 쓰기 모듈이 있는 몰(KID-256). */
const MALL_WRITE_SITES = ['11st', 'always', 'art09', 'auction', 'boribori', 'coupang', 'domeggook', 'gmarket', 'gs-shop', 'icecream-mall', 'kakao', 'kidkids', 'kidsnote', 'kkomangse', 'lotte-on', 'onch', 'smartstore', 'ssg', 'teacher-mall', 'thirtymall'];

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
      'advertising.ad_report',
      'advertising.competitor_catalog',
      'advertising.competitor_seller_identity',
      'advertising.keyword_serp',
      'advertising.wing_itemwinner',
      'advertising.wing_rank',
      'advertising.wing_tracked_products',
      'advertising.wing_traffic',
      'analytics.sellpia_product_profitability',
      'analytics.sellpia_sales',
      'channels.mall_admin_listings',
      'channels.mall_availability_read',
      'channels.registration',
      'channels.sabangnet_mall_listings',
      'channels.sellpia_manual_match',
      'channels.wing_catalog_details',
      'channels.wing_catalog_excel',
      'channels.wing_catalog_list',
      'orders.coupang_directship',
      'orders.coupang_reviews',
      'orders.coupang_rocket_po',
      'orders.coupang_shipment_summary',
      'orders.mall_orders',
      'orders.sellpia_shipment_tracking',
      'products.sellpia_inventory',
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
    // 알림 창 가드 짝의 "수집 탭인가" 물음(실기기 R1) · 쓰기 탭의 실제 입력 부탁(KID-256) · 팝업 COLLECT_CURRENT · keepalive 포트.
    expect(runtimeListeners).toEqual(['onMessage', 'onMessage', 'onMessage', 'onConnect']);
    expect(Object.keys(registered[0].externalActions).sort()).toEqual(['operation.cancel', 'operation.start']);
    // 소싱 kind(KID-360)를 도는 빌드만 sourcingOperationKindsV1을 싣는다 — 웹이 옛 빌드를 가려낸다.
    // operationLoginV1: operation.start의 credentials를 받는 빌드(KID-377) — 웹은 이 표시가 있을 때만 자격을 싣는다.
    // mallOrderSite.<몰>·mallListingSite.<몰>: 이 빌드에 사이트가 있는 몰마다(KID-380 T4) — 웹은 몰마다 이것으로 옛 빌드를 거른다.
    // mallWriteSite.<몰>: 이 빌드에 쓰기 모듈이 있는 몰마다(KID-256) — 웹은 몰마다 이것으로 등록·품절 버튼을 켠다.
    const { mallSite, writeSite, kinds } = Object.entries(registered[0].capabilities).reduce(
      (split, [name, value]) => {
        (/^mall(Order|Listing)Site\./.test(name) ? split.mallSite : /^mallWriteSite\./.test(name) ? split.writeSite : split.kinds)[name] = value;
        return split;
      },
      { mallSite: {} as Record<string, boolean>, writeSite: {} as Record<string, boolean>, kinds: {} as Record<string, boolean> },
    );
    expect(kinds).toEqual({
      operationRuntime: true,
      sourcingOperationKindsV1: true,
      orderCaptureOperationKindsV1: true,
      channelsOperationKindsV1: true,
      operationLoginV1: true,
      operationLoginBlockedV1: true,
      advertisingKeywordOperationKindsV1: true,
      wingDailyOperationKindsV1: true,
      sellpiaOperationKindsV1: true,
      advertisingAdReportOperationKindV1: true,
      channelsRegistrationOperationKindV1: true,
    });
    expect(Object.keys(writeSite).sort()).toEqual(MALL_WRITE_SITES.map((mallKey) => `mallWriteSite.${mallKey}`));
    expect(mallSite).toEqual(Object.fromEntries([
      ...MALL_ORDER_OPERATION_MALLS.map((mallKey) => [mallOrderSiteCapability(mallKey), true]),
      ...MALL_ADMIN_LISTING_MALL_KEYS.map((mallKey) => [mallListingSiteCapability(mallKey), true]),
    ]));

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
