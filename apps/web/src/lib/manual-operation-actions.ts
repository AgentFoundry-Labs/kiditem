import type { OperationRun } from '@kiditem/shared/operations';
import type { SellpiaSyncScope } from '@kiditem/shared/sellpia-inventory-freshness';
import { operationsApi } from '@/lib/operations-api';

export type ManualOperationSourceSurface = 'dashboard' | 'domain_screen';

export function startTrendCollectionAction({
  sourceSurface,
  sources,
}: {
  sourceSurface: ManualOperationSourceSurface;
  sources?: string[];
}): Promise<OperationRun> {
  return operationsApi.start('sourcing.collect_daily_trends', {
    sourceSurface,
    input: sources?.length ? { sources } : {},
  });
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
