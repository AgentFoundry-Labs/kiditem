import type {
  RocketWorkbookExportRequest,
  RocketWorkbookExportResponse,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';

export interface RocketWorkbookExportTransactionPort {
  exportWorkbook(input: {
    organizationId: string;
    userId: string;
    sourceImportRunId: string;
    request: RocketWorkbookExportRequest;
    preview: RocketPurchasePreviewResponse;
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
    reason: string;
  }): Promise<RocketWorkbookExportResponse>;
}

export const ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT = Symbol(
  'ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT',
);
