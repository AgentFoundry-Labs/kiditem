import type { RuntimeError } from '../../core/errors';
import { openOperatorTab } from '../operator-tab';
import type { TabPages } from '../tab-page';
import { answerLost, orderStep, sellpiaStepFailure, SELLPIA_INVOICE_URL, SELLPIA_TAB_MATCH, type SellpiaPageAnswer } from './order-page';

/** 옛 송장채번 단계 제한 시간. */
const INVOICE_TIMEOUT_MS = 160_000;

interface InvoiceAnswer extends SellpiaPageAnswer {
  pressed?: boolean;
  selectedTargetOrderNumbers?: string[];
  rows?: Array<{ ordNo?: string; invNo?: string; courier?: string }>;
  message?: string;
}

/**
 * 채번 한 번. `not_pressed`: 고를 대상 행이 없어 [송장번호채번]을 누르지 않았다. `pressed`: 눌렀고 발급 행을 읽었다(대상 중
 * 발급 행이 없는 번호는 `issued`에 없다). `unknown`: 눌렀는지·무엇이 발급됐는지 모른다(답이 끊김, 누른 뒤 셀피아가 실패라 함).
 */
export interface SellpiaInvoiceAttempt {
  state: 'not_pressed' | 'pressed' | 'unknown';
  selectedOrderNumbers: string[];
  issued: Array<{ orderNo: string; trackingNumber: string; courier: string }>;
  message: string | null;
}

/**
 * 셀피아 자동송장(KID-366 wave8b, 옛 `runSellpiaAutoInvoice`). ⚠️되돌리기 어렵다 — 실제 송장번호를 발급한다. 운영자 셀피아 탭
 * (송장채번 화면이 먼저)을 쓰고 앞으로 가져와, 대상 주문번호 행만 골라 [송장번호채번]을 누른다(처리기가 고를 행이 없으면
 * 누르지 않는다 — 대기 행 전체 채번 금지). 택배사는 옛 값 1136 그대로다. 누르기 전 실패는 던지고, 누른 뒤를 모르면 `unknown`.
 */
export function createSellpiaInvoice(tabs: TabPages) {
  return {
    async issueInvoices(targetOrderNumbers: readonly string[]): Promise<SellpiaInvoiceAttempt> {
      const { page } = await openOperatorTab(tabs, {
        matches: ['https://*.sellpia.com/order_delivery_link.html*', SELLPIA_TAB_MATCH],
        url: SELLPIA_INVOICE_URL,
        stay: (current) => current.includes('order_delivery_link'),
      });
      try {
        let answer: InvoiceAnswer;
        try {
          answer = await orderStep<InvoiceAnswer>(page, 'invoice', targetOrderNumbers, INVOICE_TIMEOUT_MS);
        } catch (error) {
          if (!answerLost(error)) throw error;
          return { state: 'unknown', selectedOrderNumbers: [], issued: [], message: (error as RuntimeError).message };
        }
        if (!answer?.success) {
          if (answer?.pressed) return { state: 'unknown', selectedOrderNumbers: [], issued: [], message: answer.error ?? null };
          throw sellpiaStepFailure(answer, SELLPIA_INVOICE_URL);
        }
        const issued = (answer.rows ?? []).flatMap((row) => {
          const orderNo = String(row.ordNo ?? '').trim();
          const trackingNumber = String(row.invNo ?? '').trim();
          return orderNo && trackingNumber ? [{ orderNo, trackingNumber, courier: String(row.courier ?? '').trim() }] : [];
        });
        return {
          state: answer.pressed ? 'pressed' : 'not_pressed',
          selectedOrderNumbers: [...new Set(answer.selectedTargetOrderNumbers ?? [])],
          issued,
          message: answer.message ?? null,
        };
      } finally {
        await page.leave();
      }
    },
  };
}
