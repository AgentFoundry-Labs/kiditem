# Graph Report - apps/server/src/finance  (2026-04-14)

## Corpus Check
- Corpus is ~1,924 words - fits in a single context window. You may not need a graph.

## Summary
- 48 nodes · 39 edges · 17 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (6n)|Cluster 0 (6n)]]
- [[_COMMUNITY_Cluster 1 (5n)|Cluster 1 (5n)]]
- [[_COMMUNITY_Cluster 2 (5n)|Cluster 2 (5n)]]
- [[_COMMUNITY_Cluster 3 (4n)|Cluster 3 (4n)]]
- [[_COMMUNITY_Cluster 4 (4n)|Cluster 4 (4n)]]
- [[_COMMUNITY_Cluster 5 (4n)|Cluster 5 (4n)]]
- [[_COMMUNITY_Cluster 6 (4n)|Cluster 6 (4n)]]
- [[_COMMUNITY_Cluster 7 (4n)|Cluster 7 (4n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (2n)|Cluster 10 (2n)]]
- [[_COMMUNITY_Cluster 11 (1n)|Cluster 11 (1n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]
- [[_COMMUNITY_Cluster 16 (1n)|Cluster 16 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `services/profit-loss.service.ts` - 6 edges
2. `ProfitLossService` - 5 edges
3. `$queryRaw Cross-table 집계` - 5 edges
4. `Period 파싱 YYYY-MM` - 5 edges
5. `services/sales-analysis.service.ts` - 5 edges
6. `ProfitLossController` - 3 edges
7. `SalesAnalysisController` - 3 edges
8. `SalesAnalysisService` - 3 edges
9. `resolvePricing 적용` - 3 edges
10. `Channel 집계 via groupBy` - 2 edges

## Surprising Connections (you probably didn't know these)
- `$queryRaw Cross-table 집계` --rationale_for--> `services/profit-loss.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 7 → community 1_
- `$queryRaw Cross-table 집계` --rationale_for--> `services/sales-analysis.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 7 → community 2_
- `Period 파싱 YYYY-MM` --rationale_for--> `services/profit-loss.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 6 → community 1_
- `Period 파싱 YYYY-MM` --rationale_for--> `services/sales-analysis.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 6 → community 2_
- `services/profit-loss.service.ts` --modification_triggers--> `__tests__/pl-flow.spec.ts`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 1 → community 2_

## Communities

### Community 0 - "Cluster 0 (6n)"
Cohesion: 0.47
Nodes (1): ProfitLossService

### Community 1 - "Cluster 1 (5n)"
Cohesion: 0.5
Nodes (5): dto/ (query DTO), common/master-product-resolver.ts, services/profit-loss.service.ts, resolvePricing 적용, 모든 monetary 값은 integer (KRW)

### Community 2 - "Cluster 2 (5n)"
Cohesion: 0.4
Nodes (5): __tests__/pl-flow.spec.ts, prisma/schema.prisma, services/sales-analysis.service.ts, Channel 집계 via groupBy, Return/Profit rate는 클라이언트에서 계산

### Community 3 - "Cluster 3 (4n)"
Cohesion: 0.5
Nodes (1): ProfitLossController

### Community 4 - "Cluster 4 (4n)"
Cohesion: 0.5
Nodes (1): SalesAnalysisController

### Community 5 - "Cluster 5 (4n)"
Cohesion: 0.5
Nodes (1): SalesAnalysisService

### Community 6 - "Cluster 6 (4n)"
Cohesion: 0.5
Nodes (4): Period 파싱 YYYY-MM, Date range query 금지 (월 단위 강제), Period default: 현재 월, 기간은 YYYY-MM 만 (date range 미지원)

### Community 7 - "Cluster 7 (4n)"
Cohesion: 0.5
Nodes (4): $queryRaw Cross-table 집계, 서비스에서 profit 재계산 금지, $queryRaw string concat 금지 (parameterized only), profit은 DB profitLoss 테이블 값 사용

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (1): FinanceModule

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (1): SalesAnalysisQueryDto

### Community 10 - "Cluster 10 (2n)"
Cohesion: 1.0
Nodes (1): ProfitLossQueryDto

### Community 11 - "Cluster 11 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (1): Prisma 표준 API로 cross-table 조인 불가

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): SQL Injection 방지를 위한 parameterized binding

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (1): master product fallback 가격 반영 필요

### Community 16 - "Cluster 16 (1n)"
Cohesion: 1.0
Nodes (1): finance.module.ts

## Knowledge Gaps
- **17 isolated node(s):** `FinanceModule`, `SalesAnalysisQueryDto`, `ProfitLossQueryDto`, `기간은 YYYY-MM 만 (date range 미지원)`, `모든 monetary 값은 integer (KRW)` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `FinanceModule`, `finance.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `sales-analysis-query.dto.ts`, `SalesAnalysisQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (2n)`** (2 nodes): `profit-loss-query.dto.ts`, `ProfitLossQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `Prisma 표준 API로 cross-table 조인 불가`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `SQL Injection 방지를 위한 parameterized binding`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `master product fallback 가격 반영 필요`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (1n)`** (1 nodes): `finance.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `services/profit-loss.service.ts` connect `Cluster 1 (5n)` to `Cluster 2 (5n)`, `Cluster 6 (4n)`, `Cluster 7 (4n)`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `services/sales-analysis.service.ts` connect `Cluster 2 (5n)` to `Cluster 6 (4n)`, `Cluster 7 (4n)`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `$queryRaw Cross-table 집계` connect `Cluster 7 (4n)` to `Cluster 1 (5n)`, `Cluster 2 (5n)`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `services/profit-loss.service.ts` (e.g. with `$queryRaw Cross-table 집계` and `Period 파싱 YYYY-MM`) actually correct?**
  _`services/profit-loss.service.ts` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `$queryRaw Cross-table 집계` (e.g. with `services/profit-loss.service.ts` and `services/sales-analysis.service.ts`) actually correct?**
  _`$queryRaw Cross-table 집계` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Period 파싱 YYYY-MM` (e.g. with `services/profit-loss.service.ts` and `services/sales-analysis.service.ts`) actually correct?**
  _`Period 파싱 YYYY-MM` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `services/sales-analysis.service.ts` (e.g. with `$queryRaw Cross-table 집계` and `Period 파싱 YYYY-MM`) actually correct?**
  _`services/sales-analysis.service.ts` has 3 INFERRED edges - model-reasoned connections that need verification._