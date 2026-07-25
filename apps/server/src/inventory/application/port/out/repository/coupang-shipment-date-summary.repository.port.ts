export const COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT = Symbol(
  'COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT',
);

export type CoupangShipmentDateSummaryRecord = {
  date: string;
  count: number;
  boxes: number;
  capturedAt: string;
};

export interface CoupangShipmentDateSummaryRepositoryPort {
  listDateSummary(organizationId: string): Promise<CoupangShipmentDateSummaryRecord[]>;
  /**
   * Upsert the collected 발송일별 요약 rows (new dates inserted, existing dates
   * refreshed) and return the full persisted set. Incremental: dates absent from
   * `items` keep their stored values so the calendar accumulates history.
   */
  upsertDateSummary(
    organizationId: string,
    items: Array<{ date: string; count: number; boxes: number }>,
  ): Promise<CoupangShipmentDateSummaryRecord[]>;
}
