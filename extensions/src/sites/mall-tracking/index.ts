import { MALL_TRACKING_UPLOAD_MALLS } from '@kiditem/shared/orders-action-operations';
import { registerSite, siteFactoryFor } from '../registry';

/**
 * 몰 송장 업로드 라우터(KID-366 wave8b). 수집기 `orders.mall_tracking_upload`는 사이트를 하나만 선언하므로, 이 사이트가 plan의
 * 몰 키로 그 몰 사이트(`sites/<mallKey>`의 `uploadTracking`, `tracking-upload.ts`)를 찾아 준다. 업로드를 받는 몰
 * (`MALL_TRACKING_UPLOAD_MALLS`)만 — plan 값으로 다른 사이트를 부르지 못하게. 몰 사이트가 운영자 탭을 스스로 찾거나 열므로
 * `account:` 잠금이라도 브라우저 자원이 탭을 잡지 않는다(`opensOwnTabs`).
 */
export const MALL_TRACKING_SITE = 'mall-tracking';

const isUploadMall = (mallKey: string): boolean => (MALL_TRACKING_UPLOAD_MALLS as readonly string[]).includes(mallKey);

registerSite({
  name: MALL_TRACKING_SITE,
  opensOwnTabs: true,
  create: (deps, lease) => ({
    uploader: (mallKey: string) => (isUploadMall(mallKey) ? siteFactoryFor(mallKey)?.create(deps, lease) ?? null : null),
  }),
});
