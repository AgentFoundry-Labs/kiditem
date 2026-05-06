import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  CoupangImageSyncService,
  dedupeRows,
  hasDisplayImage,
} from '../coupang-image-sync.service';
import type {
  CoupangInventoryRow,
  CoupangInventoryScrapePort,
} from '../../port/out/coupang-inventory-scrape.port';
import type {
  AttachPrimaryImageInput,
  CoupangListingHandle,
  MasterCatalogPort,
} from '../../port/out/master-catalog.port';

const ORG_A = '00000000-0000-0000-0000-0000000c0001';
const ORG_B = '00000000-0000-0000-0000-0000000c0002';

describe('coupang-image-sync helpers', () => {
  describe('dedupeRows', () => {
    it('removes duplicates by inventoryId, drops empty rows', () => {
      const rows: CoupangInventoryRow[] = [
        { inventoryId: '1', name: 'A', url: 'https://x/1.jpg' },
        { inventoryId: '1', name: 'A-dup', url: 'https://x/1b.jpg' },
        { inventoryId: '2', name: 'B', url: 'https://x/2.jpg' },
        { inventoryId: '', name: 'no-id', url: 'https://x/.jpg' },
        { inventoryId: '3', name: 'no-url', url: '' },
      ];
      const out = dedupeRows(rows);
      expect(out).toHaveLength(2);
      expect(out.map((r) => r.inventoryId)).toEqual(['1', '2']);
      // 첫 등장이 우선, 두번째 dup row 는 버림
      expect(out[0].name).toBe('A');
    });
  });

  describe('hasDisplayImage', () => {
    it('true when imageUrl OR thumbnailUrl OR images[] non-empty', () => {
      expect(hasDisplayImage({ imageUrl: 'https://x', thumbnailUrl: null, images: [] })).toBe(true);
      expect(hasDisplayImage({ imageUrl: null, thumbnailUrl: 'https://x', images: [] })).toBe(true);
      expect(
        hasDisplayImage({ imageUrl: null, thumbnailUrl: null, images: [{ id: 'i1' }] }),
      ).toBe(true);
    });

    it('false when all three sources empty', () => {
      expect(hasDisplayImage({ imageUrl: null, thumbnailUrl: null, images: [] })).toBe(false);
    });
  });
});

