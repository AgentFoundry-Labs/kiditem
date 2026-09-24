export {
  OPERATION_STATUSES,
  PROVIDER_OUTCOMES,
  OperationStatusSchema,
  ProviderOutcomeSchema,
  canRetryProviderSideEffect,
  isOperationTerminal,
} from './operation-lifecycle.js';
export type { OperationStatus, ProviderOutcome } from './operation-lifecycle.js';

export type ChannelListingSaleStatusInput = {
  latestSnapshotStatus?: string | null;
  rawStatus?: string | null;
  optionStatuses?: readonly (string | null | undefined)[];
  listingStatus?: string | null;
  isActive: boolean;
};

const ON_SALE_LISTING_STATUSES = new Set([
  'active', 'on_sale', 'sale', 'selling', 'true', '활성', '판매 중', '판매중',
]);

const OFF_SALE_LISTING_STATUSES = new Set([
  'inactive', 'off_sale', 'stopped', 'suspended', 'soldout', 'out_of_stock',
  '비활성', '판매 중지', '판매중지', '품절',
]);

export function isChannelListingOnSale(status: string | null | undefined): boolean {
  return status !== null
    && status !== undefined
    && ON_SALE_LISTING_STATUSES.has(status.trim().toLowerCase());
}

function isRecognizedChannelListingSaleStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return ON_SALE_LISTING_STATUSES.has(normalized)
    || OFF_SALE_LISTING_STATUSES.has(normalized);
}

export function resolveChannelListingSaleStatus(
  input: ChannelListingSaleStatusInput,
): string | null {
  const explicitStatuses = [
    input.latestSnapshotStatus,
    input.rawStatus,
  ];
  for (const status of explicitStatuses) {
    if (typeof status === 'string' && status.trim()) return status.trim();
  }

  for (const status of input.optionStatuses ?? []) {
    if (
      typeof status === 'string'
      && status.trim()
      && isRecognizedChannelListingSaleStatus(status)
    ) {
      return status.trim();
    }
  }

  if (
    typeof input.listingStatus === 'string'
    && input.listingStatus.trim()
    && isRecognizedChannelListingSaleStatus(input.listingStatus)
  ) {
    return input.listingStatus.trim();
  }

  return input.isActive ? 'active' : null;
}
