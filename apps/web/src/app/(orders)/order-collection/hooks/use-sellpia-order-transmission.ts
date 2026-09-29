'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { OperationView } from '@kiditem/shared/operation';
import { friendlyError } from '@/lib/api-error';
import { formatNumber } from '@/lib/utils';
import {
  closeOrderActionOperation,
  confirmOrderActionOperation,
  OrderActionStillRunning,
  readOrderActionOperation,
  startSellpiaOrderTransfer,
} from '@/lib/order-action-operations';
import {
  saveGeneratedOrderFile,
  withoutSellpiaTransferConfirmation,
  withSellpiaTransferNeedsConfirmation,
  withSellpiaTransferStarted,
  withSellpiaTransmissionRequested,
  type StoredOrderCollectionFile,
} from '../lib/order-generated-file-store';
import { SELLPIA_TRANSFER_RECOLLECT_MESSAGE, sellpiaTransferScope } from '../lib/order-collection-page-model';

const NEEDS_CONFIRMATION =
  '셀피아 확인 필요 — 주문접수는 눌렀지만 접수를 확인하지 못했습니다. 다시 보내지 말고 셀피아 주문 내역을 확인한 뒤 행에서 확인·닫기를 눌러 주세요.';
const STILL_RUNNING = '셀피아 전송이 아직 끝나지 않았습니다. 이 화면을 다시 열면 결과를 읽어 행에 적습니다.';
const NOT_SUBMITTED_REASON = '운영자가 셀피아에서 확인: 접수되지 않음';
const PERSIST_FAILED = '셀피아 전송 결과는 서버에 남았지만 이 브라우저 파일 기록을 고치지 못했습니다.';

/**
 * 서버의 전송 실행 상태로 파일 기록을 맞춘다. 성공 → 전송 요청(다시 누르면 재전송 확인 창), 확인 필요 → 확인 표시,
 * 실패·중단 → 표시 해제(다시 보낼 수 있다). 아직 도는 실행이면 null.
 */
function recordFromServer(file: StoredOrderCollectionFile, operation: OperationView): StoredOrderCollectionFile | null {
  switch (operation.status) {
    case 'succeeded': {
      const finishedAt = operation.finishedAt ? Date.parse(String(operation.finishedAt)) : Number.NaN;
      return withSellpiaTransmissionRequested(file, Number.isFinite(finishedAt) ? finishedAt : Date.now());
    }
    case 'reconciling':
      return file.sellpiaTransferConfirmationId === operation.id ? file : withSellpiaTransferNeedsConfirmation(file, operation.id);
    case 'failed':
    case 'cancelled':
      return withoutSellpiaTransferConfirmation(file);
    default:
      return null;
  }
}

/**
 * 셀피아 전송 = 실행 `orders.sellpia_order_transfer`(KID-366). 서버가 원천 실행에서 파일을 다시 만들고 확장이 셀피아에
 * 올린다. 결과는 이 브라우저 파일 기록(편의 상태)에 옮겨 적고, 어긋나면 서버 실행 상태가 이긴다.
 */
