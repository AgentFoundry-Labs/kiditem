# Graph Report - apps/server/src/chat  (2026-04-14)

## Corpus Check
- Corpus is ~1,953 words - fits in a single context window. You may not need a graph.

## Summary
- 61 nodes · 51 edges · 16 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (12n)|Cluster 0 (12n)]]
- [[_COMMUNITY_Cluster 1 (10n)|Cluster 1 (10n)]]
- [[_COMMUNITY_Cluster 2 (7n)|Cluster 2 (7n)]]
- [[_COMMUNITY_Cluster 3 (5n)|Cluster 3 (5n)]]
- [[_COMMUNITY_Cluster 4 (5n)|Cluster 4 (5n)]]
- [[_COMMUNITY_Cluster 5 (5n)|Cluster 5 (5n)]]
- [[_COMMUNITY_Cluster 6 (4n)|Cluster 6 (4n)]]
- [[_COMMUNITY_Cluster 7 (3n)|Cluster 7 (3n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (1n)|Cluster 10 (1n)]]
- [[_COMMUNITY_Cluster 11 (1n)|Cluster 11 (1n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI` - 9 edges
2. `ChatService` - 6 edges
3. `SIGTERM → SIGKILL grace — zombie prevention` - 5 edges
4. `Tool allowlist for safety — --permission-mode + --allowedTools read-only enforcement` - 5 edges
5. `chat.controller.ts — POST /api/chat (SSE)` - 5 edges
6. `ClaudeCliAdapter` - 4 edges
7. `chat.service.ts — CopilotKit runtime init + Observable stream` - 4 edges
8. `ChatController` - 3 edges
9. `Process per request — no pooling, short lifetime (2-120s)` - 3 edges
10. `No data injection in prompts — agent queries DB dynamically` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Process per request — no pooling, short lifetime (2-120s)` --rationale_for--> `claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 7 → community 1_
- `SIGTERM → SIGKILL grace — zombie prevention` --rationale_for--> `claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 5 → community 1_
- `Tool allowlist for safety — --permission-mode + --allowedTools read-only enforcement` --rationale_for--> `claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 4 → community 1_
- `claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI` --modification_triggers--> `chat.service.ts — CopilotKit runtime init + Observable stream`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 0 → community 1_

## Communities

### Community 0 - "Cluster 0 (12n)"
Cohesion: 0.18
Nodes (12): chat.controller.ts — POST /api/chat (SSE), dto/chat.dto.ts — ChatRequestDto, chat.module.ts, chat.service.ts — CopilotKit runtime init + Observable stream, dto/index.ts, main.ts — Express pre-registration for /api/chat/copilot, apps/server/package.json — @copilotkit/runtime@^1.54.1, Dual mount — /api/chat (NestJS) + /api/chat/copilot/* (CopilotKit Hono) (+4 more)

### Community 1 - "Cluster 1 (10n)"
Cohesion: 0.2
Nodes (10): agent-config/prompts/agents/chat.md — runtime prompt, claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI, ENV priority — CHATBOT_DATABASE_URL > AGENT_DATABASE_URL > DATABASE_URL, No data injection in prompts — agent queries DB dynamically, Silent JSON failure — corruption recovery, Token buffering — newline-bounded, partial JSON accumulation, No data variable injection in prompts, No stderr logging (silent failure is intentional) (+2 more)

### Community 2 - "Cluster 2 (7n)"
Cohesion: 0.29
Nodes (1): ChatService

### Community 3 - "Cluster 3 (5n)"
Cohesion: 0.5
Nodes (1): ClaudeCliAdapter

### Community 4 - "Cluster 4 (5n)"
Cohesion: 0.4
Nodes (5): Tool allowlist for safety — --permission-mode + --allowedTools read-only enforcement, No shell interpolation — spawn args must be explicit array, No tool allowlist changes without security audit (current: Bash(psql:*) Read Grep), Args changes (model, tools) require claude-cli-adapter.ts:args + tests + security review, Read-only PostgreSQL access via Bash(psql:*) tool only

### Community 5 - "Cluster 5 (5n)"
Cohesion: 0.4
Nodes (5): SIGTERM → SIGKILL grace — zombie prevention, No timeout logic removal (resource exhaustion guard), Subscriber unsubscribe must trigger child.kill('SIGTERM') for cleanup, Timeout/grace constants (TIMEOUT_MS, GRACE_MS) require load test before change, Timeout 120s (SIGTERM) with 10s grace (SIGKILL)

### Community 6 - "Cluster 6 (4n)"
Cohesion: 0.5
Nodes (1): ChatController

### Community 7 - "Cluster 7 (3n)"
Cohesion: 0.67
Nodes (3): Process per request — no pooling, short lifetime (2-120s), No child process sharing (breaks request isolation, multi-tenant risk), Multi-tenant credential injection requires ADR

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (1): ChatModule

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (1): ChatRequestDto

### Community 10 - "Cluster 10 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Cluster 11 (1n)"
Cohesion: 1.0
Nodes (1): Hono router has /info and other sub-routes that NestJS @All('copilot') exact-match would block

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (1): req.url = req.originalUrl patch compensates for Express prefix strip

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (1): Incomplete lines kept in buffer, resumed on next chunk; close handler drains remainder

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): Malformed JSON lines skipped to maintain stream robustness

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (1): chat is self-contained and independent from agent-registry despite shared DB pattern

## Knowledge Gaps
- **28 isolated node(s):** `ChatModule`, `ChatRequestDto`, `Token buffering — newline-bounded, partial JSON accumulation`, `SSE stream — Observable → MessageEvent per token via text/event-stream headers`, `Args changes (model, tools) require claude-cli-adapter.ts:args + tests + security review` (+23 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `ChatModule`, `chat.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `ChatRequestDto`, `chat.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (1n)`** (1 nodes): `Hono router has /info and other sub-routes that NestJS @All('copilot') exact-match would block`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `req.url = req.originalUrl patch compensates for Express prefix strip`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `Incomplete lines kept in buffer, resumed on next chunk; close handler drains remainder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `Malformed JSON lines skipped to maintain stream robustness`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `chat is self-contained and independent from agent-registry despite shared DB pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI` connect `Cluster 1 (10n)` to `Cluster 0 (12n)`, `Cluster 4 (5n)`, `Cluster 5 (5n)`, `Cluster 7 (3n)`?**
  _High betweenness centrality (0.264) - this node is a cross-community bridge._
- **Why does `chat.service.ts — CopilotKit runtime init + Observable stream` connect `Cluster 0 (12n)` to `Cluster 1 (10n)`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI` (e.g. with `Process per request — no pooling, short lifetime (2-120s)` and `Token buffering — newline-bounded, partial JSON accumulation`) actually correct?**
  _`claude-cli-adapter.ts — CopilotServiceAdapter implementation, spawns Claude CLI` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `chat.controller.ts — POST /api/chat (SSE)` (e.g. with `Dual mount — /api/chat (NestJS) + /api/chat/copilot/* (CopilotKit Hono)` and `SSE stream — Observable → MessageEvent per token via text/event-stream headers`) actually correct?**
  _`chat.controller.ts — POST /api/chat (SSE)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ChatModule`, `ChatRequestDto`, `Token buffering — newline-bounded, partial JSON accumulation` to the rest of the system?**
  _28 weakly-connected nodes found - possible documentation gaps or missing edges._