import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  COUPANG_IMAGE_SYNC_ALERT_START_TIMEOUT_MS,
  COUPANG_IMAGE_SYNC_STALE_ALERT_TTL_MS,
  CoupangImageSyncService,
  dedupeRows,
} from '../coupang-image-sync.service';
import type {
  CoupangInventoryRow,
  CoupangInventoryScrapePort,
} from '../../port/out/provider/coupang-inventory-scrape.port';
import type { CoupangImageReconciliationPort } from '../../port/out/cross-domain/coupang-image-reconciliation.port';
import type {
  AttachPrimaryImageInput,
  CoupangListingHandle,
  MasterCatalogPort,
} from '../../port/out/cross-domain/master-catalog.port';

const ORG_A = '00000000-0000-0000-0000-0000000c0001';
const ORG_B = '00000000-0000-0000-0000-0000000c0002';

function hasDisplayImage(master: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: Array<{ id: string }>;
}): boolean {
  return Boolean(master.imageUrl || master.thumbnailUrl || master.images.length > 0);
}

describe('coupang-image-sync helpers', () => {
  describe('dedupeRows', () => {
    it('removes duplicates by inventoryId, drops empty rows, and stamps source', () => {
      const rows: CoupangInventoryRow[] = [
        { inventoryId: '1', name: 'A', url: 'https://x/1.jpg' },
        { inventoryId: '1', name: 'A-dup', url: 'https://x/1b.jpg' },
        { inventoryId: '2', name: 'B', url: 'https://x/2.jpg' },
        { inventoryId: '', name: 'no-id', url: 'https://x/.jpg' },
        { inventoryId: '3', name: 'no-url', url: '' },
      ];
      const out = dedupeRows(rows, 'extension');
      expect(out).toHaveLength(2);
      expect(out.map((r) => r.inventoryId)).toEqual(['1', '2']);
      expect(out.every((r) => r.source === 'extension')).toBe(true);
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
      getCapabilities: vi.fn(() => ({ source: 'server_scraper', enabled: true })),
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

    const reconciliation: CoupangImageReconciliationPort = {
      recordRows: vi.fn(async () => undefined),
    };
    const operationAlerts = {
      start: vi.fn(async () => ({ id: 'alert-1' })),
      progress: vi.fn(async () => null),
      succeed: vi.fn(async () => null),
      fail: vi.fn(async () => null),
      cancel: vi.fn(async () => null),
      closeStaleOperations: vi.fn(async () => []),
    };
    const service = new CoupangImageSyncService(
      scraper,
      catalog,
      reconciliation,
      operationAlerts as any,
    );
    return {
      service,
      scraper,
      catalog,
      storage,
      imageFetcher,
      reconciliation,
      operationAlerts,
      ensureCalls,
      attachCalls,
    };
  }

  it('start() throws ConflictException when same org has running job', async () => {
    const { service } = buildService();
    service.start(ORG_A);
    expect(() => service.start(ORG_A)).toThrow(ConflictException);
  });

  it('closes stale running Coupang image-sync alerts on module init', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'));
    const { service, operationAlerts } = buildService();

    try {
      await service.onModuleInit();

      expect(operationAlerts.closeStaleOperations).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'coupang_image_sync',
          operationKeyPrefix: 'coupang-image-sync:',
          status: 'failed',
          staleBefore: new Date(Date.now() - COUPANG_IMAGE_SYNC_STALE_ALERT_TTL_MS),
          metadata: expect.objectContaining({
            phase: 'finished',
            staleReconciled: true,
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes extension and server scraper capabilities for source selection', () => {
    const { service, scraper } = buildService();

    expect(service.getCapabilities()).toEqual({
      extensionRows: { source: 'extension', enabled: true },
      serverScraper: { source: 'server_scraper', enabled: true },
      preferredSource: 'server_scraper',
    });
    expect(scraper.getCapabilities).toHaveBeenCalledOnce();
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

  it('completes job: scraper → catalog.findCoupangMaster + URL metadata attach per row', async () => {
    const { service, scraper, catalog, storage, imageFetcher, ensureCalls, attachCalls } = buildService();
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
    expect(imageFetcher.fetchImage).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(ensureCalls.map((c) => c.inventoryId)).toEqual(['INV-1', 'INV-2']);
    expect(attachCalls.every((c) => c.organizationId === ORG_A)).toBe(true);
    expect(attachCalls).toEqual([
      expect.objectContaining({
        masterId: 'master-INV-1',
        storageKey: null,
        url: 'https://wing.coupang.com/img/1.jpg',
        mimeType: null,
        fileSize: null,
      }),
      expect.objectContaining({
        masterId: 'master-INV-2',
        storageKey: null,
        url: 'https://wing.coupang.com/img/2.jpg',
        mimeType: null,
        fileSize: null,
      }),
    ]);
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

  it('records extension rows in the matching queue for image-sync reconciliation', async () => {
    const { service, reconciliation } = buildService();

    const { jobId } = service.startFromRows(ORG_A, [
      { inventoryId: 'EXT-1', name: 'Extension P1', url: 'https://wing.coupang.com/img/ext-1.jpg' },
      { inventoryId: 'EXT-1', name: 'Duplicate', url: 'https://wing.coupang.com/img/ext-1b.jpg' },
      { inventoryId: 'EXT-2', legacyCode: 'LC-2', name: 'Extension P2', url: 'https://wing.coupang.com/img/ext-2.jpg' },
    ]);
    await waitForJob();

    expect(service.getStatus(jobId, ORG_A).status).toBe('done');
    expect(reconciliation.recordRows).toHaveBeenCalledWith({
      organizationId: ORG_A,
      rows: [
        {
          inventoryId: 'EXT-1',
          name: 'Extension P1',
          url: 'https://wing.coupang.com/img/ext-1.jpg',
          source: 'extension',
        },
        {
          inventoryId: 'EXT-2',
          legacyCode: 'LC-2',
          name: 'Extension P2',
          url: 'https://wing.coupang.com/img/ext-2.jpg',
          source: 'extension',
        },
      ],
    });
  });

  it('rejects non-public source image URLs without attaching metadata', async () => {
    const { service, catalog, imageFetcher, storage } = buildService();

    const { jobId } = service.startFromRows(ORG_A, [
      { inventoryId: 'LOCALHOST', name: 'bad image', url: 'http://localhost:9000/private.jpg' },
    ]);
    await waitForJob();

    const status = service.getStatus(jobId, ORG_A);
    expect(status.status).toBe('done');
    expect(status.processed).toBe(1);
    expect(status.failed).toBe(1);
    expect(status.succeeded).toBe(0);
    expect(catalog.attachPrimaryImage).not.toHaveBeenCalled();
    expect(imageFetcher.fetchImage).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
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
    const { service, catalog, imageFetcher, storage } = buildService({
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
    expect(imageFetcher.fetchImage).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('emits operation alert lifecycle for a successful job', async () => {
    const { service, operationAlerts } = buildService();
    const { jobId } = service.start(ORG_A, 'user-1');
    await waitForJob();

    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        operationKey: `coupang-image-sync:${jobId}`,
        type: 'coupang_image_sync',
        sourceType: 'coupang_image_sync',
        sourceId: jobId,
        actorUserId: 'user-1',
        href: '/product-pipeline/thumbnail-generation',
      }),
    );
    expect(operationAlerts.succeed).toHaveBeenCalledWith(
      ORG_A,
      `coupang-image-sync:${jobId}`,
      expect.objectContaining({
        metadata: expect.objectContaining({ jobId, total: 2, succeeded: 2 }),
      }),
    );
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('continues the sync job if operation alert start hangs', async () => {
    vi.useFakeTimers();
    const { service, operationAlerts } = buildService();
    operationAlerts.start.mockImplementationOnce(() => new Promise(() => undefined));

    try {
      const { jobId } = service.startFromRows(
        ORG_A,
        [{ inventoryId: 'EXT-1', name: 'Extension P1', url: 'https://wing.coupang.com/img/ext-1.jpg' }],
        'user-1',
      );

      await vi.advanceTimersByTimeAsync(COUPANG_IMAGE_SYNC_ALERT_START_TIMEOUT_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(service.getStatus(jobId, ORG_A).status).toBe('done');
      expect(operationAlerts.succeed).toHaveBeenCalledWith(
        ORG_A,
        `coupang-image-sync:${jobId}`,
        expect.objectContaining({
          metadata: expect.objectContaining({ jobId, total: 1, succeeded: 1 }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-closes the operation alert if a delayed start resolves after the job', async () => {
    vi.useFakeTimers();
    const { service, operationAlerts } = buildService();
    let releaseStart!: () => void;
    operationAlerts.start.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseStart = () => resolve({ id: 'alert-delayed' });
      }),
    );

    try {
      const { jobId } = service.startFromRows(
        ORG_A,
        [{ inventoryId: 'EXT-1', name: 'Extension P1', url: 'https://wing.coupang.com/img/ext-1.jpg' }],
        'user-1',
      );

      await vi.advanceTimersByTimeAsync(COUPANG_IMAGE_SYNC_ALERT_START_TIMEOUT_MS);
      await Promise.resolve();
      await Promise.resolve();
      expect(service.getStatus(jobId, ORG_A).status).toBe('done');
      expect(operationAlerts.succeed).toHaveBeenCalledTimes(1);

      releaseStart();
      await Promise.resolve();
      await Promise.resolve();

      expect(operationAlerts.succeed).toHaveBeenCalledTimes(2);
      expect(operationAlerts.succeed).toHaveBeenLastCalledWith(
        ORG_A,
        `coupang-image-sync:${jobId}`,
        expect.objectContaining({
          metadata: expect.objectContaining({ jobId, total: 1, succeeded: 1 }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits operation alert fail when the job throws before completion', async () => {
    const scraper: CoupangInventoryScrapePort = {
      getCapabilities: vi.fn(() => ({ source: 'server_scraper', enabled: true })),
      scrapeAll: vi.fn(async () => {
        throw new Error('extension scrape blew up');
      }),
    };
    const catalog: MasterCatalogPort = {
      findCoupangListingImageStates: vi.fn(async () => []),
      findCoupangMaster: vi.fn(async () => null as unknown as CoupangListingHandle),
      attachPrimaryImage: vi.fn(async () => true),
    };
    const reconciliation: CoupangImageReconciliationPort = {
      recordRows: vi.fn(async () => undefined),
    };
    const operationAlerts = {
      start: vi.fn(async () => ({ id: 'alert-1' })),
      progress: vi.fn(async () => null),
      succeed: vi.fn(async () => null),
      fail: vi.fn(async () => null),
      cancel: vi.fn(async () => null),
      closeStaleOperations: vi.fn(async () => []),
    };
    const service = new CoupangImageSyncService(
      scraper,
      catalog,
      reconciliation,
      operationAlerts as any,
    );

    const { jobId } = service.start(ORG_A, 'user-1');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(service.getStatus(jobId, ORG_A).status).toBe('failed');
    expect(operationAlerts.start).toHaveBeenCalled();
    expect(operationAlerts.fail).toHaveBeenCalledWith(
      ORG_A,
      `coupang-image-sync:${jobId}`,
      expect.objectContaining({
        message: 'extension scrape blew up',
      }),
    );
    expect(operationAlerts.succeed).not.toHaveBeenCalled();
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
