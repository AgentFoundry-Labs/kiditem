# Graph Report - apps/server/src/panel  (2026-04-15)

## Corpus Check
- Corpus is ~3,018 words - fits in a single context window. You may not need a graph.

## Summary
- 78 nodes · 88 edges · 15 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (10n)|Cluster 0 (10n)]]
- [[_COMMUNITY_Cluster 1 (10n)|Cluster 1 (10n)]]
- [[_COMMUNITY_Cluster 2 (10n)|Cluster 2 (10n)]]
- [[_COMMUNITY_Cluster 3 (9n)|Cluster 3 (9n)]]
- [[_COMMUNITY_Cluster 4 (9n)|Cluster 4 (9n)]]
- [[_COMMUNITY_Cluster 5 (9n)|Cluster 5 (9n)]]
- [[_COMMUNITY_Cluster 6 (6n)|Cluster 6 (6n)]]
- [[_COMMUNITY_Cluster 7 (5n)|Cluster 7 (5n)]]
- [[_COMMUNITY_Cluster 8 (3n)|Cluster 8 (3n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (1n)|Cluster 10 (1n)]]
- [[_COMMUNITY_Cluster 11 (1n)|Cluster 11 (1n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `PanelSseService (Subject + ring buffer + seqCounter)` - 12 edges
2. `PanelService.snapshot (workflow runs <24h or active)` - 12 edges
3. `PanelController (@Controller('panel'))` - 10 edges
4. `workflowPanelAdapter (WorkflowRun → PanelRunItem)` - 9 edges
5. `PanelSseService` - 8 edges
6. `PanelController` - 5 edges
7. `PanelModule (NestJS module)` - 5 edges
8. `PanelService (snapshot + backfill)` - 5 edges
9. `PanelController.stream (@Sse 'stream')` - 5 edges
10. `PanelService` - 4 edges

## Surprising Connections (you probably didn't know these)
- `PanelController (@Controller('panel'))` --rationale_for--> `Rule: throw HttpException, GlobalExceptionFilter handles`  [INFERRED]
  apps/server/src/panel/panel.controller.ts → apps/server/CLAUDE.md
- `PanelService.snapshot (workflow runs <24h or active)` --rationale_for--> `Rule: No 'first active company' fallback in services`  [INFERRED]
  apps/server/src/panel/panel.service.ts → apps/server/CLAUDE.md
- `PanelController (@Controller('panel'))` --rationale_for--> `Rule: companyId via @CurrentCompany() decorator only (ADR-0006)`  [EXTRACTED]
  apps/server/src/panel/panel.controller.ts → apps/server/CLAUDE.md
- `PanelSseService (Subject + ring buffer + seqCounter)` --rationale_for--> `Rule: Panel assumes single server instance (multi → pg LISTEN/Redis)`  [EXTRACTED]
  apps/server/src/panel/events/panel-sse.service.ts → apps/server/CLAUDE.md
- `PanelController.snapshot (@Get 'snapshot')` --calls--> `PanelService.snapshot (workflow runs <24h or active)`  [EXTRACTED]
  apps/server/src/panel/panel.controller.ts → apps/server/src/panel/panel.service.ts

## Communities

### Community 0 - "Cluster 0 (10n)"
Cohesion: 0.22
Nodes (10): 24h window (active OR updatedAt >= now-24h), PanelController.backfill (@Get 'backfill'), PanelService (snapshot + backfill), PanelService.backfill (PR1: same as snapshot), PanelService.snapshot (workflow runs <24h or active), Pattern: steps Json narrowed via Array.isArray + cast, take: 100 (snapshot result cap), prisma.workflowRun.findMany (companyId + status/updatedAt filter) (+2 more)

### Community 1 - "Cluster 1 (10n)"
Cohesion: 0.24
Nodes (10): @nestjs/event-emitter (EventEmitter2 bus), PanelSseService.getStream (filter by companyId), PanelSseService.replayAfter (Last-Event-ID resume), ringBuffer (Map companyId -> events, RING_BUFFER_SIZE=100), rxjs Subject + Observable (live stream), seqCounter (monotonic, increments per upsert/dismiss), PanelController.stream (@Sse 'stream'), PanelSseService (Subject + ring buffer + seqCounter) (+2 more)

### Community 2 - "Cluster 2 (10n)"
Cohesion: 0.22
Nodes (10): defaultVisibility: triggeredByUserId == null ? 'company' : 'user', Panel item id namespace ('workflow:<runId>'), PR1 scope: workflow source only (PR2 adds agent, image_edit, alert), PanelRunAdapter<TInput> interface, panelRunAdapters registry (workflow → adapter, satisfies), VALID_STATUS Set (derived from PanelRunItem.shape.status.options), Visibility filter: company OR (user AND actorUserId === currentUserId), workflowPanelAdapter (WorkflowRun → PanelRunItem) (+2 more)

### Community 3 - "Cluster 3 (9n)"
Cohesion: 0.28
Nodes (1): PanelSseService

### Community 4 - "Cluster 4 (9n)"
Cohesion: 0.25
Nodes (9): @CurrentCompany decorator (ADR-0006), @CurrentUser decorator, PanelController (@Controller('panel')), PanelModule (NestJS module), PanelModule exports PanelSseService (PR2 cross-domain emit), PanelController.snapshot (@Get 'snapshot'), Rule: EventEmitterModule.forRoot() in AppModule only (CRITICAL #7), Rule: throw HttpException, GlobalExceptionFilter handles (+1 more)

### Community 5 - "Cluster 5 (9n)"
Cohesion: 0.22
Nodes (9): buildWorkflowPanelItem (single source of truth for upsert), PanelDismissInternal (itemId + companyId payload), PANEL_EVENTS constants (UPSERT, DISMISS event names), PanelSseService.handleDismiss (@OnEvent DISMISS), PanelSseService.handleUpsert (@OnEvent UPSERT), Legacy WorkflowRun rows pre-Task 6 lack companyId — return null, normalizeWorkflowStatus ('completed' → 'succeeded'), Pattern: workflow domain hook emits PANEL_EVENTS.UPSERT on status transition (+1 more)

### Community 6 - "Cluster 6 (6n)"
Cohesion: 0.4
Nodes (1): PanelController

### Community 7 - "Cluster 7 (5n)"
Cohesion: 0.5
Nodes (1): PanelService

### Community 8 - "Cluster 8 (3n)"
Cohesion: 1.0
Nodes (2): buildWorkflowPanelItem(), normalizeWorkflowStatus()

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (1): PanelModule

### Community 10 - "Cluster 10 (1n)"
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
Nodes (0): 

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): Rule: No findUnique({where:{id}}) for GET/PATCH/DELETE — IDOR risk

## Knowledge Gaps
- **24 isolated node(s):** `PanelModule`, `ringBuffer (Map companyId -> events, RING_BUFFER_SIZE=100)`, `Server-side companyId strip (internal routing only, not on wire)`, `PanelUpsertInternal (item + companyId payload)`, `PanelDismissInternal (itemId + companyId payload)` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `panel.module.ts`, `PanelModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (1n)`** (1 nodes): `registry.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `workflow.adapter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `panel-events.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `Rule: No findUnique({where:{id}}) for GET/PATCH/DELETE — IDOR risk`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PanelService.snapshot (workflow runs <24h or active)` connect `Cluster 0 (10n)` to `Cluster 1 (10n)`, `Cluster 2 (10n)`, `Cluster 4 (9n)`, `Cluster 5 (9n)`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Why does `PanelSseService (Subject + ring buffer + seqCounter)` connect `Cluster 1 (10n)` to `Cluster 4 (9n)`, `Cluster 5 (9n)`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `workflowPanelAdapter (WorkflowRun → PanelRunItem)` connect `Cluster 2 (10n)` to `Cluster 0 (10n)`, `Cluster 5 (9n)`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **What connects `PanelModule`, `ringBuffer (Map companyId -> events, RING_BUFFER_SIZE=100)`, `Server-side companyId strip (internal routing only, not on wire)` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._