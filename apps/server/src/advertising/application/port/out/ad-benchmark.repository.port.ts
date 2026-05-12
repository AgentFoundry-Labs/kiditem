// Outgoing port for the 30-day ad benchmark aggregate read. Sole consumer
// today is AdBenchmarkService; the Prisma adapter groups by listing and
// returns additive metric sums for ratio recomputation in the domain layer.

import type { AdMetricSums } from '../../../domain/ad-metrics';

export const AD_BENCHMARK_REPOSITORY_PORT = Symbol(
  'AdBenchmarkRepositoryPort',
);

export interface BenchmarkPerListingRow {
  listingId: string;
  sums: AdMetricSums;
}

export interface BenchmarkAggregates {
  totals: AdMetricSums;
  perListing: BenchmarkPerListingRow[];
}

export interface AdBenchmarkRepositoryPort {
  findBenchmarkAggregates(
    organizationId: string,
  ): Promise<BenchmarkAggregates>;
}
