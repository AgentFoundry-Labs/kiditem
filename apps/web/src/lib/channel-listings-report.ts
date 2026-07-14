import { apiClient } from '@/lib/api-client';

export interface ReportChannelListing {
  id: string;
  listingName: string;
  thumbnailUrl: string | null;
  channel: string;
  channelAccountId: string | null;
  channelAccountName: string | null;
  externalId: string;
  channelName: string | null;
  channelPrice: number | null;
  contentWorkspaceId: string | null;
  status: string | null;
  exposureStatus: string | null;
  optionCount: number;
  mappingStatus: 'matched' | 'unmatched' | 'needs_review';
}

interface ChannelListingPage {
  items: ReportChannelListing[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchAllChannelListingsForReport(
  pageSize = 100,
): Promise<ReportChannelListing[]> {
  const first = await fetchPage(1, pageSize);
  const items = [...first.items];
  const pageCount = Math.ceil(first.total / pageSize);
  for (let page = 2; page <= pageCount; page += 1) {
    const next = await fetchPage(page, pageSize);
    items.push(...next.items);
  }
  return items.slice(0, first.total);
}

function fetchPage(page: number, limit: number): Promise<ChannelListingPage> {
  return apiClient.get<ChannelListingPage>(
    `/api/channels/listings?page=${page}&limit=${limit}`,
  );
}
