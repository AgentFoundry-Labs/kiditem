import type { SiteDeps, SiteLease } from '../registry';
import { registerSite } from '../registry';
import { createSiteLoginGate, ensureLoggedIn, type LoginOutcome } from '../site-login';
import type { TabPage } from '../tab-page';
import { COUPANG_SUPPLIER_LOGIN, keepTabFor, supplierPage, type PageTable, type SupplierPage } from './page';
import {
  PO_BOOTSTRAP_URL,
  enterScmContext,
  preparePoSession,
  readPurchasableCenters,
  readPurchaseOrderDetail,
  readPurchaseOrderListPage,
  type PurchaseOrderListPage,
} from './po';
import { COUPANG_SHIPMENT_URL, readParcelPage, type ParcelRow } from './shipments';

const NAVIGATION_TIMEOUT_MS = 30_000;

/** 발주 목록 조회 조건(옛 요청의 쿼리 그대로). */
export interface PurchaseOrderListQuery {
  searchDateType: 'WAREHOUSING_PLAN_DATE' | 'PURCHASE_ORDER_DATE';
  from: string;
  to: string;
  /** `RP`·`PA`·`RI`·`CI` 또는 빈 글자(전체). */
  status: string;
}

export function purchaseOrderListPath(query: PurchaseOrderListQuery, pageNumber: number): string {
  return '/po-web/app/purchase-order/list?page=' + pageNumber
    + '&searchDateType=' + query.searchDateType
    + '&searchStartDate=' + query.from
    + '&searchEndDate=' + query.to
    + '&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq='
    + '&purchaseOrderStatus=' + query.status
    + '&purchaseOrderType=&skuIdArray=&crossdock=&transportType=';
}

/**
 * 쿠팡 서플라이어 허브(supplier.coupang.com, KID-359). 배송요약·로켓 PO·directship이 같은 사이트를 쓴다.
 *
 * - 쉽먼트 조회는 조직 잠금이라 브라우저 자원이 탭을 주지 않는다 — 이 사이트가 백그라운드 탭을 열고 끝나면 닫는다.
 * - 발주(로켓 PO·directship)는 계정 잠금이라 브라우저 자원이 발주 부트스트랩 주소로 새 탭을 열어 준다(`origin`) — 옛 수집도
 *   운영자 탭을 쓰지 않고 새 비활성 탭을 썼다. 로그인 확인은 그 탭이 PO 화면에 닿는지로 한다(`SITE_LOGIN_REQUIRED`).
 *   기록된 결정(worker.js, 2026-09-21 라이브): "그 로그인을 몰 소유자로 감싸면 몰 쪽에 없는 시도를 조회해 404
 *   (`ORDER_COLLECTION_ATTEMPT_NOT_FOUND`)가 나고 … 로그인 문턱에서 수집이 끝났다" — 새 경로에는 몰 소유자도 시도도 없고,
 *   직배송 로그인 문턱은 이 사이트의 주소 확인이 `SITE_LOGIN_REQUIRED`로 알린다(같은 결과, 옛 우회 불필요).
 * - 로그인 화면이면 실행의 저장 자격(`lease.credentials`)으로 그 탭에서 한 번 로그인하고 같은 읽기를 한 번 다시 한다
 *   (KID-377, `createSiteLoginGate`). 그래도 멈추면 운영자가 로그인하도록 탭을 남긴다: 이 사이트가 연 탭(쉽먼트)은
 *   사이트가 닫지 않고, 계정 잠금이 연 탭(발주)은 브라우저 자원이 닫지 않고 앞으로 가져온다(`core/browser` `operatorMustAct`).
 */
