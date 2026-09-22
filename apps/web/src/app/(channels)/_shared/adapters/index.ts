import type { MallPublishAdapter } from '../mall-publish-adapter';
import { coupangWingAdapter } from './coupang-wing.adapter';
import { domeggookAdapter } from './domeggook.adapter';
import { kidsnoteAdapter } from './kidsnote.adapter';
import { onchAdapter } from './onch.adapter';
import { art09Adapter } from './art09.adapter';
import { alwaysAdapter } from './always.adapter';
import { teacherMallAdapter } from './teacher-mall.adapter';
import { elevenStAdapter } from './11st.adapter';
import { icecreamMallAdapter } from './icecream-mall.adapter';
import { gmarketAdapter } from './gmarket.adapter';
import { boriboriAdapter } from './boribori.adapter';
import { kkomangseAdapter } from './kkomangse.adapter';
import { thirtymallAdapter } from './thirtymall.adapter';
import { kidkidsAdapter } from './kidkids.adapter';
import { ssgAdapter } from './ssg.adapter';
import { smartstoreAdapter } from './smartstore.adapter';
import { gsShopAdapter } from './gs-shop.adapter';
import { lotteOnAdapter } from './lotte-on.adapter';

/**
 * 등록 어댑터 레지스트리.
 *
 * 몰을 늘리는 유일한 경로다. 화면·상태·버튼을 몰마다 새로 만들지 않는다 —
 * 여기 한 줄을 더하면 상품 선택 → 몰 선택 → 값 확인 → 송신이 그대로 동작한다.
 *
 * 매니페스트(`MallAdapterManifest`, 서버)가 "이 몰이 무엇을 지원하고 무엇이
 * 위험한가" 를 소유하고, 어댑터는 "실제로 어떻게 보내는가" 를 소유한다.
 * 매니페스트에 있지만 어댑터가 없는 몰은 화면에서 '경로 없음' 으로 보인다.
 *
 * 쿠팡 로켓은 이 목록에 없다 — 발주 전용 채널이라 몰 등록 마법사가 다루는 대상이 아니다.
 * 쿠팡 WING 은 엑셀을 만드는 수집상품 경로를 마법사에서 함께 보여 주되, 파일 생성은 등록
 * 확인과 구분한다.
 */
export const MALL_PUBLISH_ADAPTERS: readonly MallPublishAdapter[] = [
  kidsnoteAdapter,
  domeggookAdapter,
  onchAdapter,
  art09Adapter,
  alwaysAdapter,
  teacherMallAdapter,
  elevenStAdapter,
  icecreamMallAdapter,
  // G마켓 · 옥션을 한 번에 맡는다. 옥션용을 따로 만들면 같은 폼을 두 번 연다.
  gmarketAdapter,
  boriboriAdapter,
  kkomangseAdapter,
  thirtymallAdapter,
  kidkidsAdapter,
  ssgAdapter,
  smartstoreAdapter,
  gsShopAdapter,
  lotteOnAdapter,
];

/** #554 등록 마법사에서 선택할 수 있는 경로. WING은 파일 생성 경로라 상태 표의 몰 열은 아니다. */
export const MALL_REGISTRATION_ADAPTERS: readonly MallPublishAdapter[] = [
  ...MALL_PUBLISH_ADAPTERS,
  coupangWingAdapter,
];

const BY_REGISTRATION_KEY = new Map(MALL_REGISTRATION_ADAPTERS.map((adapter) => [adapter.mallKey, adapter]));

/**
 * 상품이 올라가는 경로를 가진 어댑터 전부 — 마법사 목록에 쿠팡 WING 을 더한 것이다.
 *
 * 쿠팡 WING 은 파일 생성 경로지만 마법사에서 함께 고를 수 있다. 등록 확인은 별도 몰
 * 재조회가 필요하며, 엑셀 생성 결과는 작업 목록에만 남긴다.
 */
const REGISTRATION_ADAPTERS: readonly MallPublishAdapter[] = [
  ...MALL_REGISTRATION_ADAPTERS,
];

export function getMallPublishAdapter(mallKey: string): MallPublishAdapter | null {
  return BY_REGISTRATION_KEY.get(mallKey) ?? null;
}

export function hasMallPublishAdapter(mallKey: string): boolean {
  return BY_REGISTRATION_KEY.has(mallKey);
}

/**
 * 이 몰로 상품이 올라가게 하는 어댑터. 제 어댑터가 없어도 다른 몰 등록에 함께 실리는
 * 몰(옥션 ← G마켓 ESM)이면 그 어댑터를 준다. 없으면 null.
 *
 * `getMallPublishAdapter` 와 다르다 — 그건 '이 몰로 보내는 버튼' 을 만들 때 쓰고, 옥션에
 * 버튼이 따로 생기면 같은 상품을 두 번 올린다. 이건 '이 몰에 올라가는가' 를 말할 때만 쓴다.
 */
export function registrationAdapterFor(mallKey: string): MallPublishAdapter | null {
  return REGISTRATION_ADAPTERS.find((adapter) => adapter.mallKey === mallKey)
    ?? REGISTRATION_ADAPTERS.find((adapter) => adapter.alsoPublishesTo?.includes(mallKey))
    ?? null;
}

export {
  coupangWingAdapter,
  kidsnoteAdapter,
  domeggookAdapter,
  onchAdapter,
  art09Adapter,
  alwaysAdapter,
  teacherMallAdapter,
  elevenStAdapter,
  icecreamMallAdapter,
  gmarketAdapter,
  boriboriAdapter,
  kkomangseAdapter,
  thirtymallAdapter,
  kidkidsAdapter,
  ssgAdapter,
  smartstoreAdapter,
  gsShopAdapter,
  lotteOnAdapter,
};
