'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { formatNumber } from '@/lib/utils';
import {
  closeOrderActionOperation,
  confirmOrderActionOperation,
  startSellpiaOrderTransfer,
} from '@/lib/order-action-operations';
import {
  saveGeneratedOrderFile,
  withoutSellpiaTransferConfirmation,
  withSellpiaTransferNeedsConfirmation,
  withSellpiaTransmissionRequested,
  type StoredOrderCollectionFile,
} from '../lib/order-generated-file-store';
import { SELLPIA_TRANSFER_RECOLLECT_MESSAGE, sellpiaTransferScope } from '../lib/order-collection-page-model';

const NEEDS_CONFIRMATION =
  '셀피아 확인 필요 — 주문접수는 눌렀지만 접수를 확인하지 못했습니다. 다시 보내지 말고 셀피아 주문 내역을 확인한 뒤 행에서 확인·닫기를 눌러 주세요.';
const NOT_SUBMITTED_REASON = '운영자가 셀피아에서 확인: 접수되지 않음';
const PERSIST_FAILED = '셀피아 전송 결과는 서버에 남았지만 이 브라우저 파일 기록을 고치지 못했습니다.';

/**
 * 셀피아 전송 = 실행 `orders.sellpia_order_transfer`(KID-366). 서버가 원천 실행에서 파일을 다시 만들고 확장이 셀피아에
 * 올린다 — 실행이 멱등 울타리다. 결과는 이 브라우저 파일 기록(편의 상태)에 옮겨 적는다.
 */
export function useSellpiaOrderTransmission({
  onTransmissionRequested,
}: {
  /** 파일 기록이 바뀌었다(전송 요청·확인 필요·확인 필요 해제). */
  onTransmissionRequested: (file: StoredOrderCollectionFile) => void;
}) {
  const [sendingId, setSendingId] = useState<string | null>(null);

  const record = useCallback(async (updated: StoredOrderCollectionFile) => {
    try {
      await saveGeneratedOrderFile(updated);
    } catch {
      toast.warning(PERSIST_FAILED);
    }
    onTransmissionRequested(updated);
  }, [onTransmissionRequested]);

  const transmit = useCallback(
    async (
      file: StoredOrderCollectionFile,
      options: { showSuccessToast?: boolean; retryConfirmed?: boolean } = {},
    ): Promise<boolean> => {
      const scope = sellpiaTransferScope(file);
      if (!scope) {
        toast.error(SELLPIA_TRANSFER_RECOLLECT_MESSAGE);
        return false;
      }
      setSendingId(file.id);
      try {
        const outcome = await startSellpiaOrderTransfer(scope);
        if (outcome.status === 'needs_confirmation') {
          await record(withSellpiaTransferNeedsConfirmation(file, outcome.operationId));
          toast.warning(NEEDS_CONFIRMATION, { duration: 15000 });
          return false;
        }
        await record(withSellpiaTransmissionRequested(file, Date.now()));
        if (options.showSuccessToast !== false) {
          toast.success(
            `${options.retryConfirmed ? '셀피아 재전송 요청됨' : '셀피아 전송 요청됨'} — ${scope.shopName} `
              + `(접수 확인 ${formatNumber(outcome.result.acceptedOrderNumbers.length)}건)`,
          );
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error, '셀피아 전송 요청 실패') ?? '셀피아 전송 요청 실패');
        return false;
      } finally {
        setSendingId(null);
      }
    },
    [record],
  );

  /** 운영자가 셀피아에서 접수를 확인했다 — 실행을 성공으로 닫고 전송 요청으로 적는다. */
  const confirmTransfer = useCallback(async (file: StoredOrderCollectionFile): Promise<void> => {
    const operationId = file.sellpiaTransferConfirmationId;
    if (!operationId) return;
    try {
      const resolved = await confirmOrderActionOperation(operationId);
      if (resolved && resolved.status !== 'succeeded') {
        toast.error('셀피아 전송 확인을 서버가 받지 않았습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      await record(withSellpiaTransmissionRequested(file, Date.now()));
      toast.success('셀피아 접수를 확인했습니다.');
    } catch (error) {
      toast.error(friendlyError(error, '셀피아 전송 확인 실패') ?? '셀피아 전송 확인 실패');
    }
  }, [record]);

  /** 운영자가 셀피아에서 보니 접수되지 않았다 — 실행을 실패로 닫고 확인 표시를 지워 다시 보낼 수 있게 한다. */
  const closeTransfer = useCallback(async (file: StoredOrderCollectionFile): Promise<void> => {
    const operationId = file.sellpiaTransferConfirmationId;
    if (!operationId) return;
    try {
      await closeOrderActionOperation(operationId, NOT_SUBMITTED_REASON);
      await record(withoutSellpiaTransferConfirmation(file));
      toast.info('미접수로 닫았습니다. 다시 전송할 수 있습니다.');
    } catch (error) {
      toast.error(friendlyError(error, '셀피아 전송 닫기 실패') ?? '셀피아 전송 닫기 실패');
    }
  }, [record]);

  return { sendingId, transmit, confirmTransfer, closeTransfer };
}
