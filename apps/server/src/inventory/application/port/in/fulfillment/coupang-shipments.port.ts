import type {
  CoupangShipmentDateSummaryEntry,
  ShipmentSummaryAttempt,
  ShipmentSummaryAttemptRead,
  ShipmentSummaryPlan,
  ShipmentSummarySource,
} from "../../../../read/coupang-shipment-date-summary.reader";

/** Shipment-date facts `read/coupang-shipment-date-summary.reader.ts` returns. */
export type {
  CoupangShipmentDateSummaryEntry,
  ShipmentSummaryAttempt,
  ShipmentSummaryAttemptRead,
  ShipmentSummaryPlan,
  ShipmentSummarySource,
};

export const COUPANG_SHIPMENTS_PORT = Symbol("CoupangShipmentsPort");

export type CoupangShipmentMergedFileKind = "label" | "statement" | "all";

export type CoupangShipmentMergedFileItem = {
  id: string;
  runId: string;
  date: string;
  kind: CoupangShipmentMergedFileKind;
  fileName: string;
  downloadPath: string;
  sizeBytes: number;
  sourceCount: number;
  pageCount: number;
  centers: string[];
  createdAt: string;
};

export type CoupangShipmentDailyFiles = {
  date: string;
  files: CoupangShipmentMergedFileItem[];
  runCount: number;
  updatedAt: string | null;
};

export type CoupangShipmentFilesResponse = {
  rootPath: string;
  totalFiles: number;
  days: CoupangShipmentDailyFiles[];
};

export type CoupangShipmentFileRequest = {
  runId: string;
  date: string;
  fileName: string;
};

export type CoupangShipmentResolvedFile = {
  path: string;
  fileName: string;
  sizeBytes: number;
};

export type ShipmentSummarySubmission = {
  items: Array<{ date: string; count: number; boxes: number }>;
  scannedPages: number;
  totalRows: number;
  proof: {
    maxPages: number;
    validatedTable: boolean;
    stopReason: "empty_page" | "short_page" | "max_pages";
    lastPageRowCount: number;
    pageRowCounts: number[];
  };
};

export type CoupangShipmentDateSummaryResult = {
  items: CoupangShipmentDateSummaryEntry[];
};

export interface CoupangShipmentsPort {
  listLocalFiles(organizationId: string): Promise<CoupangShipmentFilesResponse>;
  resolveLocalFile(
    organizationId: string,
    input: CoupangShipmentFileRequest,
  ): Promise<CoupangShipmentResolvedFile>;
  listDateSummary(
    organizationId: string,
  ): Promise<CoupangShipmentDateSummaryResult>;
  beginSummary(
    organizationId: string,
    idempotencyKey: string,
    maxPages?: number,
  ): Promise<ShipmentSummaryAttempt>;
  readSummarySource(
    organizationId: string,
    maxPages?: number,
  ): Promise<ShipmentSummarySource>;
  readSummaryAttempt(
    organizationId: string,
    attemptId: string,
  ): Promise<ShipmentSummaryAttemptRead>;
  completeSummary(
    organizationId: string,
    attemptId: string,
    attemptToken: string,
    input: ShipmentSummarySubmission,
  ): Promise<ShipmentSummaryAttempt>;
  failSummary(
    organizationId: string,
    attemptId: string,
    attemptToken: string,
    code: string,
    message: string,
  ): Promise<ShipmentSummaryAttempt>;
  /**
   * Operator stop without the attempt token; a terminal attempt is returned
   * unchanged. The page calls it, so the answer carries no fence token.
   */
  cancelSummary(
    organizationId: string,
    attemptId: string,
  ): Promise<Omit<ShipmentSummaryAttempt, "attemptToken">>;
}
