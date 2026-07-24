import { describe, expect, it, vi } from 'vitest';
import { DashboardSalesRepositoryAdapter } from '../dashboard-sales.repository.adapter';

describe('DashboardSalesRepositoryAdapter', () => {
  it('preserves an unclassified stored MasterProduct grade on Top Products', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: 'listing-1',
        name: '미분류 상품',
        organization: '쿠팡',
        grade: null,
        revenue: 10_000,
        quantity: 1,
      },
    ]);
    const repository = new DashboardSalesRepositoryAdapter({
      $queryRaw: queryRaw,
    } as never);

    const result = await repository.fetchTopProducts(
      '11111111-1111-4111-8111-111111111111',
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-08-01T00:00:00.000Z'),
    );

    expect(result[0].grade).toBeNull();
  });
});
