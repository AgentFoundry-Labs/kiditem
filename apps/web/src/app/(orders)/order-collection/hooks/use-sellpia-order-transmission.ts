'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { recordMallOperationOutcome } from '@/lib/mall-operation-outcomes-api';
import { sendOrderFileToSellpiaViaExtension } from '../lib/order-collection-extension';
import {
  markGeneratedOrderFileTransmissionRequested,
  type StoredOrderCollectionFile,
} from '../lib/order-generated-file-store';
import {
  SellpiaOrderTransmissionResolutionRequiredError,
  transmitSellpiaOrder,
} from '../lib/sellpia-order-transmission';
import { sellpiaOrderTransmissionApi } from '../lib/sellpia-order-transmission-api';

export function useSellpiaOrderTransmission({
  onTransmissionRequested,
}: {
  onTransmissionRequested: (file: StoredOrderCollectionFile) => void;
}) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const transmit = useCallback(
    async (
      file: StoredOrderCollectionFile,
      options: { showSuccessToast?: boolean; retryConfirmed?: boolean } = {},
    ): Promise<boolean> => {
      setSendingId(file.id);
      setSettlingId(null);
      try {
        const result = await transmitSellpiaOrder({
          file,
          retryConfirmed: options.retryConfirmed,
          extension: { sendSellpiaOrders: sendOrderFileToSellpiaViaExtension },
          store: {
            markTransmissionRequested: markGeneratedOrderFileTransmissionRequested,
          },
          transmissions: sellpiaOrderTransmissionApi,
          onSubmissionConfirmed: () => {
            setSendingId(null);
            setSettlingId(file.id);
          },
        });

        if (result.status === 'not_submitted') {
          if (result.abortWarning) {
            toast.error(
              '셀피아 전송은 제출되지 않았지만 준비 상태 해제에 실패했습니다. 재시도 전에 상태를 확인하세요.',
            );
          } else if (result.error) {
            toast.error(result.error);
          } else {
            toast.warning('셀피아 전송 요청이 제출되지 않았습니다.');
          }
          return false;
        }

        onTransmissionRequested(result.file);
        // 몰별 '신규(미전송)'를 서버에서 계산하려면 몇 건을 보냈는지가 서버에 남아야 한다.
        // 셀피아가 접수한 것이 확인된 이 자리에서만 적는다 — 개수와 몰 키만 담는다.
        if (result.file.mallKey) {
          void recordMallOperationOutcome({
            mallKey: result.file.mallKey,
            operation: 'sellpia_transfer',
            outcome: 'succeeded',
            reasonCode: 'transmission_requested',
            itemCount: result.file.orderNumbers?.length
              ?? result.file.collectedRows
              ?? null,
            trigger: 'manual',
          });
        }
        if (result.finalizationWarning) {
          toast.warning(
            '셀피아 전송 요청은 완료됐지만 전송 상태 저장에 실패했습니다. 재전송하지 말고 이전 전송 결과를 확인하세요.',
          );
        }
        if (result.persistenceWarning) {
          toast.warning('셀피아 전송 요청은 완료됐지만 전송 상태를 저장하지 못했습니다.');
        } else if (
          !result.finalizationWarning
          && options.showSuccessToast !== false
        ) {
          toast.success(
            `${options.retryConfirmed ? '셀피아 재전송 요청됨' : '셀피아 전송 요청됨'} — ${result.shopName}`,
          );
        }
        return true;
      } catch (error) {
        const message = friendlyError(error) ?? '셀피아 전송 요청 실패';
        if (error instanceof SellpiaOrderTransmissionResolutionRequiredError) {
          toast.error(message);
        } else {
          toast.error(message);
        }
        return false;
      } finally {
        setSendingId(null);
        setSettlingId(null);
      }
    },
    [onTransmissionRequested],
  );

  return { sendingId, settlingId, transmit };
}
