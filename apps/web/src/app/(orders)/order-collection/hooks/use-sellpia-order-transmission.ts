'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import { sendOrderFileToSellpiaViaExtension } from '../lib/order-collection-extension';
import {
  markGeneratedOrderFileTransmissionRequested,
  type StoredOrderCollectionFile,
} from '../lib/order-generated-file-store';
import { transmitSellpiaOrder } from '../lib/sellpia-order-transmission';

const REFRESH_SCHEDULING_WARNING =
  '셀피아 전송 요청은 완료됐지만 재고 최신화 예약에 실패했습니다. 지금 동기화를 실행하세요.';

export function useSellpiaOrderTransmission({
  onTransmissionRequested,
}: {
  onTransmissionRequested: (file: StoredOrderCollectionFile) => void;
}) {
  const queryClient = useQueryClient();
  const [sendingId, setSendingId] = useState<string | null>(null);

  const invalidateFreshnessHistory = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.freshness() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.history() }),
    ]);
  }, [queryClient]);

  const transmit = useCallback(
    async (
      file: StoredOrderCollectionFile,
      options: { showSuccessToast?: boolean } = {},
    ): Promise<boolean> => {
      setSendingId(file.id);
      try {
        const result = await transmitSellpiaOrder({
          file,
          extension: { sendSellpiaOrders: sendOrderFileToSellpiaViaExtension },
          store: {
            markTransmissionRequested: markGeneratedOrderFileTransmissionRequested,
          },
          freshness: sellpiaInventoryFreshnessApi,
          invalidateFreshnessHistory,
        });

        if (result.status === 'not_submitted') {
          toast.warning('셀피아 전송 요청이 제출되지 않았습니다.');
          return false;
        }

        onTransmissionRequested(result.file);
        if (result.refreshWarning) {
          toast.warning(REFRESH_SCHEDULING_WARNING);
        }
        if (result.persistenceWarning) {
          toast.warning('셀피아 전송 요청은 완료됐지만 전송 상태를 저장하지 못했습니다.');
        } else if (!result.refreshWarning && options.showSuccessToast !== false) {
          toast.success(`셀피아 전송 요청됨 — ${result.shopName}`);
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error) ?? '셀피아 전송 요청 실패');
        return false;
      } finally {
        setSendingId(null);
      }
    },
    [invalidateFreshnessHistory, onTransmissionRequested],
  );

  return { sendingId, transmit };
}
