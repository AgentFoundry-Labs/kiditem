# Graph Report - apps/web/src/app/return-scan  (2026-04-14)

## Corpus Check
- Corpus is ~1,237 words - fits in a single context window. You may not need a graph.

## Summary
- 30 nodes · 20 edges · 13 communities detected
- Extraction: 75% EXTRACTED · 25% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (7n)|Cluster 0 (7n)]]
- [[_COMMUNITY_Cluster 1 (5n)|Cluster 1 (5n)]]
- [[_COMMUNITY_Cluster 2 (4n)|Cluster 2 (4n)]]
- [[_COMMUNITY_Cluster 3 (3n)|Cluster 3 (3n)]]
- [[_COMMUNITY_Cluster 4 (2n)|Cluster 4 (2n)]]
- [[_COMMUNITY_Cluster 5 (2n)|Cluster 5 (2n)]]
- [[_COMMUNITY_Cluster 6 (1n)|Cluster 6 (1n)]]
- [[_COMMUNITY_Cluster 7 (1n)|Cluster 7 (1n)]]
- [[_COMMUNITY_Cluster 8 (1n)|Cluster 8 (1n)]]
- [[_COMMUNITY_Cluster 9 (1n)|Cluster 9 (1n)]]
- [[_COMMUNITY_Cluster 10 (1n)|Cluster 10 (1n)]]
- [[_COMMUNITY_Cluster 11 (1n)|Cluster 11 (1n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `page.tsx` - 6 edges
2. `Barcode Input UX` - 5 edges
3. `Local-Only Scan Log` - 4 edges
4. `Stateless Barcode Flow` - 2 edges
5. `Local Sync Exception (auto-select)` - 2 edges
6. `components/BarcodeScanInput.tsx` - 2 edges
7. `components/ScanLogTable.tsx` - 2 edges
8. `Scan log is client-side array only (no mutation)` - 1 edges
9. `Product lookup is search-only via /api/products?search=X` - 1 edges
10. `ScanLogTable columns: timestamp / barcode / product name / status` - 1 edges

## Surprising Connections (you probably didn't know these)
- `Local-Only Scan Log` --rationale_for--> `page.tsx`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 2 → community 0_
- `Barcode Input UX` --rationale_for--> `components/ScanLogTable.tsx`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 1 → community 0_

## Communities

### Community 0 - "Cluster 0 (7n)"
Cohesion: 0.29
Nodes (7): page.tsx, prisma/schema.prisma, components/ScanLogTable.tsx, Local Sync Exception (auto-select), Stateless Barcode Flow, No UX changes beyond auto-select (scan speed priority), Product lookup is search-only via /api/products?search=X

### Community 1 - "Cluster 1 (5n)"
Cohesion: 0.4
Nodes (5): components/BarcodeScanInput.tsx, Barcode Input UX, No keyboard scanner abstraction library (raw input + Enter), Input field monospace enforced (barcode UX), Reset error/successMsg on every new scan

### Community 2 - "Cluster 2 (4n)"
Cohesion: 0.5
Nodes (4): Local-Only Scan Log, No server persistence of scan results (ephemeral intent), Scan log is client-side array only (no mutation), ScanLogTable columns: timestamp / barcode / product name / status

### Community 3 - "Cluster 3 (3n)"
Cohesion: 0.67
Nodes (0): 

### Community 4 - "Cluster 4 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 5 - "Cluster 5 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 6 - "Cluster 6 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 7 - "Cluster 7 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 8 - "Cluster 8 (1n)"
Cohesion: 1.0
Nodes (1): Fast return-receiving UX priority; permanent log is separate system

### Community 9 - "Cluster 9 (1n)"
Cohesion: 1.0
Nodes (1): Scanner UX simplification justifies useQuery pattern violation

### Community 10 - "Cluster 10 (1n)"
Cohesion: 1.0
Nodes (1): Pure search — no server mutation

### Community 11 - "Cluster 11 (1n)"
Cohesion: 1.0
Nodes (1): components/ReturnProductInfo.tsx

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (1): components/ReturnScanHeader.tsx

## Knowledge Gaps
- **14 isolated node(s):** `Scan log is client-side array only (no mutation)`, `Product lookup is search-only via /api/products?search=X`, `ScanLogTable columns: timestamp / barcode / product name / status`, `Input field monospace enforced (barcode UX)`, `Reset error/successMsg on every new scan` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 4 (2n)`** (2 nodes): `ReturnScanHeader.tsx`, `ReturnScanHeader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 5 (2n)`** (2 nodes): `handleKeyDown()`, `BarcodeScanInput.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 6 (1n)`** (1 nodes): `ReturnProductInfo.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 7 (1n)`** (1 nodes): `ScanLogTable.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 8 (1n)`** (1 nodes): `Fast return-receiving UX priority; permanent log is separate system`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (1n)`** (1 nodes): `Scanner UX simplification justifies useQuery pattern violation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (1n)`** (1 nodes): `Pure search — no server mutation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (1n)`** (1 nodes): `components/ReturnProductInfo.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `components/ReturnScanHeader.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `page.tsx` connect `Cluster 0 (7n)` to `Cluster 1 (5n)`, `Cluster 2 (4n)`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **Why does `Barcode Input UX` connect `Cluster 1 (5n)` to `Cluster 0 (7n)`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `Local-Only Scan Log` connect `Cluster 2 (4n)` to `Cluster 0 (7n)`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `page.tsx` (e.g. with `Stateless Barcode Flow` and `Local-Only Scan Log`) actually correct?**
  _`page.tsx` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Barcode Input UX` (e.g. with `components/BarcodeScanInput.tsx` and `components/ScanLogTable.tsx`) actually correct?**
  _`Barcode Input UX` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Scan log is client-side array only (no mutation)`, `Product lookup is search-only via /api/products?search=X`, `ScanLogTable columns: timestamp / barcode / product name / status` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._