import type { SiteDeps, SiteLease } from '../registry';
import { registerSite } from '../registry';
import type { TabPage } from '../tab-page';
import { keepTabFor, supplierPage, type SupplierPage } from './page';
import { COUPANG_SHIPMENT_URL, readParcelPage, type ParcelRow } from './shipments';

const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * 쿠팡 서플라이어 허브(supplier.coupang.com, KID-359). 배송요약·로켓 PO·directship이 같은 사이트를 쓴다.
 * 쉽먼트 조회는 조직 잠금이라 브라우저 자원이 탭을 주지 않는다 — 이 사이트가 백그라운드 탭을 열고 끝나면 닫는다
 * (옛 수집도 운영자 탭을 쓰지 않고 새 비활성 탭을 열었다). 로그인 화면에서 멈추면 운영자가 로그인하도록 탭을 남긴다.
 */
export function createCoupangSupplierSite(deps: Pick<SiteDeps, 'tabs'>, _lease: SiteLease = { tabId: null }) {
  let shipmentTab: TabPage | null = null;
  let shipmentPage: Promise<SupplierPage> | null = null;
  let keepOpen = false;
  const remember = <T>(work: Promise<T>): Promise<T> =>
    work.catch((error: unknown) => {
      if (keepTabFor(error)) keepOpen = true;
      throw error;
    });

  /** 여러 쪽을 함께 불러도 탭은 하나만 연다. */
  function shipments(): Promise<SupplierPage> {
    shipmentPage ??= (async () => {
      const tab = await deps.tabs.open('about:blank');
      shipmentTab = tab;
      await tab.navigate(COUPANG_SHIPMENT_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS, continueOnTimeout: true });
      return supplierPage(tab);
    })();
    return shipmentPage;
  }

  return {
    /** 쉽먼트 목록 한 쪽(1부터). 여러 쪽을 함께 불러도 된다(탭 하나). */
    parcelPage(pageNumber: number): Promise<ParcelRow[]> {
      return remember(shipments().then((page) => readParcelPage(page, pageNumber)));
    },
    /** 이 사이트가 연 탭을 닫는다. 로그인·예상 밖 주소에서 멈췄으면 운영자에게 남긴다. */
    async close() {
      if (shipmentTab && !keepOpen) await shipmentTab.close();
      shipmentTab = null;
      shipmentPage = null;
    },
  };
}

export type CoupangSupplierSite = ReturnType<typeof createCoupangSupplierSite>;

registerSite({ name: 'coupang-supplier', create: (deps, lease) => createCoupangSupplierSite(deps, lease) });
