import { describe, expect, it } from 'vitest';
import {
  RocketPurchasePreviewRequestSchema, RocketWorkbookExportRequestSchema,
  RocketPoSourceControlSchema, RocketPoSourceAttemptSchema,
} from './rocket-purchase-preview.js';

describe('Rocket COMPLETE source reference', () => {
  it('accepts only a saved source reference, never page-supplied source rows', () => {
    const request = {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sourceImportRunId: '22222222-2222-4222-8222-222222222222',
      editedQuantities: {},
      previewScope: 'confirmation_requested',
    };
    expect(RocketPurchasePreviewRequestSchema.safeParse(request).success).toBe(true);
    expect(RocketPurchasePreviewRequestSchema.safeParse({ ...request, rows: [] }).success).toBe(false);
    expect(RocketPurchasePreviewRequestSchema.safeParse({ ...request, collection: {} }).success).toBe(false);
  });
  it('exposes a safe frozen source plan and keeps the write token in control only', () => {
    const control = {
      attemptId: '22222222-2222-4222-8222-222222222222',
      attemptToken: '33333333-3333-4333-8333-333333333333',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      state: 'RUNNING', generation: '1',
      plan: {
        sourceType: 'coupang_rocket_po_catalog', parserVersion: 'rocket-po-v1',
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        from: '2026-09-01', to: '2026-09-30', status: '',
        dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true,
        vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null },
      },
      expiresAt: '2026-09-01T00:10:00.000Z', actualCutoffAt: null,
      errorCode: null, errorMessage: null,
    };
    expect(RocketPoSourceControlSchema.parse(control)).toEqual(control);
    expect(RocketPoSourceAttemptSchema.safeParse(control).success).toBe(false);
    const { attemptToken: _token, ...safe } = control;
    expect(RocketPoSourceAttemptSchema.parse(safe)).toEqual(safe);
  });
  it('workbook input references source evidence instead of accepting replacement rows', () => {
    const request = {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sourceImportRunId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      editedQuantities: { line: 1 }, selectedPoLineIds: ['line'], shortageReasons: {},
      artifactFileName: 'confirmation.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    expect(RocketWorkbookExportRequestSchema.safeParse(request).success).toBe(true);
    expect(RocketWorkbookExportRequestSchema.safeParse({ ...request, rows: [] }).success).toBe(false);
  });
});
