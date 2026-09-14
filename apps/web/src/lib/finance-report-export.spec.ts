import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchRaw, downloadBlob } = vi.hoisted(() => ({
  fetchRaw: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { fetchRaw },
}));
vi.mock('@/lib/browser-download', () => ({
  downloadBlob,
}));

import {
  downloadFinanceReport,
  downloadProfitLossReport,
} from './finance-report-export';

function response(fileName = '서버-리포트.xlsx') {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    blob: vi.fn().mockResolvedValue(new Blob(['xlsx'])),
  };
}

describe('finance report server download boundary', () => {
  beforeEach(() => {
    fetchRaw.mockReset();
    downloadBlob.mockReset();
  });

  it('uses one fixed combined route and trusts the server filename', async () => {
    fetchRaw.mockResolvedValue(response('통합리포트_2026-08_2026-09-07.xlsx'));

    const fileName = await downloadFinanceReport({
      type: 'full',
      surface: 'reports',
      period: '2026-08',
    });

    expect(fetchRaw).toHaveBeenCalledWith(
      '/api/reports/export?type=full&surface=reports&period=2026-08',
    );
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), '통합리포트_2026-08_2026-09-07.xlsx');
    expect(fileName).toBe('통합리포트_2026-08_2026-09-07.xlsx');
  });

  it('preserves page period and fixed P&L filters in the owner query', async () => {
    fetchRaw.mockResolvedValue(response('손익표_2026-08.xlsx'));

    await downloadProfitLossReport({
      period: '2026-08',
      profitFilter: 'minus',
      grades: ['A', 'C'],
      sortField: 'netProfit',
      sortDirection: 'asc',
    });

    expect(fetchRaw).toHaveBeenCalledWith(
      '/api/profit-loss/export?period=2026-08&profitFilter=minus&grades=A%2CC&sortField=netProfit&sortDirection=asc',
    );
  });
});
