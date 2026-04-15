# Graph Report - apps/server/src/orders  (2026-04-14)

## Corpus Check
- Corpus is ~2,143 words - fits in a single context window. You may not need a graph.

## Summary
- 77 nodes · 61 edges · 20 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (12n)|Cluster 0 (12n)]]
- [[_COMMUNITY_Cluster 1 (8n)|Cluster 1 (8n)]]
- [[_COMMUNITY_Cluster 2 (7n)|Cluster 2 (7n)]]
- [[_COMMUNITY_Cluster 3 (7n)|Cluster 3 (7n)]]
- [[_COMMUNITY_Cluster 4 (7n)|Cluster 4 (7n)]]
- [[_COMMUNITY_Cluster 5 (6n)|Cluster 5 (6n)]]
- [[_COMMUNITY_Cluster 6 (5n)|Cluster 6 (5n)]]
- [[_COMMUNITY_Cluster 7 (5n)|Cluster 7 (5n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (2n)|Cluster 10 (2n)]]
- [[_COMMUNITY_Cluster 11 (2n)|Cluster 11 (2n)]]
- [[_COMMUNITY_Cluster 12 (2n)|Cluster 12 (2n)]]
- [[_COMMUNITY_Cluster 13 (2n)|Cluster 13 (2n)]]
- [[_COMMUNITY_Cluster 14 (2n)|Cluster 14 (2n)]]
- [[_COMMUNITY_Cluster 15 (2n)|Cluster 15 (2n)]]
- [[_COMMUNITY_Cluster 16 (1n)|Cluster 16 (1n)]]
- [[_COMMUNITY_Cluster 17 (1n)|Cluster 17 (1n)]]
- [[_COMMUNITY_Cluster 18 (1n)|Cluster 18 (1n)]]
- [[_COMMUNITY_Cluster 19 (1n)|Cluster 19 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `OrdersService` - 7 edges
2. `OrdersController` - 6 edges
3. `ReturnsController` - 6 edges
4. `ReturnsService` - 6 edges
5. `CsService` - 5 edges
6. `외부 채널 어댑터 위임 (Coupang adapter)` - 5 edges
7. `CsController` - 4 edges
8. `Multi-controller 모듈 (orders/returns/cs 통합)` - 4 edges
9. `Status 기반 필터링 (predefined enum)` - 4 edges
10. `services/orders.service.ts` - 4 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Cluster 0 (12n)"
Cohesion: 0.2
Nodes (12): channels/adapters/coupang/constants.ts, channels/adapters/coupang/orders.ts, dto/order-action.dto.ts, services/orders.service.ts, services/returns.service.ts, 외부 채널 어댑터 위임 (Coupang adapter), Status 기반 필터링 (predefined enum), DTO 변환 단계에서 집계 로직 금지 (+4 more)

### Community 1 - "Cluster 1 (8n)"
Cohesion: 0.25
Nodes (1): OrdersService

### Community 2 - "Cluster 2 (7n)"
Cohesion: 0.29
Nodes (1): OrdersController

### Community 3 - "Cluster 3 (7n)"
Cohesion: 0.29
Nodes (1): ReturnsController

### Community 4 - "Cluster 4 (7n)"
Cohesion: 0.29
Nodes (1): ReturnsService

### Community 5 - "Cluster 5 (6n)"
Cohesion: 0.47
Nodes (1): CsService

### Community 6 - "Cluster 6 (5n)"
Cohesion: 0.4
Nodes (1): CsController

### Community 7 - "Cluster 7 (5n)"
Cohesion: 0.4
Nodes (5): orders.module.ts, Multi-controller 모듈 (orders/returns/cs 통합), 별도 mutation endpoint 생성 금지, Returns/CS 는 pagination 필수 (limit/page params), 모든 주문 mutation은 POST /api/orders 단일 endpoint + action enum

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (1): OrdersModule

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (1): ReturnActionBodyDto

### Community 10 - "Cluster 10 (2n)"
Cohesion: 1.0
Nodes (1): ListReturnsQueryDto

### Community 11 - "Cluster 11 (2n)"
Cohesion: 1.0
Nodes (1): ListCsQueryDto

### Community 12 - "Cluster 12 (2n)"
Cohesion: 1.0
Nodes (1): OrderActionBodyDto

### Community 13 - "Cluster 13 (2n)"
Cohesion: 1.0
Nodes (1): CreateCsBodyDto

### Community 14 - "Cluster 14 (2n)"
Cohesion: 1.0
Nodes (1): ListOrdersQueryDto

### Community 15 - "Cluster 15 (2n)"
Cohesion: 1.0
Nodes (2): common/pagination.ts, services/cs.service.ts

### Community 16 - "Cluster 16 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Cluster 17 (1n)"
Cohesion: 1.0
Nodes (1): Cross-service 의존 없음 - 향후 분리 가능하나 현재 묶임

### Community 18 - "Cluster 18 (1n)"
Cohesion: 1.0
Nodes (1): DB 갱신이 아니라 channels.adapters.coupang 호출로 외부 연동 격리

### Community 19 - "Cluster 19 (1n)"
Cohesion: 1.0
Nodes (1): channels/constants.ts와 동일 enum 유지 (sync 필요)

## Knowledge Gaps
- **22 isolated node(s):** `OrdersModule`, `ReturnActionBodyDto`, `ListReturnsQueryDto`, `ListCsQueryDto`, `OrderActionBodyDto` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `OrdersModule`, `orders.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `return-action.dto.ts`, `ReturnActionBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (2n)`** (2 nodes): `list-returns.dto.ts`, `ListReturnsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (2n)`** (2 nodes): `list-cs.dto.ts`, `ListCsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (2n)`** (2 nodes): `order-action.dto.ts`, `OrderActionBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (2n)`** (2 nodes): `CreateCsBodyDto`, `create-cs.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (2n)`** (2 nodes): `list-orders.dto.ts`, `ListOrdersQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (2n)`** (2 nodes): `common/pagination.ts`, `services/cs.service.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 17 (1n)`** (1 nodes): `Cross-service 의존 없음 - 향후 분리 가능하나 현재 묶임`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (1n)`** (1 nodes): `DB 갱신이 아니라 channels.adapters.coupang 호출로 외부 연동 격리`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 19 (1n)`** (1 nodes): `channels/constants.ts와 동일 enum 유지 (sync 필요)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `OrdersModule`, `ReturnActionBodyDto`, `ListReturnsQueryDto` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._