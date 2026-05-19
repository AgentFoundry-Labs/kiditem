// Buffer that sums ad metrics across multiple target rows targeting the
// same `(organizationId, listingId, businessDate)` so the ingest handler emits
// one `ChannelListingDailySnapshot` upsert per listing-day instead of
// touching the same row N times. Each handler builds the buffer locally
// and flushes it after the per-row loop.

import type { ChannelListingDailyRepositoryPort } from '../port/out/repository/channel-listing-daily.repository.port';

export type SummedListingAdMetrics = {
  adSpend: number;
  adRevenue: number;
  adImpressions: number;
  adClicks: number;
  adConversions: number;
  adOrders: number;
};

export type ListingAdMetricAccumulator = {
  organizationId: string;
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  rawSnapshotId: string | null;
  productName: string | null;
  metaSource: string;
  metaRows: Array<Record<string, unknown>>;
  metrics: SummedListingAdMetrics;
};

export type AddListingAdMetricsInput = {
  organizationId: string;
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  rawSnapshotId: string | null;
  productName: string | null;
  metaSource: string;
  metaRow: Record<string, unknown>;
  metrics: SummedListingAdMetrics;
};

const LISTING_AD_SUM_KEYS = [
  'adSpend',
  'adRevenue',
  'adImpressions',
  'adClicks',
  'adConversions',
  'adOrders',
] as const satisfies ReadonlyArray<keyof SummedListingAdMetrics>;

export function addListingAdMetrics(
  accumulators: Map<string, ListingAdMetricAccumulator>,
  input: AddListingAdMetricsInput,
): void {
  const key = [
    input.organizationId,
    input.listingId,
    input.businessDate.toISOString().slice(0, 10),
  ].join('::');
  const existing = accumulators.get(key);
  if (existing) {
    existing.rawSnapshotId = input.rawSnapshotId;
    if (input.productName) existing.productName = input.productName;
    existing.metaRows.push(input.metaRow);
    for (const metricKey of LISTING_AD_SUM_KEYS) {
      existing.metrics[metricKey] += input.metrics[metricKey];
    }
    return;
  }

  accumulators.set(key, {
    organizationId: input.organizationId,
    listingId: input.listingId,
    channel: input.channel,
    externalId: input.externalId,
    businessDate: input.businessDate,
    rawSnapshotId: input.rawSnapshotId,
    productName: input.productName,
    metaSource: input.metaSource,
    metaRows: [input.metaRow],
    metrics: { ...input.metrics },
  });
}

export function buildListingAdMetaData(
  accumulator: ListingAdMetricAccumulator,
): Record<string, unknown> {
  if (accumulator.metaRows.length === 1) {
    return accumulator.metaRows[0];
  }
  return {
    rowCount: accumulator.metaRows.length,
    rows: accumulator.metaRows,
  };
}

export async function flushListingAdMetrics(
  port: ChannelListingDailyRepositoryPort,
  accumulators: Map<string, ListingAdMetricAccumulator>,
): Promise<number> {
  let count = 0;
  for (const accumulator of accumulators.values()) {
    await port.upsert({
      organizationId: accumulator.organizationId,
      listingId: accumulator.listingId,
      channel: accumulator.channel,
      externalId: accumulator.externalId,
      businessDate: accumulator.businessDate,
      rawSnapshotId: accumulator.rawSnapshotId,
      productName: accumulator.productName,
      metaJson: {
        source: accumulator.metaSource,
        data: buildListingAdMetaData(accumulator),
      },
      metrics: { ad: accumulator.metrics },
    });
    count += 1;
  }
  return count;
}
