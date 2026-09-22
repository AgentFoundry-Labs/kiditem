import type {
  CoupangShipmentsPort,
  CoupangShipmentDateSummaryEntry,
} from "../../in/index";

export const COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT = Symbol(
  "COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT",
);

export type CoupangShipmentDateSummaryRecord = CoupangShipmentDateSummaryEntry;

export interface CoupangShipmentDateSummaryRepositoryPort extends Pick<
  CoupangShipmentsPort,
  | "beginSummary"
  | "readSummarySource"
  | "readSummaryAttempt"
  | "completeSummary"
  | "failSummary"
  | "cancelSummary"
> {
  listDateSummary(
    organizationId: string,
  ): Promise<CoupangShipmentDateSummaryRecord[]>;
}
