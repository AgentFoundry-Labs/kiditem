import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Panel emit hook tests for ThumbnailGeneration services (Task 19).
 *
 * Verify that PANEL_EVENTS.UPSERT is emitted at the right lifecycle points:
 *   1. ThumbnailGenerationService.saveEditorResult — on create (succeeded+ready)
 *   2. ThumbnailGenerationService.selectCandidate — on phase transition → ready
 *   3. ThumbnailGenerationService.applyGeneration — on phase transition → applied
 *   4. ThumbnailGenerationService.skipGeneration — on status → cancelled
 *   5. ThumbnailEditService.createEditJobs — on create (pending)
 *   6. ThumbnailEditService.processEditJob (via createEditJobs background) — running, failed, ready
 *
 * NOT emitted:
 *   - deleteGeneration (no status change, record removed)
 *   - findAll bulk SQL reset (no companyId context, internal housekeeping)
 *
 * Payload envelope: { item, companyId }
 *   item: no companyId field (stripped before delivery to client)
 *   item.source === 'image'
 *   item.title === product.title
 */

import { ThumbnailGenerationService } from '../services/thumbnail-generation.service';
import { ThumbnailEditService } from '../services/thumbnail-edit.service';
import { PANEL_EVENTS } from '../../panel/events/panel-events';

// ── helpers ────────────────────────────────────────────────────────────────

function makeEventEmitter() {
  return { emit: vi.fn() };
}

/** Minimal ThumbnailGeneration row shape returned by Prisma writes */
function makeGenRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'gen-1',
    productId: 'prod-1',
    companyId: 'co-1',
    status: 'pending',
    phase: null,
    method: 'edit',
    grade: '-',
    score: 0,
    originalUrl: 'https://img.example.com/orig.jpg',
    candidates: [],
    selectedUrl: null,
    editAnalysis: null,
    prompt: null,
    triggeredByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Minimal Product row shape */
function makeProduct(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'prod-1',
    companyId: 'co-1',
    name: '아동 레깅스',
    imageUrl: 'https://img.example.com/orig.jpg',
    coupangProductId: null,
    category: '의류',
    ...overrides,
  };
}

// ── ThumbnailGenerationService tests ──────────────────────────────────────

