import { MALL_ADMIN_LISTING_MALL_KEYS, mallListingSiteCapability } from '@kiditem/shared/mall-admin-listings';
import { MALL_ORDER_OPERATION_MALLS, mallOrderSiteCapability } from '@kiditem/shared/orders-operations';
import { registeredMallAvailability } from '../sites/mall-write/availability';
import { registeredMallWriters } from '../sites/mall-write/writer';
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

/** 몰 쓰기 사이트 표시 이름(KID-256) — 웹(M3)이 등록·품절 버튼을 켤 때 본다. */
export function mallWriteSiteCapability(mallKey: string): string {
  return `mallWriteSite.${mallKey}`;
}

/**
 * `ping`의 몰마다 쓰기 모듈 표시(KID-256): 이 빌드가 그 몰의 쓰기 모듈(`sites/<mall>/registration.ts` 등록 폼이나
 * `availability.ts` 품절·재개·가격)을 가졌으면
 * `mallWriteSite.<몰>`이 true다. 몰 쓰기 kind 표시(`channelsRegistrationOperationKindV1`)만 보고 버튼을 켜면 쓰기 모듈이 없는
 * 몰은 서버가 실행을 연 뒤에야 `RUNTIME_PLAN_INVALID`로 끝난다 — 웹이 몰마다 이것으로 먼저 거른다.
 */
export function mallWriteCapabilities(
  writers: ReadonlyArray<{ mallKey: string }> = [...registeredMallWriters(), ...registeredMallAvailability()],
): Record<string, boolean> {
  return Object.fromEntries(writers.map((writer) => [mallWriteSiteCapability(writer.mallKey), true]));
}
