import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('useDepartmentQuickActions execution boundaries', () => {
  it('shares each executable action with its domain screen', () => {
    const dashboard = source(
      'src/app/(analytics)/dashboard/hooks/use-department-quick-actions.ts',
    );
    const orderScreen = source(
      'src/app/(orders)/order-collection/components/OrderCollectionWorkspace.tsx',
    );
    const shipmentScreen = source(
      'src/app/(inventory)/coupang-shipments/page.tsx',
    );
    const rocketPanel = source(
      'src/app/(orders)/rocket-orders/components/RocketConfirmPanel.tsx',
    );
    const trendScreen = source(
      'src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionSection.tsx',
    );
    const sellpiaScreen = source(
      'src/app/(inventory)/_shared/sellpia-inventory-source-owner.ts',
    );
    const sellpiaAction = source('src/app/(inventory)/_shared/SellpiaSyncAction.tsx');
    const panel = source('src/app/(analytics)/dashboard/components/DashboardChartPanel.tsx');
    const sharedOrderAction = source('src/hooks/useAllMarketplaceOrderCollection.ts');

    expect(dashboard).toContain('usePersistedAllMarketplaceOrderCollection');
    expect(sharedOrderAction).toContain('useAllMarketplaceOrderCollection');
    expect(sharedOrderAction).toContain('await refetchMallAccounts()');
    // 다시 불러온 계정을 같은 collectAll 로 넘긴다 — 대시보드 버튼이 제 수집기를 따로 만들지
    // 않는다는 뜻이다. 사람이 직접 로그인해야 하는 몰만 빼고 넘기므로 이름은 targetAccounts 다.
    expect(sharedOrderAction).toContain('collectAll(targetAccounts, {');
    expect(sharedOrderAction).toMatch(/targetAccounts\s*=[\s\S]{0,200}latestAccounts/);
    expect(sharedOrderAction).toContain('await syncRun(activeRun.attemptId)');
    expect(orderScreen).toContain('useAllMarketplaceOrderCollection');

    for (const [sharedAction, domainSource] of [
      ['collectAndPersistCoupangShipmentSummary', shipmentScreen],
      ['useRocketPoCollection', rocketPanel],
      ['useTrendSourceCollection', trendScreen],
      ['useSellpiaInventoryCollection', sellpiaAction],
    ] as const) {
      expect(dashboard).toContain(sharedAction);
      expect(domainSource).toContain(sharedAction);
    }
    expect(dashboard).toContain("@/hooks/use-trend-source-collection");
    expect(trendScreen).toContain("@/hooks/use-trend-source-collection");
    expect(dashboard).not.toContain('startTrendCollectionAction');
    expect(sellpiaScreen).toContain('collectSellpiaInventory');
    expect(dashboard).not.toContain('manual-operation-actions');
    // Each cell reads its own source's state; no cell waits on another.
    expect(panel).not.toContain('runningAction');
  });
});
