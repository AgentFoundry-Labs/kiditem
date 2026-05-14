import { describe, it, expect } from 'vitest';
import { PanelRunItemSchema } from '@kiditem/shared/panel';
import { imagePanelMapper, ImageAdapterInput } from '../image.mapper';
import type { ThumbnailGeneration } from '@prisma/client';

const GEN_ID = '11111111-1111-1111-1111-111111111111';
const MASTER_ID = '22222222-2222-2222-2222-222222222222';
const ORGANIZATION_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

const baseGeneration: ThumbnailGeneration = {
  id: GEN_ID,
  organizationId: ORGANIZATION_ID,
  masterId: MASTER_ID,
  originalUrl: null,
  selectedUrl: null,
  status: 'pending',
  phase: null,
  grade: 'F',
  score: 0,
  prompt: null,
  method: 'generate',
  editAnalysis: null,
  inputMeta: null,
  inputMetaVersion: 1,
  errorMessage: null,
  attemptCount: 0,
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

describe('imagePanelMapper', () => {
  it.each(['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const)(
    'passes through canonical status "%s"',
    (status) => {
      const item = imagePanelMapper.mapToItem(makeInput({ status }), 'co-1');
      expect(item.status).toBe(status);
    },
  );

  it.each(['generating', 'ready', 'applied'])(
    'passes through canonical phase "%s"',
    (phase) => {
      const item = imagePanelMapper.mapToItem(makeInput({ phase }), 'co-1');
      expect(item.phase).toBe(phase);
    },
  );

  it('passes through null phase', () => {
    const item = imagePanelMapper.mapToItem(makeInput({ phase: null }), 'co-1');
    expect(item.phase).toBeNull();
  });

  it('passes through non-canonical phase without throwing (Rule 3)', () => {
    expect(() =>
      imagePanelMapper.mapToItem(makeInput({ phase: 'foo' }), 'co-1'),
    ).not.toThrow();
    const item = imagePanelMapper.mapToItem(makeInput({ phase: 'foo' }), 'co-1');
    expect(item.phase).toBe('foo');
  });

  it('method "generate" emits without filtering', () => {
    const item = imagePanelMapper.mapToItem(makeInput({ method: 'generate' }), 'co-1');
    expect(item).toBeDefined();
    expect(item.source).toBe('image');
  });

  it('method "edit" emits without filtering', () => {
    const item = imagePanelMapper.mapToItem(makeInput({ method: 'edit' }), 'co-1');
    expect(item).toBeDefined();
    expect(item.source).toBe('image');
  });

  it('triggeredByUserId: null maps to actorUserId: null and visibility: organization', () => {
    const item = imagePanelMapper.mapToItem(
      makeInput({ triggeredByUserId: null }),
      'co-1',
    );
    expect(item.actorUserId).toBeNull();
    expect(item.visibility).toBe('organization');
  });

  it('triggeredByUserId uuid maps to actorUserId and visibility: user', () => {
    const item = imagePanelMapper.mapToItem(makeInput({ triggeredByUserId: USER_ID }), 'co-1');
    expect(item.actorUserId).toBe(USER_ID);
    expect(item.visibility).toBe('user');
  });

  it('throws on invalid (non-canonical) status', () => {
    expect(() =>
      imagePanelMapper.mapToItem(makeInput({ status: 'queued' }), 'co-1'),
    ).toThrow(/unknown status "queued"/);
  });

  it('output passes PanelRunItemSchema validation', () => {
    const item = imagePanelMapper.mapToItem(makeInput({ status: 'succeeded' }), 'co-1');
    const result = PanelRunItemSchema.omit({ seq: true, updatedAt: true }).safeParse(item);
    expect(result.success).toBe(true);
  });

  it('maps id with image: prefix', () => {
    const item = imagePanelMapper.mapToItem(makeInput(), 'co-1');
    expect(item.id).toBe(`image:${GEN_ID}`);
    expect(item.sourceId).toBe(GEN_ID);
  });

  it('failureType is null for image source', () => {
    const item = imagePanelMapper.mapToItem(makeInput({ status: 'failed' }), 'co-1');
    expect(item.failureType).toBeNull();
  });

  it('output does NOT include organizationId (envelope carries it)', () => {
    const item = imagePanelMapper.mapToItem(makeInput(), 'co-1');
    expect('organizationId' in item).toBe(false);
    // Confirm Zod parse also succeeds (organizationId not in schema)
    const result = PanelRunItemSchema.omit({ seq: true, updatedAt: true }).safeParse(item);
    expect(result.success).toBe(true);
  });

  it('deepLink opens the thumbnail workspace with the generation selected', () => {
    const item = imagePanelMapper.mapToItem(makeInput(), 'co-1');
    expect(item.deepLink).toBe(`/thumbnails?generationId=${GEN_ID}`);
  });
});
