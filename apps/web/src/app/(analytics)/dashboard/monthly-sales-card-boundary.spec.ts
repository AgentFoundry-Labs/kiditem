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
const modalSource = readFileSync(
  resolve(webRoot, 'src/app/(analytics)/dashboard/components/DashboardProfitDetailModal.tsx'),
  'utf8',
);

describe('dashboard monthly sales card preservation', () => {
  it('keeps the staging card structure visible while local sales data is empty', () => {
    expect(pageSource).not.toContain('(wingRevenue > 0 || rocketRevenue > 0) &&');
    expect(pageSource).not.toContain('(effectiveSales?.trafficKpi?.visitors ?? 0) > 0 &&');
    expect(pageSource).not.toContain('(effectiveSales?.trafficKpi?.views ?? 0) > 0 &&');
    expect(pageSource).toContain("trafficObservedAt ? formatDateTime(trafficObservedAt) : '미수집'");
  });

  /**
   * The profit inputs moved from the KPI cell into the detail modal. The rule
   * they were guarding did not move: one source's structure never renders under
   * another source's card. The modal has two fallbacks of its own (the calendar
   * month's order structure, and the ad account), so the caller's answer has to
   * be able to say "my source published nothing" and stop both.
   */
  it('shows profit inputs from one source and never borrows another', () => {
    expect(pageSource).toContain('const spProfit = sellpiaProfitInputsAvailable ? sp?.netProfit ?? null : null;');
    expect(pageSource).toContain('const spProfitRate = sellpiaProfitInputsAvailable ? sp?.profitRate ?? null : null;');
    expect(pageSource).toContain('const displayProfitRate = sellpiaHasData && sellpiaProfitInputsAvailable');
    expect(pageSource).toContain('const profitDetailInputs = sellpiaHasData');
    expect(pageSource).toContain('inputs={profitDetailInputs}');
    // `null` is an answer, `undefined` is an absence — collapsing the two is
    // exactly how the month structure leaked under a Sellpia card.
    expect(modalSource).toContain('inputs !== undefined ? inputs : salesBaseline.profitInputs ?? null');
    expect(modalSource).toContain('const sourcePublishedNothing = inputs === null;');
    expect(modalSource).toContain('const view: ProfitDetailView = sourcePublishedNothing ?');
  });

  it('routes revenue to the integrated sales analysis instead of expanding inline', () => {
    expect(pageSource).toContain('/sales-analysis?tab=overview&period=');
    expect(pageSource).toContain('href={salesAnalysisHref}');
    expect(pageSource).not.toContain('showChannelDetail');
    expect(pageSource).not.toContain('<DashboardChannelSales');
  });

  it('never lets Wing revenue stand in for a Rocket figure', () => {
    expect(pageSource).not.toContain('rocketRevenue');
    expect(pageSource).toContain('{profitRateAvailable ? (');
  });
});