export function useSellpiaOrderTransmission({
  items = [],
  onTransmissionRequested,
}: {
  /** 화면의 파일 기록. 끝을 옮기지 못한 전송 실행이 있으면 서버 상태로 맞춘다. */
  items?: readonly StoredOrderCollectionFile[];
  /** 파일 기록이 바뀌었다(전송 요청·진행·확인 필요·해제). */
  onTransmissionRequested: (file: StoredOrderCollectionFile) => void;
}) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const syncedRef = useRef(new Set<string>());

  const record = useCallback(async (updated: StoredOrderCollectionFile) => {
    try {
      await saveGeneratedOrderFile(updated);
    } catch {
      toast.warning(PERSIST_FAILED);
    }
    onTransmissionRequested(updated);
  }, [onTransmissionRequested]);

  /** 그 실행을 서버에서 읽어 기록을 맞춘다. 아직 도는 실행이면 'pending'. */
  const syncFromServer = useCallback(async (
    file: StoredOrderCollectionFile,
    operationId: string,
  ): Promise<'updated' | 'unchanged' | 'pending'> => {
    const operation = await readOrderActionOperation(operationId);
    const updated = recordFromServer(file, operation);
    if (!updated) return 'pending';
    if (updated === file) return 'unchanged';
    await record(updated);
    return 'updated';
  }, [record]);

  // 기다림 상한을 넘겼거나 탭이 닫혀 끝을 옮기지 못한 전송·확인 필요 기록은 화면이 열릴 때 서버 상태로 맞춘다.
  // 기록 하나당 실행 하나를 한 번 읽는다(주기 폴링 아님). 끝나지 않은 실행은 다음 기록 변경 때 다시 읽는다.
  useEffect(() => {
    for (const file of items) {
      const operationId = file.sellpiaTransferOperationId ?? file.sellpiaTransferConfirmationId;
      if (!operationId || file.id === sendingId) continue;
      const key = `${file.id}:${operationId}`;
      if (syncedRef.current.has(key)) continue;
      syncedRef.current.add(key);
      void syncFromServer(file, operationId)
        .then((state) => {
          if (state === 'pending') syncedRef.current.delete(key);
        })
        .catch(() => syncedRef.current.delete(key));
    }
  }, [items, sendingId, syncFromServer]);

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
      let current = file;
      try {
        const outcome = await startSellpiaOrderTransfer(scope, {
          onStarted: (operationId) => {
            current = withSellpiaTransferStarted(file, operationId);
            void record(current);
          },
        });
        if (outcome.status === 'needs_confirmation') {
          await record(withSellpiaTransferNeedsConfirmation(current, outcome.operationId));
          toast.warning(NEEDS_CONFIRMATION, { duration: 15000 });
          return false;
        }
        await record(withSellpiaTransmissionRequested(current, Date.now()));
        if (options.showSuccessToast !== false) {
          toast.success(
            `${options.retryConfirmed ? '셀피아 재전송 요청됨' : '셀피아 전송 요청됨'} — ${scope.shopName} `
              + `(접수 확인 ${formatNumber(outcome.result.acceptedOrderNumbers.length)}건)`,
          );
        }
        return true;
      } catch (error) {
        if (error instanceof OrderActionStillRunning) {
          toast.warning(STILL_RUNNING, { duration: 12000 });
          return false;
        }
        // 실패로 끝난 실행(미접수 등)은 진행 표시를 지워 다시 보낼 수 있게 한다.
        if (current.sellpiaTransferOperationId) await record(withoutSellpiaTransferConfirmation(current));
        toast.error(friendlyError(error, '셀피아 전송 요청 실패') ?? '셀피아 전송 요청 실패');
        return false;
      } finally {
        setSendingId(null);
      }
    },
    [record],
  );

  /** 확인·닫기가 거절되면(이미 끝난 실행 등) 그 실행의 서버 상태로 기록을 맞춘다. */
  const resolveOrSync = useCallback(async (
    file: StoredOrderCollectionFile,
    resolve: (operationId: string) => Promise<StoredOrderCollectionFile>,
    successText: string,
    failureText: string,
  ): Promise<void> => {
    const operationId = file.sellpiaTransferConfirmationId;
    if (!operationId) return;
    try {
      await record(await resolve(operationId));
      toast.success(successText);
    } catch (error) {
      const synced = await syncFromServer(file, operationId).catch(() => 'pending' as const);
      if (synced !== 'pending' && synced !== 'unchanged') toast.info('서버에 이미 끝난 전송이라 그 결과로 행을 맞췄습니다.');
      else toast.error(friendlyError(error, failureText) ?? failureText);
    }
  }, [record, syncFromServer]);

  /** 운영자가 셀피아에서 접수를 확인했다 — 실행을 성공으로 닫고 전송 요청으로 적는다. */
  const confirmTransfer = useCallback((file: StoredOrderCollectionFile) => resolveOrSync(
    file,
    async (operationId) => {
      const resolved = await confirmOrderActionOperation(operationId);
      if (resolved && resolved.status !== 'succeeded') throw new Error('셀피아 전송 확인을 서버가 받지 않았습니다.');
      return withSellpiaTransmissionRequested(file, Date.now());
    },
    '셀피아 접수를 확인했습니다.',
    '셀피아 전송 확인 실패',
  ), [resolveOrSync]);

  /** 운영자가 셀피아에서 보니 접수되지 않았다 — 실행을 실패로 닫고 표시를 지워 다시 보낼 수 있게 한다. */
  const closeTransfer = useCallback((file: StoredOrderCollectionFile) => resolveOrSync(
    file,
    async (operationId) => {
      await closeOrderActionOperation(operationId, NOT_SUBMITTED_REASON);
      return withoutSellpiaTransferConfirmation(file);
    },
    '미접수로 닫았습니다. 다시 전송할 수 있습니다.',
    '셀피아 전송 닫기 실패',
  ), [resolveOrSync]);

  return { sendingId, transmit, confirmTransfer, closeTransfer };
}
