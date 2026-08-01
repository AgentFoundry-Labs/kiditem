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
    const rocketWorkflow = source(
      'src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts',
    );
    const trendScreen = source(
      'src/app/(sourcing-ai)/sourcing-ai/market/lib/trend-collection-api.ts',
    );
    const sellpiaScreen = source('src/hooks/useSellpiaInventoryFreshness.ts');
    const sharedOrderAction = source('src/hooks/useAllMarketplaceOrderCollection.ts');

    expect(dashboard).toContain('usePersistedAllMarketplaceOrderCollection');
    expect(dashboard).toContain('useSellpiaInventoryFreshness');
    expect(dashboard).toContain("sourceSurface: 'dashboard'");
    expect(sharedOrderAction).toContain('useAllMarketplaceOrderCollection');
    expect(sharedOrderAction).toContain('await refetchMallAccounts()');
    expect(sharedOrderAction).toContain('collectAll(latestAccounts)');
    expect(sharedOrderAction).toContain('await syncRun(activeRun.runId)');
    expect(orderScreen).toContain('useAllMarketplaceOrderCollection');

    for (const [sharedAction, domainSource] of [
      ['collectAndPersistCoupangShipmentSummary', shipmentScreen],
      ['collectAndPersistRocketPurchaseOrders', rocketWorkflow],
      ['startTrendCollectionAction', trendScreen],
    ] as const) {
      expect(dashboard).toContain(sharedAction);
      expect(domainSource).toContain(sharedAction);
    }
    expect(sellpiaScreen).toContain('startSellpiaInventoryRefreshAction');
  });
});
