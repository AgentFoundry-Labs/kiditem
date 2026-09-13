import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import { exportCampaignXlsx, exportTrendXlsx } from './xlsx-export';

vi.mock('@/lib/api-client', () => ({
  apiClient: { fetchRaw: vi.fn() },
}));

vi.mock('@/lib/browser-download', () => ({
  downloadBlob: vi.fn(),
}));

describe('Advertising server XLSX export bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the loaded campaign rows to the server and downloads its filename', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(
      new Response(new Uint8Array([120, 108, 115, 120]), {
        status: 200,
        headers: {
          'Content-Disposition': "attachment; filename*=UTF-8''%EA%B4%91%EA%B3%A0%EC%BA%A0%ED%8E%98%EC%9D%B8_A%EB%93%B1%EA%B8%89_20260731.xlsx",
        },
      }),
    );

    const actions = [{ grade: 'A' }] as never;
    await exportCampaignXlsx('A', actions, 100_000);

    expect(apiClient.fetchRaw).toHaveBeenCalledWith('/api/ads/exports/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade: 'A', actions, budget: 100_000 }),
    });
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.anything(),
      '광고캠페인_A등급_20260731.xlsx',
    );
  });

  it('sends the selected trend series without client-side workbook conversion', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(
      new Response(new Uint8Array([120, 108, 115, 120]), {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="trend.xlsx"' },
      }),
    );
    const input = {
      period: '7d',
      leftMetric: 'spend',
      rightMetric: 'roas',
      leftLabel: '집행 광고비',
      rightLabel: '광고 수익률(ROAS)',
      points: [{
        businessDate: '2026-07-31',
        axisLabel: '07/31(금)',
        leftValue: 1000,
        rightValue: 250,
      }],
    } as const;

    await exportTrendXlsx(input);

    expect(apiClient.fetchRaw).toHaveBeenCalledWith('/api/ads/exports/trend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(downloadBlob).toHaveBeenCalledWith(expect.anything(), 'trend.xlsx');
  });

  it('sends an unmeasured trend value as null so the workbook cell stays empty', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(
      new Response(new Uint8Array([120, 108, 115, 120]), { status: 200 }),
    );

    await exportTrendXlsx({
      period: '7d',
      leftMetric: 'spend',
      rightMetric: 'roas',
      leftLabel: '집행 광고비',
      rightLabel: '광고 수익률(ROAS)',
      points: [{
        businessDate: '2026-07-31',
        axisLabel: '07/31(금)',
        leftValue: null,
        rightValue: 0,
      }],
    });

    const body = JSON.parse(
      String(vi.mocked(apiClient.fetchRaw).mock.calls[0]![1]!.body),
    ) as { points: Array<{ leftValue: number | null; rightValue: number | null }> };
    expect(body.points[0]).toMatchObject({ leftValue: null, rightValue: 0 });
  });

    it('surfaces a server conversion failure without downloading a partial file', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(
      new Response(JSON.stringify({ message: '광고 데이터가 유효하지 않습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(exportCampaignXlsx('A', [] as never, 100_000)).rejects.toThrow(
      '광고 데이터가 유효하지 않습니다.',
    );
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
