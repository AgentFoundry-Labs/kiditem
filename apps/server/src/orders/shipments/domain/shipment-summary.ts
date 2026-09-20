export const COUPANG_SHIPMENT_SUMMARY_SOURCE_TYPE = "coupang_shipment_summary";
export const COUPANG_SHIPMENT_SUMMARY_PARSER_VERSION = "shipment-summary-v1";

export type CoupangShipmentDateSummaryEntry = {
  date: string;
  count: number | null;
  boxes: number | null;
  capturedAt: string;
  verified: boolean;
};

export type ShipmentSummaryPlan = {
  sourceType: "coupang_shipment_summary";
  parserVersion: "shipment-summary-v1";
  maxPages: number;
};
export type ShipmentSummaryAttempt = {
  attemptId: string;
  attemptToken: string;
  generation: string;
  state: "RUNNING" | "COMPLETE" | "FAILED";
  plan: ShipmentSummaryPlan;
  expiresAt: string;
  actualCutoffAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};
export type ShipmentSummarySource = {
  ready: boolean;
  latestAttempt: Omit<ShipmentSummaryAttempt, "attemptToken"> | null;
  latestComplete: Omit<ShipmentSummaryAttempt, "attemptToken"> | null;
  capturedItems: CoupangShipmentDateSummaryEntry[];
  items: CoupangShipmentDateSummaryEntry[];
};
export type ShipmentSummaryAttemptRead = ShipmentSummaryAttempt &
  Pick<ShipmentSummarySource, "items" | "capturedItems">;
