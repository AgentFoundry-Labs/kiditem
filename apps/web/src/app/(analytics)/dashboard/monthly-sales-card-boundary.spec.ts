import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');
const pageSource = readFileSync(
  resolve(webRoot, 'src/app/(analytics)/dashboard/page.tsx'),
  'utf8',
);

describe('dashboard monthly sales card preservation', () => {
  it('keeps the staging card structure visible while local sales data is empty', () => {
    expect(pageSource).not.toContain('(wingRevenue > 0 || rocketRevenue > 0) &&');
    expect(pageSource).not.toContain('(effectiveSales?.trafficKpi?.visitors ?? 0) > 0 &&');
    expect(pageSource).not.toContain('(effectiveSales?.trafficKpi?.views ?? 0) > 0 &&');
    expect(pageSource).toContain("salesBaseline.lastSyncAt ? formatDateTime(salesBaseline.lastSyncAt) : '이력 없음'");
  });

  it('subtracts collected Coupang ad spend and renders receipt-style expenses', () => {
    expect(pageSource).toContain('const spAdCost = sp?.adCost ?? 0;');
    expect(pageSource).toContain('const spProfit = sp?.netProfit ??');
    expect(pageSource).toContain('const spProfitRate = sp?.profitRate ?? 0;');
    expect(pageSource).toContain('const profitRateAvailable = sellpiaHasData ? spTotal > 0 : profitMetricsAvailable;');
    expect(pageSource).toContain('const displayProfitRate = sellpiaHasData ? spProfitRate : profitRate;');
    expect(pageSource).toContain('<DashboardExpenseAmount amount={spCost} />');
    expect(pageSource).toContain('<DashboardExpenseAmount amount={spAdCost} />');
    expect(pageSource).toContain('{profitRateAvailable ? (');
  });
});
