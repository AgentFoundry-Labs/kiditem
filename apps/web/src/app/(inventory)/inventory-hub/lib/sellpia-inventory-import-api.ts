import {
  SellpiaInventoryImportResponseSchema,
  type SellpiaInventoryImportResponse,
} from '@kiditem/shared/source-import';
import { apiClient } from '@/lib/api-client';

export async function importSellpiaInventory(
  file: File,
): Promise<SellpiaInventoryImportResponse> {
  const form = new FormData();
  form.append('file', file);
  return apiClient.uploadParsed(
    '/api/inventory/sellpia-sync/import',
    SellpiaInventoryImportResponseSchema,
    form,
  );
}
