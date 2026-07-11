import { describe, expect, it, vi } from 'vitest';
import { UnshippedService } from '../unshipped.service';

describe('UnshippedService', () => {
  it('pages through the dedicated unshipped repository', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({
        items: [{ id: 'unshipped-1' }],
        total: 21,
        delayedCount: 7,
      }),
    };
    const service = new UnshippedService(repository as never);

    await expect(
      service.findAll({ page: 2, limit: 20, minDays: 3 }, 'org-1'),
    ).resolves.toEqual({
      items: [{ id: 'unshipped-1' }],
      total: 21,
      page: 2,
      limit: 20,
      summary: { total: 21, delayed: 7 },
    });
    expect(repository.list).toHaveBeenCalledWith('org-1', {
      minDays: 3,
      skip: 20,
      take: 20,
    });
  });
});
