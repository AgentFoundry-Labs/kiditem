import type {
  RocketWorkbookDecisionRequest,
  RocketWorkbookExportResponse,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';

export interface RocketWorkbookExportTransactionPort {
  exportWorkbook(input: {
    organizationId: string;
    userId: string;
    sourceImportRunId: string;
    request: RocketWorkbookDecisionRequest;
    preview: Extract<RocketPurchasePreviewResponse, { status: 'ready' }>;
    artifactBytes: Buffer;
  }): Promise<RocketWorkbookExportResponse>;
  getActiveWorkflow(input: {
    organizationId: string;
  }): Promise<RocketWorkbookExportResponse | null>;
  downloadWorkbook(input: {
    organizationId: string;
    exportId: string;
  }): Promise<{ fileName: string; contentType: string; bytes: Buffer }>;
  abandonWorkbook(input: {
    organizationId: string;
    userId: string;
    exportId: string;
  }): Promise<RocketWorkbookExportResponse>;
  listExportedPoLineIds(input: {
    organizationId: string;
    channelAccountId: string;
    poLineIds: string[];
  }): Promise<string[]>;
}

export const ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT = Symbol(
  'ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT',
);
