# Graph Report - apps/server/src/dashboard  (2026-04-14)

## Corpus Check
- Corpus is ~4,586 words - fits in a single context window. You may not need a graph.

## Summary
- 51 nodes · 45 edges · 16 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (9n)|Cluster 0 (9n)]]
- [[_COMMUNITY_Cluster 1 (8n)|Cluster 1 (8n)]]
- [[_COMMUNITY_Cluster 2 (7n)|Cluster 2 (7n)]]
- [[_COMMUNITY_Cluster 3 (6n)|Cluster 3 (6n)]]
- [[_COMMUNITY_Cluster 4 (5n)|Cluster 4 (5n)]]
- [[_COMMUNITY_Cluster 5 (3n)|Cluster 5 (3n)]]
- [[_COMMUNITY_Cluster 6 (2n)|Cluster 6 (2n)]]
- [[_COMMUNITY_Cluster 7 (2n)|Cluster 7 (2n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (1n)|Cluster 9 (1n)]]
- [[_COMMUNITY_Cluster 10 (1n)|Cluster 10 (1n)]]
- [[_COMMUNITY_Cluster 11 (1n)|Cluster 11 (1n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `dashboard.service.ts` - 10 edges
2. `DashboardService` - 8 edges
3. `KST 경계 정규화` - 5 edges
4. `DashboardController` - 4 edges
5. `Massive Parallel — Promise.all() 11+ queries` - 4 edges
6. `Month-over-Month Snapshot` - 4 edges
7. `Ad Metrics — $queryRaw` - 4 edges
8. `Inventory Reorder Point — 앱 레이어 계산` - 3 edges
9. `common/kstDayStart.ts` - 3 edges
10. `Summary 는 항상 current month + today snapshot` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Massive Parallel — Promise.all() 11+ queries` --rationale_for--> `dashboard.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 2 → community 1_
- `KST 경계 정규화` --rationale_for--> `dashboard.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 3 → community 1_
- `Inventory Reorder Point — 앱 레이어 계산` --rationale_for--> `dashboard.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 5 → community 1_

## Communities

### Community 0 - "Cluster 0 (9n)"
Cohesion: 0.33
Nodes (1): DashboardService

### Community 1 - "Cluster 1 (8n)"
Cohesion: 0.29
Nodes (8): ads 테이블 schema, dashboard.service.ts, dashboard-trend.dto.ts, 프론트 dashboard 페이지, types.ts, Ad Metrics — $queryRaw, Prisma aggregate 가 NULL 처리 부족해 raw SQL 필요, Ad metrics 는 ads 테이블 (NOT profitLoss.adCost)

### Community 2 - "Cluster 2 (7n)"
Cohesion: 0.29
Nodes (7): Massive Parallel — Promise.all() 11+ queries, Month-over-Month Snapshot, alert filter by type in summary 금지, Summary 에 custom date range 금지, 트렌드 KPI (이번 달 대비 % 증감) 계산용 이중 스냅샷, 개별 쿼리 추가 시 Promise.all 길이 + types.ts 응답 타입 동시 갱신, Summary 는 항상 current month + today snapshot

### Community 3 - "Cluster 3 (6n)"
Cohesion: 0.33
Nodes (6): common/kstDayStart.ts, finance / profit-loss 호출자, KST 경계 정규화, UTC 경계 금지 (KST 강제), 한국 사용자 시간대 일치 위해 KST 자정 기준, KST 경계 사용 (UTC 절대 금지)

### Community 4 - "Cluster 4 (5n)"
Cohesion: 0.4
Nodes (1): DashboardController

### Community 5 - "Cluster 5 (3n)"
Cohesion: 0.67
Nodes (3): Inventory Reorder Point — 앱 레이어 계산, 동적 reorder point 가 DB column 아닌 계산 필드라 앱에서 비교, 알림은 top-10, recency 정렬

### Community 6 - "Cluster 6 (2n)"
Cohesion: 1.0
Nodes (1): DashboardModule

### Community 7 - "Cluster 7 (2n)"
Cohesion: 1.0
Nodes (1): DashboardSummaryQueryDto

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (1): DashboardTrendQueryDto

### Community 9 - "Cluster 9 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Cluster 10 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Cluster 11 (1n)"
Cohesion: 1.0
Nodes (1): Grade breakdown 은 active products 만 카운트

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (1): dashboard.controller.ts

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (1): dashboard.module.ts

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): dto/ (DashboardTrendDto 등)

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (1): common/resolvePricing

## Knowledge Gaps
- **23 isolated node(s):** `DashboardModule`, `DashboardSummaryQueryDto`, `DashboardTrendQueryDto`, `Ad metrics 는 ads 테이블 (NOT profitLoss.adCost)`, `알림은 top-10, recency 정렬` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 6 (2n)`** (2 nodes): `DashboardModule`, `dashboard.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 7 (2n)`** (2 nodes): `DashboardSummaryQueryDto`, `dashboard-summary-query.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `DashboardTrendQueryDto`, `dashboard-trend.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (1n)`** (1 nodes): `Grade breakdown 은 active products 만 카운트`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `dashboard.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `dashboard.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `dto/ (DashboardTrendDto 등)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `common/resolvePricing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dashboard.service.ts` connect `Cluster 1 (8n)` to `Cluster 2 (7n)`, `Cluster 3 (6n)`, `Cluster 5 (3n)`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Why does `KST 경계 정규화` connect `Cluster 3 (6n)` to `Cluster 1 (8n)`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `Massive Parallel — Promise.all() 11+ queries` connect `Cluster 2 (7n)` to `Cluster 1 (8n)`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `dashboard.service.ts` (e.g. with `Massive Parallel — Promise.all() 11+ queries` and `KST 경계 정규화`) actually correct?**
  _`dashboard.service.ts` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `KST 경계 정규화` (e.g. with `dashboard.service.ts` and `common/kstDayStart.ts`) actually correct?**
  _`KST 경계 정규화` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `DashboardModule`, `DashboardSummaryQueryDto`, `DashboardTrendQueryDto` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._