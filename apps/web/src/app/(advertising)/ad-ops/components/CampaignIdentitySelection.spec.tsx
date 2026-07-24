import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdCampaignSnapshot } from '@kiditem/shared/advertising';
import { apiClient } from '@/lib/api-client';
import { CampaignTable, type CampaignSelection } from './CampaignTable';
import { ProductDrilldown } from './ProductDrilldown';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn() },
}));

const metrics = {
  spend: 1,
  impressions: 2,
  clicks: 3,
  conversions: 4,
  revenue: 5,
  ctr: 6,
  roas: 7,
  cvr: 8,
};

function campaign(channelAccountId: string, campaignIdentity: string): AdCampaignSnapshot {
  return {
    listing: null,
    channelAccountId,
    campaignIdentity,
    campaignId: 'same-provider-id',
    campaignName: '동일 캠페인명',
    period: '7d',
    metricsAvailable: true,
    conversionsAvailable: true,
    status: 'ON',
    onOff: 'ON',
    metrics,
  };
}

function wrapper(children: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('campaign account + identity selection', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset().mockResolvedValue([]);
  });

  it('keeps same-name/id campaigns in two accounts as separate selectable rows', () => {
    const first = campaign('11111111-1111-4111-8111-111111111111', 'campaign:same-provider-id');
    const second = campaign('22222222-2222-4222-8222-222222222222', 'campaign:same-provider-id');
    const onSelect = vi.fn<(selection: CampaignSelection | null) => void>();

    render(wrapper(
      <CampaignTable
        campaigns={[first, second]}
        sortBy="revenue"
        onSortChange={vi.fn()}
        selectedCampaign={null}
        onSelectCampaign={onSelect}
      />,
    ));

    fireEvent.click(screen.getAllByText('동일 캠페인명')[1]);
    expect(onSelect).toHaveBeenCalledWith({
      channelAccountId: second.channelAccountId,
      campaignIdentity: second.campaignIdentity,
      campaignName: '동일 캠페인명',
    });
  });

  it('renders metadata-only OFF campaigns without fabricated zero metrics or drill-down', () => {
    const metadataOnly = {
      ...campaign('11111111-1111-4111-8111-111111111111', 'campaign:off'),
      campaignName: '중단 캠페인',
      metricsAvailable: false,
      conversionsAvailable: false,
      status: 'OFF',
      onOff: 'OFF',
    } satisfies AdCampaignSnapshot;
    const onSelect = vi.fn<(selection: CampaignSelection | null) => void>();

    render(wrapper(
      <CampaignTable
        campaigns={[metadataOnly]}
        sortBy="revenue"
        onSortChange={vi.fn()}
        selectedCampaign={null}
        onSelectCampaign={onSelect}
      />,
    ));

    const row = screen.getByRole('row', { name: /중단 캠페인/ });
    expect(within(row).getByText('OFF')).toBeInTheDocument();
    expect(within(row).getByText('성과 미수집')).toBeInTheDocument();
    expect(within(row).getAllByText('-')).toHaveLength(8);

    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('requests drill-down by account and stable identity without campaignName', async () => {
    render(wrapper(
      <ProductDrilldown
        campaign={{
          channelAccountId: '11111111-1111-4111-8111-111111111111',
          campaignIdentity: 'href:https://advertising.coupang.com/marketing/campaign/1/product',
          campaignName: '동일 캠페인명',
        }}
        period="7d"
      />,
    ));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    const url = vi.mocked(apiClient.get).mock.calls.find(([value]) =>
      String(value).startsWith('/api/ads/products?'),
    )?.[0];
    expect(url).toContain('channelAccountId=11111111-1111-4111-8111-111111111111');
    expect(url).toContain('campaignIdentity=href%3Ahttps%3A%2F%2Fadvertising.coupang.com');
    expect(url).not.toContain('campaign=');
    expect(url).not.toContain(encodeURIComponent('동일 캠페인명'));
  });
});
