# Agent OS Patterns — Claude Code Architecture Adoption

Pattern analysis from Claude Code source map leak.
Reference: https://bits-bytes-nn.github.io/insights/agentic-ai/2026/03/31/claude-code-source-map-leak-analysis.html

30 patterns evaluated. 5 already implemented, 7 need enhancement, 12 new to implement, 6 not applicable.

## Already Implemented

### #1 Async Generator for Agentic Loop
- **Claude Code**: `async function*` query() yields events while streaming
- **KidItem**: `manager-workflow.service.ts` — DB-persisted state suspend/resume
- **Adaptation**: True generator replaced with DB state machine for server restart recovery

### #7 Three-Tier Error Recovery Cascade
- **Claude Code**: Free recovery → low-cost API → escalation
- **KidItem**: `heartbeat.service.ts` — session retry (free) → failCount++ → 3-strike auto-pause
- **Matches principle**: never incur cost until free options exhausted

### #9 Build-Time Feature Gating
- **Claude Code**: `feature()` evaluated at compile time, dead code eliminated
- **KidItem**: `feature-gate.service.ts` — DB-based runtime gate, no caching
- **Adaptation**: Runtime gate is correct for server-side; compile-time is CLI-specific

### #18 Four-Tier Token Warning System
- **Claude Code**: Normal → Warning (yellow) → Error (orange) → Auto-Compact → Blocking (red)
- **KidItem**: `heartbeat.service.ts` — <80% normal → 80% warn → 95% critical → 100% block
- **Both emit events** at each threshold for UI signaling

### #27 Server-Side Kill Switch
- **Claude Code**: GrowthBook flags for zero-downtime feature disable
- **KidItem**: `FeatureGateService.isEnabled()` — DB toggle, no caching, real-time

---

## Enhancement Needed

### #2 Atomic State Transition
- **Gap**: `ExecutionContext` is immutable (Object.freeze), but `WorkflowContext` is mutable Map
- **Action**: Apply Object.freeze to WorkflowContext step outputs. Each step gets immutable snapshot of previous state.
- **Files**: `apps/server/src/workflows/context.ts`

### #8 Permission Hierarchy (8-Source Priority) — Implemented (2026-04-13)
- **Gap**: Single-level `allowedTools` + `permissionMode` strings, delegated to Claude CLI
- **Action**: Multi-layer resolution: global defaults → company policy → agentType config → instance override → runtime extra. Server-side validation before CLI delegation.
- **Files**: `permissions/hierarchy.validator.ts`

### #14 Coordinator Mode (Privilege Separation)
- **Gap**: Manager orchestrates specialists but has same tool access (Bash, Read, etc.)
- **Action**: Manager agent gets orchestration-only tools (spawn agent, read results, approve/reject). Specialists get domain-specific tools. Enforce via `allowedTools` per agent role.
- **Files**: `seed-agents.ts`, `adapters/claude-local/execute.ts`

### #17 Async Transcript Recording
- **Gap**: HeartbeatRun records everything synchronously after execution
- **Action**: Split into blocking (result + status) and fire-and-forget (stdout excerpt, activity event, cost analytics). Use `setImmediate()` or event-based for non-critical writes.
- **Files**: `heartbeat.service.ts`, `agent-registry.service.ts`

### #19 Stop Hooks (Validation Retry)
- **Gap**: Zod validation on output exists but failure only logs, doesn't retry
- **Action**: On validation failure, retry agent with appended "your output was invalid, fix: {errors}" prompt. Max 1 retry within budget.
- **Files**: `heartbeat.service.ts`, `schemas/validate-output.ts`

### #28 Skill Safety Filtering (Deny Rules)
- **Gap**: Skills mounted via symlinks with no filtering
- **Action**: Add `deniedSkills` field on AgentDefinition. Filter skill list before mounting. Prevent dangerous skill injection per agent type.
- **Files**: `skills/skills.service.ts`, `seed-agents.ts`, schema

### #30 Dynamic Agent Cron — Implemented (2026-04-13)
- **Gap**: Static `schedule` cron field on agent definition, manual sync
- **Action**: Allow agents to create/modify their own schedules at runtime via structured output field `{ nextSchedule: "0 9 * * *" }`. Auto-sync on result reception.
- **Files**: `heartbeat.service.ts:replaceAgentTimer()`

---

## New Implementation

### #3 Four-Layer Message Compression — Implemented (2026-04-13) (infrastructure only, not connected)
- **Need**: Multi-turn agent conversations will exhaust context window
- **Approach**: Add `contextStrategy` field on AgentDefinition: `single-shot` (current) / `multi-turn`. For multi-turn: excerpt old results → selective clear → summarize via AI → hard truncate.
- **Files**: `context-manager/compressor.service.ts`

### #4 Diminishing Returns Detection — Implemented (2026-04-13) (adapter AsyncGenerator)
- **Need**: Prevent token waste when agent spins without progress
- **Approach**: Switch to `--output-format stream-json`. Monitor token delta per continuation. Stop after 3 consecutive continuations producing < 500 tokens.
- **Files**: `adapters/types.ts` (AsyncGenerator), `adapters/claude-local/execute.ts`

### #5 Concurrent-Safe Parallel Execution
- **Need**: Workflow DAG has independent branches that run sequentially
- **Approach**: Tag executors with `isConcurrencySafe: boolean`. DAG engine detects independent nodes (no shared inputs) → `Promise.all()`. Read-only executors (fetch, filter, sort) are safe. Write executors (update, create) are serial.
- **When**: Phase 2
- **Files**: `workflow-runner.service.ts`, `executors/types.ts`, `executors/catalog.ts`

