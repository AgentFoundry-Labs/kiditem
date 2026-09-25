import { registerSite, siteFactoryFor } from '../registry';

/**
 * 몰 주문 라우터(KID-359 H3). 수집기 `orders.mall_orders`는 사이트를 하나만 선언하므로, 이 사이트가 plan의 몰 키로
 * 그 몰 사이트(`sites/<mallKey>`, 파일 끝에서 몰 키 이름으로 스스로 등록)를 찾아 준다. 몰마다 탭을 스스로 열고 닫으므로
 * `account:` 잠금이라도 브라우저 자원이 탭을 잡지 않는다(`opensOwnTabs`).
 */
export const MALL_ORDERS_SITE = 'mall-orders';

registerSite({
  name: MALL_ORDERS_SITE,
  opensOwnTabs: true,
  create: (deps, lease) => ({
    reader: (mallKey: string) => (mallKey === MALL_ORDERS_SITE ? null : siteFactoryFor(mallKey)?.create(deps, lease) ?? null),
  }),
});
