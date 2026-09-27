import { MALL_ADMIN_LISTING_MALL_KEYS, mallListingSiteCapability } from '@kiditem/shared/mall-admin-listings';
import { MALL_ORDER_OPERATION_MALLS, mallOrderSiteCapability } from '@kiditem/shared/orders-operations';
import { siteFactoryFor, type SiteFactory } from '../sites/registry';

/**
 * `ping`의 몰마다 사이트 표시(KID-380 T4): 이 빌드가 그 몰 사이트를 가졌으면 `mallOrderSite.<몰>`(주문)·
 * `mallListingSite.<몰>`(관리자 목록)이 true다. 이번 wave 전 빌드는 kind 표시(`orderCaptureOperationKindsV1`)는 있어도 새로
 * 옮긴 몰의 사이트가 없어, 서버가 실행을 연 뒤에야 `RUNTIME_PLAN_INVALID`로 끝났다 — 웹이 이 표시로 먼저 거른다.
 */
export function mallSiteCapabilities(resolve: (name: string) => SiteFactory | null = siteFactoryFor): Record<string, boolean> {
  const capabilities: Record<string, boolean> = {};
  for (const mallKey of MALL_ORDER_OPERATION_MALLS) {
    if (resolve(mallKey)) capabilities[mallOrderSiteCapability(mallKey)] = true;
  }
  for (const mallKey of MALL_ADMIN_LISTING_MALL_KEYS) {
    if (resolve(mallKey)) capabilities[mallListingSiteCapability(mallKey)] = true;
  }
  return capabilities;
}
