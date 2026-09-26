import { describe, expect, it } from 'vitest';
import {
  RocketPurchasePreviewRequestSchema, RocketWorkbookExportRequestSchema,
} from './rocket-purchase-preview.js';

describe('Rocket COMPLETE source reference', () => {
  it('accepts only a saved source reference, never page-supplied source rows', () => {
    const request = {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      rocketPoOperationId: '22222222-2222-4222-8222-222222222222',
      inventoryOperationId: '44444444-4444-4444-8444-444444444444',
      editedQuantities: {},
      previewScope: 'confirmation_requested',
    };
    expect(RocketPurchasePreviewRequestSchema.safeParse(request).success).toBe(true);
    expect(RocketPurchasePreviewRequestSchema.safeParse({ ...request, rows: [] }).success).toBe(false);
    expect(RocketPurchasePreviewRequestSchema.safeParse({ ...request, collection: {} }).success).toBe(false);
  });
  it('workbook input references source evidence instead of accepting replacement rows', () => {
    const request = {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      rocketPoOperationId: '22222222-2222-4222-8222-222222222222',
      inventoryOperationId: '44444444-4444-4444-8444-444444444444',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      editedQuantities: { line: 1 }, selectedPoLineIds: ['line'], shortageReasons: {},
      artifactFileName: 'confirmation.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    expect(RocketWorkbookExportRequestSchema.safeParse(request).success).toBe(true);
    expect(RocketWorkbookExportRequestSchema.safeParse({ ...request, rows: [] }).success).toBe(false);
  });
});
