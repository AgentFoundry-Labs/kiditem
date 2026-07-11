import { describe, expect, it, vi } from 'vitest';
import { buildProductManagementMasterWhere } from '../product-management.filters';
import { ProductManagementRepositoryAdapter } from '../product-management.repository.adapter';

describe('buildProductManagementMasterWhere', () => {
  it('limits product management to registered channel listings', () => {
    const where = buildProductManagementMasterWhere('organization-1', {}, null);

    expect(where).toMatchObject({
      organizationId: 'organization-1',
      isDeleted: false,
      listings: {
        some: {
          organizationId: 'organization-1',
          isDeleted: false,
        },
      },
    });
    expect(where).not.toHaveProperty('OR');
  });

  it('keeps search filters while requiring a registered listing', () => {
    const where = buildProductManagementMasterWhere(
      'organization-1',
      { search: '왁스' },
      ['master-1'],
    );

    expect(where).toMatchObject({
      organizationId: 'organization-1',
      listings: {
        some: {
          organizationId: 'organization-1',
          isDeleted: false,
        },
      },
      AND: expect.arrayContaining([
        { id: { in: ['master-1'] } },
      ]),
    });
  });
});

describe('ProductManagementRepositoryAdapter nullable ChannelProduct filters', () => {
  it('drops null MasterProduct IDs from channel-linked ID reads', async () => {
    const prisma = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          { masterId: null },
          { masterId: 'master-1' },
        ]),
      },
    };
    const repository = new ProductManagementRepositoryAdapter(prisma as never);

    const result = await repository.findChannelLinkedMasterIds(
      'organization-1',
      ['master-1'],
    );

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization-1',
          masterId: { in: ['master-1'], not: null },
          isDeleted: false,
        }),
      }),
    );
    expect(result).toEqual(['master-1']);
  });

  it('excludes unlinked ChannelProducts from status, management, and grade ID reads', async () => {
    const prisma = {
      channelListing: {
        findMany: vi.fn()
          .mockResolvedValueOnce([
            { masterId: null, status: 'active', exposureStatus: 'visible' },
          ])
          .mockResolvedValueOnce([
            {
              id: 'imported-listing-1',
              masterId: null,
              externalId: 'imported-product-1',
              channelName: 'Wing import only',
              channelPrice: 9900,
            },
          ])
          .mockResolvedValueOnce([{ masterId: null }]),
      },
    };
    const repository = new ProductManagementRepositoryAdapter(prisma as never);

    const statusRows = await repository.findStatusListingRows('organization-1');
    const managementRows = await repository.findManagementListingRows(
      'organization-1',
      ['master-1'],
    );
    const gradeMasterIds = await repository.findMasterIdsForListings(
      'organization-1',
      ['imported-listing-1'],
    );

    expect(statusRows).toEqual([]);
    expect(managementRows).toEqual([]);
    expect(gradeMasterIds).toEqual([]);
    expect(prisma.channelListing.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(prisma.channelListing.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          masterId: { in: ['master-1'], not: null },
        }),
      }),
    );
    expect(prisma.channelListing.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
  });
});
