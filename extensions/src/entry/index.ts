import '../collectors/advertising.ad_action';
import '../collectors/advertising.ad_report';
import '../collectors/advertising.competitor_catalog';
import '../collectors/advertising.competitor_seller_identity';
import '../collectors/advertising.keyword_serp';
import '../collectors/advertising.wing_itemwinner';
import '../collectors/advertising.wing_rank';
import '../collectors/advertising.wing_tracked_products';
import '../collectors/advertising.wing_traffic';
import '../collectors/analytics.sellpia_product_profitability';
import '../collectors/analytics.sellpia_sales';
import '../collectors/channels.mall_admin_listings';
import '../collectors/channels.mall_availability_read';
import '../collectors/channels.registration';
import '../collectors/channels.sabangnet_mall_listings';
import '../collectors/channels.sellpia_manual_match';
import '../collectors/channels.wing_catalog_details';
import '../collectors/channels.wing_catalog_excel';
import '../collectors/channels.wing_catalog_list';
import '../collectors/orders.coupang_directship';
import '../collectors/orders.coupang_reviews';
import '../collectors/orders.coupang_rocket_po';
import '../collectors/orders.coupang_shipment_summary';
import '../collectors/orders.mall_orders';
import '../collectors/orders.sellpia_shipment_tracking';
import '../collectors/products.sellpia_inventory';
import '../collectors/sourcing.coupang_keyword_suggestion';
import '../collectors/sourcing.live_commerce';
import '../collectors/sourcing.product_extension';
import '../collectors/sourcing.tiktok_creative';
import '../collectors/sourcing.trend_1688';
import '../collectors/sourcing.wing_catalog';
import '../collectors/test.echo';
import '../sites/11st/availability';
import '../sites/11st/listings';
import '../sites/11st/registration';
import '../sites/1688';
import '../sites/ad-center';
import '../sites/always';
import '../sites/always/availability';
import '../sites/always/registration';
import '../sites/art09';
import '../sites/art09/availability';
import '../sites/art09/registration';
import '../sites/auction/availability';
import '../sites/auction/listings';
import '../sites/boribori';
import '../sites/boribori/registration';
import '../sites/coupang-product';
import '../sites/coupang-search';
import '../sites/coupang-shop';
import '../sites/coupang-supplier';
import '../sites/domeggook';
import '../sites/domeggook/availability';
import '../sites/domeggook/registration';
import '../sites/gmarket/availability';
import '../sites/gmarket/listings';
import '../sites/gmarket/registration';
import '../sites/gs-shop';
import '../sites/gs-shop/registration';
import '../sites/haebub-mall';
import '../sites/icecream-mall';
import '../sites/icecream-mall/availability';
import '../sites/icecream-mall/registration';
import '../sites/kakao/listings';
import '../sites/kakao/availability';
import '../sites/kakao/registration';
import '../sites/kidkids';
import '../sites/kidkids/availability';
import '../sites/kidkids/registration';
import '../sites/kidsnote';
import '../sites/kidsnote/availability';
import '../sites/kidsnote/registration';
import '../sites/kkomangse';
import '../sites/kkomangse/availability';
import '../sites/kkomangse/registration';
import '../sites/live-commerce';
import '../sites/lotte-on';
import '../sites/lotte-on/availability';
import '../sites/lotte-on/registration';
import '../sites/mall-admin-listings';
import '../sites/mall-orders';
import '../sites/mall-write';
import '../sites/onch';
import '../sites/onch/availability';
import '../sites/onch/registration';
import '../sites/product-page';
import '../sites/sabangnet';
import '../sites/sellpia';
import '../sites/smartstore/availability';
import '../sites/smartstore/listings';
import '../sites/smartstore/registration';
import '../sites/ssg/registration';
import '../sites/teacher-mall';
import '../sites/teacher-mall/availability';
import '../sites/teacher-mall/registration';
import '../sites/thirtymall/availability';
import '../sites/thirtymall/listings';
import '../sites/thirtymall/registration';
import '../sites/tiktok-cc';
import '../sites/wing';
import '../sites/wing/availability';
import '../sites/wing/registration';
import '../sites/wing/thumbnail';
import '../sites/wing/itemwinner';
import '../sites/wing/pre-matching-search';
import '../sites/wing/reviews';
import '../sites/wing/traffic';
import { ADVERTISING_AD_ACTION_OPERATION_CAPABILITY, ADVERTISING_AD_REPORT_OPERATION_CAPABILITY } from '@kiditem/shared/advertising-operations';
import { CHANNELS_OPERATION_CAPABILITY, CHANNELS_REGISTRATION_OPERATION_CAPABILITY } from '@kiditem/shared/channels-operations';
import { SELLPIA_OPERATION_CAPABILITY } from '@kiditem/shared/sellpia-operations';
import { collectorFor } from '../collectors';
import { createAuthStore, type ProfileStorage } from '../core/auth-store';
import { createApiClient } from '../core/authed-fetch';
import { createBrowserResources } from '../core/browser';
import { createExternalDispatch, createInternalDispatch, type ActionTable, type EntryAction, type LegacyExternalActions } from '../core/dispatch';
import { createKeepAlive } from '../core/keep-alive';
import { createOperationClient } from '../core/operation-client';
import { createRunner, type OperationRunner } from '../core/runner';
import { createTabPages, installDialogGuardAnswer, installTrustedInputAnswer, requestWebAuth, sweepDialogGuards } from '../sites/tab-page';
import type { SiteDeps } from '../sites/registry';
import { OPERATION_CANCEL_ACTION, OPERATION_START_ACTION } from './actions';
import { ACCOUNT_SITE, createSiteHandles, entrySites, ownTabSites } from './site-handles';
import { createOperationActions, type ExternalAction } from './operation-actions';
import { installPreparedOperations } from './prepared-operations';
import { installProductCollect } from './sourcing-product-collect';
import { mallSiteCapabilities, mallWriteCapabilities } from './mall-site-capabilities';

