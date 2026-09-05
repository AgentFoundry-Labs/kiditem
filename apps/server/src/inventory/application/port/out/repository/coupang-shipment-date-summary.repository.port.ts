import type {
  CoupangShipmentsPort,
  CoupangShipmentDateSummaryEntry,
} from "../../in/fulfillment";

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
> {
  listDateSummary(
    organizationId: string,
  ): Promise<CoupangShipmentDateSummaryRecord[]>;
}