describe('ThumbnailGenerationService — Panel emit hook (Task 19)', () => {
  let prisma: any;
  let eventEmitter: ReturnType<typeof makeEventEmitter>;
  let service: ThumbnailGenerationService;

  function makePrismaForGenService() {
    return {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      thumbnailGeneration: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        delete: vi.fn(),
      },
      product: {
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      thumbnailAnalysis: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
  }

  beforeEach(() => {
    prisma = makePrismaForGenService();
    eventEmitter = makeEventEmitter();
    service = new ThumbnailGenerationService(
      prisma as any,
      {} as any, // thumbnailAiService (not used in these tests)
      { create: vi.fn().mockResolvedValue({}) } as any, // trackingService
      eventEmitter as any,
    );
  });

  it('emits PANEL_EVENTS.UPSERT on saveEditorResult (create succeeded+ready)', async () => {
    const genRow = makeGenRow({ status: 'succeeded', phase: 'ready' });
    const product = makeProduct();
    prisma.thumbnailGeneration.create.mockResolvedValue(genRow);
    prisma.product.findUnique.mockResolvedValue(product);

    await service.saveEditorResult({
      productId: 'prod-1',
      companyId: 'co-1',
      originalUrl: 'https://img.example.com/orig.jpg',
      candidates: [{ url: 'https://img.example.com/out.jpg', filename: 'out.jpg' }],
    });

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    expect(panelCalls).toHaveLength(1);

    const payload = panelCalls[0][1];
    expect(payload.companyId).toBe('co-1');
    expect(payload.item).toBeDefined();
    expect(payload.item.status).toBe('succeeded');
    expect(payload.item.phase).toBe('ready');
    expect(payload.item.source).toBe('image');
    expect(payload.item.title).toBe(product.name);
    // companyId must NOT be on the item (envelope only)
    expect(payload.item.companyId).toBeUndefined();
  });

  it('does NOT emit when saveEditorResult DB throws', async () => {
    prisma.thumbnailGeneration.create.mockRejectedValue(new Error('DB fail'));

    const id = await service.saveEditorResult({
      productId: 'prod-1',
      companyId: 'co-1',
      originalUrl: null,
      candidates: [],
    });

    expect(id).toBeNull();
    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    expect(panelCalls).toHaveLength(0);
  });

  it('emits PANEL_EVENTS.UPSERT on selectCandidate (phase → ready)', async () => {
    const existingRow = makeGenRow({ status: 'succeeded', phase: 'generating' });
    const updatedRow = makeGenRow({
      status: 'succeeded',
      phase: 'ready',
      selectedUrl: 'https://img.example.com/out.jpg',
      product: makeProduct(),
    });
    prisma.thumbnailGeneration.findUnique.mockResolvedValue(existingRow);
    prisma.thumbnailGeneration.update.mockResolvedValue(updatedRow);

    await service.selectCandidate('gen-1', 'https://img.example.com/out.jpg');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    expect(panelCalls).toHaveLength(1);

    const payload = panelCalls[0][1];
    expect(payload.companyId).toBe('co-1');
    expect(payload.item.status).toBe('succeeded');
    expect(payload.item.phase).toBe('ready');
    expect(payload.item.source).toBe('image');
    expect(payload.item.companyId).toBeUndefined();
  });

  it('emits PANEL_EVENTS.UPSERT on applyGeneration (phase → applied)', async () => {
    const existingRow = makeGenRow({ status: 'succeeded', phase: 'ready', selectedUrl: 'https://img.example.com/out.jpg' });
    const appliedRow = makeGenRow({
      status: 'succeeded',
      phase: 'applied',
      product: makeProduct(),
    });
    prisma.thumbnailGeneration.findUnique.mockResolvedValue(existingRow);
    prisma.product.update.mockResolvedValue({});
    prisma.thumbnailGeneration.update.mockResolvedValue(appliedRow);

    await service.applyGeneration('gen-1');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    expect(panelCalls).toHaveLength(1);

    const payload = panelCalls[0][1];
    expect(payload.item.status).toBe('succeeded');
    expect(payload.item.phase).toBe('applied');
    expect(payload.item.source).toBe('image');
    expect(payload.item.companyId).toBeUndefined();
  });

  it('emits PANEL_EVENTS.UPSERT on skipGeneration (status → cancelled)', async () => {
    const existingRow = makeGenRow();
    const cancelledRow = makeGenRow({
      status: 'cancelled',
      phase: null,
      product: makeProduct(),
    });
    prisma.thumbnailGeneration.findUnique.mockResolvedValue(existingRow);
    prisma.thumbnailGeneration.update.mockResolvedValue(cancelledRow);

    await service.skipGeneration('gen-1');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    expect(panelCalls).toHaveLength(1);

    const payload = panelCalls[0][1];
    expect(payload.item.status).toBe('cancelled');
    expect(payload.item.source).toBe('image');
    expect(payload.item.companyId).toBeUndefined();
  });

  it('does NOT emit on deleteGeneration (no status change)', async () => {
    prisma.thumbnailGeneration.findUnique.mockResolvedValue(makeGenRow());
    prisma.thumbnailGeneration.delete.mockResolvedValue({});

    await service.deleteGeneration('gen-1');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    expect(panelCalls).toHaveLength(0);
  });
});

// ── ThumbnailEditService tests ─────────────────────────────────────────────

describe('ThumbnailEditService — Panel emit hook (Task 19)', () => {
  let prisma: any;
  let aiService: any;
  let eventEmitter: ReturnType<typeof makeEventEmitter>;
  let service: ThumbnailEditService;

  function makePrismaForEditService() {
    return {
      product: {
        findUnique: vi.fn(),
      },
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
  }

  beforeEach(() => {
    prisma = makePrismaForEditService();
    aiService = {
      editImage: vi.fn(),
      checkCompliance: vi.fn().mockResolvedValue(new Map()),
    };
    eventEmitter = makeEventEmitter();
    service = new ThumbnailEditService(prisma as any, aiService as any, eventEmitter as any);
  });

  it('emits PANEL_EVENTS.UPSERT on createEditJobs create (status=pending)', async () => {
    const product = makeProduct();
    const genRow = makeGenRow({ status: 'pending', product });
    prisma.product.findUnique.mockResolvedValue(product);
    prisma.thumbnailGeneration.create.mockResolvedValue(genRow);
    // processEditJob runs via setImmediate — we don't wait for it here
    aiService.editImage.mockResolvedValue([]);

    await service.createEditJobs(['prod-1']);

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    // At least one emit from the create (pending)
    expect(panelCalls.length).toBeGreaterThanOrEqual(1);

    const createPayload = panelCalls[0][1];
    expect(createPayload.companyId).toBe('co-1');
    expect(createPayload.item).toBeDefined();
    expect(createPayload.item.status).toBe('pending');
    expect(createPayload.item.source).toBe('image');
    expect(createPayload.item.title).toBe(product.name);
    expect(createPayload.item.companyId).toBeUndefined();
  });

  it('emits PANEL_EVENTS.UPSERT on status transitions in processEditJob (running → succeeded+ready)', async () => {
    const product = makeProduct();
    const genRow = makeGenRow({ status: 'pending', product });
    const runningRow = makeGenRow({ status: 'running', phase: null });
    const readyRow = makeGenRow({ status: 'succeeded', phase: 'ready' });
    const genForProduct = { productId: 'prod-1', companyId: 'co-1', product: { id: 'prod-1', name: product.name } };

    prisma.product.findUnique.mockResolvedValue(product);
    prisma.thumbnailGeneration.create.mockResolvedValue(genRow);
    prisma.thumbnailGeneration.findUnique.mockResolvedValue(genForProduct);
    // processEditJob calls update twice: running, then markReady
    prisma.thumbnailGeneration.update
      .mockResolvedValueOnce(runningRow)
      .mockResolvedValueOnce(readyRow); // markReady uses update

    aiService.editImage.mockResolvedValue([{ url: 'https://img.example.com/out.jpg', filename: 'out.jpg' }]);

    await service.createEditJobs(['prod-1']);
    // Wait for setImmediate to flush
    await new Promise((resolve) => setImmediate(resolve));

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    // 1 on create (pending) + 1 on running + 1 on ready = 3
    expect(panelCalls.length).toBeGreaterThanOrEqual(3);

    const runningPayload = panelCalls[1][1];
    expect(runningPayload.item.status).toBe('running');

    const readyPayload = panelCalls[2][1];
    expect(readyPayload.item.status).toBe('succeeded');
    expect(readyPayload.item.phase).toBe('ready');
  });

  it('emits PANEL_EVENTS.UPSERT on failed (0 candidates)', async () => {
    const product = makeProduct();
    const genRow = makeGenRow({ status: 'pending', product });
    const runningRow = makeGenRow({ status: 'running', phase: null });
    const failedRow = makeGenRow({ status: 'failed', phase: null });
    const genForProduct = { productId: 'prod-1', companyId: 'co-1', product: { id: 'prod-1', name: product.name } };

    prisma.product.findUnique.mockResolvedValue(product);
    prisma.thumbnailGeneration.create.mockResolvedValue(genRow);
    prisma.thumbnailGeneration.findUnique.mockResolvedValue(genForProduct);
    prisma.thumbnailGeneration.update
      .mockResolvedValueOnce(runningRow)
      .mockResolvedValueOnce(failedRow);

    aiService.editImage.mockResolvedValue([]); // 0 candidates → failed

    await service.createEditJobs(['prod-1']);
    await new Promise((resolve) => setImmediate(resolve));

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    // 1 create + 1 running + 1 failed
    expect(panelCalls.length).toBeGreaterThanOrEqual(3);

    const failedPayload = panelCalls[2][1];
    expect(failedPayload.item.status).toBe('failed');
    expect(failedPayload.item.companyId).toBeUndefined();
  });
});
