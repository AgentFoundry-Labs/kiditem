import type { PanelItem } from '@kiditem/shared/panel';
import { apiClient } from '@/lib/api-client';

const RECOVERY_SINCE_MINUTES = 24 * 60;
const STALE_BROWSER_BATCH_MINUTES = 30;
const STALE_THUMBNAIL_MINUTES = 6 * 60;

export async function recoverStalePanelOperations(afterSeq: number): Promise<PanelItem[]> {
  await Promise.allSettled([
    apiClient.post('/api/operation-alerts/reconcile-browser-stale', {
      staleMinutes: STALE_BROWSER_BATCH_MINUTES,
      limit: 100,
    }),
    apiClient.post('/api/thumbnail-editor/reconcile-stuck', {
      sinceMinutes: RECOVERY_SINCE_MINUTES,
      stalePendingMinutes: STALE_THUMBNAIL_MINUTES,
      limit: 100,
    }),
    apiClient.post('/api/ai/detail-page/reconcile-stuck', {
      sinceMinutes: RECOVERY_SINCE_MINUTES,
      limit: 100,
    }),
  ]);

  const qs = new URLSearchParams({ afterSeq: String(afterSeq) });
  return apiClient.get<PanelItem[]>(`/api/panel/backfill?${qs}`);
}
