import { describe, expect, it } from 'vitest';
import { isUsableChannelAccountStatus } from './channel-account-usability';

describe('isUsableChannelAccountStatus (KID-330)', () => {
  it('uses a bootstrapped or a configured mall account and nothing else', () => {
    expect(isUsableChannelAccountStatus('active')).toBe(true);
    expect(isUsableChannelAccountStatus('configured')).toBe(true);
    expect(isUsableChannelAccountStatus('paused')).toBe(false);
    expect(isUsableChannelAccountStatus('inactive')).toBe(false);
  });
});
