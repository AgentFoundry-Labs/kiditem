import { describe, expect, it, vi } from 'vitest';
import { MasterProductRepositoryAdapter } from '../adapter/out/repository/master-product.repository.adapter';

describe('MasterProductRepositoryAdapter', () => {
  it('createPromoted persists image rows with tenant, master, metadata, and one primary image', async () => {
    const tx = {
      masterProduct: {
        create: vi.fn().mockResolvedValue({ id: 'master-1' }),
      },
      masterProductImage: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const repository = new MasterProductRepositoryAdapter({} as any);

    await repository.createPromoted({
      organizationId: 'organization-1',
      tx: tx as any,
      data: { organizationId: 'organization-1', code: 'M-00000001', name: 'Toy' },
      images: [
        {
          url: 'https://example.com/first.jpg',
          storageKey: null,
          role: 'product',
          label: null,
          sortOrder: 0,
          source: 'sourcing-extension',
        },
        {
          url: 'https://example.com/second.jpg',
          storageKey: 'products/second.jpg',
          role: 'detail',
          label: 'Detail',
          sortOrder: 1,
          source: 'sourcing-extension',
          mimeType: 'image/jpeg',
          width: 640,
          height: 480,
          fileSize: 12345,
          isPrimary: true,
        },
      ],
    });

    expect(tx.masterProduct.create).toHaveBeenCalledWith({
      data: { organizationId: 'organization-1', code: 'M-00000001', name: 'Toy' },
      select: { id: true },
    });
    expect(tx.masterProductImage.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'organization-1',
          masterId: 'master-1',
          url: 'https://example.com/first.jpg',
          storageKey: null,
          role: 'product',
          label: null,
          sortOrder: 0,
          source: 'sourcing-extension',
          mimeType: null,
          width: null,
          height: null,
          fileSize: null,
          isPrimary: false,
        },
        {
          organizationId: 'organization-1',
          masterId: 'master-1',
          url: 'https://example.com/second.jpg',
          storageKey: 'products/second.jpg',
          role: 'detail',
          label: 'Detail',
          sortOrder: 1,
          source: 'sourcing-extension',
          mimeType: 'image/jpeg',
          width: 640,
          height: 480,
          fileSize: 12345,
          isPrimary: true,
        },
      ],
    });
  });
});
