import { Injectable } from '@nestjs/common';
import type { ChannelAdapter, ChannelAdapterRegistryPort } from '../../../application/port/out/channel/channel-adapter.port';
import { CoupangChannelAdapter } from './coupang/coupang-channel.adapter';
import { GenericMallChannelAdapter } from './generic-mall.adapter';

/**
 * 채널 키 → 채널 어댑터(KID-321). 전용 어댑터가 있는 채널(지금은 쿠팡 WING 하나)은 그 어댑터를, 나머지
 * 몰은 `MALL_ADMIN_LISTING_READERS` 를 읽는 공통 어댑터를 그 키로 돌려준다.
 */
@Injectable()
export class ChannelAdapterRegistryAdapter implements ChannelAdapterRegistryPort {
  private readonly adapters = new Map<string, ChannelAdapter>();

  constructor(coupang: CoupangChannelAdapter) {
    this.adapters.set(coupang.channel, coupang);
  }

  get(channel: string): ChannelAdapter {
    const known = this.adapters.get(channel);
    if (known) return known;
    const generic = new GenericMallChannelAdapter(channel);
    this.adapters.set(channel, generic);
    return generic;
  }
}
