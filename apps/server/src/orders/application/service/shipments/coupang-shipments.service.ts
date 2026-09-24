import { Inject, Injectable } from "@nestjs/common";
import {
  COUPANG_SHIPMENT_FILE_STORAGE_PORT,
  type CoupangShipmentFileStoragePort,
} from "../../port/out/storage/shipments/index";
import {
  COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT,
  type CoupangShipmentDateSummaryRepositoryPort,
} from "../../port/out/persistence/shipments/coupang-shipment-date-summary.repository.port";
import type {
  CoupangShipmentDateSummaryResult,
  CoupangShipmentFileRequest,
  CoupangShipmentFilesResponse,
  CoupangShipmentResolvedFile,
  CoupangShipmentsPort,
  ShipmentSummarySubmission,
} from "../../port/in/shipments/index";

@Injectable()
export class CoupangShipmentsService implements CoupangShipmentsPort {
  constructor(
    @Inject(COUPANG_SHIPMENT_FILE_STORAGE_PORT)
    private readonly storage: CoupangShipmentFileStoragePort,
    @Inject(COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT)
    private readonly dateSummary: CoupangShipmentDateSummaryRepositoryPort,
  ) {}

  listLocalFiles(
    organizationId: string,
  ): Promise<CoupangShipmentFilesResponse> {
    return this.storage.listMergedFiles(organizationId);
  }

  resolveLocalFile(
    organizationId: string,
    input: CoupangShipmentFileRequest,
  ): Promise<CoupangShipmentResolvedFile> {
    return this.storage.resolveMergedFile(organizationId, input);
  }

  async listDateSummary(
    organizationId: string,
  ): Promise<CoupangShipmentDateSummaryResult> {
    const items = await this.dateSummary.listDateSummary(organizationId);
    return { items };
  }

  beginSummary(organizationId: string, key: string, maxPages?: number) {
    return this.dateSummary.beginSummary(organizationId, key, maxPages);
  }
  readSummarySource(organizationId: string, maxPages?: number) {
    return this.dateSummary.readSummarySource(organizationId, maxPages);
  }
  readSummaryAttempt(organizationId: string, attemptId: string) {
    return this.dateSummary.readSummaryAttempt(organizationId, attemptId);
  }
  completeSummary(
    organizationId: string,
    attemptId: string,
    token: string,
    input: ShipmentSummarySubmission,
  ) {
    return this.dateSummary.completeSummary(
      organizationId,
      attemptId,
      token,
      input,
    );
  }
  failSummary(
    organizationId: string,
    attemptId: string,
    token: string,
    code: string,
    message: string,
  ) {
    return this.dateSummary.failSummary(
      organizationId,
      attemptId,
      token,
      code,
      message,
    );
  }
  cancelSummary(organizationId: string, attemptId: string) {
    return this.dateSummary.cancelSummary(organizationId, attemptId);
  }
}