### #6 Model Fallback with Tombstoning — Implemented (2026-04-13)
- **Need**: Claude API outage shouldn't halt all agents
- **Approach**: `AdapterModule` gets fallback chain: claude-local → gemini-api (new adapter) → manual-queue. On failure, create tombstone record marking abandoned run, switch to next adapter. Tombstone prevents duplicate execution on recovery.
- **Files**: `adapters/fallback-chain.ts`

### #10 Selective Result Clearing (Microcompact) — Implemented (2026-04-13)
- **Need**: HeartbeatRun stdout excerpts accumulate without cleanup
- **Approach**: Keep last N runs at full detail. Older runs: replace stdout with AI-generated summary (single sentence). Configurable retention per agent.
- **Files**: `lifecycle/result-cleanup.service.ts`

### #11 Tool Pool Ordering (Cache Stability)
- **Need**: Skill list order changes invalidate Claude's prompt cache
- **Approach**: Sort skills alphabetically before mounting. Built-in rules first, custom skills second. Consistent ordering = stable prompt prefix = better cache hit rate.
- **When**: Phase 1
- **Files**: `skills/skills.service.ts`

### #12 Transcript Classifier (Smart Permission) — Implemented (2026-04-13) (rule-based v1)
- **Need**: Move beyond `bypassPermissions` to intelligent permission decisions
- **Approach**: Per agent type, define `safeTools` whitelist. Tools outside whitelist → lightweight AI classifier judges safety. 3 consecutive rejections → escalate to human. Track all decisions.
- **Files**: `permissions/classifier.ts`

### #13 Dangerous Pattern Detection
- **Need**: Prevent dangerous tool configurations even if Claude CLI allows them
- **Approach**: `validateAllowedTools(tools: string)` server-side function. Block patterns: `python:*`, `Bash(rm:*)`, interpreter wildcards, `sudo:*`. Run on seed-agents registration and API create/update.
- **When**: Phase 1
- **Files**: New `validators/dangerous-patterns.ts`, `agent-registry.service.ts`, `seed-agents.ts`

### #15 Shared Scratch Workspace
- **Need**: Multi-agent workflows need intermediate result sharing
- **Approach**: `/tmp/kiditem-scratch/{workflowId}/` directory. Manager creates workspace, passes path to specialists via ExecutionContext env var. Cleanup on workflow completion.
- **When**: Phase 2
- **Files**: `manager-workflow.service.ts`, `adapters/types.ts`, `heartbeat.service.ts`

### #21 Max Output Tokens Escalation — Implemented (2026-04-13)
- **Need**: Agent output truncation when response exceeds default limit
- **Approach**: Add `maxOutputTokens` field on AgentDefinition (default 8192). On 413/overflow detection in adapter output, auto-escalate to 65536 and retry once. Pass `--max-tokens` to Claude CLI.
- **Files**: `adapters/claude-local/execute.ts`, `heartbeat.service.ts`

### #22 Permission Denial Tracking
- **Need**: Audit trail for agent permission decisions
- **Approach**: New `agent_permission_denials` table: agentId, toolName, reason, timestamp, runId. Log every denial from classifier (#12) or manual rejection. Dashboard query endpoint.
- **When**: Phase 2
- **Files**: Schema, new service, `agent-registry.controller.ts`

### #24 Prefetch + Harvest
- **Need**: Reduce agent startup latency
- **Approach**: In heartbeat.wakeAgent(), run `Promise.all([mountSkills(), loadRules(), buildContext(), checkFeatureGate()])` instead of sequential calls. Harvest results before spawn.
- **When**: Phase 1
- **Files**: `heartbeat.service.ts`

---

## Not Applicable

| # | Pattern | Reason |
|---|---|---|
| #16 | Context Collapse Read-Time Projection | Claude CLI manages its own message history internally |
| #20 | PTL Retry with Group Dropping | Claude CLI internal context management, server cannot intervene |
| #23 | File State Cache for Deduplication | CLI client pattern; server orchestrator doesn't do repeated file reads |
| #25 | Trusted Device Token Auth | Internal service communication; no device binding needed |
| #26 | Git Worktree Session Isolation | Claude CLI `--session-id` already handles this |
| #29 | Voice Mode Auth Gating | No voice mode in KidItem |

---

## Implementation Phases

### Phase 1 — Immediate (current code, no new features)
1. **#2** WorkflowContext immutable snapshots
2. **#11** Skill pool alphabetical ordering
3. **#13** Dangerous pattern detection for allowedTools
4. **#17** Async transcript recording (split blocking/non-blocking)
5. **#24** Prefetch + Harvest parallel preparation

### Phase 2 — Short-term (new features)
6. **#5** Concurrent-safe parallel workflow execution
7. **#14** Coordinator privilege separation
8. **#15** Shared scratch workspace
9. **#19** Validation retry on schema failure
10. **#22** Permission denial tracking
11. **#28** Skill deny rules

### Phase 3 — Mid-term (architecture expansion) — Implemented (2026-04-13)
12. **#4** Diminishing returns detection
13. **#6** Model fallback with tombstoning
14. **#8** Multi-layer permission hierarchy
15. **#12** Transcript classifier (smart permission)
16. **#21** Max output tokens escalation
17. **#30** Dynamic agent cron

### Phase 4 — Long-term (multi-turn transition) — Implemented (2026-04-13)
18. **#3** Four-layer message compression
19. **#10** Selective result clearing (microcompact)
