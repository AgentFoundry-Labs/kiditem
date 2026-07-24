import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const financeRoot = path.resolve(import.meta.dirname);

describe('active finance route contracts', () => {
  it('keeps settlements inside sales analysis', () => {
    const tabs = readFileSync(
      path.join(
        financeRoot,
        'sales-analysis/components/SalesAnalysisPageContent.tsx',
      ),
      'utf8',
    );
    const settlements = readFileSync(
      path.join(
        financeRoot,
        'sales-analysis/components/Settlements.tsx',
      ),
      'utf8',
    );

    expect(tabs).toContain(
      "import('@/app/(finance)/sales-analysis/components/Settlements')",
    );
    expect(tabs).toContain("id: 'settlements'");
    expect(tabs).toContain('<SettlementsPage />');
    expect(settlements).toContain("queryKeys.settlements.list(period)");
    expect(settlements).toContain(
      'apiClient.get<Settlement[]>(`/api/settlements?${params}`)',
    );
  });
});
