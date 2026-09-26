import { registerSite } from '../registry';
import type { TabPages } from '../tab-page';
import { createSellpiaInventory } from './inventory';
import { createSellpiaProfit } from './profit';
import { createSellpiaSales } from './sales';
import { createSellpiaTracking } from './tracking';
import { createSellpiaManualMatch } from './manual-match';

export { SELLPIA_INVENTORY_FILE, SELLPIA_INVENTORY_URL, type SellpiaInventoryRow } from './inventory';
export { SELLPIA_PROFIT_FILE, SELLPIA_PROFIT_URL, type SellpiaProfitRowProduct, type SellpiaProfitRows } from './profit';
export { SELLPIA_SALES_FILE, SELLPIA_SALES_URL, type SellpiaSalesRow } from './sales';
export { SELLPIA_ORIGIN, SELLPIA_PAGE_GUARD, SELLPIA_REPRINT_URL, SELLPIA_SHIPMENT_TRACKING_FILE, type SellpiaTrackingRow } from './tracking';

/**
 * 셀피아(kiditem.sellpia.com) 사이트 핸들(KID-359 H3 → KID-361·363 wave3). 화면마다 파일 하나(`tracking.ts`·`inventory.ts`·
 * `sales.ts`·`profit.ts`·`manual-match.ts`)가 메서드 묶음을 만들고, 여기서 하나로 합친다 — 트랙이 같은 파일을 고치지 않게
 * 각 트랙은 자기 파일 + 아래 spread 한 줄만 더한다. 운영자 탭은 건드리지 않고 매번 백그라운드 탭을 새로 열어 읽고 닫는다.
 * 탭 잠금은 서버 lockKey `resource:sellpia:login`이 하고, 이 사이트는 브라우저 자원에 origin을 두지 않는다(탭을 스스로 연다).
 */
export function createSellpiaSite(tabs: TabPages) {
  return {
    ...createSellpiaTracking(tabs),
    ...createSellpiaInventory(tabs),
    ...createSellpiaSales(tabs),
    ...createSellpiaProfit(tabs),
    ...createSellpiaManualMatch(tabs),
  };
}

export type SellpiaSite = ReturnType<typeof createSellpiaSite>;

registerSite({ name: 'sellpia', opensOwnTabs: true, create: (deps) => createSellpiaSite(deps.tabs) });
