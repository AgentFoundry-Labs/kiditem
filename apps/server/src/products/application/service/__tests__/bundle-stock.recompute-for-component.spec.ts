import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BundleStockService } from '../bundle-stock.service';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('BundleStockService.recomputeForComponent', () => {
  let service: BundleStockService;
  let mockTx: any;

  beforeEach(async () => {
    mockTx = {
      bundleComponent: { findMany: vi.fn() },
      productOption: { findMany: vi.fn() },
      $queryRaw: vi.fn(),
    };
    const m = await Test.createTestingModule({
      providers: [BundleStockService, { provide: PrismaService, useValue: {} }],
    }).compile();
    service = m.get(BundleStockService);
  });

  it('no bundles using this component → empty array', async () => {
    mockTx.bundleComponent.findMany.mockResolvedValue([]);
    const result = await service.recomputeForComponent('organization-1', 'opt-1', mockTx);
    expect(result).toEqual([]);
    expect(mockTx.bundleComponent.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        componentOptionId: 'opt-1',
        componentOption: { isDeleted: false },
      },
      select: { bundleOptionId: true },
    });
  });

  it('fan-out calls recompute per bundle', async () => {
    mockTx.bundleComponent.findMany.mockResolvedValue([
      { bundleOptionId: 'bundle-A' },
      { bundleOptionId: 'bundle-B' },
    ]);
    const spy = vi.spyOn(service, 'recompute').mockResolvedValue(undefined as any);

    const result = await service.recomputeForComponent('organization-1', 'opt-1', mockTx);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('organization-1', 'bundle-A', mockTx);
    expect(spy).toHaveBeenCalledWith('organization-1', 'bundle-B', mockTx);
    expect(result).toEqual(['bundle-A', 'bundle-B']);
  });

  it('soft-deleted componentOption excluded by where clause', async () => {
    mockTx.bundleComponent.findMany.mockResolvedValue([]);
    await service.recomputeForComponent('organization-1', 'opt-deleted', mockTx);
    const call = mockTx.bundleComponent.findMany.mock.calls[0][0];
    expect(call.where.componentOption.isDeleted).toBe(false);
  });
});
