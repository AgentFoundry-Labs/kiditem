import { describe, expect, it, vi } from 'vitest';
import type { ImageFetchPort } from '../../port/out/provider/image-fetch.port';
import type { ImageStoragePort } from '../../port/out/storage/image-storage.port';
import { CatalogMediaMaterializationWorker } from '../catalog-media-materialization-worker.service';

const ASSET_ID = '00000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002';

describe('CatalogMediaMaterializationWorker', () => {
  it('leases a provider asset and replaces its external URL with managed storage', async () => {
    const prisma = makePrisma([{ 
      id: ASSET_ID,
      organizationId: ORGANIZATION_ID,
      sourceUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/a.jpg',
      leaseToken: 'lease-1',
      attemptCount: 1,
    }]);
    const imageFetch = makeImageFetch();
    const storage = makeStorage();
    const worker = new CatalogMediaMaterializationWorker(
      prisma as never,
      imageFetch,
      storage,
    );

    await expect(worker.tick()).resolves.toBeUndefined();

    expect(imageFetch.fetchImage).toHaveBeenCalledWith(
      'https://image1.coupangcdn.com/image/vendor_inventory/a.jpg',
    );
    expect(storage.save).toHaveBeenCalledWith(
      `content-assets/coupang/${ORGANIZATION_ID}/${ASSET_ID}.jpg`,
      Buffer.from('image'),
      'image/jpeg',
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('records a retryable failure without throwing or changing the external URL', async () => {
    const prisma = makePrisma([{ 
      id: ASSET_ID,
      organizationId: ORGANIZATION_ID,
      sourceUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/a.jpg',
      leaseToken: 'lease-2',
      attemptCount: 2,
    }]);
    const imageFetch = makeImageFetch({
      fetchImage: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    });
    const worker = new CatalogMediaMaterializationWorker(
      prisma as never,
      imageFetch,
      makeStorage(),
    );

    await expect(worker.tick()).resolves.toBeUndefined();

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const query = String(prisma.$executeRaw.mock.calls[0]?.[0]?.[0] ?? '');
    expect(query).toContain('materializationStatus');
    expect(query).not.toContain('SET url =');
  });

  it('does nothing when there is no pending provider asset', async () => {
    const prisma = makePrisma([]);
    const imageFetch = makeImageFetch();
    const worker = new CatalogMediaMaterializationWorker(
      prisma as never,
      imageFetch,
      makeStorage(),
    );

    await worker.tick();

    expect(imageFetch.fetchImage).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

function makePrisma(claims: unknown[]) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(claims),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
}

function makeImageFetch(overrides: Partial<ImageFetchPort> = {}): ImageFetchPort {
  return {
    fetchImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from('image'),
      mimeType: 'image/jpeg',
      storageKey: null,
    }),
    fetchTrustedStorageImage: vi.fn(),
    assertSupportedMime: vi.fn(),
    extForMime: vi.fn().mockReturnValue('jpg'),
    ...overrides,
  } as ImageFetchPort;
}

function makeStorage(overrides: Partial<ImageStoragePort> = {}): ImageStoragePort {
  return {
    save: vi.fn().mockResolvedValue('https://storage.local/content-assets/a.jpg'),
    copy: vi.fn(),
    delete: vi.fn(),
    extractKey: vi.fn(),
    ...overrides,
  } as ImageStoragePort;
}
