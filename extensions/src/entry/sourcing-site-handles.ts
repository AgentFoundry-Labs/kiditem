import type { OperationKind } from '@kiditem/shared/operation';
import { collectorFor } from '../collectors';
import { RuntimeError } from '../core/errors';
import { createSiteCaller, type SiteCallerDeps } from '../core/site-caller';
import { create1688SearchSite } from '../sites/1688';
import { createCoupangSearchSite } from '../sites/coupang-search';
import { createLiveCommerceSite } from '../sites/live-commerce';
import { createProductPageSite } from '../sites/product-page';
import type { TabPages } from '../sites/tab-page';
import { createTiktokCcSite } from '../sites/tiktok-cc';
import { WING_SEARCH_SITE, createWingCatalogSearchSite } from '../sites/wing/pre-matching-search';

export const PRODUCT_TAB_REQUIRED = 'PRODUCT_TAB_REQUIRED' as const;

export interface SourcingSiteDeps extends SiteCallerDeps {
  tabs: TabPages;
  randomId(): string;
}

/**
 * 소싱 kind(KID-360) → 그 수집기에 넘길 사이트 핸들. 수집기가 선언한 `site` 이름으로 조립한다. 상품 확장은 운영자
 * 탭이 있어야 해서 팝업 입구(`sourcing-product-collect`)만 탭을 묶어 부른다 — 탭 없이 오면 멈춘다.
 */
export function createSourcingSiteHandles(deps: SourcingSiteDeps, productTabId: number | null = null) {
  return (kind: OperationKind): unknown => {
    switch (collectorFor(kind)?.site ?? null) {
      case WING_SEARCH_SITE.name:
        return createWingCatalogSearchSite(createSiteCaller(WING_SEARCH_SITE.caller, deps), { sleep: deps.sleep });
      case 'coupang-search':
        return createCoupangSearchSite(deps.tabs, { sleep: deps.sleep });
      case 'ali1688':
        return create1688SearchSite(deps.tabs);
      case 'live-commerce':
        return createLiveCommerceSite(deps.tabs);
      case 'tiktok':
        return createTiktokCcSite(deps.tabs);
      case 'product-page':
        if (productTabId !== null) return createProductPageSite(deps.tabs, productTabId, { randomId: deps.randomId });
        return {
          extract: async () => {
            throw new RuntimeError(PRODUCT_TAB_REQUIRED, '상품 수집은 확장 팝업의 [현재 상품 수집]에서 시작해 주세요.');
          },
        };
      default:
        return null;
    }
  };
}
