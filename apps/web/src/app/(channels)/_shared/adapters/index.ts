import type { MallPublishAdapter } from '../mall-publish-adapter';
import { coupangWingAdapter } from './coupang-wing.adapter';
import { domeggookAdapter } from './domeggook.adapter';
import { kidsnoteAdapter } from './kidsnote.adapter';
import { onchannelAdapter } from './onchannel.adapter';
import { artgongguAdapter } from './artgonggu.adapter';
import { alwayzAdapter } from './alwayz.adapter';
import { teachervilleAdapter } from './teacherville.adapter';
import { elevenstAdapter } from './elevenst.adapter';

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
];

const BY_KEY = new Map(MALL_PUBLISH_ADAPTERS.map((adapter) => [adapter.mallKey, adapter]));

export function getMallPublishAdapter(mallKey: string): MallPublishAdapter | null {
  return BY_KEY.get(mallKey) ?? null;
}

export function hasMallPublishAdapter(mallKey: string): boolean {
  return BY_KEY.has(mallKey);
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
};
