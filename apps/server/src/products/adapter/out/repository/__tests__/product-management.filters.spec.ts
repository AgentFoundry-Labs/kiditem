import { describe, expect, it } from 'vitest';
import { buildProductManagementMasterWhere } from '../product-management.filters';

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
