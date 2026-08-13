import { describe, expect, it } from 'vitest';
import { projectDashboardContext } from '../dashboard-context';

describe('projectDashboardContext', () => {
  it('keeps only bounded allowlisted dashboard state', () => {
    const context = projectDashboardContext({
      routeKey: 'inventory_stock_ops',
      resourceRefs: [{ kind: 'product', id: 'product-1', version: '7', url: '/raw' }],
      filters: { status: ['ready'], page: 2, secret: { token: 'hidden' } },
      visibleRowIds: Array.from({ length: 120 }, (_, index) => `row-${index}`),
      aggregateSummary: { total: 12, nested: { role: 'admin' } },
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      organizationId: 'org-1',
      role: 'owner',
      html: '<input type="hidden" value="secret">',
      url: 'https://attacker.example',
    });

    expect(context).toEqual({
      routeKey: 'inventory_stock_ops',
      resourceRefs: [{ kind: 'product', id: 'product-1', version: '7' }],
      filters: { status: ['ready'], page: 2 },
      visibleRowIds: Array.from({ length: 100 }, (_, index) => `row-${index}`),
      aggregateSummary: { total: 12 },
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
    });
    expect(JSON.stringify(context)).not.toMatch(/organizationId|secret|html|url|role/);
  });
});
