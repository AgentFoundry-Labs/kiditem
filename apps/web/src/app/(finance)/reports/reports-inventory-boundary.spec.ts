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

describe('Sellpia inventory report boundary', () => {
  it.each([
    ['finance report', financeReportSource],
    ['settings report', settingsReportSource],
  ])('%s exports the complete Sellpia snapshot instead of legacy inventory policy', (_name, source) => {
    expect(source).toContain('fetchAllSellpiaInventorySkus');
    expect(source).toContain('i.code');
    expect(source).not.toContain('sellpiaProductCode');
    expect(source).toContain('purchasePrice');
    expect(source).toContain('stockValue');
    expect(source).toContain('lastImportedAt');
    expect(source).not.toMatch(/['"]\/api\/inventory['"]/);
    expect(source).not.toMatch(
      /optimalStock|reorderPoint|avgDailySales|daysRemaining|recommendedOrder|p\.currentStock/,
    );
  });

  it('fetches Sellpia inventory only for inventory-bearing finance reports', () => {
    expect(financeReportSource).toContain("type === 'full'");
    expect(financeReportSource).toContain("[type as ReportDataKey]");
    expect(financeReportSource).toContain("key === 'inventory'");
    expect(financeReportSource).not.toContain('const [productsRes, profitLoss, inventory, adsData]');
  });
});
