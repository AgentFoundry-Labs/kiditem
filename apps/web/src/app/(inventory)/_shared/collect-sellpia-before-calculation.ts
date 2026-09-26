import type { QueryClient } from '@tanstack/react-query';
import { SELLPIA_INVENTORY_KIND } from '@kiditem/shared/sellpia-operations';
import { startCollectionSource } from '@/hooks/use-collection-source-control';
import { waitForSellpiaOperation } from '@/lib/sellpia-operations';
import { sellpiaInventoryCollection } from './sellpia-inventory-source-owner';
import { invalidateSellpiaInventory } from './invalidate-sellpia-inventory';

/**
 * 계산 전에 셀피아 재고를 새로 모은다(KID-361 J1). 공용 시작 한 번(같은 원천의 다른 화면 시작과 합쳐진다) 뒤, 그
 * 실행 하나(`GET /api/operations/:id`)가 발행을 끝낼 때까지 2초마다 읽고 그 실행 id를 돌려준다 — 발주·로켓 계산은 이
 * id로 정확한 재고 세대를 요구한다. 화면을 떠나면(`signal`) 기다리기만 멈추고, 다른 화면의 공용 수집은 멈추지 않는다.
 */
export async function collectSellpiaInventoryBeforeCalculation(
  queryClient: QueryClient,
  organizationId: string | null,
  signal?: AbortSignal,
  options: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<string> {
  if (!organizationId) throw new Error('조직을 선택한 뒤 다시 시도해 주세요.');
  signal?.throwIfAborted();
  const source = sellpiaInventoryCollection({ organizationId });
  const started = await startCollectionSource(queryClient, source, undefined);
  if (started.outcome === 'refused') throw new Error(started.message);
  const operationId = started.attemptId
    ?? source.readRunning(await queryClient.fetchQuery({ ...source.statusQuery, staleTime: 0 }))?.attemptId
    ?? null;
  if (!operationId) throw new Error('재고 수집 실행을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.');
  const operation = await waitForSellpiaOperation(SELLPIA_INVENTORY_KIND, operationId, {
    source: 'sellpia_inventory',
    ...(signal ? { signal } : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });
  await invalidateSellpiaInventory(queryClient);
  return operation.id;
}
