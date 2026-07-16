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

const VIEW_REFRESH_WARNING =
  '셀피아 전송 요청은 완료됐지만 최신 상태를 화면에 반영하지 못했습니다. 새로고침하세요.';

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
          if (result.abortWarning) {
            toast.error(
              '셀피아 전송은 제출되지 않았지만 준비 상태 해제에 실패했습니다. 재시도 전에 상태를 확인하세요.',
            );
          } else {
            toast.warning('셀피아 전송 요청이 제출되지 않았습니다.');
          }
          return false;
        }

        onTransmissionRequested(result.file);
        if (result.finalizationWarning) {
          toast.warning(
            '셀피아 전송 요청은 완료됐지만 재고 최신화 확정에 실패했습니다. 재전송하지 말고 이전 전송 결과를 확인하세요.',
          );
        }
        if (result.viewRefreshWarning) {
          toast.warning(VIEW_REFRESH_WARNING);
        }
        if (result.persistenceWarning) {
          toast.warning('셀피아 전송 요청은 완료됐지만 전송 상태를 저장하지 못했습니다.');
        } else if (
          !result.viewRefreshWarning
          && !result.finalizationWarning
          && options.showSuccessToast !== false
        ) {
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
