import { describe, expect, it } from 'vitest';
import { contentWorkspaceDetailHref } from './content-workspace-view';

describe('contentWorkspaceDetailHref', () => {
  it('uses only the confirmed channel listing id for registered navigation', () => {
    expect(contentWorkspaceDetailHref({
      channelListingId: 'listing-1',
    })).toBe('/product-pipeline/registered-products/listing-1');
  });

  it('does not turn an ownerless workspace id into a registered listing route', () => {
    expect(contentWorkspaceDetailHref({
      channelListingId: null,
    })).toBeNull();
  });
});
