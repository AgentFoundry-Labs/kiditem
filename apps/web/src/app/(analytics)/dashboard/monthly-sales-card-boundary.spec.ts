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
  });

  /**
   * The rule the profit cell guarded outlives the cell: one source's structure
   * never renders under another source's card. The detail modal left the
   * dashboard with the period strip (2026-09-18); the headline 순이익 card now
   * carries the rule — a Sellpia card whose profit is withheld stays empty
   * instead of borrowing the order-based profit.
   */
  it('shows profit from one source and never borrows another', () => {
    expect(pageSource).toContain('const spProfit = sellpiaProfitInputsAvailable ? sp?.netProfit ?? null : null;');
    expect(pageSource).toContain('const displayProfit = profitCardUsesSellpia');
    expect(pageSource).toContain(': (!sellpiaHasData && profitMetricsAvailable) ? kpiProfit : null;');
  });

  it('routes revenue to the integrated sales analysis instead of expanding inline', () => {
    expect(pageSource).toContain('/sales-analysis?tab=overview&period=');
    // 매출 카드와 매출 차트가 둘 다 매출 분석으로 보낸다(링크는 각 컴포넌트가 그린다).
    expect(pageSource).toContain('salesHref={salesAnalysisHref}');
    expect(pageSource).not.toContain('showChannelDetail');
    expect(pageSource).not.toContain('<DashboardChannelSales');
  });

  it('never lets Wing revenue stand in for a Rocket figure', () => {
    expect(pageSource).not.toContain('rocketRevenue');
  });
});
