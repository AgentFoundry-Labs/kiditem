import { z } from 'zod';
import {
  ListingAvailabilityExecutionSchema,
  type ListingAvailabilityExecution,
  type PrepareListingAvailabilityInput,
  type ReportListingAvailabilityInput,
} from '@kiditem/shared/sales-product';
import { apiClient } from '@/lib/api-client';

const BASE = '/api/channels/listing-availability-executions';
const ListingAvailabilityExecutionListSchema = z.array(ListingAvailabilityExecutionSchema);

export interface ListingAvailabilityExecutionContext {
  executionId: string;
  payloadHash: string;
  leaseToken: string;
}

export const listingAvailabilityExecutionKeys = {
  history: (channelAccountId: string, externalListingId: string) => [
    'listing-availability-executions', channelAccountId, externalListingId,
  ] as const,
};

function historyPath(channelAccountId: string, externalListingId: string): string {
  const query = new URLSearchParams({ channelAccountId, externalListingId });
  return `${BASE}?${query.toString()}`;
}

/** Existing-listing availability actions use the Channels execution fence. */
export const listingAvailabilityExecutionApi = {
  prepare: (input: PrepareListingAvailabilityInput): Promise<ListingAvailabilityExecution> =>
    apiClient.post<unknown>(BASE, input).then((response) => ListingAvailabilityExecutionSchema.parse(response)),

  list: (channelAccountId: string, externalListingId: string): Promise<ListingAvailabilityExecution[]> =>
    apiClient.getParsed(historyPath(channelAccountId, externalListingId), ListingAvailabilityExecutionListSchema),

  start: (executionId: string): Promise<ListingAvailabilityExecution> =>
    apiClient.post<unknown>(`${BASE}/${encodeURIComponent(executionId)}/start`, {})
      .then((response) => ListingAvailabilityExecutionSchema.parse(response)),

  report: (executionId: string, input: ReportListingAvailabilityInput): Promise<ListingAvailabilityExecution> =>
    apiClient.post<unknown>(`${BASE}/${encodeURIComponent(executionId)}/result`, input)
      .then((response) => ListingAvailabilityExecutionSchema.parse(response)),
};
