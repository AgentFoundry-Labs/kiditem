import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');
const financeReportSource = readFileSync(
  resolve(webRoot, 'src/app/(finance)/reports/page.tsx'),
  'utf8',
);
const settingsReportSource = readFileSync(
  resolve(webRoot, 'src/app/settings/components/ReportDownload.tsx'),
  'utf8',
);
const profitLossReportMapperSource = readFileSync(
  resolve(webRoot, 'src/lib/profit-loss-report.ts'),
  'utf8',
);
const serverExportSource = readFileSync(
  resolve(webRoot, 'src/lib/finance-report-export.ts'),
  'utf8',
);

describe('server-owned Finance report boundary', () => {
  it.each([
    ['finance report', financeReportSource],
    ['settings report', settingsReportSource],
  ])('%s delegates workbook creation to the server report owner', (_name, source) => {
    expect(source).toContain('downloadFinanceReport');
    expect(source).not.toContain('fetchAllSellpiaInventorySkus');
    expect(source).not.toContain('fetchAllChannelListingsForReport');
    expect(source).not.toContain('import("xlsx")');
    expect(source).not.toContain('XLSX.writeFile');
  });

  it('uses one fixed endpoint for settings and finance report surfaces', () => {
    expect(serverExportSource).toContain('`/api/reports/export?${params}`');
    expect(settingsReportSource).toContain("surface: 'settings'");
    expect(financeReportSource).toContain("surface: 'reports'");
    expect(serverExportSource).toContain("params.set('period', options.period)");
  });

  it('moves page-specific workbooks to fixed owner endpoints while preserving filters', () => {
    const profitLossSource = readFileSync(
      resolve(webRoot, 'src/app/(finance)/profit-loss/page.tsx'),
      'utf8',
    );
    const settlementsSource = readFileSync(
      resolve(webRoot, 'src/app/(finance)/sales-analysis/components/Settlements.tsx'),
      'utf8',
    );
    expect(profitLossSource).toContain('downloadProfitLossReport');
    expect(profitLossSource).toContain('selectedGrades');
    expect(profitLossSource).toContain('sortDirection');
    expect(profitLossSource).not.toContain('import("xlsx")');
    expect(settlementsSource).toContain('downloadSettlementReconcileReport');
    expect(settlementsSource).not.toContain('import("xlsx")');
  });

  it('keeps the legacy shared profit-loss mapper out of browser workbook generation', () => {
    expect(profitLossReportMapperSource).toContain("from '@kiditem/shared/finance'");
    expect(financeReportSource).not.toContain('mapProfitLossReportRow');
    expect(settingsReportSource).not.toContain('mapProfitLossReportRow');
  });
});
