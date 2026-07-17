import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NaverDatalabTrendAdapter } from './naver-datalab-trend.adapter';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

describe('NaverDatalabTrendAdapter', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NAVER_API_HUB_CLIENT_ID = 'client-id';
    process.env.NAVER_API_HUB_CLIENT_SECRET = 'client-secret';
    process.env.NAVER_API_HUB_BASE_URL = 'https://api-hub.test';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('calls DataLab search trends with client credentials and ranks rising keywords', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      timeUnit: 'date',
      results: [
        {
          title: '슬라임',
          keywords: ['슬라임'],
          data: [
            { period: '2026-05-18', ratio: 10 },
            { period: '2026-05-19', ratio: 20 },
            { period: '2026-05-20', ratio: 80 },
          ],
        },
        {
          title: '잔디인형',
          keywords: ['잔디인형'],
          data: [
            { period: '2026-05-18', ratio: 30 },
            { period: '2026-05-19', ratio: 30 },
            { period: '2026-05-20', ratio: 35 },
          ],
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabTrendAdapter();
    const result = await adapter.compareSearchTrends({
      keywords: ['슬라임', '슬라임', '잔디인형'],
      startDate: '2026-04-20',
      endDate: '2026-05-20',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api-hub.test/search-trend/v1/search');
    expect((init?.headers as Record<string, string>)['X-NCP-APIGW-API-KEY-ID']).toBe('client-id');
    expect((init?.headers as Record<string, string>)['X-NCP-APIGW-API-KEY']).toBe('client-secret');
    expect((init?.headers as Record<string, string>)['X-Naver-Client-Id']).toBeUndefined();
    expect((init?.headers as Record<string, string>)['X-Naver-Client-Secret']).toBeUndefined();
    expect(JSON.parse(String(init?.body))).toMatchObject({
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      timeUnit: 'date',
      keywordGroups: [
        { groupName: '슬라임', keywords: ['슬라임'] },
        { groupName: '잔디인형', keywords: ['잔디인형'] },
      ],
    });
    expect(result.keywords).toEqual(['슬라임', '잔디인형']);
    expect(result.items[0]).toMatchObject({
      keyword: '슬라임',
      latestRatio: 80,
      previousAverageRatio: 15,
      trendDelta: 65,
      trendRate: 4.33,
    });
  });

  it('splits ranking requests into DataLab batches of five keyword groups', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        startDate: request.startDate,
        endDate: request.endDate,
        timeUnit: request.timeUnit,
        results: request.keywordGroups.map((group: { groupName: string }, index: number) => ({
          title: group.groupName,
          keywords: [group.groupName],
          data: [
            { period: '2026-05-19', ratio: index + 1 },
            { period: '2026-05-20', ratio: index + 20 },
          ],
        })),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabTrendAdapter();
    const result = await adapter.compareSearchTrends({
      keywords: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'],
      startDate: '2026-05-19',
      endDate: '2026-05-20',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).keywordGroups).toHaveLength(5);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).keywordGroups).toHaveLength(2);
    expect(result.items).toHaveLength(7);
  });

  it('fails clearly when DataLab credentials are missing', async () => {
    delete process.env.NAVER_API_HUB_CLIENT_ID;
    const adapter = new NaverDatalabTrendAdapter();

    await expect(adapter.compareSearchTrends({ keywords: ['슬라임'] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not silently fall back to legacy Developer Center credentials', async () => {
    delete process.env.NAVER_API_HUB_CLIENT_ID;
    delete process.env.NAVER_API_HUB_CLIENT_SECRET;
    process.env.NAVER_DATALAB_CLIENT_ID = 'legacy-client-id';
    process.env.NAVER_DATALAB_CLIENT_SECRET = 'legacy-client-secret';
    const adapter = new NaverDatalabTrendAdapter();

    expect(adapter.getStatus()).toEqual({
      configured: false,
      requiredEnv: ['NAVER_API_HUB_CLIENT_ID', 'NAVER_API_HUB_CLIENT_SECRET'],
    });
    await expect(adapter.compareSearchTrends({ keywords: ['슬라임'] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('wraps upstream DataLab failures', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad client', { status: 401 })) as typeof fetch;
    const adapter = new NaverDatalabTrendAdapter();

    await expect(adapter.compareSearchTrends({ keywords: ['슬라임'] })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
