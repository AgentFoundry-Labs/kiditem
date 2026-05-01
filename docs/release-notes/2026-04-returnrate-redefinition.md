# Return Rate 계산 방식 변경 — 2026-04-20

**영향**: 대시보드 "반품률" 수치가 기존과 달라집니다.
**관련 정책**: returnRate semantic. Historical ADR scratch docs were pruned
during instruction cleanup; durable contracts now live in `AGENTS.md`, scoped
`AGENTS.md` files, and this release note.

## 무엇이 바뀌었나

### 이전 (버그)

반품률 = (**이 기간** 발생한 반품) ÷ (**이 기간** 주문 수)

- 3월 주문 → 4월 반품 → 4월 반품률의 분자에 들어감 (하지만 4월 분모엔 없음) → 반품률 100% 초과 가능 상태
- 원본 주문을 알 수 없는 고아 반품도 분자에 포함

### 이후 (ADR-0017)

반품률 = (**이 기간 주문** 중 반품된 건) ÷ (**이 기간** 주문 수)

- 분자·분모 모두 "이 기간 주문된 건" 집합 기준 → 반품률 ≤ 100% 보장
- 원본 주문 없는 고아 반품은 **"원본 주문 없는 반품"** 별도 지표로 노출

## 수치 변화 예시 (2026-02 샘플 organization)

> DB 접근 불가 — 아래 수치는 실제 production snapshot 으로 배포 전 교체 필요.

| 지표 | Before (bug) | After (ADR-0017) |
|---|---|---|
| 분자 (returns) | (샘플 수치 — 실제 production snapshot 으로 배포 전 교체) | (샘플 수치 — 실제 production snapshot 으로 배포 전 교체) |
| 분모 (orders)  | (샘플 수치 — 실제 production snapshot 으로 배포 전 교체) | (샘플 수치 — 실제 production snapshot 으로 배포 전 교체) |
| 반품률 | (샘플 수치 — 실제 production snapshot 으로 배포 전 교체) | (샘플 수치 — 실제 production snapshot 으로 배포 전 교체) |
| 고아 반품 (신규 필드) | N/A | (샘플 수치 — 실제 production snapshot 으로 배포 전 교체) |

배포 전 아래 쿼리로 실제 수치를 채워 넣으세요:

```sql
WITH candidate AS (
  SELECT o.organization_id, COUNT(*) AS o_cnt
  FROM orders o
  WHERE o.ordered_at >= '2026-02-01' AND o.ordered_at < '2026-03-01'
  GROUP BY o.organization_id HAVING COUNT(*) >= 10
  ORDER BY o_cnt DESC LIMIT 1
)
SELECT
  c.organization_id,
  (SELECT COUNT(*) FROM order_returns orr
     WHERE orr.organization_id = c.organization_id
     AND orr.requested_at >= '2026-02-01' AND orr.requested_at < '2026-03-01') AS old_num,
  (SELECT COUNT(*) FROM orders o
     WHERE o.organization_id = c.organization_id
     AND o.ordered_at >= '2026-02-01' AND o.ordered_at < '2026-03-01') AS denom,
  (SELECT COUNT(*) FROM order_returns orr
     INNER JOIN orders o ON orr.order_id = o.id
     WHERE o.organization_id = c.organization_id
     AND o.ordered_at >= '2026-02-01' AND o.ordered_at < '2026-03-01') AS new_num,
  (SELECT COUNT(*) FROM order_returns
     WHERE organization_id = c.organization_id
     AND order_id IS NULL
     AND requested_at >= '2026-02-01' AND requested_at < '2026-03-01') AS orphan
FROM candidate c;
```

## MoM / YoY 비교 주의사항

과거 대시보드 캡처와 수치가 다를 수 있습니다:
- 2026-04-20 이전 캡처는 **이전 semantic** 기준
- 2026-04-20 이후 조회는 **신규 semantic** 기준

월간 동일 기간 비교 시 이 차이에 주의하세요. 과거 데이터도 신규 semantic 으로 일관되게 조회됩니다 (Plan E 에서 ProfitLoss snapshot 이 복원될 때까지 month-close 회계 목적은 별도 저장 권장).

## Late return 발생 시

주문 후 수 개월 뒤 반품이 발생하면 과거 period 반품률이 retrospectively 변할 수 있습니다 (live 집계 특성). 월말 회계가 필요하면 월별 snapshot 을 별도 보관하세요.

## 신규 지표: "원본 주문 없는 반품" (orphanReturnCount)

원본 주문을 알 수 없는 반품 (`OrderReturn.orderId IS NULL`) 은 **메인 반품률 계산에서 제외됩니다**. 대신 요약 카드에 별도 배지로 표시될 예정입니다 (프론트엔드 적용은 Plan E.1 — coupang pages boost). 원인:
- 원본 주문이 DB 에서 삭제됨 (cascade)
- 과거 sync 시점 order-return 매칭 실패

고아 건수가 많으면 데이터 정합성 조사가 필요합니다 (판매자 문의 대응 우선).

## 기술 배경 (개발팀 대상)

- 수정 대상: `channel-dashboard.service.getReturnSummary`
- 새 semantic: Prisma relation filter (`order: { organizationId, orderedAt }`) — 기간 필터는 `orders.ordered_at` 기준
- 2-hop IDOR defense: `organizationId` 를 `orderReturn` + 조인된 `order` 양쪽에 적용 (ADR-0006 준수)
- `ReturnSummary` 타입에 `orphanReturnCount: number` 필드 추가 (`@kiditem/shared` ReturnSummarySchema Zod 신설)

기존 동일 semantic 이름을 쓰는 `sales-analysis.service:70` 는 D.3 (live aggregation 전환 시) 에서 같이 수렴됩니다 (ADR-0017 § Scope boundaries). D.3 전까지 `channel-dashboard.returnRate` (live 실측) 와 `sales-analysis.returnRate` (ProfitLoss 테이블 미기재로 0) 값이 다를 수 있으나, 두 지표가 같은 UI 에 함께 노출되는 위치는 없습니다.

## 문의

- Historical ADR scratch doc was pruned during instruction cleanup.
- 구현 PR: (Plan D.2 merge 시 PR 링크 추가)
- 개발팀 Slack / GitHub issue
