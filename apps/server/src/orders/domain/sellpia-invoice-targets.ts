import { SELLPIA_INVOICE_TARGET_TTL_MS } from '@kiditem/shared/orders-action-operations';

/**
 * 자동송장 대상 규칙(KID-355 wave8b, 사장님 2026-09-29 13:31 "추천대로" Q3): 표 없이 실행 result만으로 정한다.
 * 대상 = 최근 24시간(옛 확장 세션 저장소의 수명 그대로) 안에 **성공한 전송 실행**의 `acceptedOrderNumbers` 가운데
 * 아직 어떤 송장 실행 result에도 발급·선택되지 않은 번호. 순서는 전송이 끝난 순, 같은 번호는 한 번만.
 * `reconciling`으로 멈춘 전송(제출은 됐지만 확인 못 함)은 성공이 아니므로 대상이 아니다 — 운영자가 confirm한 뒤에야 들어온다.
 */
export interface SellpiaTransferOutcomeView {
  finishedAt: Date;
  acceptedOrderNumbers: readonly string[];
}

export interface SellpiaInvoiceOutcomeView {
  /** 발급된 번호와 선택했으나 못 찾은 번호 모두 — 한 번 시도한 번호는 다시 고르지 않는다(비가역 보호). */
  attemptedOrderNumbers: readonly string[];
}

export function sellpiaInvoiceTargets(
  input: {
    transfers: readonly SellpiaTransferOutcomeView[];
    invoices: readonly SellpiaInvoiceOutcomeView[];
    now: Date;
    ttlMs?: number;
  },
): string[] {
  const ttl = input.ttlMs ?? SELLPIA_INVOICE_TARGET_TTL_MS;
  const cutoff = input.now.getTime() - ttl;
  const attempted = new Set<string>();
  for (const invoice of input.invoices) for (const orderNo of invoice.attemptedOrderNumbers) attempted.add(normalize(orderNo));
  const seen = new Set<string>();
  const targets: string[] = [];
  const fresh = input.transfers
    .filter((transfer) => transfer.finishedAt.getTime() >= cutoff && transfer.finishedAt.getTime() <= input.now.getTime())
    .sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime());
  for (const transfer of fresh) {
    for (const raw of transfer.acceptedOrderNumbers) {
      const orderNo = normalize(raw);
      if (!orderNo || seen.has(orderNo) || attempted.has(orderNo)) continue;
      seen.add(orderNo);
      targets.push(orderNo);
    }
  }
  return targets;
}

function normalize(orderNo: string): string {
  return orderNo.trim();
}
