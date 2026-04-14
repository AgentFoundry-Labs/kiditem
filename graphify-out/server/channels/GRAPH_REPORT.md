# Graph Report - apps/server/src/channels  (2026-04-14)

## Corpus Check
- Corpus is ~4,026 words - fits in a single context window. You may not need a graph.

## Summary
- 110 nodes · 112 edges · 19 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (24n)|Cluster 0 (24n)]]
- [[_COMMUNITY_Cluster 1 (12n)|Cluster 1 (12n)]]
- [[_COMMUNITY_Cluster 2 (12n)|Cluster 2 (12n)]]
- [[_COMMUNITY_Cluster 3 (10n)|Cluster 3 (10n)]]
- [[_COMMUNITY_Cluster 4 (9n)|Cluster 4 (9n)]]
- [[_COMMUNITY_Cluster 5 (7n)|Cluster 5 (7n)]]
- [[_COMMUNITY_Cluster 6 (7n)|Cluster 6 (7n)]]
- [[_COMMUNITY_Cluster 7 (6n)|Cluster 7 (6n)]]
- [[_COMMUNITY_Cluster 8 (5n)|Cluster 8 (5n)]]
- [[_COMMUNITY_Cluster 9 (4n)|Cluster 9 (4n)]]
- [[_COMMUNITY_Cluster 10 (3n)|Cluster 10 (3n)]]
- [[_COMMUNITY_Cluster 11 (2n)|Cluster 11 (2n)]]
- [[_COMMUNITY_Cluster 12 (2n)|Cluster 12 (2n)]]
- [[_COMMUNITY_Cluster 13 (2n)|Cluster 13 (2n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]
- [[_COMMUNITY_Cluster 16 (1n)|Cluster 16 (1n)]]
- [[_COMMUNITY_Cluster 17 (1n)|Cluster 17 (1n)]]
- [[_COMMUNITY_Cluster 18 (1n)|Cluster 18 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `Coupang Adapter (외부 API 격리)` - 14 edges
2. `ChannelSyncService` - 11 edges
3. `ChannelDashboardController` - 9 edges
4. `ChannelDashboardService` - 8 edges
5. `ChannelSyncController` - 6 edges
6. `$queryRaw — Dashboard 분석 전용` - 5 edges
7. `Company Isolation` - 5 edges
8. `services/channel-sync.service.ts` - 5 edges
9. `Status Mapping (Coupang → 내부 enum)` - 4 edges
10. `adapters/coupang/coupang-client.ts` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Sync 3종 (Products / Orders / Inventory)` --rationale_for--> `services/channel-sync.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 10 → community 0_
- `Health Check (Non-fatal)` --rationale_for--> `adapters/coupang/coupang-client.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 9 → community 0_

## Communities

### Community 0 - "Cluster 0 (24n)"
Cohesion: 0.09
Nodes (24): controllers/channel-sync.controller.ts, services/channel-sync.service.ts, adapters/coupang/constants.ts, adapters/coupang/coupang-client.ts, adapters/coupang/orders.ts, adapters/coupang/products.ts, Coupang Adapter (외부 API 격리), Status Mapping (Coupang → 내부 enum) (+16 more)

### Community 1 - "Cluster 1 (12n)"
Cohesion: 0.27
Nodes (1): ChannelSyncService

### Community 2 - "Cluster 2 (12n)"
Cohesion: 0.18
Nodes (12): controllers/channel-dashboard.controller.ts, services/channel-dashboard.service.ts, Company Isolation, $queryRaw — Dashboard 분석 전용, Cross-company raw 쿼리 금지 (companyId WHERE 필수), $queryRaw에 string concat 금지 (parameterized만), String concat 금지 — SQL injection 위험 방지, 모든 $queryRaw에 WHERE company_id 필수 (+4 more)

### Community 3 - "Cluster 3 (10n)"
Cohesion: 0.31
Nodes (1): ChannelDashboardController

### Community 4 - "Cluster 4 (9n)"
Cohesion: 0.22
Nodes (1): ChannelDashboardService

### Community 5 - "Cluster 5 (7n)"
Cohesion: 0.29
Nodes (0): 

### Community 6 - "Cluster 6 (7n)"
Cohesion: 0.29
Nodes (1): ChannelSyncController

### Community 7 - "Cluster 7 (6n)"
Cohesion: 0.33
Nodes (0): 

### Community 8 - "Cluster 8 (5n)"
Cohesion: 0.7
Nodes (4): coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId()

### Community 9 - "Cluster 9 (4n)"
Cohesion: 0.5
Nodes (4): Health Check (Non-fatal), 외부 API 다운 시 시스템 전체 fall-through 방지, checkHealth 에러 catch → connected:false 반환 (throw 안 함), getSellerProducts(maxPerPage:1)로 자격증명 검증

### Community 10 - "Cluster 10 (3n)"
Cohesion: 0.67
Nodes (3): Sync 3종 (Products / Orders / Inventory), Batch continue-on-error: 개별 실패해도 loop 계속, syncInventory는 DB-only 집계 (Coupang API 미호출)

### Community 11 - "Cluster 11 (2n)"
Cohesion: 1.0
Nodes (1): ChannelsModule

### Community 12 - "Cluster 12 (2n)"
Cohesion: 1.0
Nodes (1): SyncOrdersBodyDto

### Community 13 - "Cluster 13 (2n)"
Cohesion: 1.0
Nodes (1): CoupangDateRangeQueryDto

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Cluster 16 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Cluster 17 (1n)"
Cohesion: 1.0
Nodes (1): services/types.ts

### Community 18 - "Cluster 18 (1n)"
Cohesion: 1.0
Nodes (1): channels.module.ts

## Knowledge Gaps
- **31 isolated node(s):** `ChannelsModule`, `SyncOrdersBodyDto`, `CoupangDateRangeQueryDto`, `모든 Coupang API 호출은 adapters/coupang/만 거침`, `인증은 HmacSHA256 signature로 처리` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 11 (2n)`** (2 nodes): `ChannelsModule`, `channels.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (2n)`** (2 nodes): `sync-orders.dto.ts`, `SyncOrdersBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (2n)`** (2 nodes): `CoupangDateRangeQueryDto`, `coupang-date-range.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 17 (1n)`** (1 nodes): `services/types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (1n)`** (1 nodes): `channels.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `services/channel-sync.service.ts` connect `Cluster 0 (24n)` to `Cluster 10 (3n)`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `adapters/coupang/coupang-client.ts` connect `Cluster 0 (24n)` to `Cluster 9 (4n)`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `Coupang Adapter (외부 API 격리)` (e.g. with `adapters/coupang/coupang-client.ts` and `adapters/coupang/constants.ts`) actually correct?**
  _`Coupang Adapter (외부 API 격리)` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ChannelsModule`, `SyncOrdersBodyDto`, `CoupangDateRangeQueryDto` to the rest of the system?**
  _31 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cluster 0 (24n)` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._