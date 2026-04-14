# Graph Report - apps/server/src/products  (2026-04-14)

## Corpus Check
- Corpus is ~17,666 words - fits in a single context window. You may not need a graph.

## Summary
- 255 nodes · 242 edges · 52 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (21n)|Cluster 0 (21n)]]
- [[_COMMUNITY_Cluster 1 (19n)|Cluster 1 (19n)]]
- [[_COMMUNITY_Cluster 2 (19n)|Cluster 2 (19n)]]
- [[_COMMUNITY_Cluster 3 (19n)|Cluster 3 (19n)]]
- [[_COMMUNITY_Cluster 4 (14n)|Cluster 4 (14n)]]
- [[_COMMUNITY_Cluster 5 (14n)|Cluster 5 (14n)]]
- [[_COMMUNITY_Cluster 6 (14n)|Cluster 6 (14n)]]
- [[_COMMUNITY_Cluster 7 (11n)|Cluster 7 (11n)]]
- [[_COMMUNITY_Cluster 8 (10n)|Cluster 8 (10n)]]
- [[_COMMUNITY_Cluster 9 (9n)|Cluster 9 (9n)]]
- [[_COMMUNITY_Cluster 10 (7n)|Cluster 10 (7n)]]
- [[_COMMUNITY_Cluster 11 (7n)|Cluster 11 (7n)]]
- [[_COMMUNITY_Cluster 12 (6n)|Cluster 12 (6n)]]
- [[_COMMUNITY_Cluster 13 (5n)|Cluster 13 (5n)]]
- [[_COMMUNITY_Cluster 14 (5n)|Cluster 14 (5n)]]
- [[_COMMUNITY_Cluster 15 (5n)|Cluster 15 (5n)]]
- [[_COMMUNITY_Cluster 16 (5n)|Cluster 16 (5n)]]
- [[_COMMUNITY_Cluster 17 (4n)|Cluster 17 (4n)]]
- [[_COMMUNITY_Cluster 18 (4n)|Cluster 18 (4n)]]
- [[_COMMUNITY_Cluster 19 (3n)|Cluster 19 (3n)]]
- [[_COMMUNITY_Cluster 20 (3n)|Cluster 20 (3n)]]
- [[_COMMUNITY_Cluster 21 (2n)|Cluster 21 (2n)]]
- [[_COMMUNITY_Cluster 22 (2n)|Cluster 22 (2n)]]
- [[_COMMUNITY_Cluster 23 (2n)|Cluster 23 (2n)]]
- [[_COMMUNITY_Cluster 24 (2n)|Cluster 24 (2n)]]
- [[_COMMUNITY_Cluster 25 (2n)|Cluster 25 (2n)]]
- [[_COMMUNITY_Cluster 26 (2n)|Cluster 26 (2n)]]
- [[_COMMUNITY_Cluster 27 (2n)|Cluster 27 (2n)]]
- [[_COMMUNITY_Cluster 28 (2n)|Cluster 28 (2n)]]
- [[_COMMUNITY_Cluster 29 (2n)|Cluster 29 (2n)]]
- [[_COMMUNITY_Cluster 30 (2n)|Cluster 30 (2n)]]
- [[_COMMUNITY_Cluster 31 (2n)|Cluster 31 (2n)]]
- [[_COMMUNITY_Cluster 32 (2n)|Cluster 32 (2n)]]
- [[_COMMUNITY_Cluster 33 (2n)|Cluster 33 (2n)]]
- [[_COMMUNITY_Cluster 34 (2n)|Cluster 34 (2n)]]
- [[_COMMUNITY_Cluster 35 (2n)|Cluster 35 (2n)]]
- [[_COMMUNITY_Cluster 36 (2n)|Cluster 36 (2n)]]
- [[_COMMUNITY_Cluster 37 (2n)|Cluster 37 (2n)]]
- [[_COMMUNITY_Cluster 38 (2n)|Cluster 38 (2n)]]
- [[_COMMUNITY_Cluster 39 (2n)|Cluster 39 (2n)]]
- [[_COMMUNITY_Cluster 40 (2n)|Cluster 40 (2n)]]
- [[_COMMUNITY_Cluster 41 (1n)|Cluster 41 (1n)]]
- [[_COMMUNITY_Cluster 42 (1n)|Cluster 42 (1n)]]
- [[_COMMUNITY_Cluster 43 (1n)|Cluster 43 (1n)]]
- [[_COMMUNITY_Cluster 44 (1n)|Cluster 44 (1n)]]
- [[_COMMUNITY_Cluster 45 (1n)|Cluster 45 (1n)]]
- [[_COMMUNITY_Cluster 46 (1n)|Cluster 46 (1n)]]
- [[_COMMUNITY_Cluster 47 (1n)|Cluster 47 (1n)]]
- [[_COMMUNITY_Cluster 48 (1n)|Cluster 48 (1n)]]
- [[_COMMUNITY_Cluster 49 (1n)|Cluster 49 (1n)]]
- [[_COMMUNITY_Cluster 50 (1n)|Cluster 50 (1n)]]
- [[_COMMUNITY_Cluster 51 (1n)|Cluster 51 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `ThumbnailAnalysisController` - 18 edges
2. `ThumbnailAiService` - 18 edges
3. `ProductsController` - 13 edges
4. `ProductsService` - 13 edges
5. `ThumbnailAnalysisService` - 13 edges
6. `ThumbnailGenerationService` - 9 edges
7. `Pattern: DTO 분리 및 barrel export` - 9 edges
8. `Pattern: Thumbnail 3-stage Pipeline` - 8 edges
9. `Pattern: Gemini API 단일 진입점` - 7 edges
10. `ThumbnailWingService` - 6 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Hyperedges (group relationships)
- **All Patterns in products/CLAUDE.md** — claude_pattern_agentregistry_trigger, claude_pattern_dto_separation, claude_pattern_gemini_api_single_entry, claude_pattern_pricing_resolver_fallback_chain, claude_pattern_satisfies_as_const, claude_pattern_thumbnail_3stage_pipeline, claude_pattern_transaction_atomic_compound [EXTRACTED 1.00]
- **All Prohibits in products/CLAUDE.md** — claude_prohibit_company_id_in_dto, claude_prohibit_direct_cost_price, claude_prohibit_direct_gemini_call, claude_prohibit_direct_llm_for_content, claude_prohibit_inline_dto, claude_prohibit_new_transaction, claude_prohibit_pricing_direct_calc, claude_prohibit_thumbnail_skip_reorder [EXTRACTED 1.00]

## Communities

### Community 0 - "Cluster 0 (21n)"
Cohesion: 0.11
Nodes (21): File: apps/server/src/products/services/thumbnail-ai.service.ts, File: apps/server/src/products/services/thumbnail-analysis.service.ts, File: apps/server/src/products/services/thumbnail-edit.service.ts, File: apps/server/src/products/__tests__/thumbnail-flow.spec.ts, File: apps/server/src/products/services/thumbnails.service.ts, Pattern: Gemini API 단일 진입점, Pattern: satisfies + as const 강제, Pattern: Thumbnail 3-stage Pipeline (+13 more)

### Community 1 - "Cluster 1 (19n)"
Cohesion: 0.11
Nodes (1): ThumbnailAnalysisController

### Community 2 - "Cluster 2 (19n)"
Cohesion: 0.2
Nodes (1): ThumbnailAiService

### Community 3 - "Cluster 3 (19n)"
Cohesion: 0.11
Nodes (19): File: apps/server/src/agent-registry/agent-registry.service.ts, File: agent-config/prompts/agents/content.md, File: apps/server/src/common/master-product-resolver.ts, File: prisma/schema.prisma, File: apps/server/src/products/products.service.ts, File: apps/server/src/products/__tests__/products.service.spec.ts, Pattern: AgentRegistry trigger (content-draft), Pattern: Pricing Resolver Fallback Chain (+11 more)

### Community 4 - "Cluster 4 (14n)"
Cohesion: 0.15
Nodes (1): ProductsController

### Community 5 - "Cluster 5 (14n)"
Cohesion: 0.14
Nodes (1): ProductsService

### Community 6 - "Cluster 6 (14n)"
Cohesion: 0.2
Nodes (1): ThumbnailAnalysisService

### Community 7 - "Cluster 7 (11n)"
Cohesion: 0.24
Nodes (2): ThumbnailGenerationService, toGeneration()

### Community 8 - "Cluster 8 (10n)"
Cohesion: 0.2
Nodes (10): File: apps/server/src/products/dto/index.ts, Pattern: DTO 분리 및 barrel export, Prohibit: DTO에 companyId 포함 금지, Prohibit: DTO inline 정의 금지, Rationale: DTO 파일 분리와 barrel export로 도메인 내부 분할 유지, Rule: companyId는 컨트롤러에서 @CurrentCompany()로 주입 (ADR-0006), Rule: DTO는 dto/index.ts에서 barrel export, Rule: DTO 명명은 <Verb><Noun><Body|Query>Dto 규칙을 따른다 (+2 more)

### Community 9 - "Cluster 9 (9n)"
Cohesion: 0.33
Nodes (4): assignGrade(), buildIssues(), buildSuggestions(), ThumbnailsService

### Community 10 - "Cluster 10 (7n)"
Cohesion: 0.38
Nodes (2): ThumbnailTrackingService, toRecord()

### Community 11 - "Cluster 11 (7n)"
Cohesion: 0.33
Nodes (1): ThumbnailWingService

### Community 12 - "Cluster 12 (6n)"
Cohesion: 0.33
Nodes (1): ThumbnailTrackingController

### Community 13 - "Cluster 13 (5n)"
Cohesion: 0.4
Nodes (1): ProductImagesController

### Community 14 - "Cluster 14 (5n)"
Cohesion: 0.4
Nodes (1): ThumbnailsController

### Community 15 - "Cluster 15 (5n)"
Cohesion: 0.5
Nodes (1): ThumbnailEditorController

### Community 16 - "Cluster 16 (5n)"
Cohesion: 0.4
Nodes (1): ThumbnailEditService

### Community 17 - "Cluster 17 (4n)"
Cohesion: 0.5
Nodes (1): ReviewsController

### Community 18 - "Cluster 18 (4n)"
Cohesion: 0.5
Nodes (1): ReviewsService

### Community 19 - "Cluster 19 (3n)"
Cohesion: 0.67
Nodes (2): AnalyzeBatchDto, AnalyzeThumbnailDto

### Community 20 - "Cluster 20 (3n)"
Cohesion: 0.67
Nodes (2): ProductImageItemDto, UpdateProductImagesDto

### Community 21 - "Cluster 21 (2n)"
Cohesion: 1.0
Nodes (1): ProductsModule

### Community 22 - "Cluster 22 (2n)"
Cohesion: 1.0
Nodes (1): TriggerContentDraftBodyDto

### Community 23 - "Cluster 23 (2n)"
Cohesion: 1.0
Nodes (1): PipelineStatsQueryDto

### Community 24 - "Cluster 24 (2n)"
Cohesion: 1.0
Nodes (1): EditThumbnailDto

### Community 25 - "Cluster 25 (2n)"
Cohesion: 1.0
Nodes (1): UpdateMetricsDto

### Community 26 - "Cluster 26 (2n)"
Cohesion: 1.0
Nodes (1): SaveFromUrlDto

### Community 27 - "Cluster 27 (2n)"
Cohesion: 1.0
Nodes (1): CreateProductBodyDto

### Community 28 - "Cluster 28 (2n)"
Cohesion: 1.0
Nodes (1): ThumbnailEditorDto

### Community 29 - "Cluster 29 (2n)"
Cohesion: 1.0
Nodes (1): PreInspectDto

### Community 30 - "Cluster 30 (2n)"
Cohesion: 1.0
Nodes (1): SelectCandidateDto

### Community 31 - "Cluster 31 (2n)"
Cohesion: 1.0
Nodes (1): CheckImageSpecDto

### Community 32 - "Cluster 32 (2n)"
Cohesion: 1.0
Nodes (1): ListThumbnailAnalysesQueryDto

### Community 33 - "Cluster 33 (2n)"
Cohesion: 1.0
Nodes (1): ListThumbnailsQueryDto

### Community 34 - "Cluster 34 (2n)"
Cohesion: 1.0
Nodes (1): ListReviewsQueryDto

### Community 35 - "Cluster 35 (2n)"
Cohesion: 1.0
Nodes (1): ListProductsQueryDto

### Community 36 - "Cluster 36 (2n)"
Cohesion: 1.0
Nodes (1): ListTrackingQueryDto

### Community 37 - "Cluster 37 (2n)"
Cohesion: 1.0
Nodes (1): CreateTrackingDto

### Community 38 - "Cluster 38 (2n)"
Cohesion: 1.0
Nodes (1): UpdateDraftContentBodyDto

### Community 39 - "Cluster 39 (2n)"
Cohesion: 1.0
Nodes (1): ListGenerationsQueryDto

### Community 40 - "Cluster 40 (2n)"
Cohesion: 1.0
Nodes (2): File: apps/server/src/products/controllers/product-images.controller.ts, File: apps/server/src/common/storage/storage.service.ts

### Community 41 - "Cluster 41 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Cluster 42 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Cluster 43 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/services/thumbnail-wing.service.ts

### Community 44 - "Cluster 44 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/controllers/products.controller.ts

### Community 45 - "Cluster 45 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/controllers/thumbnails.controller.ts

### Community 46 - "Cluster 46 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/controllers/thumbnail-analysis.controller.ts

### Community 47 - "Cluster 47 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/controllers/thumbnail-editor.controller.ts

### Community 48 - "Cluster 48 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/controllers/thumbnail-tracking.controller.ts

### Community 49 - "Cluster 49 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/controllers/reviews.controller.ts

### Community 50 - "Cluster 50 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/products.module.ts

### Community 51 - "Cluster 51 (1n)"
Cohesion: 1.0
Nodes (1): File: apps/server/src/products/services/types.ts

## Knowledge Gaps
- **70 isolated node(s):** `ProductsModule`, `TriggerContentDraftBodyDto`, `PipelineStatsQueryDto`, `EditThumbnailDto`, `UpdateMetricsDto` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 21 (2n)`** (2 nodes): `ProductsModule`, `products.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 22 (2n)`** (2 nodes): `trigger-content-draft.dto.ts`, `TriggerContentDraftBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 23 (2n)`** (2 nodes): `pipeline-stats.dto.ts`, `PipelineStatsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 24 (2n)`** (2 nodes): `edit-thumbnail.dto.ts`, `EditThumbnailDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 25 (2n)`** (2 nodes): `update-metrics.dto.ts`, `UpdateMetricsDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 26 (2n)`** (2 nodes): `save-from-url.dto.ts`, `SaveFromUrlDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 27 (2n)`** (2 nodes): `CreateProductBodyDto`, `create-product.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 28 (2n)`** (2 nodes): `thumbnail-editor.dto.ts`, `ThumbnailEditorDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 29 (2n)`** (2 nodes): `pre-inspect.dto.ts`, `PreInspectDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 30 (2n)`** (2 nodes): `generate-thumbnail.dto.ts`, `SelectCandidateDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 31 (2n)`** (2 nodes): `CheckImageSpecDto`, `check-image-spec.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 32 (2n)`** (2 nodes): `list-thumbnail-analyses.dto.ts`, `ListThumbnailAnalysesQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 33 (2n)`** (2 nodes): `list-thumbnails.dto.ts`, `ListThumbnailsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 34 (2n)`** (2 nodes): `list-reviews.dto.ts`, `ListReviewsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 35 (2n)`** (2 nodes): `list-products.dto.ts`, `ListProductsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 36 (2n)`** (2 nodes): `list-tracking-query.dto.ts`, `ListTrackingQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 37 (2n)`** (2 nodes): `CreateTrackingDto`, `create-tracking.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 38 (2n)`** (2 nodes): `update-draft-content.dto.ts`, `UpdateDraftContentBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 39 (2n)`** (2 nodes): `list-generations-query.dto.ts`, `ListGenerationsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 40 (2n)`** (2 nodes): `File: apps/server/src/products/controllers/product-images.controller.ts`, `File: apps/server/src/common/storage/storage.service.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 41 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 42 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 43 (1n)`** (1 nodes): `File: apps/server/src/products/services/thumbnail-wing.service.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 44 (1n)`** (1 nodes): `File: apps/server/src/products/controllers/products.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 45 (1n)`** (1 nodes): `File: apps/server/src/products/controllers/thumbnails.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 46 (1n)`** (1 nodes): `File: apps/server/src/products/controllers/thumbnail-analysis.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 47 (1n)`** (1 nodes): `File: apps/server/src/products/controllers/thumbnail-editor.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 48 (1n)`** (1 nodes): `File: apps/server/src/products/controllers/thumbnail-tracking.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 49 (1n)`** (1 nodes): `File: apps/server/src/products/controllers/reviews.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 50 (1n)`** (1 nodes): `File: apps/server/src/products/products.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 51 (1n)`** (1 nodes): `File: apps/server/src/products/services/types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `ProductsModule`, `TriggerContentDraftBodyDto`, `PipelineStatsQueryDto` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cluster 0 (21n)` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Cluster 1 (19n)` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Cluster 3 (19n)` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Cluster 5 (14n)` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._