# Graph Report - apps/web/src/app/thumbnail-editor  (2026-04-14)

## Corpus Check
- Corpus is ~3,203 words - fits in a single context window. You may not need a graph.

## Summary
- 47 nodes · 32 edges · 16 communities detected
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (8n)|Cluster 0 (8n)]]
- [[_COMMUNITY_Cluster 1 (7n)|Cluster 1 (7n)]]
- [[_COMMUNITY_Cluster 2 (5n)|Cluster 2 (5n)]]
- [[_COMMUNITY_Cluster 3 (5n)|Cluster 3 (5n)]]
- [[_COMMUNITY_Cluster 4 (5n)|Cluster 4 (5n)]]
- [[_COMMUNITY_Cluster 5 (2n)|Cluster 5 (2n)]]
- [[_COMMUNITY_Cluster 6 (2n)|Cluster 6 (2n)]]
- [[_COMMUNITY_Cluster 7 (2n)|Cluster 7 (2n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (2n)|Cluster 10 (2n)]]
- [[_COMMUNITY_Cluster 11 (1n)|Cluster 11 (1n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `Mutation-Driven Workflow (no polling)` - 5 edges
2. `Standalone Generation — productId optional` - 4 edges
3. `Split Panel — independent input/result panels` - 4 edges
4. `ImageUploader — FileReader abstraction` - 4 edges
5. `page.tsx` - 3 edges
6. `components/EditorResultPanel.tsx` - 3 edges
7. `Immediate History Sync via invalidateQueries` - 2 edges
8. `hooks/useThumbnailEditor.ts` - 2 edges
9. `purpose (compliance | quality) required for generation` - 1 edges
10. `EditorResultPanel reads page.tsx result state (not query)` - 1 edges

## Surprising Connections (you probably didn't know these)
- `Mutation-Driven Workflow (no polling)` --rationale_for--> `hooks/useThumbnailEditor.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 3 → community 1_

## Communities

### Community 0 - "Cluster 0 (8n)"
Cohesion: 0.25
Nodes (8): page.tsx, apps/server/.../thumbnail-editor.controller.ts, Immediate History Sync via invalidateQueries, Standalone Generation — productId optional, Cross-page consistency — thumbnails history tab refresh, Enable thumbnail preview before product registration, queryKeys.products.detail(productId) for product context only, purpose (compliance | quality) required for generation

### Community 1 - "Cluster 1 (7n)"
Cohesion: 0.29
Nodes (7): components/EditorInputPanel.tsx, components/EditorResult.tsx, components/EditorResultPanel.tsx, hooks/useThumbnailEditor.ts, Split Panel — independent input/result panels, Panels share state via page.tsx props drilling (no local shared state), EditorResultPanel reads page.tsx result state (not query)

### Community 2 - "Cluster 2 (5n)"
Cohesion: 0.4
Nodes (0): 

### Community 3 - "Cluster 3 (5n)"
Cohesion: 0.4
Nodes (5): Mutation-Driven Workflow (no polling), Prohibit canvas transformation (API only), Prohibit result state polling, Immediate response removes polling need, selectedCandidateUrl gates apply/skip button activation

### Community 4 - "Cluster 4 (5n)"
Cohesion: 0.4
Nodes (5): components/ImageUploader.tsx, ImageUploader — FileReader abstraction, Prohibit upload image resize/validation (raw transmit), FileReader componentized for cross-domain reuse, Image URL is data URL format (no external CDN upload)

### Community 5 - "Cluster 5 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 6 - "Cluster 6 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 7 - "Cluster 7 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Cluster 10 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Cluster 11 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (1): components/EditorHistoryTab.tsx

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): components/ThumbnailEditorView.tsx

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (1): hooks/useOriginalImage.ts

## Knowledge Gaps
- **20 isolated node(s):** `purpose (compliance | quality) required for generation`, `EditorResultPanel reads page.tsx result state (not query)`, `Image URL is data URL format (no external CDN upload)`, `queryKeys.products.detail(productId) for product context only`, `selectedCandidateUrl gates apply/skip button activation` (+15 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 5 (2n)`** (2 nodes): `ThumbnailEditorPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 6 (2n)`** (2 nodes): `ThumbnailEditorView.tsx`, `ThumbnailEditorView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 7 (2n)`** (2 nodes): `EditorResultPanel.tsx`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `EditorInputPanel.tsx`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `useThumbnailEditor.ts`, `useGenerateThumbnail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (2n)`** (2 nodes): `useOriginalImage.ts`, `useOriginalImage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (1n)`** (1 nodes): `ImageUploader.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `EditorResult.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `components/EditorHistoryTab.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `components/ThumbnailEditorView.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `hooks/useOriginalImage.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Mutation-Driven Workflow (no polling)` connect `Cluster 3 (5n)` to `Cluster 1 (7n)`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `hooks/useThumbnailEditor.ts` connect `Cluster 1 (7n)` to `Cluster 3 (5n)`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Split Panel — independent input/result panels` (e.g. with `components/EditorInputPanel.tsx` and `components/EditorResultPanel.tsx`) actually correct?**
  _`Split Panel — independent input/result panels` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `page.tsx` (e.g. with `Standalone Generation — productId optional` and `Immediate History Sync via invalidateQueries`) actually correct?**
  _`page.tsx` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `purpose (compliance | quality) required for generation`, `EditorResultPanel reads page.tsx result state (not query)`, `Image URL is data URL format (no external CDN upload)` to the rest of the system?**
  _20 weakly-connected nodes found - possible documentation gaps or missing edges._