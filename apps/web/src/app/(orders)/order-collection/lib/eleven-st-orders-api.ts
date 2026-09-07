import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type { OrderCollectionExtensionRun } from './order-collection-extension';

/**
 * 11번가 모바일 셀러오피스(msoffice) 주문 한 건.
 *
 * 목록(`shippingManager2`) 응답의 UPPER_SNAKE 필드를 확장이 가공 없이 넘기고,
 * 주소·연락처가 든 상세(`getOrderDetail2`)를 `__detail` 로 붙여둔다.
 */
export interface ElevenStOrder {
  ORD_NO?: string | number;
  ORD_PRD_SEQ?: string | number;
  ORD_PRD_STAT?: string | number;
  ORD_PRD_STAT_NM?: string;
  PRD_NO?: string | number;
  PRD_NM?: string;
  PRD_OPT_NM?: string;
  SEL_PRC?: string | number;
  ORD_QTY?: string | number;
  ORDER_AMT?: string | number;
  ORD_NM?: string;
  RCVR_NM?: string;
  RCVR_MAIL_NO?: string;
  DLV_NO?: string | number;
  INVC_NO?: string;
  LST_DLV_CST?: string | number;
  ORD_STL_END_DT?: string;
  /** 주소·연락처가 여기 있다. 목록에는 없다. */
  __detail?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface ElevenStCollectResponse {
  success?: boolean;
  orders?: ElevenStOrder[];
  count?: number;
  dateFrom?: string;
  dateTo?: string;
  error?: string;
  pendingLogin?: boolean;
}

/**
 * 확장으로 11번가 셀러오피스 주문(결제완료 202)을 로그인 세션에서 가져온다.
 *
 * 데스크톱 soffice 가 아니라 모바일 msoffice 의 JSON API 를 쓴다 — 같은 세션 쿠키로
 * 돌면서 응답이 JSON 이라 레거시 ExtJS iframe 을 건드리지 않아도 된다.
 * 날짜를 안 주면 최근 7일을 본다(발송 전 주문이 며칠 누적돼도 놓치지 않게).
 */
export async function collectElevenStOrdersFromExtension(
  date?: string,
  run?: OrderCollectionExtensionRun,
): Promise<ElevenStOrder[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 '
      + '11번가 셀러오피스에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<ElevenStCollectResponse>(
    extensionId,
    {
      action: 'collect11stOrders',
      date: date ?? run?.date,
      runId: await issueBrowserCollectionRunId(run?.runId),
      deferTerminal: Boolean(run?.runId),
    },
    190000,
  );
  if (!res?.success || !Array.isArray(res.orders)) {
    throw Object.assign(new Error(res?.error ?? '11번가 주문 수집에 실패했습니다.'), {
      pendingLogin: res?.pendingLogin === true,
    });
  }
  return res.orders;
}
