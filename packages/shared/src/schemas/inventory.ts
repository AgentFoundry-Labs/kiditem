import { z } from 'zod';
import { zIsoDate } from './common.js';

export const SELLPIA_WORKBOOK_FILE_EXTENSIONS = ['.xls', '.xlsx', '.csv'] as const;
export type SellpiaWorkbookFileExtension = typeof SELLPIA_WORKBOOK_FILE_EXTENSIONS[number];
export const SELLPIA_WORKBOOK_ACCEPT = SELLPIA_WORKBOOK_FILE_EXTENSIONS.join(',');
export const SELLPIA_WORKBOOK_FORMAT_LABEL = 'XLS/XLSX/CSV';

export const SellpiaReceiptUploadBatchStatusSchema = z.enum([
  'template_pending',
  'pending_upload',
  'uploaded',
  'needs_reupload',
  'canceled',
]);
export type SellpiaReceiptUploadBatchStatus = z.infer<
  typeof SellpiaReceiptUploadBatchStatusSchema
>;

export const SellpiaReceiptUploadBatchSchema = z.object({
  id: z.string().uuid(),
  status: SellpiaReceiptUploadBatchStatusSchema,
  sourceType: z.string().min(1).max(50),
  sourceRef: z.string().min(1).max(200),
  templateVersion: z.string().max(50).nullable(),
  uploadedAt: zIsoDate.nullable(),
  note: z.string().max(500).nullable(),
  createdAt: zIsoDate,
});
export type SellpiaReceiptUploadBatch = z.infer<
  typeof SellpiaReceiptUploadBatchSchema
>;

export const SellpiaReceiptBatchCreateInputSchema = z.object({
  sourceType: z.string().min(1).max(50),
  sourceRef: z.string().min(1).max(200),
  note: z.string().max(500).optional(),
});
export type SellpiaReceiptBatchCreateInput = z.infer<
  typeof SellpiaReceiptBatchCreateInputSchema
>;

export const SellpiaReceiptBatchMarkUploadedInputSchema = z.object({
  note: z.string().max(500).optional(),
});
export type SellpiaReceiptBatchMarkUploadedInput = z.infer<
  typeof SellpiaReceiptBatchMarkUploadedInputSchema
>;
