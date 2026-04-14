# Graph Report - apps/web/src/app/sourcing  (2026-04-14)

## Corpus Check
- Corpus is ~14,517 words - fits in a single context window. You may not need a graph.

## Summary
- 116 nodes · 87 edges · 38 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (14n)|Cluster 0 (14n)]]
- [[_COMMUNITY_Cluster 1 (13n)|Cluster 1 (13n)]]
- [[_COMMUNITY_Cluster 2 (8n)|Cluster 2 (8n)]]
- [[_COMMUNITY_Cluster 3 (7n)|Cluster 3 (7n)]]
- [[_COMMUNITY_Cluster 4 (6n)|Cluster 4 (6n)]]
- [[_COMMUNITY_Cluster 5 (5n)|Cluster 5 (5n)]]
- [[_COMMUNITY_Cluster 6 (5n)|Cluster 6 (5n)]]
- [[_COMMUNITY_Cluster 7 (4n)|Cluster 7 (4n)]]
- [[_COMMUNITY_Cluster 8 (4n)|Cluster 8 (4n)]]
- [[_COMMUNITY_Cluster 9 (4n)|Cluster 9 (4n)]]
- [[_COMMUNITY_Cluster 10 (3n)|Cluster 10 (3n)]]
- [[_COMMUNITY_Cluster 11 (3n)|Cluster 11 (3n)]]
- [[_COMMUNITY_Cluster 12 (3n)|Cluster 12 (3n)]]
- [[_COMMUNITY_Cluster 13 (2n)|Cluster 13 (2n)]]
- [[_COMMUNITY_Cluster 14 (2n)|Cluster 14 (2n)]]
- [[_COMMUNITY_Cluster 15 (2n)|Cluster 15 (2n)]]
- [[_COMMUNITY_Cluster 16 (2n)|Cluster 16 (2n)]]
- [[_COMMUNITY_Cluster 17 (2n)|Cluster 17 (2n)]]
- [[_COMMUNITY_Cluster 18 (2n)|Cluster 18 (2n)]]
- [[_COMMUNITY_Cluster 19 (2n)|Cluster 19 (2n)]]
- [[_COMMUNITY_Cluster 20 (2n)|Cluster 20 (2n)]]
- [[_COMMUNITY_Cluster 21 (2n)|Cluster 21 (2n)]]
- [[_COMMUNITY_Cluster 22 (2n)|Cluster 22 (2n)]]
- [[_COMMUNITY_Cluster 23 (2n)|Cluster 23 (2n)]]
- [[_COMMUNITY_Cluster 24 (2n)|Cluster 24 (2n)]]
- [[_COMMUNITY_Cluster 25 (1n)|Cluster 25 (1n)]]
- [[_COMMUNITY_Cluster 26 (1n)|Cluster 26 (1n)]]
- [[_COMMUNITY_Cluster 27 (1n)|Cluster 27 (1n)]]
- [[_COMMUNITY_Cluster 28 (1n)|Cluster 28 (1n)]]
- [[_COMMUNITY_Cluster 29 (1n)|Cluster 29 (1n)]]
- [[_COMMUNITY_Cluster 30 (1n)|Cluster 30 (1n)]]
- [[_COMMUNITY_Cluster 31 (1n)|Cluster 31 (1n)]]
- [[_COMMUNITY_Cluster 32 (1n)|Cluster 32 (1n)]]
- [[_COMMUNITY_Cluster 33 (1n)|Cluster 33 (1n)]]
- [[_COMMUNITY_Cluster 34 (1n)|Cluster 34 (1n)]]
- [[_COMMUNITY_Cluster 35 (1n)|Cluster 35 (1n)]]
- [[_COMMUNITY_Cluster 36 (1n)|Cluster 36 (1n)]]
- [[_COMMUNITY_Cluster 37 (1n)|Cluster 37 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `Editor — GrapesJS Architecture` - 14 edges
2. `AI Text Edit Panel (Sync + UndoManager Pause)` - 6 edges
3. `Detail Page — Local-Only Edit + Template Preview` - 5 edges
4. `AI Image Edit Panel (Async + Polling)` - 5 edges
5. `Image Upload — base64 Passthrough` - 4 edges
6. `DetailPageEditor.tsx` - 4 edges
7. `List Page — Processing Polling` - 3 edges
8. `Template Rendering via renderTemplateToHtml()` - 3 edges
9. `3-Stage UI: list → detail → editor` - 3 edges
10. `sourcing/[id]/page.tsx` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Detail Page — Local-Only Edit + Template Preview` --rationale_for--> `sourcing/[id]/page.tsx`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 5 → community 2_
- `Editor — GrapesJS Architecture` --rationale_for--> `DetailPageEditor.tsx`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 1 → community 2_
- `ImagePickerModal.tsx` --modification_triggers--> `DetailPageEditor.tsx`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 2 → community 6_

## Communities

### Community 0 - "Cluster 0 (14n)"
Cohesion: 0.14
Nodes (14): AIImageEditPanel.tsx, AITextEditPanel.tsx, server/ai/ (backend preset matcher), AI Image Edit Panel (Async + Polling), AI Text Edit Panel (Sync + UndoManager Pause), ❌ Concurrent AI edits, ❌ Applying AI result without UndoManager pause, Undo pause prevents partial undo of AI result (avoids user confusion) (+6 more)

### Community 1 - "Cluster 1 (13n)"
Cohesion: 0.15
Nodes (13): Editor — GrapesJS Architecture, ❌ Local storage (storageManager must stay false), ❌ Adding new GrapesJS plugins indiscriminately, ❌ editor.saveJSON() (HTML+CSS export only), Storage disabled because parent manages persistence, Fingerprint dedup avoids duplicate stylesheet injection, Canvas device '쿠팡 상세페이지' 860px width, Style Manager has 5 sectors (레이아웃/타이포/배경/테두리/효과) (+5 more)

### Community 2 - "Cluster 2 (8n)"
Cohesion: 0.29
Nodes (8): sourcing/[id]/page.tsx, DetailPageEditor.tsx, sourcing/[id]/editor/page.tsx, sourcing/page.tsx, List Page — Processing Polling, 3-Stage UI: list → detail → editor, List uses 50/page pagination, refetchInterval 3s only when hasProcessing

### Community 3 - "Cluster 3 (7n)"
Cohesion: 0.29
Nodes (0): 

### Community 4 - "Cluster 4 (6n)"
Cohesion: 0.4
Nodes (2): handleScrapeKeyDown(), handleScrapeUrl()

### Community 5 - "Cluster 5 (5n)"
Cohesion: 0.4
Nodes (5): Detail Page — Local-Only Edit + Template Preview, ❌ Detail page directly updating DB (preview only), Detail page is preview-only; publish is separate step, Detail page runs 3 parallel fetches (product + preview + CSS), editData kept as useState local (5 tabs)

### Community 6 - "Cluster 6 (5n)"
Cohesion: 0.4
Nodes (5): ImagePickerModal.tsx, Image Upload — base64 Passthrough, ❌ Image server upload inside editor, Upload FileReader.readAsDataURL → base64 → component.src, Gallery sourced from rawImages/processedImages props

### Community 7 - "Cluster 7 (4n)"
Cohesion: 0.67
Nodes (2): handleAdd(), handleKeyDown()

### Community 8 - "Cluster 8 (4n)"
Cohesion: 0.5
Nodes (0): 

### Community 9 - "Cluster 9 (4n)"
Cohesion: 0.67
Nodes (4): @kiditem/templates (external package), lib/template-html.tsx, Template Rendering via renderTemplateToHtml(), renderTemplateToHtml() pipeline: renderToStaticMarkup → CSS vars → font links → full HTML

### Community 10 - "Cluster 10 (3n)"
Cohesion: 1.0
Nodes (2): buildThemeVarsCss(), renderTemplateToHtml()

### Community 11 - "Cluster 11 (3n)"
Cohesion: 0.67
Nodes (0): 

### Community 12 - "Cluster 12 (3n)"
Cohesion: 0.67
Nodes (0): 

### Community 13 - "Cluster 13 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Cluster 14 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Cluster 15 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Cluster 16 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Cluster 17 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Cluster 18 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Cluster 19 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Cluster 20 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Cluster 21 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Cluster 22 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Cluster 23 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Cluster 24 (2n)"
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
Nodes (0): 

### Community 28 - "Cluster 28 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Cluster 29 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Cluster 30 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Cluster 31 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Cluster 32 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Cluster 33 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Cluster 34 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Cluster 35 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Cluster 36 (1n)"
Cohesion: 1.0
Nodes (1): lib/sourcing-api.ts

### Community 37 - "Cluster 37 (1n)"
Cohesion: 1.0
Nodes (1): lib/types.ts

## Knowledge Gaps
- **33 isolated node(s):** `List uses 50/page pagination`, `refetchInterval 3s only when hasProcessing`, `Detail page runs 3 parallel fetches (product + preview + CSS)`, `editData kept as useState local (5 tabs)`, `Use grapesjs@0.22.14 + @grapesjs/react@2.0.0` (+28 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 13 (2n)`** (2 nodes): `RawDataTab.tsx`, `formatNumber()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (2n)`** (2 nodes): `ThumbnailGrid.tsx`, `ThumbnailGrid()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (2n)`** (2 nodes): `SourcingStatusBadge.tsx`, `SourcingStatusBadge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (2n)`** (2 nodes): `SkeletonCard.tsx`, `SkeletonCard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 17 (2n)`** (2 nodes): `SourcingHeader.tsx`, `SourcingHeader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (2n)`** (2 nodes): `ProductErrorView.tsx`, `ProductErrorView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 19 (2n)`** (2 nodes): `ProductLoadingView.tsx`, `ProductLoadingView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 20 (2n)`** (2 nodes): `ProductTabContent.tsx`, `ProductTabContent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 21 (2n)`** (2 nodes): `types.ts`, `mapProcessedData()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 22 (2n)`** (2 nodes): `ColorPickerField()`, `ColorPickerField.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 23 (2n)`** (2 nodes): `EditorErrorScreen()`, `EditorErrorScreen.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 24 (2n)`** (2 nodes): `EditorLoadingScreen()`, `EditorLoadingScreen.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 25 (1n)`** (1 nodes): `MobilePreview.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 26 (1n)`** (1 nodes): `ProductEditHeader.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 27 (1n)`** (1 nodes): `ProductEditTabs.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 28 (1n)`** (1 nodes): `ProductList.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 29 (1n)`** (1 nodes): `SourcingToolbar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 30 (1n)`** (1 nodes): `ProductCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 31 (1n)`** (1 nodes): `ScrapeUrlInput.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 32 (1n)`** (1 nodes): `SourcingStats.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 33 (1n)`** (1 nodes): `sourcing-api.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 34 (1n)`** (1 nodes): `ImagePickerModal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 35 (1n)`** (1 nodes): `AIImageEditPanel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 36 (1n)`** (1 nodes): `lib/sourcing-api.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 37 (1n)`** (1 nodes): `lib/types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Editor — GrapesJS Architecture` connect `Cluster 1 (13n)` to `Cluster 2 (8n)`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `DetailPageEditor.tsx` connect `Cluster 2 (8n)` to `Cluster 1 (13n)`, `Cluster 6 (5n)`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `sourcing/[id]/page.tsx` connect `Cluster 2 (8n)` to `Cluster 5 (5n)`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Editor — GrapesJS Architecture` (e.g. with `DetailPageEditor.tsx` and `sourcing/[id]/editor/page.tsx`) actually correct?**
  _`Editor — GrapesJS Architecture` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `List uses 50/page pagination`, `refetchInterval 3s only when hasProcessing`, `Detail page runs 3 parallel fetches (product + preview + CSS)` to the rest of the system?**
  _33 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cluster 0 (14n)` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._