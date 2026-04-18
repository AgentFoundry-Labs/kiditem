import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdBenchmarkService } from '../ad-benchmark.service';

describe('AdBenchmarkService', () => {
  let service: AdBenchmarkService;
  let prisma: any;
  let adConfig: any;

  const baseConfig = {
    benchmark: {
      roas: { avg: 300, good: 500, excellent: 700, poor: 200 },
      ctr: { avg: 1, good: 2, excellent: 3, poor: 0.5 },
      cvr: { avg: 5, good: 10, excellent: 15, poor: 2 },
      cpc: { avg: 250, good: 150, excellent: 100, poor: 500 },
      adRate: { avg: 15, good: 10, excellent: 5, poor: 25 },
      acos: { avg: 25, good: 15, excellent: 10, poor: 40 },
    },
  };

  beforeEach(() => {
    prisma = {
      ad: {
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      channelListing: {
        findMany: vi.fn(),
      },
    };
    adConfig = { getConfig: vi.fn().mockResolvedValue(baseConfig) };
    service = new AdBenchmarkService(prisma, adConfig);
  });

  it('returns diagnosis with listing-primary results', async () => {
    prisma.ad.aggregate.mockResolvedValue({
      _sum: { spend: 100000, impressions: 10000, clicks: 150, conversions: 10, revenue: 300000 },
    });
    prisma.ad.groupBy.mockResolvedValue([
      { listingId: 'L1', _sum: { spend: 50000, impressions: 5000, clicks: 75, conversions: 5, revenue: 200000 } },
      { listingId: 'L2', _sum: { spend: 50000, impressions: 5000, clicks: 75, conversions: 5, revenue: 100000 } },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      { id: 'L1', externalId: 'COUPANG-1', channelName: '쿠팡', master: { id: 'M1', code: 'M-00000001', name: '상품1' } },
      { id: 'L2', externalId: 'COUPANG-2', channelName: '쿠팡', master: { id: 'M2', code: 'M-00000002', name: '상품2' } },
    ]);

    const result = await service.getDiagnosis('company-1');

    expect(result.listings).toHaveLength(2);
    expect(result.listings[0].listingId).toBe('L1');
    expect(result.listings[0].masterProduct.code).toBe('M-00000001');
    expect(result.listings[0].channelName).toBe('쿠팡');
    expect(result.diagnosis).toHaveLength(3);
    expect(result.diagnosis.map((d) => d.metric).sort()).toEqual(['ctr', 'cvr', 'roas']);
  });

  it('computes delta against industry average (above / below / average)', async () => {
    prisma.ad.aggregate.mockResolvedValue({
      _sum: { spend: 100, impressions: 10000, clicks: 250, conversions: 20, revenue: 500 },
    });
    prisma.ad.groupBy.mockResolvedValue([]);
    prisma.channelListing.findMany.mockResolvedValue([]);

    const result = await service.getDiagnosis('company-1');

    const ctrDiag = result.diagnosis.find((d) => d.metric === 'ctr')!;
    expect(ctrDiag.status).toBe('above');

    const roasDiag = result.diagnosis.find((d) => d.metric === 'roas')!;
    expect(roasDiag.status).toBe('above');

    const cvrDiag = result.diagnosis.find((d) => d.metric === 'cvr')!;
    expect(cvrDiag.status).toBe('above');
  });

  it('passes companyId through all reads (no default fallback)', async () => {
    prisma.ad.aggregate.mockResolvedValue({
      _sum: { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
    });
    prisma.ad.groupBy.mockResolvedValue([]);
    prisma.channelListing.findMany.mockResolvedValue([]);

    await service.getDiagnosis('company-xyz');

    expect(prisma.ad.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-xyz' }) }),
    );
    expect(prisma.ad.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-xyz' }) }),
    );
    expect(adConfig.getConfig).toHaveBeenCalledWith('company-xyz');
  });
});
