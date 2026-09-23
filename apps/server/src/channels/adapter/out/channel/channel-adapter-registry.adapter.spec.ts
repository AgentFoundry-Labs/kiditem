import { describe, expect, it, vi } from 'vitest';
import { CHANNEL_REGISTRY, channelDelivery, channelSupportsRepresentativeImage } from '@kiditem/shared/channel-registry';
import { ChannelAdapterRegistryAdapter } from './channel-adapter-registry.adapter';
import { CoupangChannelAdapter } from './coupang/coupang-channel.adapter';

const runner = { isBlocked: () => false, upload: vi.fn() };

describe('ChannelAdapterRegistryAdapter', () => {
  const coupang = new CoupangChannelAdapter({ preflightExternalProductRegistration: vi.fn() }, runner);
  const registry = new ChannelAdapterRegistryAdapter(coupang);

  it('returns the dedicated adapter for its key and one shared generic adapter per other key', () => {
    expect(registry.get('coupang')).toBe(coupang);
    expect(registry.get('kidkids')).toMatchObject({ channel: 'kidkids', representativeImage: null });
    expect(registry.get('kidkids')).toBe(registry.get('kidkids'));
  });

  it('agrees with the channel registry on delivery and representative-image support for every channel', () => {
    for (const entry of CHANNEL_REGISTRY) {
      const adapter = registry.get(entry.key);
      expect(adapter.channel).toBe(entry.key);
      expect(adapter.delivery).toBe(channelDelivery(entry.key));
      expect(adapter.representativeImage !== null).toBe(channelSupportsRepresentativeImage(entry.key));
    }
  });
});
