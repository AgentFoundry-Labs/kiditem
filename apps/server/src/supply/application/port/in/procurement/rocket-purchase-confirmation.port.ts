import type {
  RocketWorkbookAbandonRequest,
  RocketWorkbookExportRequest,
  RocketWorkbookExportResponse,
} from '@kiditem/shared/rocket-purchase-preview';

export interface RocketWorkbookExportPort {
  exportWorkbook(input: {
    organizationId: string;
    userId: string;
    request: RocketWorkbookExportRequest;
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
    request: RocketWorkbookAbandonRequest;
  }): Promise<RocketWorkbookExportResponse>;
}

export const ROCKET_WORKBOOK_EXPORT_PORT = Symbol(
  'ROCKET_WORKBOOK_EXPORT_PORT',
);
