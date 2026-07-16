import { describe, expect, it, vi } from 'vitest';
import { ConfirmedOrdersRepositoryAdapter } from './confirmed-orders.repository.adapter';

describe('ConfirmedOrdersRepositoryAdapter', () => {
  it('reads the organization-fenced central variant recipe for picking', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 'order-1',
      lineItems: [{
        productName: 'Widget 2-pack',
        quantity: 2,
        listingOption: {
          organizationId: 'org-1',
          productVariant: {
            organizationId: 'org-1',
            components: [{
              organizationId: 'org-1',
              sellpiaInventorySkuId: 'sku-1',
              quantity: 2,
              sellpiaInventorySku: {
                organizationId: 'org-1',
                code: 'SP-001',
                name: 'Widget',
                optionName: null,
              },
            }],
          },
        },
      }],
    }]);
    const adapter = new ConfirmedOrdersRepositoryAdapter({
      order: { findMany },
    } as never);

    await expect(adapter.findConfirmedOrdersForPicking('org-1')).resolves.toEqual([{
      id: 'order-1',
      lineItems: [{
        productName: 'Widget 2-pack',
        quantity: 2,
        listingOption: {
          components: [{
            sellpiaInventorySkuId: 'sku-1',
            quantity: 2,
            sellpiaInventorySku: {
              code: 'SP-001',
              name: 'Widget',
              optionName: null,
            },
          }],
        },
      }],
    }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', status: 'confirmed' },
      include: expect.objectContaining({
        lineItems: expect.objectContaining({
          select: expect.objectContaining({
            listingOption: expect.objectContaining({
              select: expect.objectContaining({ productVariant: expect.any(Object) }),
            }),
          }),
        }),
      }),
    }));
  });

  it('drops a recipe when any relation crosses the organization fence', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 'order-1',
      lineItems: [{
        productName: 'Foreign recipe',
        quantity: 1,
        listingOption: {
          organizationId: 'org-1',
          productVariant: {
            organizationId: 'org-1',
            components: [{
              organizationId: 'org-1',
              sellpiaInventorySkuId: 'foreign-sku',
              quantity: 1,
              sellpiaInventorySku: {
                organizationId: 'org-2',
                code: 'SP-FOREIGN',
                name: 'Foreign',
                optionName: null,
              },
            }],
          },
        },
      }],
    }]);
    const adapter = new ConfirmedOrdersRepositoryAdapter({
      order: { findMany },
    } as never);

    const result = await adapter.findConfirmedOrdersForPicking('org-1');

    expect(result[0]?.lineItems[0]?.listingOption).toBeNull();
  });
});
