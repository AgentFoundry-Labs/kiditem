import { describe, expect, it, vi } from 'vitest';
import { lockChannelListingRow } from './channel-listing-row-lock';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const LISTING_ID = '00000000-0000-4000-8000-000000000002';

describe('lockChannelListingRow catalog admission', () => {
  it('admits owner-published staged identities with the existing row fences', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      { id: LISTING_ID, masterProductId: null },
    ]);

    await expect(lockChannelListingRow({ $queryRaw: queryRaw } as never, {
      organizationId: ORGANIZATION_ID,
      channelListingId: LISTING_ID,
      activeOnly: true,
      catalogMatchingEligibleOnly: true,
    })).resolves.toEqual({ id: LISTING_ID, masterProductId: null });

    const [strings, ...values] = queryRaw.mock.calls[0]! as [string[], ...unknown[]];
    const text = strings.join('?');
    expect(text).toContain('organization_id = ?::uuid');
    expect(text).toContain('is_active = TRUE');
    expect(text).toContain("raw_json->>'source' IN (");
    expect(text).toContain("'coupang_catalog_basics'");
    expect(text).toContain("'coupang_catalog_details'");
    expect(values).toContain('coupang_wing_catalog_basics');
    expect(values).toContain('coupang_wing_catalog_details');
    expect(values).toContain('coupang-catalog-owner-v1');
  });
});
