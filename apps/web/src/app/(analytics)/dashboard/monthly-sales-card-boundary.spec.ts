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
});
