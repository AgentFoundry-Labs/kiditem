import { describe, expect, it, vi } from 'vitest';
import { CHANNEL_REGISTRY } from '@kiditem/shared/channel-registry';
import { ChannelAdapterRegistryAdapter } from './channel-adapter-registry.adapter';
import { CoupangChannelAdapter } from './coupang/coupang-channel.adapter';

describe('ChannelAdapterRegistryAdapter', () => {
  const coupang = new CoupangChannelAdapter({ preflightExternalProductRegistration: vi.fn() });
  const registry = new ChannelAdapterRegistryAdapter(coupang);

  it('returns the dedicated adapter for its key and one shared generic adapter per other key', () => {
    expect(registry.get('coupang')).toBe(coupang);
    expect(registry.get('kidkids')).toMatchObject({ channel: 'kidkids' });
    expect(registry.get('kidkids')).toBe(registry.get('kidkids'));
  });

  it('answers every registry channel by its own key', () => {
    for (const entry of CHANNEL_REGISTRY) expect(registry.get(entry.key).channel).toBe(entry.key);
  });
});
