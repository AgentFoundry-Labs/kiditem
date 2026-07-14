import { describe, expect, it } from 'vitest';
import {
  SELLPIA_WORKBOOK_ACCEPT,
  SELLPIA_WORKBOOK_FILE_EXTENSIONS,
  SELLPIA_WORKBOOK_FORMAT_LABEL,
  SellpiaReceiptBatchCreateInputSchema,
  SellpiaReceiptUploadBatchSchema,
  SellpiaReceiptUploadBatchStatusSchema,
} from './inventory.js';

describe('Sellpia workbook and receipt tracking contracts', () => {
  it('publishes one workbook file support interface', () => {
    expect(SELLPIA_WORKBOOK_FORMAT_LABEL).toBe('XLS/XLSX/CSV');
    expect(SELLPIA_WORKBOOK_FILE_EXTENSIONS).toEqual(['.xls', '.xlsx', '.csv']);
    expect(SELLPIA_WORKBOOK_ACCEPT).toBe('.xls,.xlsx,.csv');
  });

  it('tracks receipt upload without mutating KidItem stock', () => {
    const parsed = SellpiaReceiptUploadBatchSchema.parse({
      id: '00000000-0000-4000-8000-000000000007',
      status: 'template_pending',
      sourceType: 'purchase_receipt',
      sourceRef: 'receipt-20260712-1',
      templateVersion: null,
      uploadedAt: null,
      note: null,
      createdAt: '2026-07-12T00:00:00.000Z',
    });

    expect(SellpiaReceiptUploadBatchStatusSchema.options).toContain('pending_upload');
    expect(parsed.status).toBe('template_pending');
    expect(SellpiaReceiptBatchCreateInputSchema.parse({
      sourceType: 'purchase_receipt',
      sourceRef: 'receipt-20260712-1',
    })).toEqual({
      sourceType: 'purchase_receipt',
      sourceRef: 'receipt-20260712-1',
    });
  });
});
