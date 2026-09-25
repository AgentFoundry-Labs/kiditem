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
} from "../../port/in/shipments/index";
import type { CoupangShipmentDateItem } from "@kiditem/shared/orders-operations";
import type { OwnerTransaction } from "../../../../common/owner-transaction";

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

  publishSummaryOperation(
    tx: OwnerTransaction,
    input: { organizationId: string; operationId: string; items: readonly CoupangShipmentDateItem[] },
  ): Promise<{ dates: number }> {
    return this.dateSummary.publishOperation(tx, { ...input, capturedAt: new Date() });
  }
}
