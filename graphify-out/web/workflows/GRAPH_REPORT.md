# Graph Report - apps/web/src/app/workflows  (2026-04-14)

## Corpus Check
- Corpus is ~3,802 words - fits in a single context window. You may not need a graph.

## Summary
- 57 nodes · 45 edges · 16 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (8n)|Cluster 0 (8n)]]
- [[_COMMUNITY_Cluster 1 (8n)|Cluster 1 (8n)]]
- [[_COMMUNITY_Cluster 2 (7n)|Cluster 2 (7n)]]
- [[_COMMUNITY_Cluster 3 (6n)|Cluster 3 (6n)]]
- [[_COMMUNITY_Cluster 4 (4n)|Cluster 4 (4n)]]
- [[_COMMUNITY_Cluster 5 (4n)|Cluster 5 (4n)]]
- [[_COMMUNITY_Cluster 6 (4n)|Cluster 6 (4n)]]
- [[_COMMUNITY_Cluster 7 (4n)|Cluster 7 (4n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (2n)|Cluster 10 (2n)]]
- [[_COMMUNITY_Cluster 11 (2n)|Cluster 11 (2n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `Thin Page Composition` - 6 edges
2. `hooks/useWorkflows.ts` - 5 edges
3. `Wildcard Invalidation` - 4 edges
4. `UseQueryOptions Forwarding` - 4 edges
5. `Company ID 자동 주입` - 3 edges
6. `Page 안에서 inline useQuery 금지 (전용 hook 만)` - 2 edges
7. `workflows/page.tsx` - 2 edges
8. `lib/workflow-api.ts` - 2 edges
9. `lib/workflow-types.ts` - 2 edges
10. `@kiditem/shared/schemas/workflows.ts` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Wildcard Invalidation` --rationale_for--> `hooks/useWorkflows.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 6 → community 3_
- `UseQueryOptions Forwarding` --rationale_for--> `hooks/useWorkflows.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 7 → community 3_
- `Thin Page Composition` --conceptually_related_to--> `Page 안에서 inline useQuery 금지 (전용 hook 만)`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 1 → community 7_
- `@kiditem/shared/schemas/workflows.ts` --modification_triggers--> `hooks/useWorkflows.ts`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 3 → community 1_

## Communities

### Community 0 - "Cluster 0 (8n)"
Cohesion: 0.25
Nodes (0): 

### Community 1 - "Cluster 1 (8n)"
Cohesion: 0.25
Nodes (8): components/MyWorkflowsSection.tsx, workflows/page.tsx, @kiditem/shared/schemas/workflows.ts, lib/workflow-types.ts, Thin Page Composition, 단일 useState + hook data pass → 모달/탭/복잡 state 없음, Hook 레이어에서 error 처리 안 함 — page.tsx 가 isApiError 분기, Filter state (useState) 는 UI only, API 호출에 반영 안 함

### Community 2 - "Cluster 2 (7n)"
Cohesion: 0.29
Nodes (0): 

### Community 3 - "Cluster 3 (6n)"
Cohesion: 0.33
Nodes (6): 백엔드 endpoint (/api/workflows/*, /api/workflow-runs/*), hooks/useWorkflows.ts, lib/workflow-api.ts, Company ID 자동 주입, getCompanyId baked in → Hook 호출자는 companyId 모름, 모든 workflow 는 인증 회사 스코프 (getCompanyId 강제)

### Community 4 - "Cluster 4 (4n)"
Cohesion: 0.5
Nodes (0): 

### Community 5 - "Cluster 5 (4n)"
Cohesion: 0.5
Nodes (0): 

### Community 6 - "Cluster 6 (4n)"
Cohesion: 0.5
Nodes (4): Wildcard Invalidation, Workflow data 클라이언트 변환 금지 (서버 응답 그대로), workflow 변경은 list/detail/runs 모두 영향 → 전체 새로고침이 일관성 보장, Activation/Delete/Trigger 모두 동일 invalidation 전략

### Community 7 - "Cluster 7 (4n)"
Cohesion: 0.5
Nodes (4): UseQueryOptions Forwarding, Page 안에서 inline useQuery 금지 (전용 hook 만), Polling 금지 (static list 의도), caller가 refetchInterval/enabled/staleTime 등 override 가능 → 합성성

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Cluster 10 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Cluster 11 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): Polling 없음 (refetchInterval 사용 안 함, static list)

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (1): src/lib/api (apiClient, getCompanyId)

## Knowledge Gaps
- **14 isolated node(s):** `모든 workflow 는 인증 회사 스코프 (getCompanyId 강제)`, `Polling 없음 (refetchInterval 사용 안 함, static list)`, `Hook 레이어에서 error 처리 안 함 — page.tsx 가 isApiError 분기`, `Filter state (useState) 는 UI only, API 호출에 반영 안 함`, `Activation/Delete/Trigger 모두 동일 invalidation 전략` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `page.tsx`, `WorkflowsPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `WorkflowCanvas.tsx`, `WorkflowCanvas()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (2n)`** (2 nodes): `MyWorkflowsSection.tsx`, `MyWorkflowsSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (2n)`** (2 nodes): `workflow-types.ts`, `mapStepStatus()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `WorkflowNode.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `workflow-api.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `Polling 없음 (refetchInterval 사용 안 함, static list)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `src/lib/api (apiClient, getCompanyId)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `hooks/useWorkflows.ts` connect `Cluster 3 (6n)` to `Cluster 1 (8n)`, `Cluster 6 (4n)`, `Cluster 7 (4n)`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `UseQueryOptions Forwarding` connect `Cluster 7 (4n)` to `Cluster 3 (6n)`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `Thin Page Composition` connect `Cluster 1 (8n)` to `Cluster 7 (4n)`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Thin Page Composition` (e.g. with `workflows/page.tsx` and `components/MyWorkflowsSection.tsx`) actually correct?**
  _`Thin Page Composition` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `hooks/useWorkflows.ts` (e.g. with `Wildcard Invalidation` and `UseQueryOptions Forwarding`) actually correct?**
  _`hooks/useWorkflows.ts` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `모든 workflow 는 인증 회사 스코프 (getCompanyId 강제)`, `Polling 없음 (refetchInterval 사용 안 함, static list)`, `Hook 레이어에서 error 처리 안 함 — page.tsx 가 isApiError 분기` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._