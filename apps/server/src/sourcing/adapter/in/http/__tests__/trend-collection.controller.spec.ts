import { describe, expect, it, vi } from 'vitest';
import { TrendCollectionController } from '../trend-collection.controller';

describe('TrendCollectionController', () => {
  it('returns organization-scoped 1688 browser collection targets', async () => {
    const collectService = {
      list1688Targets: vi.fn().mockResolvedValue([
        { label: '문구', keyword: '文具' },
        { label: '완구', keyword: '儿童玩具' },
      ]),
    };
    const controller = new TrendCollectionController(collectService as never, {} as never);

    const result = await controller.get1688Targets('org-1');

    expect(collectService.list1688Targets).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({
      targets: [
        { label: '문구', keyword: '文具' },
        { label: '완구', keyword: '儿童玩具' },
      ],
    });
  });
});
