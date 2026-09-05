import type { OperationRun } from '@kiditem/shared/operations';
import type { SellpiaSyncScope } from '@kiditem/shared/sellpia-inventory-freshness';
import { collectTrendSources, type TrendSourceCollectionResult } from './source-trend-api';
import { operationsApi } from '@/lib/operations-api';

export type ManualOperationSourceSurface = 'dashboard' | 'domain_screen';

export function startTrendCollectionAction({
  sources,
}: {
  sourceSurface: ManualOperationSourceSurface;
  sources?: string[];
}): Promise<TrendSourceCollectionResult> {
  return collectTrendSources(sources);
}

export function startSellpiaInventoryRefreshAction({
  sourceSurface,
  reason,
  scope,
}: {
  sourceSurface: ManualOperationSourceSurface;
  reason: 'manual_request' | 'retry';
  scope: SellpiaSyncScope;
}): Promise<OperationRun> {
  return operationsApi.start('inventory.refresh_sellpia_snapshot', {
    sourceSurface,
    input: { reason, scope },
  });
}

export function startProductProfitabilityRefreshAction({
  sourceSurface,
}: {
  sourceSurface: ManualOperationSourceSurface;
}): Promise<OperationRun> {
  return operationsApi.start('products.refresh_profitability_evidence', {
    sourceSurface,
    input: {},
  });
}
