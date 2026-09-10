import { describe, expect, it } from 'vitest';
import { PUBLIC_CAPABILITY_CATALOG_KEYS } from './public-capability-catalog';

describe('public capability catalog', () => {
  it('does not advertise the retired Coupang Open API listing submission capability', () => {
    expect(PUBLIC_CAPABILITY_CATALOG_KEYS).not.toContain('channels.submit_coupang_listing');
    expect(new Set(PUBLIC_CAPABILITY_CATALOG_KEYS).size).toBe(PUBLIC_CAPABILITY_CATALOG_KEYS.length);
  });
});
