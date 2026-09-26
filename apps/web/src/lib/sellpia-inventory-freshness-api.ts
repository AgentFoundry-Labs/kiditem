import {
  SellpiaInventoryCollectionStatusViewSchema,
  type SellpiaInventoryCollectionStatusView,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { apiClient } from './api-client';

const COLLECTION_STATUS_PATH = '/api/inventory/sellpia-collection-status';
export type SellpiaInventoryCollectionStatusWithBlockers = SellpiaInventoryCollectionStatusView;

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
};
