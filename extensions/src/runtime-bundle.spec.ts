import { MALL_ADMIN_LISTING_MALL_KEYS, mallListingSiteCapability } from '@kiditem/shared/mall-admin-listings';
import { MALL_ORDER_OPERATION_MALLS, mallOrderSiteCapability } from '@kiditem/shared/orders-operations';
import { describe, expect, it } from 'vitest';
import { OPERATION_STATUSES } from '@kiditem/shared/operation';
import bundleSource from '../kiditem-os/runtime/kiditem-runtime.js?raw';

/** 쓰기 모듈이 있는 몰(KID-256). */
const MALL_WRITE_SITES = ['11st', 'always', 'art09', 'auction', 'boribori', 'coupang', 'domeggook', 'gmarket', 'gs-shop', 'icecream-mall', 'kakao', 'kidkids', 'kidsnote', 'kkomangse', 'lotte-on', 'onch', 'smartstore', 'ssg', 'teacher-mall', 'thirtymall'];

// 커밋된 번들(서비스워커가 싣는 바로 그 파일)을 classic script 처럼 실행한다.
// `extension:check` 가 이 파일이 src 의 새 빌드와 바이트까지 같은지 따로 본다.
function loadRuntime(chrome: unknown, globals: { fetch?: unknown } = {}): Record<string, unknown> {
  // 번들이 쓰는 전역을 같은 이름의 매개변수로 넘긴다 — 옛 워커 전역(`KidItemDomains` 등)은 번들이 읽지 않는다(KID-366).
  return new Function('chrome', 'fetch', `${bundleSource}\nreturn KidItemRuntime;`)(chrome, globals.fetch);
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

  it('exposes the registered operation kinds and skips installing without chrome.runtime', () => {
    const runtime = loadRuntime({});

    expect((runtime.runtime as { kinds(): string[] }).kinds()).toEqual([
      'advertising.ad_action',
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

  it('answers web messages as the only onMessageExternal listener: ping merges the old table, operation.start runs on the new API client', async () => {
    const external: Array<(message: unknown, sender: unknown, respond: (value: unknown) => void) => boolean> = [];
    const runtimeListeners: string[] = [];
    const stored: Record<string, unknown> = { kiditem_environment_profiles_v1: { office: { accessToken: 'office-token', updatedAt: 1 } } };
    const fetched: Array<{ url: string; authorization: string | null }> = [];
    const runtime = loadRuntime(
      {
        tabs: {},
        storage: {
          local: {
            get: async (key: string) => ({ [key]: stored[key] }),
            set: async (values: Record<string, unknown>) => void Object.assign(stored, values),
          },
        },
        runtime: {
          id: 'kiditem-os-test',
          getManifest: () => ({ version: '9.9.9' }),
          getPlatformInfo: () => undefined,
          onMessageExternal: { addListener: (listener: (typeof external)[number]) => external.push(listener) },
          // 알림 창 가드 짝의 "수집 탭인가" 물음(실기기 R1) · 쓰기 탭의 실제 입력 부탁(KID-256) · 내부 메시지 dispatch(KID-366) ·
          // 팝업 준비 실행 돌리기(KID-386) · 팝업 COLLECT_CURRENT · keepalive 포트.
          onMessage: { addListener: () => runtimeListeners.push('onMessage') },
          onConnect: { addListener: () => runtimeListeners.push('onConnect') },
        },
      },
      {
        fetch: async (url: string, init: RequestInit) => {
          fetched.push({ url, authorization: new Headers(init.headers).get('authorization') });
          return new Response('{}', { status: 500 });
        },
      },
    );
    expect(external).toHaveLength(1);
    expect(runtimeListeners).toEqual(['onMessage', 'onMessage', 'onMessage', 'onMessage', 'onMessage', 'onConnect']);
    const send = (message: unknown, url = 'http://kiditem-office/x') => new Promise<Record<string, unknown>>((resolve) => {
      external[0]!(message, { url }, (value) => resolve(value as Record<string, unknown>));
    });

    (runtime.attachLegacyActions as (table: unknown) => void)({ forExternalAction: () => null, capabilities: () => ({ browserCollectionSessions: true }) });
    const ping = await send({ action: 'ping' });
    expect(ping.version).toBe('9.9.9');
    const capabilities = ping.capabilities as Record<string, boolean>;
    expect(capabilities.browserCollectionSessions).toBe(true);
    // 소싱 kind(KID-360)를 도는 빌드만 sourcingOperationKindsV1을 싣는다 — 웹이 옛 빌드를 가려낸다.
    // operationLoginV1: operation.start의 credentials를 받는 빌드(KID-377) — 웹은 이 표시가 있을 때만 자격을 싣는다.
    // mallOrderSite.<몰>·mallListingSite.<몰>: 이 빌드에 사이트가 있는 몰마다(KID-380 T4) — 웹은 몰마다 이것으로 옛 빌드를 거른다.
    // mallWriteSite.<몰>: 이 빌드에 쓰기 모듈이 있는 몰마다(KID-256) — 웹은 몰마다 이것으로 등록·품절 버튼을 켠다.
    const { mallSite, writeSite, kinds } = Object.entries(capabilities).reduce(
      (split, [name, value]) => {
        (/^mall(Order|Listing)Site\./.test(name) ? split.mallSite : /^mallWriteSite\./.test(name) ? split.writeSite : split.kinds)[name] = value;
        return split;
      },
      { mallSite: {} as Record<string, boolean>, writeSite: {} as Record<string, boolean>, kinds: {} as Record<string, boolean> },
    );
    expect(kinds).toEqual({
      browserCollectionSessions: true,
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
      advertisingAdActionOperationKindV1: true,
      channelsRegistrationOperationKindV1: true,
    });
    expect(Object.keys(writeSite).sort()).toEqual(MALL_WRITE_SITES.map((mallKey) => `mallWriteSite.${mallKey}`));
    expect(mallSite).toEqual(Object.fromEntries([
      ...MALL_ORDER_OPERATION_MALLS.map((mallKey) => [mallOrderSiteCapability(mallKey), true]),
      ...MALL_ADMIN_LISTING_MALL_KEYS.map((mallKey) => [mallListingSiteCapability(mallKey), true]),
    ]));

    await expect(send({ action: 'operation.start', kind: 'Bad' }, 'http://localhost:3000/x')).resolves.toMatchObject({ success: false, errorCode: 'VALIDATION_FAILED' });
    await expect(send({ action: 'operation.start', kind: 'test.echo' })).resolves.toMatchObject({ success: false, errorCode: 'RUNTIME_API_UNREACHABLE' });
    expect(fetched).toEqual([{ url: 'http://kiditem-office/api/operations', authorization: 'Bearer office-token' }]);
  });
});
