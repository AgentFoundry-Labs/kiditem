import { describe, expect, it, vi } from 'vitest';
import { ConfirmedChannelComponentReferenceRepositoryAdapter } from './confirmed-channel-component-reference.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

describe('ConfirmedChannelComponentReferenceRepositoryAdapter', () => {
  it('returns only organization-owned confirmed recipe references', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { sellpiaInventorySku: { code: 'SP-001' } },
      { sellpiaInventorySku: { code: 'SP-001' } },
      { sellpiaInventorySku: { code: 'SP-002' } },
    ]);
    const adapter = new ConfirmedChannelComponentReferenceRepositoryAdapter({
      productVariantComponent: { findMany },
    } as never);

    await expect(adapter.listReferencedSellpiaProductCodes(ORGANIZATION_ID))
      .resolves.toEqual(['SP-001', 'SP-002']);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        productVariant: { organizationId: ORGANIZATION_ID },
        sellpiaInventorySku: { organizationId: ORGANIZATION_ID },
      },
      select: { sellpiaInventorySku: { select: { code: true } } },
      orderBy: [{ sellpiaInventorySku: { code: 'asc' } }, { id: 'asc' }],
    });
  });
});
