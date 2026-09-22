import { describe, expect, it } from 'vitest';
import {
  CHANNEL_REGISTRY,
  MALL_CHANNELS,
  MARKETPLACE_CHANNELS,
  channelCollectsOrders,
  channelCollectsViaExtension,
  channelCollectsViaSellpia,
  channelCollectsViaUpload,
  channelFormSpec,
  channelLogoPath,
  channelOutcomeKey,
  channelRegistersListings,
  channelUploadsTracking,
  findChannel,
  isChannelKey,
} from './channel-registry';

/**
 * 레지스트리의 내용 명세. 값이 바뀌는 것 자체는 막지 않는다 — 바뀔 때 **한 곳에서** 바뀌고,
 * 그 결과가 화면·서버·확장에 같은 모양으로 닿는지를 지킨다.
 */
describe('채널 레지스트리', () => {
  it('⭐ 몰 27 + 마켓 2, 키는 겹치지 않는다', () => {
    expect(CHANNEL_REGISTRY).toHaveLength(29);
    expect(MALL_CHANNELS).toHaveLength(27);
    expect(MARKETPLACE_CHANNELS.map((entry) => entry.key)).toEqual(['coupang', 'rocket']);
    expect(new Set(CHANNEL_REGISTRY.map((entry) => entry.key)).size).toBe(CHANNEL_REGISTRY.length);
    expect(CHANNEL_REGISTRY.every((entry) => entry.name.trim().length > 0)).toBe(true);
  });

  it('모르는 키는 null 이다', () => {
    expect(findChannel('order_collection')).toBeNull();
    expect(isChannelKey('order_collection')).toBe(false);
    expect(findChannel('rocket')?.name).toBe('쿠팡 로켓');
  });

  it('⭐ 계정 행을 함께 쓰는 채널은 그 행의 키로 접힌다', () => {
    expect(channelOutcomeKey('coupang-direct')).toBe('rocket');
    expect(channelOutcomeKey('rocket')).toBe('rocket');
    expect(channelOutcomeKey('kidkids')).toBe('kidkids');
    // 모르는 키는 그대로 둔다 — 짐작해서 남의 줄에 얹지 않는다.
    expect(channelOutcomeKey('sellpia')).toBe('sellpia');
    // 한 번 접은 키를 다시 접어도 같은 키다 — 쓰는 쪽과 읽는 쪽이 같은 값에 만난다.
    expect(channelOutcomeKey(channelOutcomeKey('coupang-direct'))).toBe('rocket');
    expect(CHANNEL_REGISTRY.filter((entry) => entry.sharedAccountChannel).map((entry) => entry.key))
      .toEqual(['coupang-direct']);
  });

  it('⭐ 폼 스펙은 제 키와 같고, 옥션만 지마켓 ESM 폼을 함께 쓴다', () => {
    expect(channelFormSpec('auction')).toBe('gmarket');
    expect(CHANNEL_REGISTRY.filter((entry) => entry.formSpec).map((entry) => entry.key))
      .toEqual(['auction']);
    for (const entry of CHANNEL_REGISTRY) {
      if (entry.key === 'auction') continue;
      expect([entry.key, channelFormSpec(entry.key)]).toEqual([entry.key, entry.key]);
    }
  });

  it('⭐ 우리 확장이 가져오는 채널 — 카카오와 로켓이 들어 있다', () => {
    expect(CHANNEL_REGISTRY.filter((entry) => entry.collector === 'extension').map((entry) => entry.key))
      .toEqual([
        'icecream-mall', 'kidkids', 'kidsnote', 'haebub-mall', 'onch', 'kkomangse', 'art09',
        'domeggook', 'lotte-on', 'boribori', 'always', 'kakao', 'teacher-mall', 'gs-shop',
        'coupang-direct', 'rocket',
      ]);
    expect(channelCollectsViaExtension('kakao')).toBe(true);
    expect(channelCollectsViaExtension('rocket')).toBe(true);
    expect(channelCollectsViaExtension('toss')).toBe(false);
  });

  it('⭐ 셀피아가 가져오는 채널은 우리 수집기가 없어도 주문이 들어온다', () => {
    expect(CHANNEL_REGISTRY.filter((entry) => entry.collector === 'sellpia').map((entry) => entry.key))
      .toEqual(['gmarket', 'auction', '11st', 'smartstore', 'ssg', 'coupang']);
    expect(channelCollectsOrders('coupang')).toBe(true);
    expect(channelCollectsViaExtension('coupang')).toBe(false);
    expect(channelCollectsOrders('yoons')).toBe(false);
  });

  /** 원폴라리스는 판매자 화면이 없다. 주문이 메일 첨부 엑셀로만 와서 운영자가 올린다. */
  it('⭐ 파일을 올려 수집하는 채널은 원폴라리스뿐이고, 그 주문도 우리 쪽으로 들어온다', () => {
    expect(CHANNEL_REGISTRY.filter((entry) => entry.collector === 'upload').map((entry) => entry.key))
      .toEqual(['one-polaris']);
    expect(channelCollectsViaUpload('one-polaris')).toBe(true);
    expect(channelCollectsOrders('one-polaris')).toBe(true);
    expect(channelCollectsViaExtension('one-polaris')).toBe(false);
    expect(channelCollectsViaSellpia('one-polaris')).toBe(false);
    expect(channelCollectsViaUpload('kakao')).toBe(false);
  });

  /** 경로가 없는 일에 초록을 칠하지 않는다 — 확장에 발송처리 액션이 있는 셋뿐이다. */
  it('⭐ 송장 송신은 온채널 · 키드키즈 · 도매꾹 뿐이다', () => {
    expect(CHANNEL_REGISTRY.filter((entry) => entry.uploadTracking).map((entry) => entry.key))
      .toEqual(['kidkids', 'onch', 'domeggook']);
    expect(channelUploadsTracking('icecream-mall')).toBe(false);
  });

  /**
   * 확인 전이라 경로를 모르는 채널과, 애초에 등록할 것이 없는 채널은 다르다.
   * 앞은 '아직', 뒤는 '그 일이 없다' 다.
   */
  it('⭐ 등록 개념이 없는 채널은 확인된 `none` 뿐이다', () => {
    const noConcept = CHANNEL_REGISTRY.filter((entry) => !channelRegistersListings(entry));
    expect(noConcept.map((entry) => entry.key)).toEqual(['coupang-direct', 'rocket']);
    expect(channelRegistersListings(findChannel('one-polaris')!)).toBe(true);
    expect(channelRegistersListings(findChannel('toss')!)).toBe(true);
  });

  it('⭐ 로고가 없는 채널은 원폴라리스뿐이고, 나머지는 공식 파비콘 경로다', () => {
    expect(CHANNEL_REGISTRY.filter((entry) => entry.logo === null).map((entry) => entry.key))
      .toEqual(['one-polaris']);
    expect(channelLogoPath('one-polaris')).toBeNull();
    expect(channelLogoPath('11st')).toBe('/mall-logos/11st.ico');
    expect(channelLogoPath('unknown-mall')).toBeNull();
    for (const entry of CHANNEL_REGISTRY) {
      if (entry.logo === null) continue;
      expect([entry.key, entry.logo.startsWith('/mall-logos/')]).toEqual([entry.key, true]);
    }
  });
});
