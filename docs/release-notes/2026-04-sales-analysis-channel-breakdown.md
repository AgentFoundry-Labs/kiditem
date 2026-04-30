# Sales Analysis — 채널별 분석 실제 데이터 노출 (2026-04-20)

**영향**: `/api/sales-analysis` 응답 구조 변경. SalesOverview 탭이 처음으로 실제 채널별 breakdown 표시.

**관련 정책**: ProfitLoss bypass, returnRate semantic. Historical ADR scratch
docs were pruned during instruction cleanup; durable contracts now live in
`AGENTS.md`, scoped `AGENTS.md` files, and this release note.

## 무엇이 바뀌었나

### 이전 (stub)

- `sales-analysis.service.getAnalysis` 가 `profitLoss.groupBy({ by: ['companyId'] })` 로 1-row 반환 (ProfitLoss 테이블 writer 없음 → 모든 수치 0)
- SalesOverview 탭 = 비어있는 UI

### 이후 (Plan D.3, live aggregation)

- **채널별 grouping**: `ChannelListing.channel` (coupang / naver / wing / ...) 기준 N-row 응답
- **Live aggregation**: Order + OrderLineItem + OrderReturnLineItem + Ad 실시간 집계 (ProfitLoss 테이블 bypass)
- **ADR-0017 returnRate**: "이 기간 주문 중 반품된 비율" (distinct order count, INNER JOIN)
- **orphanReturnCount** side metric (totals 레벨, 채널 매핑 불가한 반품)

## 응답 shape 변경

```jsonc
// Before
{ period, channels: [{ channelName: "회사 이름", ... }], totals: { ... } }  // channels.length = 1 always, 값 0

// After (Plan D.3)
{
  "period": "2026-04",
  "channels": [
    { "channel": "coupang", "channelType": "marketplace", "totalOrders": 150, "totalRevenue": 5000000 },
    { "channel": "naver", "channelType": "marketplace", "totalOrders": 80, "totalRevenue": 2500000 }
  ],
  "totals": { "totalRevenue": 7500000, "totalProfit": 1200000, "totalOrders": 230, "totalCost": 6300000, "orphanReturnCount": 3 }
}
```

필드 rename: `channels[].channelName` → `channels[].channel` (값 의미도 display title → platform 식별자로 변경).

## MoM / YoY 비교 주의

이전 대시보드 캡처는 모두 0 이었음 → D.3 이후가 **첫 의미있는 수치**. 과거와 비교 불가 (baseline 없음).

## orphanReturnCount 해석

`OrderReturn.orderId IS NULL` 인 반품 (sync 불일치 / order hard-delete 흔적) 은 channel 매핑 불가 → **totals.orphanReturnCount** 에만 반영. 운영팀 데이터 정합성 조사 지표로 활용. 주문-반품 연결 불가가 지속 증가하면 sync 파이프라인 점검 필요.

## 기술 배경

- Service: `apps/server/src/finance/services/sales-analysis.service.ts` — live aggregation with 3-hop IDOR (`OrderReturnLineItem.companyId` + `return.companyId` + `return.order.companyId`)
- Test: `apps/server/src/finance/services/__tests__/sales-analysis.pg.integration.spec.ts` — 8 cases including KST boundary + 1000-order perf
- Schema: `@kiditem/shared/schemas/sales-analysis` — `SalesAnalysisDataSchema` + `ChannelAnalysisSchema`
- Frontend: `apps/web/src/app/sales-analysis/components/SalesOverview.tsx` — apiClient.getParsed + URL period + 3-state
- Follow-up: statistics/settlements/sales-plans 도 같은 패턴으로 migration.

## 문의

- Historical plan/ADR scratch docs were pruned during instruction cleanup.
- 개발팀 Slack / GitHub issue
