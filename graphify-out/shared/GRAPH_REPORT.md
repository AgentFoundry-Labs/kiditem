# Graph Report - packages/shared/src  (2026-04-15)

## Corpus Check
- Corpus is ~7,791 words - fits in a single context window. You may not need a graph.

## Summary
- 66 nodes · 56 edges · 26 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Panel Events & Index Module|Panel Events & Index Module]]
- [[_COMMUNITY_Agent  Workflow  Common Schemas|Agent / Workflow / Common Schemas]]
- [[_COMMUNITY_Security Scrub & Patterns|Security: Scrub & Patterns]]
- [[_COMMUNITY_Agent Trace Test Helpers|Agent Trace Test Helpers]]
- [[_COMMUNITY_Panel Item Base & Run|Panel Item Base & Run]]
- [[_COMMUNITY_AppException|AppException]]
- [[_COMMUNITY_Panel sourcestypes files|Panel sources/types files]]
- [[_COMMUNITY_Panel test fixtures|Panel test fixtures]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]

## God Nodes (most connected - your core abstractions)
1. `PanelItem (z.discriminatedUnion 'kind')` - 7 edges
2. `makeTrace()` - 5 edges
3. `PanelEvent (z.discriminatedUnion 'type')` - 5 edges
4. `panel/index.ts barrel (exports types + sources)` - 5 edges
5. `walk()` - 4 edges
6. `PanelItemBase (id, seq, createdAt, visibility, ...)` - 4 edges
7. `PanelRunItem (kind: 'run', source, status, deepLink)` - 3 edges
8. `PanelSnapshotEvent (type: 'snapshot', items, resetClient: true)` - 3 edges
9. `PANEL_RUN_SOURCES (workflow {label, iconName, deepLinkPattern})` - 3 edges
10. `scrubSecrets()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Rule: z.infer<typeof Schema> (no separate interface)` --rationale_for--> `PanelItem (z.discriminatedUnion 'kind')`  [INFERRED]
  packages/shared/CLAUDE.md → packages/shared/src/panel/types.ts
- `Rule: satisfies pattern in services (Prisma drift detection)` --rationale_for--> `PanelItem (z.discriminatedUnion 'kind')`  [INFERRED]
  packages/shared/CLAUDE.md → packages/shared/src/panel/types.ts
- `Rule: z.infer<typeof Schema> (no separate interface)` --rationale_for--> `PanelEvent (z.discriminatedUnion 'type')`  [INFERRED]
  packages/shared/CLAUDE.md → packages/shared/src/panel/types.ts
- `Rule: @kiditem/shared subpath exports (/schemas, /errors)` --rationale_for--> `panel/index.ts barrel (exports types + sources)`  [INFERRED]
  packages/shared/CLAUDE.md → packages/shared/src/panel/index.ts
- `Rule: npm run build required after schema change (dist refresh)` --rationale_for--> `panel/index.ts barrel (exports types + sources)`  [INFERRED]
  packages/shared/CLAUDE.md → packages/shared/src/panel/index.ts

## Hyperedges (group relationships)
- **PanelEvent 3-type discriminated union (upsert | dismiss | snapshot)** — shared_panel_upsert_event, shared_panel_dismiss_event, shared_panel_snapshot_event, shared_panel_event_union [EXTRACTED 1.00]
- **Panel wire safety rules (companyId strip, dismiss itemId-only, resetClient handshake)** — shared_panel_company_id_strip, shared_panel_dismiss_itemid_only, shared_panel_reset_client_handshake [EXTRACTED 0.95]
- **Pluggable run source pattern (registry + Zod enum + PR2 extension point)** — shared_panel_run_sources_registry, shared_panel_run_source_schema, shared_panel_pr2_extension [EXTRACTED 0.90]

## Communities

### Community 0 - "Panel Events & Index Module"
Cohesion: 0.19
Nodes (14): Rule: npm run build required after schema change (dist refresh), PanelDismissEvent (type: 'dismiss', seq, itemId), Rule: dismiss event sends itemId only (IMPORTANT #2), PanelEvent (z.discriminatedUnion 'type'), panel/index.ts barrel (exports types + sources), PanelItem (z.discriminatedUnion 'kind'), PR2: PanelAlertItem + agent/image_edit sources to be added, Rule: resetClient: z.literal(true) — server restart seq reset (CRITICAL #9) (+6 more)

### Community 1 - "Agent / Workflow / Common Schemas"
Cohesion: 0.32
Nodes (0): 

### Community 2 - "Security: Scrub & Patterns"
Cohesion: 0.43
Nodes (4): isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 3 - "Agent Trace Test Helpers"
Cohesion: 0.6
Nodes (5): makeEvent(), makeHeartbeat(), makeLog(), makeTask(), makeTrace()

### Community 4 - "Panel Item Base & Run"
Cohesion: 0.33
Nodes (6): Rule: companyId server-only, dropped from wire, PanelItemBase (id, seq, createdAt, visibility, ...), PanelRunItem (kind: 'run', source, status, deepLink), PanelRunSourceSchema (z.enum from PANEL_RUN_SOURCES keys), visibility: 'company' | 'user' (Panel filter axis), zod (Panel schema lib)

### Community 5 - "AppException"
Cohesion: 0.67
Nodes (1): AppException

### Community 6 - "Panel sources/types files"
Cohesion: 1.0
Nodes (0): 

### Community 7 - "Panel test fixtures"
Cohesion: 1.0
Nodes (0): 

### Community 8 - "Community 8"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Community 9"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Community 10"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **8 isolated node(s):** `visibility: 'company' | 'user' (Panel filter axis)`, `Rule: companyId server-only, dropped from wire`, `Rule: dismiss event sends itemId only (IMPORTANT #2)`, `Rule: resetClient: z.literal(true) — server restart seq reset (CRITICAL #9)`, `zod (Panel schema lib)` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Panel sources/types files`** (2 nodes): `sources.ts`, `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Panel test fixtures`** (2 nodes): `types.spec.ts`, `makeRun()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (1 nodes): `inventory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (1 nodes): `profit-loss.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (1 nodes): `feature-gate.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (1 nodes): `thumbnails.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (1 nodes): `product.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (1 nodes): `dashboard.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `inspection.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `rules.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `action-task.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `ads.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `reviews.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `alerts.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `codes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PanelItem (z.discriminatedUnion 'kind')` connect `Panel Events & Index Module` to `Panel Item Base & Run`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `PanelRunItem (kind: 'run', source, status, deepLink)` connect `Panel Item Base & Run` to `Panel Events & Index Module`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `PanelItem (z.discriminatedUnion 'kind')` (e.g. with `Rule: z.infer<typeof Schema> (no separate interface)` and `Rule: satisfies pattern in services (Prisma drift detection)`) actually correct?**
  _`PanelItem (z.discriminatedUnion 'kind')` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `panel/index.ts barrel (exports types + sources)` (e.g. with `Rule: @kiditem/shared subpath exports (/schemas, /errors)` and `Rule: npm run build required after schema change (dist refresh)`) actually correct?**
  _`panel/index.ts barrel (exports types + sources)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `visibility: 'company' | 'user' (Panel filter axis)`, `Rule: companyId server-only, dropped from wire`, `Rule: dismiss event sends itemId only (IMPORTANT #2)` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._