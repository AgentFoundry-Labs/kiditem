# Graph Report - apps/server/src/advertising  (2026-04-14)

## Corpus Check
- Corpus is ~17,514 words - fits in a single context window. You may not need a graph.

## Summary
- 178 nodes · 212 edges · 25 communities detected
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (28n)|Cluster 0 (28n)]]
- [[_COMMUNITY_Cluster 1 (22n)|Cluster 1 (22n)]]
- [[_COMMUNITY_Cluster 2 (19n)|Cluster 2 (19n)]]
- [[_COMMUNITY_Cluster 3 (19n)|Cluster 3 (19n)]]
- [[_COMMUNITY_Cluster 4 (13n)|Cluster 4 (13n)]]
- [[_COMMUNITY_Cluster 5 (8n)|Cluster 5 (8n)]]
- [[_COMMUNITY_Cluster 6 (7n)|Cluster 6 (7n)]]
- [[_COMMUNITY_Cluster 7 (7n)|Cluster 7 (7n)]]
- [[_COMMUNITY_Cluster 8 (7n)|Cluster 8 (7n)]]
- [[_COMMUNITY_Cluster 9 (6n)|Cluster 9 (6n)]]
- [[_COMMUNITY_Cluster 10 (6n)|Cluster 10 (6n)]]
- [[_COMMUNITY_Cluster 11 (5n)|Cluster 11 (5n)]]
- [[_COMMUNITY_Cluster 12 (4n)|Cluster 12 (4n)]]
- [[_COMMUNITY_Cluster 13 (4n)|Cluster 13 (4n)]]
- [[_COMMUNITY_Cluster 14 (3n)|Cluster 14 (3n)]]
- [[_COMMUNITY_Cluster 15 (3n)|Cluster 15 (3n)]]
- [[_COMMUNITY_Cluster 16 (3n)|Cluster 16 (3n)]]
- [[_COMMUNITY_Cluster 17 (2n)|Cluster 17 (2n)]]
- [[_COMMUNITY_Cluster 18 (2n)|Cluster 18 (2n)]]
- [[_COMMUNITY_Cluster 19 (2n)|Cluster 19 (2n)]]
- [[_COMMUNITY_Cluster 20 (2n)|Cluster 20 (2n)]]
- [[_COMMUNITY_Cluster 21 (2n)|Cluster 21 (2n)]]
- [[_COMMUNITY_Cluster 22 (2n)|Cluster 22 (2n)]]
- [[_COMMUNITY_Cluster 23 (1n)|Cluster 23 (1n)]]
- [[_COMMUNITY_Cluster 24 (1n)|Cluster 24 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `AdvertisingController` - 27 edges
2. `AdStrategyService` - 21 edges
3. `AdSyncService` - 18 edges
4. `AdActionService` - 11 edges
5. `AdConfigService` - 7 edges
6. `createActionCandidate()` - 7 edges
7. `AdExecutionService` - 6 edges
8. `AdvertisingService` - 6 edges
9. `Pattern: Advertising domain structure` - 6 edges
10. `AdCampaignsService` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Cluster 0 (28n)"
Cohesion: 0.07
Nodes (1): AdvertisingController

### Community 1 - "Cluster 1 (22n)"
Cohesion: 0.15
Nodes (1): AdStrategyService

### Community 2 - "Cluster 2 (19n)"
Cohesion: 0.22
Nodes (1): AdSyncService

### Community 3 - "Cluster 3 (19n)"
Cohesion: 0.16
Nodes (8): AdActionService, basePayload(), buildSnapshotKey(), createActionCandidate(), formatNumber(), isPaused(), roundBid(), roundBudget()

### Community 4 - "Cluster 4 (13n)"
Cohesion: 0.21
Nodes (13): File: apps/server/src/advertising/advertising.controller.ts, File: extensions/coupang-ads-scraper/, File: @kiditem/shared/schemas, File: apps/web/src/app/ads/, Pattern: Advertising domain structure, Pattern: /api/ads/* endpoint grouping, Pattern: Chrome extension → NestJS sync → DB pipeline, Rationale: Dashboard → Kiditem 이식 완료 (+5 more)

### Community 5 - "Cluster 5 (8n)"
Cohesion: 0.43
Nodes (1): AdConfigService

### Community 6 - "Cluster 6 (7n)"
Cohesion: 0.43
Nodes (3): AdBenchmarkService, compareToBenchmark(), getBenchmarkStrategy()

### Community 7 - "Cluster 7 (7n)"
Cohesion: 0.33
Nodes (1): AdExecutionService

### Community 8 - "Cluster 8 (7n)"
Cohesion: 0.38
Nodes (1): AdvertisingService

### Community 9 - "Cluster 9 (6n)"
Cohesion: 0.47
Nodes (1): AdCampaignsService

### Community 10 - "Cluster 10 (6n)"
Cohesion: 0.4
Nodes (1): AdCollectService

### Community 11 - "Cluster 11 (5n)"
Cohesion: 0.4
Nodes (4): ExecutionLogEntry, HeartbeatDto, LeaseDto, ReportDto

### Community 12 - "Cluster 12 (4n)"
Cohesion: 0.5
Nodes (1): AdvertisingModule

### Community 13 - "Cluster 13 (4n)"
Cohesion: 0.5
Nodes (3): RegisterCampaignDto, RegisterCampaignKeywordDto, RegisterCampaignProductDto

### Community 14 - "Cluster 14 (3n)"
Cohesion: 0.67
Nodes (2): CreateScrapeTargetDto, MarkScrapedDto

### Community 15 - "Cluster 15 (3n)"
Cohesion: 0.67
Nodes (2): AdActionCommandDto, AdActionQueryDto

### Community 16 - "Cluster 16 (3n)"
Cohesion: 0.67
Nodes (2): CampaignQueryDto, TrendsQueryDto

### Community 17 - "Cluster 17 (2n)"
Cohesion: 1.0
Nodes (1): ChangeAdTierBodyDto

### Community 18 - "Cluster 18 (2n)"
Cohesion: 1.0
Nodes (1): ListAdsQueryDto

### Community 19 - "Cluster 19 (2n)"
Cohesion: 1.0
Nodes (1): ExtensionSyncDto

### Community 20 - "Cluster 20 (2n)"
Cohesion: 1.0
Nodes (1): UpdateAdConfigDto

### Community 21 - "Cluster 21 (2n)"
Cohesion: 1.0
Nodes (1): CollectAdsDto

### Community 22 - "Cluster 22 (2n)"
Cohesion: 1.0
Nodes (2): Pattern: Direct DB query + realtime computation for strategy rules, Rule: Strategy rules endpoint computes in realtime without agent dependency

### Community 23 - "Cluster 23 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Cluster 24 (1n)"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **25 isolated node(s):** `CreateScrapeTargetDto`, `MarkScrapedDto`, `ChangeAdTierBodyDto`, `AdActionQueryDto`, `AdActionCommandDto` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 17 (2n)`** (2 nodes): `ChangeAdTierBodyDto`, `change-ad-tier.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (2n)`** (2 nodes): `list-ads.dto.ts`, `ListAdsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 19 (2n)`** (2 nodes): `extension-sync.dto.ts`, `ExtensionSyncDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 20 (2n)`** (2 nodes): `UpdateAdConfigDto`, `ad-config.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 21 (2n)`** (2 nodes): `CollectAdsDto`, `collect-ads.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 22 (2n)`** (2 nodes): `Pattern: Direct DB query + realtime computation for strategy rules`, `Rule: Strategy rules endpoint computes in realtime without agent dependency`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 23 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 24 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `CreateScrapeTargetDto`, `MarkScrapedDto`, `ChangeAdTierBodyDto` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cluster 0 (28n)` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._