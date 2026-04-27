# dashboard — Massive Parallel Aggregation + KST Boundary

> **Market-data hard rewrite 완료 (2026-04-27)**: dashboard 광고/트래픽 KPI 는 legacy `ads` / `ad_snapshots` / `traffic_stats` 를 읽지 않는다. 광고 spend/revenue/click/impression/conversion 은 `ChannelListingDailySnapshot.ad*`, Wing/Coupang account KPI 는 `ChannelAccountDailyKpiSnapshot`, raw scrape 감사 데이터는 `ChannelScrapeSnapshot` 이 기준이다. DB schema correctness 의 source of truth 는 Prisma schema + service code 이고, Graphify output 은 navigation artifact 로만 사용한다.

7 파일. **11+ 병렬 쿼리 + KST timezone normalization + month-over-month 비교** 가 단일 service 안에 압축.

## Directory

```
dashboard/
├── dashboard.controller.ts
├── dashboard.service.ts     # 핵심
├── dashboard.module.ts
├── types.ts                 # DateRangeContext, EffectiveMetrics, AdMetricsSnapshot 등
└── dto/                     # 2 DTO
```

## Routes

| Route | 책임 |
|---|---|
| `GET /api/dashboard` | summary KPI (today/month revenue, alerts, inventory, profit trend, ad metrics) |
| `GET /api/dashboard/trend` | 월별 P&L + ad ROAS 트렌드 |

## 핵심 패턴

### 1. Massive Parallel — Promise.all() 11+ queries

dashboard.service.ts:27-102 — orders / P&L / inventory / alerts / grades / ads 등 11개 쿼리를 단일 Promise.all 로 실행. 

**개별 쿼리 추가 시 Promise.all 길이 + types.ts 응답 타입 동시 갱신**.

### 2. KST 경계 정규화

dashboard.service.ts:15 — `kstDayStart()` (from common) 사용. **UTC 가 아니라 KST 자정** 기준으로 today 경계 잡음. 한국 사용자 시간대 일치.

### 3. Month-over-Month Snapshot

dashboard.service.ts:19-25 — current month + previous month 두 snapshot 유지. 트렌드 KPI (이번 달 대비 % 증감) 계산용.

### 4. Ad Metrics — daily facts

dashboard/helpers 와 trend 서비스는 `ChannelListingDailySnapshot` 의 `ad*` 컬럼을 KST businessDate 기준으로 aggregate 한다. ratio(ROAS/CTR/CVR)는 저장된 provider ratio 를 신뢰하지 않고 numerator/denominator 합계에서 재계산한다.

### 5. Inventory Reorder Point — 앱 레이어 계산

DB 필터 아니라 fetch 후 JS 에서 `currentStock < reorderPoint` 비교. 동적 reorder point 가 DB column 아닌 계산 필드라서.

## Rules

- Summary 는 **항상 current month + today** snapshot (date range override 미지원)
- Ad metrics 는 `ChannelListingDailySnapshot.ad*` daily fact
- 알림은 top-10, recency 정렬
- Grade breakdown 은 active products 만 카운트
- KST 경계 사용 (UTC 절대 금지 — 한국 사용자)

## Prohibits

- ❌ Summary 에 custom date range (trend endpoint 따로 사용)
- ❌ UTC 경계 (KST 강제)
- ❌ alert filter by type in summary (단순 top-10)

## Cross-domain deps

- **common** — `kstDayStart`, `resolvePricing`
- **prisma** — 모든 도메인 테이블 read

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| 새 KPI 추가 | `services/dashboard.service.ts:27-102` (Promise.all 추가) + `types.ts` (응답 인터페이스) + 프론트 dashboard 페이지 |
| Date 경계 변경 | `common/kstDayStart.ts` (helper) + 모든 호출자 (dashboard, finance, profit-loss 등) |
| Ad metrics 출처 변경 | `helpers/ad-aggregator.ts`, `helpers/profit-calculator.ts`, `services/dashboard-trend.service.ts` + `ChannelListingDailySnapshot` schema |
| Trend 기간 변경 | `dashboard-trend.dto.ts` + service 의 month iteration 로직 |
