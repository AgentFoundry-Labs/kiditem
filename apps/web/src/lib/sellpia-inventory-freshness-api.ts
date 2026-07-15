import {
  SellpiaInventoryClaimResponseSchema,
  SellpiaInventoryFreshnessViewSchema,
  type SellpiaInventoryCollectionFailureCode,
  type SellpiaInventoryFreshnessView,
  type SellpiaInventoryRefreshReason,
} from '@kiditem/shared/sellpia-inventory-freshness';
import {
  SellpiaInventoryImportResponseSchema,
  type SellpiaInventoryImportResponse,
} from '@kiditem/shared/source-import';
import {
  InventorySkuSnapshotListResponseSchema,
  SellpiaImportRunListResponseSchema,
  type SellpiaImportRunSummary,
  type SellpiaImportRunListResponse,
} from '@kiditem/shared/inventory';
import { apiClient } from './api-client';

const FRESHNESS_PATH = '/api/inventory/sellpia-freshness';
const IMPORT_PATH = '/api/inventory/sellpia-sync/import';
const HISTORY_PATH = '/api/inventory/sellpia-sync/import-runs';
const CURRENT_BASIS_PATH = '/api/inventory/sellpia-skus?page=1&limit=1';

function claimPath(claimToken: string, action: string): string {
  return `${FRESHNESS_PATH}/claims/${encodeURIComponent(claimToken)}/${action}`;
}

function historyPath(params: { page?: number; limit?: number }): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const suffix = search.toString();
  return suffix ? `${HISTORY_PATH}?${suffix}` : HISTORY_PATH;
}

async function parseFreshness(
  operation: Promise<unknown>,
): Promise<SellpiaInventoryFreshnessView> {
  return SellpiaInventoryFreshnessViewSchema.parse(await operation);
}

function appendWorkbook(form: FormData, file: File): void {
  form.append('file', file);
}

export const sellpiaInventoryFreshnessApi = {
  getState: () =>
    apiClient.getParsed(FRESHNESS_PATH, SellpiaInventoryFreshnessViewSchema),

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

  async claimDue() {
    const response = await apiClient.post<unknown>(`${FRESHNESS_PATH}/claims`, {});
    return SellpiaInventoryClaimResponseSchema.parse(response);
  },

  heartbeat: (claimToken: string) =>
    parseFreshness(apiClient.post(claimPath(claimToken, 'heartbeat'), {})),

  fail: (
    claimToken: string,
    input: {
      errorCode: SellpiaInventoryCollectionFailureCode;
      errorMessage: string;
    },
  ) => parseFreshness(apiClient.post(claimPath(claimToken, 'fail'), input)),

  cancel: (claimToken: string) =>
    parseFreshness(apiClient.post(claimPath(claimToken, 'cancel'), {})),

  requestRefresh: (reason: Extract<SellpiaInventoryRefreshReason, 'manual_request' | 'retry' | 'order_transmission_requested'>) =>
    parseFreshness(apiClient.post(`${FRESHNESS_PATH}/requests`, { reason })),

  confirmSourceBinding: () =>
    parseFreshness(apiClient.post(`${FRESHNESS_PATH}/source-binding`, {
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    })),

  importBrowser(
    file: File,
    input: {
      claimToken: string;
      activeGeneration: string;
      trigger: SellpiaInventoryRefreshReason;
    },
  ): Promise<SellpiaInventoryImportResponse> {
    const form = new FormData();
    appendWorkbook(form, file);
    form.append('kind', 'browser');
    form.append('claimToken', input.claimToken);
    form.append('activeGeneration', input.activeGeneration);
    form.append('trigger', input.trigger);
    form.append('sourceOrigin', 'https://kiditem.sellpia.com');
    form.append('sourceAccountKey', 'kiditem');
    return apiClient.uploadParsed(
      IMPORT_PATH,
      SellpiaInventoryImportResponseSchema,
      form,
    );
  },

  importManual(
    file: File,
    manualFreshExportConfirmed: true,
  ): Promise<SellpiaInventoryImportResponse> {
    const form = new FormData();
    appendWorkbook(form, file);
    form.append('kind', 'manual');
    form.append(
      'manualFreshExportConfirmed',
      String(manualFreshExportConfirmed),
    );
    return apiClient.uploadParsed(
      IMPORT_PATH,
      SellpiaInventoryImportResponseSchema,
      form,
    );
  },
};
