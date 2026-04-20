import { describe, it, expect } from 'vitest';
import { PanelRunItem } from '@kiditem/shared';
import { imagePanelAdapter, ImageAdapterInput } from '../image.adapter';
import type { ThumbnailGeneration } from '@prisma/client';

const GEN_ID = '11111111-1111-1111-1111-111111111111';
const MASTER_ID = '22222222-2222-2222-2222-222222222222';
const COMPANY_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

const baseGeneration: ThumbnailGeneration = {
  id: GEN_ID,
  companyId: COMPANY_ID,
  masterId: MASTER_ID,
  originalUrl: null,
  candidates: [],
  selectedUrl: null,
  status: 'pending',
  phase: null,
  grade: 'F',
  score: 0,
  prompt: null,
  method: 'generate',
  editAnalysis: null,
  triggeredByUserId: USER_ID,
  createdAt: new Date('2026-04-15T00:00:00Z'),
  updatedAt: new Date('2026-04-15T01:00:00Z'),
};

const baseProduct = { id: MASTER_ID, title: '테스트 상품' };

const makeInput = (
  genOverrides: Partial<ThumbnailGeneration> = {},
): ImageAdapterInput => ({
  generation: { ...baseGeneration, ...genOverrides },
  product: baseProduct,
});

describe('imagePanelAdapter', () => {
  it.each(['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const)(
    'passes through canonical status "%s"',
    (status) => {
      const item = imagePanelAdapter.mapToItem(makeInput({ status }), 'co-1');
      expect(item.status).toBe(status);
    },
  );

  it.each(['generating', 'ready', 'applied'])(
    'passes through canonical phase "%s"',
    (phase) => {
      const item = imagePanelAdapter.mapToItem(makeInput({ phase }), 'co-1');
      expect(item.phase).toBe(phase);
    },
  );

  it('passes through null phase', () => {
    const item = imagePanelAdapter.mapToItem(makeInput({ phase: null }), 'co-1');
    expect(item.phase).toBeNull();
  });

  it('passes through non-canonical phase without throwing (Rule 3)', () => {
    expect(() =>
      imagePanelAdapter.mapToItem(makeInput({ phase: 'foo' }), 'co-1'),
    ).not.toThrow();
    const item = imagePanelAdapter.mapToItem(makeInput({ phase: 'foo' }), 'co-1');
    expect(item.phase).toBe('foo');
  });

  it('method "generate" emits without filtering', () => {
    const item = imagePanelAdapter.mapToItem(makeInput({ method: 'generate' }), 'co-1');
    expect(item).toBeDefined();
    expect(item.source).toBe('image');
  });

  it('method "edit" emits without filtering', () => {
    const item = imagePanelAdapter.mapToItem(makeInput({ method: 'edit' }), 'co-1');
    expect(item).toBeDefined();
    expect(item.source).toBe('image');
  });

  it('triggeredByUserId: null maps to actorUserId: null and visibility: company', () => {
    const item = imagePanelAdapter.mapToItem(
      makeInput({ triggeredByUserId: null }),
      'co-1',
    );
    expect(item.actorUserId).toBeNull();
    expect(item.visibility).toBe('company');
  });

  it('triggeredByUserId uuid maps to actorUserId and visibility: user', () => {
    const item = imagePanelAdapter.mapToItem(makeInput({ triggeredByUserId: USER_ID }), 'co-1');
    expect(item.actorUserId).toBe(USER_ID);
    expect(item.visibility).toBe('user');
  });

  it('throws on invalid (non-canonical) status', () => {
    expect(() =>
      imagePanelAdapter.mapToItem(makeInput({ status: 'queued' }), 'co-1'),
    ).toThrow(/unknown status "queued"/);
  });

  it('output passes PanelRunItemSchema validation', () => {
    const item = imagePanelAdapter.mapToItem(makeInput({ status: 'succeeded' }), 'co-1');
    const result = PanelRunItem.omit({ seq: true, updatedAt: true }).safeParse(item);
    expect(result.success).toBe(true);
  });

  it('maps id with image: prefix', () => {
    const item = imagePanelAdapter.mapToItem(makeInput(), 'co-1');
    expect(item.id).toBe(`image:${GEN_ID}`);
    expect(item.sourceId).toBe(GEN_ID);
  });

  it('failureType is null for image source', () => {
    const item = imagePanelAdapter.mapToItem(makeInput({ status: 'failed' }), 'co-1');
    expect(item.failureType).toBeNull();
  });

  it('output does NOT include companyId (envelope carries it)', () => {
    const item = imagePanelAdapter.mapToItem(makeInput(), 'co-1');
    expect('companyId' in item).toBe(false);
    // Confirm Zod parse also succeeds (companyId not in schema)
    const result = PanelRunItem.omit({ seq: true, updatedAt: true }).safeParse(item);
    expect(result.success).toBe(true);
  });

  it('deepLink follows /products/:productId/thumbnails/:generationId pattern', () => {
    const item = imagePanelAdapter.mapToItem(makeInput(), 'co-1');
    expect(item.deepLink).toBe(`/products/${MASTER_ID}/thumbnails/${GEN_ID}`);
  });
});
