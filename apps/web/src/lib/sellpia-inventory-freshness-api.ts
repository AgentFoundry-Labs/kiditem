import {
  SellpiaInventoryCollectionStatusViewSchema,
  type SellpiaInventoryCollectionStatusView,
} from '@kiditem/shared/sellpia-inventory-freshness';
import {
  InventorySkuSnapshotListResponseSchema,
  SellpiaImportRunListResponseSchema,
  type SellpiaImportRunSummary,
  type SellpiaImportRunListResponse,
} from '@kiditem/shared/inventory';
import { apiClient } from './api-client';

const COLLECTION_STATUS_PATH = '/api/inventory/sellpia-collection-status';
const HISTORY_PATH = '/api/inventory/sellpia-sync/import-runs';
const CURRENT_BASIS_PATH = '/api/inventory/sellpia-skus?page=1&limit=1';
export type SellpiaInventoryCollectionStatusWithBlockers = SellpiaInventoryCollectionStatusView;

function historyPath(params: { page?: number; limit?: number }): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const suffix = search.toString();
  return suffix ? `${HISTORY_PATH}?${suffix}` : HISTORY_PATH;
}

async function parseCollectionStatus(
  operation: Promise<unknown>,
): Promise<SellpiaInventoryCollectionStatusView> {
  return SellpiaInventoryCollectionStatusViewSchema.parse(await operation);
}

export const sellpiaInventoryCollectionStatusApi = {
  getState: () => parseCollectionStatus(apiClient.get(COLLECTION_STATUS_PATH)),

  confirmSourceBinding: () => parseCollectionStatus(apiClient.post(`${COLLECTION_STATUS_PATH}/source-binding`, {
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
    confirmed: true,
  })),

  async getCurrentBasis(): Promise<SellpiaImportRunSummary | null> {
    const response = await apiClient.getParsed(
      CURRENT_BASIS_PATH,
      InventorySkuSnapshotListResponseSchema,
    );
    return response.latestImport;
  },

  listHistory: (params: { page?: number; limit?: number } = {}) =>
    apiClient.getParsed(
      historyPath(params),
      SellpiaImportRunListResponseSchema,
    ) as Promise<SellpiaImportRunListResponse>,

};