describe('CoupangImageSyncService — orchestration via ports', () => {
  type ExistingListing = {
    externalId: string;
    master: {
      imageUrl: string | null;
      thumbnailUrl: string | null;
      images: Array<{ id: string }>;
    };
  };

  async function waitForJob(): Promise<void> {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  }

  function buildService(overrides?: {
    scrapeRows?: CoupangInventoryRow[];
    existingListings?: ExistingListing[];
    unmatchedInventoryIds?: string[];
    attachResults?: boolean[]; // per-row result of catalog.attachPrimaryImage
    attachThrowsOnce?: boolean; // first call throws → failure path
  }) {
    const scrapeRows: CoupangInventoryRow[] = overrides?.scrapeRows ?? [
      { inventoryId: 'INV-1', name: 'P1', url: 'https://wing.coupang.com/img/1.jpg' },
      { inventoryId: 'INV-2', name: 'P2', url: 'https://wing.coupang.com/img/2.jpg' },
    ];
    const existingListings = overrides?.existingListings ?? [];

    const scraper: CoupangInventoryScrapePort = {
      scrapeAll: vi.fn().mockResolvedValue(scrapeRows),
    };

    const ensureCalls: Array<{ organizationId: string; inventoryId: string }> = [];
    const attachCalls: AttachPrimaryImageInput[] = [];
    let attachIndex = 0;
    const catalog: MasterCatalogPort = {
      findCoupangListingImageStates: vi.fn(async (input) => {
        return existingListings
          .filter((listing) => input.inventoryIds.includes(listing.externalId))
          .map((listing) => ({
            inventoryId: listing.externalId,
            hasImage: hasDisplayImage(listing.master),
          }));
      }),
      findCoupangMaster: vi.fn(async (input) => {
        ensureCalls.push(input);
        if (overrides?.unmatchedInventoryIds?.includes(input.inventoryId)) {
          return null as unknown as CoupangListingHandle;
        }
        const handle: CoupangListingHandle = {
          masterId: `master-${input.inventoryId}`,
          // 모든 master 가 image 없는 상태로 가정 (이미 있으면 syncOne 이 일찍 return)
          hasImage: false,
        };
        return handle;
      }),
      attachPrimaryImage: vi.fn(async (input) => {
        attachCalls.push(input);
        const i = attachIndex++;
        if (overrides?.attachThrowsOnce && i === 0) {
          throw new Error('synthetic attach failure');
        }
        return overrides?.attachResults?.[i] ?? true;
      }),
    };

    const storage = {
      save: vi.fn(async (key: string) => `https://storage/${key}`),
    };

    const imageFetcher = {
      fetchImage: vi.fn(async () => ({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' })),
      extForMime: vi.fn(() => 'jpg'),
    };

    const service = new CoupangImageSyncService(scraper, catalog, imageFetcher, storage);
    return { service, scraper, catalog, storage, imageFetcher, ensureCalls, attachCalls };
  }

  it('start() throws ConflictException when same org has running job', async () => {
    const { service } = buildService();
    service.start(ORG_A);
    expect(() => service.start(ORG_A)).toThrow(ConflictException);
  });

  it('start() allows different orgs to run concurrently', () => {
    const { service } = buildService();
    expect(() => service.start(ORG_A)).not.toThrow();
    expect(() => service.start(ORG_B)).not.toThrow();
  });

  it('getStatus() throws NotFoundException for unknown jobId', () => {
    const { service } = buildService();
    expect(() => service.getStatus('nonexistent', ORG_A)).toThrow(NotFoundException);
  });

  it('getStatus() throws ForbiddenException for cross-org access', () => {
    const { service } = buildService();
    const { jobId } = service.start(ORG_A);
    expect(() => service.getStatus(jobId, ORG_B)).toThrow(ForbiddenException);
  });

  it('completes job: scraper → catalog.findCoupangMaster + attachPrimaryImage per row', async () => {
    const { service, scraper, catalog, ensureCalls, attachCalls } = buildService();
    const { jobId } = service.start(ORG_A);

    // 잡 실행은 fire-and-forget. 다음 microtask 까지 대기.
    await waitForJob();

    const status = service.getStatus(jobId, ORG_A);
    expect(status.status).toBe('done');
    expect(status.phase).toBe('finished');
    expect(status.total).toBe(2);
    expect(status.processed).toBe(2);
    expect(status.succeeded).toBe(2);
    expect(status.failed).toBe(0);

    expect(scraper.scrapeAll).toHaveBeenCalledTimes(1);
    expect(catalog.findCoupangMaster).toHaveBeenCalledTimes(2);
    expect(catalog.attachPrimaryImage).toHaveBeenCalledTimes(2);
    expect(ensureCalls.map((c) => c.inventoryId)).toEqual(['INV-1', 'INV-2']);
    expect(attachCalls.every((c) => c.organizationId === ORG_A)).toBe(true);
    expect(attachCalls.every((c) => c.url.startsWith('https://storage/'))).toBe(true);
  });

  it('startFromRows() uses extension-provided rows without invoking the scraper', async () => {
    const { service, scraper, catalog } = buildService({
      scrapeRows: [{ inventoryId: 'SCRAPER', name: 'unused', url: 'https://wing.coupang.com/img/unused.jpg' }],
    });

    const { jobId } = service.startFromRows(ORG_A, [
      { inventoryId: 'EXT-1', name: 'Extension P1', url: 'https://wing.coupang.com/img/ext-1.jpg' },
    ]);
    await waitForJob();

    const status = service.getStatus(jobId, ORG_A);
    expect(status.status).toBe('done');
    expect(status.total).toBe(1);
    expect(scraper.scrapeAll).not.toHaveBeenCalled();
    expect(catalog.findCoupangMaster).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryId: 'EXT-1', organizationId: ORG_A }),
    );
  });

  it('per-row failure does not abort the loop — counts failed and continues', async () => {
    const { service } = buildService({ attachThrowsOnce: true });
    const { jobId } = service.start(ORG_A);

    await waitForJob();

    const status = service.getStatus(jobId, ORG_A);
    expect(status.status).toBe('done');
    expect(status.processed).toBe(2);
    expect(status.failed).toBe(1);
    expect(status.succeeded).toBe(1);
  });

  it('counts unmatched Coupang rows separately from failures', async () => {
    const { service, catalog, imageFetcher } = buildService({
      unmatchedInventoryIds: ['INV-1'],
    });
    const { jobId } = service.start(ORG_A);

    await waitForJob();

    const status = service.getStatus(jobId, ORG_A);
    expect(status.status).toBe('done');
    expect(status.processed).toBe(2);
    expect(status.succeeded).toBe(1);
    expect(status.failed).toBe(0);
    expect(status.unmatched).toBe(1);
    expect(catalog.attachPrimaryImage).toHaveBeenCalledTimes(1);
    expect(imageFetcher.fetchImage).toHaveBeenCalledTimes(1);
  });

  it('batches existing listing lookup before filtering rows needing images', async () => {
    const scrapeRows: CoupangInventoryRow[] = [
      { inventoryId: 'INV-1', name: 'P1', url: 'https://wing.coupang.com/img/1.jpg' },
      { inventoryId: 'INV-2', name: 'P2', url: 'https://wing.coupang.com/img/2.jpg' },
      { inventoryId: 'INV-3', name: 'P3', url: 'https://wing.coupang.com/img/3.jpg' },
    ];
    const { service, catalog, ensureCalls } = buildService({
      scrapeRows,
      existingListings: [
        {
          externalId: 'INV-1',
          master: { imageUrl: 'https://cdn/existing.jpg', thumbnailUrl: null, images: [] },
        },
        {
          externalId: 'INV-2',
          master: { imageUrl: null, thumbnailUrl: null, images: [] },
        },
      ],
    });

    const { jobId } = service.start(ORG_A);
    await waitForJob();

    expect(catalog.findCoupangListingImageStates).toHaveBeenCalledOnce();
    expect(catalog.findCoupangListingImageStates).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        inventoryIds: ['INV-1', 'INV-2', 'INV-3'],
      }),
    );

    const status = service.getStatus(jobId, ORG_A);
    expect(status.total).toBe(2);
    expect(ensureCalls.map((call) => call.inventoryId)).toEqual(['INV-2', 'INV-3']);
  });
});
