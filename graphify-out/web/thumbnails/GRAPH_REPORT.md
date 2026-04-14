# Graph Report - apps/web/src/app/thumbnails  (2026-04-14)

## Corpus Check
- Corpus is ~14,651 words - fits in a single context window. You may not need a graph.

## Summary
- 86 nodes · 56 edges · 34 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (15n)|Cluster 0 (15n)]]
- [[_COMMUNITY_Cluster 1 (11n)|Cluster 1 (11n)]]
- [[_COMMUNITY_Cluster 2 (8n)|Cluster 2 (8n)]]
- [[_COMMUNITY_Cluster 3 (6n)|Cluster 3 (6n)]]
- [[_COMMUNITY_Cluster 4 (4n)|Cluster 4 (4n)]]
- [[_COMMUNITY_Cluster 5 (3n)|Cluster 5 (3n)]]
- [[_COMMUNITY_Cluster 6 (3n)|Cluster 6 (3n)]]
- [[_COMMUNITY_Cluster 7 (3n)|Cluster 7 (3n)]]
- [[_COMMUNITY_Cluster 8 (3n)|Cluster 8 (3n)]]
- [[_COMMUNITY_Cluster 9 (3n)|Cluster 9 (3n)]]
- [[_COMMUNITY_Cluster 10 (2n)|Cluster 10 (2n)]]
- [[_COMMUNITY_Cluster 11 (2n)|Cluster 11 (2n)]]
- [[_COMMUNITY_Cluster 12 (2n)|Cluster 12 (2n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]
- [[_COMMUNITY_Cluster 16 (1n)|Cluster 16 (1n)]]
- [[_COMMUNITY_Cluster 17 (1n)|Cluster 17 (1n)]]
- [[_COMMUNITY_Cluster 18 (1n)|Cluster 18 (1n)]]
- [[_COMMUNITY_Cluster 19 (1n)|Cluster 19 (1n)]]
- [[_COMMUNITY_Cluster 20 (1n)|Cluster 20 (1n)]]
- [[_COMMUNITY_Cluster 21 (1n)|Cluster 21 (1n)]]
- [[_COMMUNITY_Cluster 22 (1n)|Cluster 22 (1n)]]
- [[_COMMUNITY_Cluster 23 (1n)|Cluster 23 (1n)]]
- [[_COMMUNITY_Cluster 24 (1n)|Cluster 24 (1n)]]
- [[_COMMUNITY_Cluster 25 (1n)|Cluster 25 (1n)]]
- [[_COMMUNITY_Cluster 26 (1n)|Cluster 26 (1n)]]
- [[_COMMUNITY_Cluster 27 (1n)|Cluster 27 (1n)]]
- [[_COMMUNITY_Cluster 28 (1n)|Cluster 28 (1n)]]
- [[_COMMUNITY_Cluster 29 (1n)|Cluster 29 (1n)]]
- [[_COMMUNITY_Cluster 30 (1n)|Cluster 30 (1n)]]
- [[_COMMUNITY_Cluster 31 (1n)|Cluster 31 (1n)]]
- [[_COMMUNITY_Cluster 32 (1n)|Cluster 32 (1n)]]
- [[_COMMUNITY_Cluster 33 (1n)|Cluster 33 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `Smart Polling — Dynamic refetchInterval` - 6 edges
2. `src/hooks/useThumbnailGenerations.ts` - 5 edges
3. `Optimistic UI + Rollback` - 4 edges
4. `thumbnails/page.tsx (6 tabs)` - 4 edges
5. `Batch Progress + AbortController` - 3 edges
6. `File Upload — FileReader base64 no form submission` - 3 edges
7. `markApplied()` - 2 edges
8. `openCoupangEdit()` - 2 edges
9. `Mutation 후 명시적 invalidateQueries + onSettled로 race 방지` - 2 edges
10. `EventSource/WebSocket 금지 (polling만)` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Smart Polling — Dynamic refetchInterval` --conceptually_related_to--> `EventSource/WebSocket 금지 (polling만)`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 1 → community 3_

## Communities

### Community 0 - "Cluster 0 (15n)"
Cohesion: 0.14
Nodes (2): markApplied(), openCoupangEdit()

### Community 1 - "Cluster 1 (11n)"
Cohesion: 0.2
Nodes (11): apiClient (/api/thumbnail-analysis/*), @kiditem/shared, src/hooks/useThumbnailGenerations.ts, Optimistic UI + Rollback, Smart Polling — Dynamic refetchInterval, raw fetch 절대 금지, setInterval 금지 (refetchInterval만), 데이터 상태 보고 자동 폴링 on/off — pending/generating 있으면 3000ms 아니면 false (+3 more)

### Community 2 - "Cluster 2 (8n)"
Cohesion: 0.25
Nodes (0): 

### Community 3 - "Cluster 3 (6n)"
Cohesion: 0.33
Nodes (6): lib/coupang-wing.ts, thumbnails/page.tsx (6 tabs), ThumbnailFilterTabs.tsx, Batch Progress + AbortController, EventSource/WebSocket 금지 (polling만), 사용자 cancel → AbortController.abort() → 서버 cancel + UI 즉시 반영

### Community 4 - "Cluster 4 (4n)"
Cohesion: 0.5
Nodes (4): UploadAnalyzer.tsx, File Upload — FileReader base64 no form submission, Canvas/image manipulation 금지 (외부 API만), Fast UX — form submission 없이 즉시 API 호출

### Community 5 - "Cluster 5 (3n)"
Cohesion: 0.67
Nodes (0): 

### Community 6 - "Cluster 6 (3n)"
Cohesion: 0.67
Nodes (0): 

### Community 7 - "Cluster 7 (3n)"
Cohesion: 0.67
Nodes (0): 

### Community 8 - "Cluster 8 (3n)"
Cohesion: 0.67
Nodes (0): 

### Community 9 - "Cluster 9 (3n)"
Cohesion: 0.67
Nodes (3): lib/grade-constants.ts, GradeDonutChart component, ScoreBreakdown component

### Community 10 - "Cluster 10 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Cluster 11 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Cluster 12 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (0): 

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
Nodes (0): 

### Community 18 - "Cluster 18 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Cluster 19 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Cluster 20 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Cluster 21 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Cluster 22 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Cluster 23 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Cluster 24 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Cluster 25 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Cluster 26 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Cluster 27 (1n)"
Cohesion: 1.0
Nodes (1): 탭/pagination은 로컬 state (URL/server state 아님)

### Community 28 - "Cluster 28 (1n)"
Cohesion: 1.0
Nodes (1): Grade 색상은 gradeBg map 하드코딩 (S→emerald, A→blue, B→amber, C→orange, F→red)

### Community 29 - "Cluster 29 (1n)"
Cohesion: 1.0
Nodes (1): @kiditem/shared 타입 필수 (ThumbnailAnalysisResult, ThumbnailGenerationItem)

### Community 30 - "Cluster 30 (1n)"
Cohesion: 1.0
Nodes (1): Image URL은 resolveImageUrl() 유틸 경유

### Community 31 - "Cluster 31 (1n)"
Cohesion: 1.0
Nodes (1): thumbnails/components/

### Community 32 - "Cluster 32 (1n)"
Cohesion: 1.0
Nodes (1): thumbnails/hooks/

### Community 33 - "Cluster 33 (1n)"
Cohesion: 1.0
Nodes (1): thumbnails/lib/ (coupang-wing.ts, resolve-url.ts, grade-constants.ts)

## Knowledge Gaps
- **22 isolated node(s):** `모든 fetch는 queryKeys.thumbnailAnalysis.* + apiClient 사용`, `탭/pagination은 로컬 state (URL/server state 아님)`, `Grade 색상은 gradeBg map 하드코딩 (S→emerald, A→blue, B→amber, C→orange, F→red)`, `@kiditem/shared 타입 필수 (ThumbnailAnalysisResult, ThumbnailGenerationItem)`, `Image URL은 resolveImageUrl() 유틸 경유` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 10 (2n)`** (2 nodes): `ThumbnailGradeCards.tsx`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (2n)`** (2 nodes): `InspectionDrawer.tsx`, `handler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (2n)`** (2 nodes): `ThumbnailFilterTabs.tsx`, `ThumbnailFilterTabs()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `GenerationQueue.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `RegenerationPipeline.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `PaginationBar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (1n)`** (1 nodes): `ScoreBreakdown.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 17 (1n)`** (1 nodes): `GradeDonutChart.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (1n)`** (1 nodes): `ProductCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 19 (1n)`** (1 nodes): `ThumbnailCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 20 (1n)`** (1 nodes): `ThumbnailStatusBadge.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 21 (1n)`** (1 nodes): `DetailModal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 22 (1n)`** (1 nodes): `GenerationHistory.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 23 (1n)`** (1 nodes): `useThumbnailGenerations.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 24 (1n)`** (1 nodes): `coupang-wing.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 25 (1n)`** (1 nodes): `resolve-url.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 26 (1n)`** (1 nodes): `grade-constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 27 (1n)`** (1 nodes): `탭/pagination은 로컬 state (URL/server state 아님)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 28 (1n)`** (1 nodes): `Grade 색상은 gradeBg map 하드코딩 (S→emerald, A→blue, B→amber, C→orange, F→red)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 29 (1n)`** (1 nodes): `@kiditem/shared 타입 필수 (ThumbnailAnalysisResult, ThumbnailGenerationItem)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 30 (1n)`** (1 nodes): `Image URL은 resolveImageUrl() 유틸 경유`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 31 (1n)`** (1 nodes): `thumbnails/components/`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 32 (1n)`** (1 nodes): `thumbnails/hooks/`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 33 (1n)`** (1 nodes): `thumbnails/lib/ (coupang-wing.ts, resolve-url.ts, grade-constants.ts)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `src/hooks/useThumbnailGenerations.ts` connect `Cluster 1 (11n)` to `Cluster 3 (6n)`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `Smart Polling — Dynamic refetchInterval` connect `Cluster 1 (11n)` to `Cluster 3 (6n)`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `thumbnails/page.tsx (6 tabs)` connect `Cluster 3 (6n)` to `Cluster 1 (11n)`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `src/hooks/useThumbnailGenerations.ts` (e.g. with `Smart Polling — Dynamic refetchInterval` and `Optimistic UI + Rollback`) actually correct?**
  _`src/hooks/useThumbnailGenerations.ts` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `모든 fetch는 queryKeys.thumbnailAnalysis.* + apiClient 사용`, `탭/pagination은 로컬 state (URL/server state 아님)`, `Grade 색상은 gradeBg map 하드코딩 (S→emerald, A→blue, B→amber, C→orange, F→red)` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cluster 0 (15n)` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._