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
  /**
   * Which of these PO lines this account has already sent in a confirmation
   * workbook. Collection stores a full snapshot every run, so the same line
   * reappears in every later snapshot; this is what separates "new since my
   * last Excel" from "already submitted".
   */
  listExportedPoLineIds(input: {
    organizationId: string;
    channelAccountId: string;
    poLineIds: string[];
  }): Promise<string[]>;
}

export const ROCKET_WORKBOOK_EXPORT_PORT = Symbol(
  'ROCKET_WORKBOOK_EXPORT_PORT',
);
