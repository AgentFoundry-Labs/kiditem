import type { MallPublishAdapter } from '../mall-publish-adapter';
import { coupangWingAdapter } from './coupang-wing.adapter';
import { domeggookAdapter } from './domeggook.adapter';
import { kidsnoteAdapter } from './kidsnote.adapter';
import { onchannelAdapter } from './onchannel.adapter';
import { artgongguAdapter } from './artgonggu.adapter';
import { alwayzAdapter } from './alwayz.adapter';
import { teachervilleAdapter } from './teacherville.adapter';
import { elevenstAdapter } from './elevenst.adapter';
import { icecreamAdapter } from './icecream.adapter';
import { esmplusAdapter } from './esmplus.adapter';
import { boriboriAdapter } from './boribori.adapter';
import { kkomangseAdapter } from './kkomangse.adapter';
import { thirtymallAdapter } from './thirtymall.adapter';
import { kidkidsAdapter } from './kidkids.adapter';
import { ssgAdapter } from './ssg.adapter';
import { smartstoreAdapter } from './smartstore.adapter';
import { gsshopAdapter } from './gsshop.adapter';
import { lotteonAdapter } from './lotteon.adapter';

/**
 * 등록 어댑터 레지스트리.
 *
 * 몰을 늘리는 유일한 경로다. 화면·상태·버튼을 몰마다 새로 만들지 않는다 —
 * 여기 한 줄을 더하면 상품 선택 → 몰 선택 → 값 확인 → 송신이 그대로 동작한다.
 *
 * 매니페스트(`MallAdapterManifest`, 서버)가 "이 몰이 무엇을 지원하고 무엇이
 * 위험한가" 를 소유하고, 어댑터는 "실제로 어떻게 보내는가" 를 소유한다.
 * 매니페스트에 있지만 어댑터가 없는 몰은 화면에서 '경로 없음' 으로 보인다.
 */
export const MALL_PUBLISH_ADAPTERS: readonly MallPublishAdapter[] = [
  coupangWingAdapter,
  kidsnoteAdapter,
  domeggookAdapter,
  onchannelAdapter,
  artgongguAdapter,
  alwayzAdapter,
  teachervilleAdapter,
  elevenstAdapter,
  icecreamAdapter,
  // G마켓 · 옥션을 한 번에 맡는다. 옥션용을 따로 만들면 같은 폼을 두 번 연다.
  esmplusAdapter,
  boriboriAdapter,
  kkomangseAdapter,
  thirtymallAdapter,
  kidkidsAdapter,
  ssgAdapter,
  smartstoreAdapter,
  gsshopAdapter,
  lotteonAdapter,
];

const BY_KEY = new Map(MALL_PUBLISH_ADAPTERS.map((adapter) => [adapter.mallKey, adapter]));

export function getMallPublishAdapter(mallKey: string): MallPublishAdapter | null {
  return BY_KEY.get(mallKey) ?? null;
}

export function hasMallPublishAdapter(mallKey: string): boolean {
  return BY_KEY.has(mallKey);
}

/**
 * 이 몰로 상품이 올라가게 하는 어댑터. 제 어댑터가 없어도 다른 몰 등록에 함께 실리는
 * 몰(옥션 ← G마켓 ESM)이면 그 어댑터를 준다. 없으면 null.
 *
 * `getMallPublishAdapter` 와 다르다 — 그건 '이 몰로 보내는 버튼' 을 만들 때 쓰고, 옥션에
 * 버튼이 따로 생기면 같은 상품을 두 번 올린다. 이건 '이 몰에 올라가는가' 를 말할 때만 쓴다.
 */
export function registrationAdapterFor(mallKey: string): MallPublishAdapter | null {
  return BY_KEY.get(mallKey)
    ?? MALL_PUBLISH_ADAPTERS.find((adapter) => adapter.alsoPublishesTo?.includes(mallKey))
    ?? null;
}

export {
  coupangWingAdapter,
  kidsnoteAdapter,
  domeggookAdapter,
  onchannelAdapter,
  artgongguAdapter,
  alwayzAdapter,
  teachervilleAdapter,
  elevenstAdapter,
  icecreamAdapter,
  esmplusAdapter,
  boriboriAdapter,
  kkomangseAdapter,
  thirtymallAdapter,
  kidkidsAdapter,
  ssgAdapter,
  smartstoreAdapter,
  gsshopAdapter,
  lotteonAdapter,
};
