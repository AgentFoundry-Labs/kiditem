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
    status: 'ON',
    onOff: 'ON',
    isActive: true,
    budget: null,
    roasTarget: null,
    metrics,
  } as AdCampaignSnapshot;
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

  it("shows a measured campaign's orders as its conversions", () => {
    render(wrapper(
      <CampaignTable
        campaigns={[campaign('11111111-1111-4111-8111-111111111111', 'campaign:measured')]}
        sortBy="revenue"
        onSortChange={vi.fn()}
        selectedCampaign={null}
        onSelectCampaign={vi.fn()}
      />,
    ));

    expect(screen.getByRole('columnheader', { name: '집행 광고비' })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /동일 캠페인명/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells[cells.length - 2]).toHaveTextContent('4');
  });

  it("shows the campaign's current daily budget and ROAS target, and - when the ad center reported none", () => {
    const budgeted = {
      ...campaign('11111111-1111-4111-8111-111111111111', 'campaign:budgeted'),
      campaignName: '예산 캠페인',
      budget: 50_000,
      roasTarget: 350,
    } satisfies AdCampaignSnapshot;
    const unset = { ...campaign('11111111-1111-4111-8111-111111111111', 'campaign:unset'), campaignName: '목표 없는 캠페인' };

    render(wrapper(
      <CampaignTable
        campaigns={[budgeted, unset]}
        sortBy="revenue"
        onSortChange={vi.fn()}
        selectedCampaign={null}
        onSelectCampaign={vi.fn()}
      />,
    ));

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers.slice(0, 3)).toEqual(['캠페인명', '일 예산', 'ROAS 목표']);
    const budgetedCells = within(screen.getByRole('row', { name: /예산 캠페인/ })).getAllByRole('cell');
    expect(budgetedCells[1]).toHaveTextContent('50,000');
    expect(budgetedCells[2]).toHaveTextContent('350%');
    const unsetCells = within(screen.getByRole('row', { name: /목표 없는 캠페인/ })).getAllByRole('cell');
    expect(unsetCells[1]).toHaveTextContent(/^-$/);
    expect(unsetCells[2]).toHaveTextContent(/^-$/);
  });

  it('renders metadata-only OFF campaigns without fabricated zero metrics or drill-down', () => {
    const metadataOnly = {
      ...campaign('11111111-1111-4111-8111-111111111111', 'campaign:off'),
      campaignName: '중단 캠페인',
      metricsAvailable: false,
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
    // 성과 8칸과 비어 있는 일 예산·ROAS 목표 2칸.
    expect(within(row).getAllByText('-')).toHaveLength(10);

    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps unknown ratios unavailable while preserving observed zero values and ROAS color', () => {
    const unknown = {
      ...campaign('11111111-1111-4111-8111-111111111111', 'campaign:unknown-ratios'),
      campaignName: '비율 미수집 캠페인',
      metrics: {
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        roas: null,
        ctr: null,
        cvr: null,
      },
    } satisfies AdCampaignSnapshot;
    const zero = {
      ...campaign('22222222-2222-4222-8222-222222222222', 'campaign:zero-ratios'),
      campaignName: '0 비율 캠페인',
      metrics: {
        ...metrics,
        roas: 0,
        ctr: 0,
        cvr: 0,
      },
    } satisfies AdCampaignSnapshot;

    render(wrapper(
      <CampaignTable
        campaigns={[unknown, zero]}
        sortBy="revenue"
        onSortChange={vi.fn()}
        selectedCampaign={null}
        onSelectCampaign={vi.fn()}
      />,
    ));

    const unknownRow = screen.getByRole('row', { name: /비율 미수집 캠페인/ });
    expect(within(unknownRow).getAllByText('0')).toHaveLength(5);
    // 비율 3칸과 비어 있는 일 예산·ROAS 목표 2칸.
    expect(within(unknownRow).getAllByText('-')).toHaveLength(5);
    const unknownRoas = within(unknownRow).getAllByRole('cell')[5]!;
    expect(unknownRoas.className).not.toMatch(/text-(emerald|green|orange|red)-\d+/);

    const zeroRow = screen.getByRole('row', { name: /0 비율 캠페인/ });
    expect(within(zeroRow).getByText('0%')).toBeInTheDocument();
    expect(within(zeroRow).getAllByText('0.00%')).toHaveLength(2);
    expect(within(zeroRow).getAllByRole('cell')[5]).toHaveClass('text-red-600');
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

  it('sorts campaigns with an unmeasured ROAS after every measured ROAS', () => {
    const named = (identity: string, name: string, roas: number | null) => ({
      ...campaign('11111111-1111-4111-8111-111111111111', identity),
      campaignName: name,
      metrics: { ...metrics, roas },
    }) satisfies AdCampaignSnapshot;

    render(wrapper(
      <CampaignTable
        campaigns={[
          named('campaign:unknown', 'ROAS 미측정', null),
          named('campaign:zero', 'ROAS 0', 0),
          named('campaign:high', 'ROAS 높음', 300),
        ]}
        sortBy="roas"
        onSortChange={vi.fn()}
        selectedCampaign={null}
        onSelectCampaign={vi.fn()}
      />,
    ));

    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]!.querySelector('span')?.textContent);
    expect(names).toEqual(['ROAS 높음', 'ROAS 0', 'ROAS 미측정']);
  });

  it('renders unmeasured drill-down ratios as - without a ROAS color', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) =>
      String(url).startsWith('/api/ads/products?')
        ? [{
            listing: null,
            channelAccountId: '11111111-1111-4111-8111-111111111111',
            campaignIdentity: 'campaign:idle',
            externalId: 'P1',
            externalOptionId: 'O1',
            campaignId: 'idle',
            campaignName: '무노출',
            keyword: null,
            status: '운영중',
            onOff: 'ON',
            productName: '무노출 상품',
            imageUrl: null,
            saleType: null,
            period: '7d',
            metrics: {
              spend: 0,
              revenue: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              ctr: null,
              roas: null,
              cvr: null,
            },
          }]
        : { roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } } },
    );

    render(wrapper(
      <ProductDrilldown
        campaign={{
          channelAccountId: '11111111-1111-4111-8111-111111111111',
          campaignIdentity: 'campaign:idle',
          campaignName: '무노출',
        }}
        period="7d"
      />,
    ));

    const row = await screen.findByRole('row', { name: /무노출 상품/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells[5]).toHaveTextContent('0원');
    expect(cells[9]).toHaveTextContent(/^-$/);
    expect(cells[11]).toHaveTextContent(/^-$/);
    expect(cells[12]).toHaveTextContent(/^-$/);
    expect(cells[12]!.className).not.toMatch(/text-(emerald|green|orange|red)-\d+/);
  });
});