export function createCoupangSupplierSite(deps: Pick<SiteDeps, 'tabs' | 'now' | 'sleep'>, lease: SiteLease = { tabId: null }) {
  let shipmentTab: TabPage | null = null;
  let shipmentPage: Promise<SupplierPage> | null = null;
  let poTab: TabPage | null = null;
  let poPage: Promise<SupplierPage> | null = null;
  let keepOpen = false;
  const remember = <T>(work: Promise<T>): Promise<T> =>
    work.catch((error: unknown) => {
      if (keepTabFor(error)) keepOpen = true;
      throw error;
    });
  const withLogin = createSiteLoginGate(lease.credentials);
  /** 로그인 화면에 멈춘 탭에서 로그인하고, 다음 읽기가 그 탭을 다시 준비하도록 세션을 비운다. */
  const loginOn = (tab: () => TabPage | null, reset: () => void) => async (): Promise<LoginOutcome> => {
    const page = tab();
    if (!page || !lease.credentials) return { status: 'unconfirmed' };
    const outcome = await ensureLoggedIn(page, COUPANG_SUPPLIER_LOGIN, lease.credentials, deps);
    reset();
    return outcome;
  };
  const shipmentLogin = loginOn(() => shipmentTab, () => { shipmentPage = null; });
  const poLogin = loginOn(() => poTab, () => { poPage = null; });

  /** 여러 쪽을 함께 불러도 탭은 하나만 연다(로그인 뒤에는 같은 탭을 쉽먼트 화면으로 다시 옮긴다). */
  function shipments(): Promise<SupplierPage> {
    shipmentPage ??= (async () => {
      const tab = shipmentTab ?? await deps.tabs.open('about:blank');
      shipmentTab = tab;
      await tab.navigate(COUPANG_SHIPMENT_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS, continueOnTimeout: true });
      return supplierPage(tab);
    })();
    return shipmentPage;
  }

  /** 발주 세션: 잠금이 준 탭(없으면 새 탭)을 부트스트랩 주소로 옮겨 PO 화면에 닿게 한다. 실행마다 한 번(로그인 뒤 한 번 더). */
  function purchaseOrders(): Promise<SupplierPage> {
    poPage ??= (async () => {
      const tab = poTab ?? (lease.tabId !== null ? deps.tabs.attach(lease.tabId) : await deps.tabs.open('about:blank'));
      poTab = tab;
      return preparePoSession(tab);
    })();
    return poPage;
  }

  const onShipments = <T>(read: (page: SupplierPage) => Promise<T>): Promise<T> =>
    remember(withLogin(() => shipments().then(read), shipmentLogin));
  const onPurchaseOrders = <T>(read: (page: SupplierPage) => Promise<T>): Promise<T> =>
    remember(withLogin(() => purchaseOrders().then(read), poLogin));

  return {
    /** 쉽먼트 목록 한 쪽(1부터). 여러 쪽을 함께 불러도 된다(탭 하나). */
    parcelPage(pageNumber: number): Promise<ParcelRow[]> {
      return onShipments((page) => readParcelPage(page, pageNumber));
    },
    /** 발주 목록 한 쪽(1부터)의 JSON 본문. 첫 쪽이 JSON이 아니면 로그인 필요. */
    purchaseOrderListPage(query: PurchaseOrderListQuery, pageNumber: number): Promise<PurchaseOrderListPage> {
      return onPurchaseOrders((page) => readPurchaseOrderListPage(page, purchaseOrderListPath(query, pageNumber), pageNumber));
    },
    /** 발주서 상세의 표(칸 단위). */
    purchaseOrderDetail(poNumber: string): Promise<PageTable[]> {
      return onPurchaseOrders((page) => readPurchaseOrderDetail(page, poNumber));
    },
    /** 직배송 센터 주소 목록 JSON. */
    purchasableCenters(): Promise<unknown> {
      return onPurchaseOrders((page) => readPurchasableCenters(page));
    },
    /** 직배송: 품목 상세 전에 탭을 첫 발주서 상세로 옮긴다. */
    enterScmContext(poNumber: string): Promise<void> {
      return onPurchaseOrders(() => enterScmContext(poTab!, poNumber));
    },
    /** 이 사이트가 연 탭을 닫는다(잠금이 준 탭은 브라우저 자원이 닫는다). 로그인·예상 밖 주소에서 멈췄으면 남긴다. */
    async close() {
      if (!keepOpen) {
        if (shipmentTab) await shipmentTab.close();
        if (poTab) await poTab.close();
      }
      shipmentTab = null;
      shipmentPage = null;
      poTab = null;
      poPage = null;
    },
  };
}

export type CoupangSupplierSite = ReturnType<typeof createCoupangSupplierSite>;

registerSite({ name: 'coupang-supplier', origin: PO_BOOTSTRAP_URL, create: (deps, lease) => createCoupangSupplierSite(deps, lease) });
