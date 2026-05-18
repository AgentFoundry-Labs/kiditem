import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BundleStockService } from '../bundle-stock.service';

describe('BundleStockService.recomputeForComponent', () => {
  let service: BundleStockService;
  let mockTx: any;
  let bundles: {
    listBundlesUsingComponent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTx = { tx: true };
    bundles = {
      listBundlesUsingComponent: vi.fn(),
    };
    service = new BundleStockService(bundles as any, { run: vi.fn() } as any);
  });

  it('no bundles using this component -> empty array', async () => {
    bundles.listBundlesUsingComponent.mockResolvedValue([]);
    const result = await service.recomputeForComponent('organization-1', 'opt-1', mockTx);

    expect(result).toEqual([]);
    expect(bundles.listBundlesUsingComponent).toHaveBeenCalledWith(mockTx, 'opt-1', 'organization-1');
  });

  it('fan-out calls recompute per bundle', async () => {
    bundles.listBundlesUsingComponent.mockResolvedValue([
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
});