/** 입구가 서비스워커에 건 것. 옛 워커 표는 서비스워커가 번들을 실은 뒤 `attachLegacy`로 넘긴다(과도기). */
export interface InstalledEntry {
  attachLegacy(table: LegacyExternalActions): void;
}

/**
 * 새 런타임의 입구(KID-366): 외부 메시지 dispatch(유일한 `onMessageExternal` 리스너)·내부 메시지 dispatch·토큰 저장소·
 * KidItem API·keep-alive를 조립한다. `chrome.runtime`이 없으면(Vitest·번들 스펙) 아무것도 하지 않고 null.
 * 수집기와 사이트는 위 import로 스스로 등록되고(kind 하나·사이트 하나 = 줄 하나), 입구는 이름으로 조립한다.
 */
export function installEntry(): InstalledEntry | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessageExternal?.addListener) return null;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const keepAlive = createKeepAlive({
    ping: () => chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  });
  const holdUntil = (work: Promise<unknown>) => void keepAlive.during(work).catch(() => undefined);
  const store = createAuthStore({ storage: chrome.storage.local as unknown as ProfileStorage, now: () => Date.now() });
  const api = createApiClient({
    store,
    fetch: (input, init) => fetch(input, init),
    requestAuth: (environment) => requestWebAuth(chrome, environment.webUrlPattern),
  });
  const apiFor = (environmentId: string) => api.apiPort(environmentId);
  const site: SiteDeps = {
    fetch: (input, init) => fetch(input, init),
    cookies: { get: (details) => chrome.cookies.get(details) },
    now: () => Date.now(),
    sleep,
    tabs: createTabPages({ chrome, fetch: (input, init) => fetch(input, init), sleep, now: () => Date.now() }),
    randomId: () => crypto.randomUUID(),
  };
  // 서비스워커가 다시 떴다 — 지난 실행이 남긴 알림 창 가드 등록을 지운다(KID-380 D4).
  void sweepDialogGuards(chrome);
  // 가드 짝이 묻는 "이 탭이 수집 탭인가"에 답한다(실기기 R1).
  if (chrome.runtime.onMessage) installDialogGuardAnswer(chrome, site.tabs);
  // 쓰기 탭 처리기의 실제 입력 부탁(Wing 카테고리 검색칸, KID-256)에 답한다 — 이 런타임이 쥔 탭에서 온 것만.
  if (chrome.runtime.onMessage) installTrustedInputAnswer(chrome, site.tabs);
  const browser = createBrowserResources(chrome, entrySites(), { accountSite: ACCOUNT_SITE, ownTabSites: ownTabSites() });
  const channelSites = createSiteHandles(site);
  const operationActions = createOperationActions({
    apiFor,
    // `account:<id>` 잠금은 그 계정의 Wing 탭을 쓴다(KID-354). 로그인 확인은 사이트 호출기의 SITE_LOGIN_REQUIRED.
    // DOM을 읽는 소싱 사이트는 탭을 스스로 열고 닫는다(KID-360).
    browser,
    siteFor: channelSites,
    keepAlive: holdUntil,
  });
  const externalActions: ActionTable = {
    [OPERATION_START_ACTION]: validated(operationActions[OPERATION_START_ACTION]),
    [OPERATION_CANCEL_ACTION]: validated(operationActions[OPERATION_CANCEL_ACTION]),
  };
  const external = createExternalDispatch({
    actions: externalActions,
    version: () => chrome.runtime.getManifest().version,
    keepAlive,
    // sourcingOperationKindsV1: 이 빌드가 소싱 kind 6종을 돈다(KID-360) — 웹은 이것으로 옛 빌드를 가려낸다.
    // orderCaptureOperationKindsV1: 셀피아 송장·몰 주문 kind를 돈다(KID-359 H3).
    // channelsOperationKindsV1: Channels 기타 kind(사방넷 몰 목록·몰 관리자 목록·셀피아 수동매칭)를 돈다(KID-363).
    // operationLoginV1: operation.start의 credentials(사이트 자동 로그인, KID-377)를 받는다 — 옛 빌드는 그 칸을 거절한다.
    // advertisingKeywordOperationKindsV1: 광고 키워드·경쟁사 kind 5종을 돈다(KID-362 K-a).
    // wingDailyOperationKindsV1: Wing 일별 사실 kind(트래픽·아이템위너)를 돈다(KID-362 K-b).
    // sellpiaOperationKindsV1: 셀피아 재고·매출·상품 손익 kind를 돈다(KID-361).
    // advertisingAdReportOperationKindV1: 광고센터 보고서 kind `advertising.ad_report`를 돈다(KID-371).
    // mallOrderSite.<몰>·mallListingSite.<몰>: 이 빌드가 사이트를 가진 몰(KID-380 T4) — 웹은 몰마다 이것으로 옛 빌드를 거른다.
    capabilities: {
      operationRuntime: true,
      sourcingOperationKindsV1: true,
      orderCaptureOperationKindsV1: true,
      [CHANNELS_OPERATION_CAPABILITY]: true,
      operationLoginV1: true,
      // operationLoginBlockedV1: operation.start의 loginBlocked(차단으로 자격을 싣지 않음, 실기기 R7)를 받는다.
      operationLoginBlockedV1: true,
      advertisingKeywordOperationKindsV1: true,
      wingDailyOperationKindsV1: true,
      [SELLPIA_OPERATION_CAPABILITY]: true,
      [ADVERTISING_AD_REPORT_OPERATION_CAPABILITY]: true,
      // advertisingAdActionOperationKindV1: 서버가 준비한 광고 액션 kind `advertising.ad_action`(claim)을 돈다(KID-386).
      [ADVERTISING_AD_ACTION_OPERATION_CAPABILITY]: true,
      // channelsRegistrationOperationKindV1: 몰 쓰기 kind(`channels.registration`)를 돈다(KID-256·364). mallWriteSite.<몰>: 그 몰의
      // 쓰기 모듈이 있다 — 웹은 몰마다 이것으로 등록·품절 버튼을 켠다.
      [CHANNELS_REGISTRATION_OPERATION_CAPABILITY]: true,
      ...mallSiteCapabilities(),
      ...mallWriteCapabilities(),
    },
  });
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => external.handleMessage(message, sender, sendResponse));
  const internal = createInternalDispatch({
    runtimeId: chrome.runtime.id,
    actions: {},
    keepAlive,
    storage: chrome.storage.local as unknown as ProfileStorage,
  });
  if (chrome.runtime.onMessage) chrome.runtime.onMessage.addListener((message, sender, sendResponse) => internal.handleMessage(message, sender, sendResponse));
  // 팝업 "승인된 광고 액션 실행" — 서버가 준비한 실행을 claim해 돌린다(KID-386). 환경마다 runner 하나.
  const preparedRunners = new Map<string, OperationRunner>();
  if (chrome.runtime.onMessage) {
    installPreparedOperations(chrome, {
      runnerFor(environmentId) {
        let runner = preparedRunners.get(environmentId);
        if (!runner) {
          runner = createRunner({ client: createOperationClient(apiFor(environmentId)), browser, siteFor: channelSites }, collectorFor);
          preparedRunners.set(environmentId, runner);
        }
        return runner;
      },
      keepAlive: holdUntil,
    });
  }
  installProductCollect(chrome, { apiFor, browser, site, getTab: (tabId) => chrome.tabs.get(tabId), keepAlive: holdUntil });
  return { attachLegacy: (table) => external.attachLegacy(table) };
}

/** `operation.start`·`operation.cancel`은 실패도 값으로 돌려주는 모양이라(검증 실패 답에 칸 사유를 싣는다) 그대로 넘긴다. */
function validated<T>(action: ExternalAction<T>): EntryAction {
  return {
    schema: { safeParse: (message: unknown) => ({ success: true as const, data: action.validate(message) }) },
    handle: async (input, context) => (await action.handle(input as ReturnType<ExternalAction<T>['validate']>, context.environmentId)) as object,
  };
}
