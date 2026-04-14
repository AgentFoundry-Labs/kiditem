# Graph Report - apps/server/src/marketplace  (2026-04-14)

## Corpus Check
- Corpus is ~1,447 words - fits in a single context window. You may not need a graph.

## Summary
- 51 nodes · 43 edges · 11 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (12n)|Cluster 0 (12n)]]
- [[_COMMUNITY_Cluster 1 (11n)|Cluster 1 (11n)]]
- [[_COMMUNITY_Cluster 2 (11n)|Cluster 2 (11n)]]
- [[_COMMUNITY_Cluster 3 (5n)|Cluster 3 (5n)]]
- [[_COMMUNITY_Cluster 4 (3n)|Cluster 4 (3n)]]
- [[_COMMUNITY_Cluster 5 (2n)|Cluster 5 (2n)]]
- [[_COMMUNITY_Cluster 6 (2n)|Cluster 6 (2n)]]
- [[_COMMUNITY_Cluster 7 (2n)|Cluster 7 (2n)]]
- [[_COMMUNITY_Cluster 8 (1n)|Cluster 8 (1n)]]
- [[_COMMUNITY_Cluster 9 (1n)|Cluster 9 (1n)]]
- [[_COMMUNITY_Cluster 10 (1n)|Cluster 10 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `MarketplaceController` - 10 edges
2. `MarketplaceService` - 10 edges
3. `marketplace.service.ts` - 8 edges
4. `Catalog + Installation Tracking` - 5 edges
5. `Parametrized Install — Param Override` - 5 edges
6. `Trigger Type 자동 감지` - 3 edges
7. `installCount 증감` - 2 edges
8. `prisma/schema.prisma` - 2 edges
9. `MarketplaceModule` - 1 edges
10. `ListMarketplaceQueryDto` - 1 edges

## Surprising Connections (you probably didn't know these)
- `Parametrized Install — Param Override` --rationale_for--> `marketplace.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 3 → community 2_
- `Trigger Type 자동 감지` --rationale_for--> `marketplace.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 4 → community 2_

## Communities

### Community 0 - "Cluster 0 (12n)"
Cohesion: 0.17
Nodes (1): MarketplaceService

### Community 1 - "Cluster 1 (11n)"
Cohesion: 0.18
Nodes (1): MarketplaceController

### Community 2 - "Cluster 2 (11n)"
Cohesion: 0.2
Nodes (11): catalog seed (marketplace 테이블), 프론트 install modal, marketplace.service.ts, prisma/schema.prisma, workflowTemplate.triggerType enum, Catalog + Installation Tracking, installCount 증감, Marketplace 테이블 직접 update 금지 (+3 more)

### Community 3 - "Cluster 3 (5n)"
Cohesion: 0.4
Nodes (5): dto/ (list, install), Parametrized Install — Param Override, Install 시 nodesJson 전체 override 금지 (configurableParams 만 허용), 카탈로그 원본은 그대로, 회사별 설치본만 커스터마이즈, Module default 'order' if not in catalog

### Community 4 - "Cluster 4 (3n)"
Cohesion: 0.67
Nodes (3): Trigger Type 자동 감지, 사용자가 trigger type 직접 지정 금지, Trigger type은 params.schedule 유무로 결정

### Community 5 - "Cluster 5 (2n)"
Cohesion: 1.0
Nodes (1): MarketplaceModule

### Community 6 - "Cluster 6 (2n)"
Cohesion: 1.0
Nodes (1): ListMarketplaceQueryDto

### Community 7 - "Cluster 7 (2n)"
Cohesion: 1.0
Nodes (1): InstallMarketplaceBodyDto

### Community 8 - "Cluster 8 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Cluster 9 (1n)"
Cohesion: 1.0
Nodes (1): marketplace.controller.ts

### Community 10 - "Cluster 10 (1n)"
Cohesion: 1.0
Nodes (1): marketplace.module.ts

## Knowledge Gaps
- **18 isolated node(s):** `MarketplaceModule`, `ListMarketplaceQueryDto`, `InstallMarketplaceBodyDto`, `카탈로그는 read-only (DB 직접 update 금지)`, `Module default 'order' if not in catalog` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 5 (2n)`** (2 nodes): `MarketplaceModule`, `marketplace.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 6 (2n)`** (2 nodes): `list-marketplace.dto.ts`, `ListMarketplaceQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 7 (2n)`** (2 nodes): `install-marketplace.dto.ts`, `InstallMarketplaceBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 8 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (1n)`** (1 nodes): `marketplace.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (1n)`** (1 nodes): `marketplace.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `marketplace.service.ts` connect `Cluster 2 (11n)` to `Cluster 3 (5n)`, `Cluster 4 (3n)`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `Parametrized Install — Param Override` connect `Cluster 3 (5n)` to `Cluster 2 (11n)`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `marketplace.service.ts` (e.g. with `Catalog + Installation Tracking` and `Parametrized Install — Param Override`) actually correct?**
  _`marketplace.service.ts` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Catalog + Installation Tracking` (e.g. with `marketplace.service.ts` and `prisma/schema.prisma`) actually correct?**
  _`Catalog + Installation Tracking` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Parametrized Install — Param Override` (e.g. with `marketplace.service.ts` and `dto/ (list, install)`) actually correct?**
  _`Parametrized Install — Param Override` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `MarketplaceModule`, `ListMarketplaceQueryDto`, `InstallMarketplaceBodyDto` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._