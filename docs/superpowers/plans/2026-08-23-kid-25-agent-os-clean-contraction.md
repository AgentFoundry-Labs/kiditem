# KID-25 Single-Node Agent OS Clean Contraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreleased Agent OS/Interaction OS graph with a six-model, single-home-server Agent OS that provides correct CLI admission, exact capability/HITL semantics, a clean destructive schema cutover, and basic same-SHA restart recovery.

**Architecture:** One Nest API process owns same-origin CopilotKit, process-local Attempt admission, direct loopback MCP v2 HTTP, and all durable Agent authority. One native macOS/Windows Host Runner owns only disposable Codex/Claude CLI processes through outbound command long-poll and idempotent event POST. The existing worker owns durable mutation Invocation dispatch, Approval expiry, and deterministic Operations. PostgreSQL stores work and exact mutation authorization only; reasoning restart is always a user-triggered immutable successor Attempt.

**Tech Stack:** NestJS, TypeScript, Prisma/PostgreSQL, Zod, CopilotKit OSS/AG-UI `1.67.1`, MCP SDK v2 `2.0.0`, MCP `2026-07-28`, Codex CLI `0.149.1`, Claude Code `2.1.245`, native macOS/Windows Host Runner, Next.js/React, Vitest, Playwright, Docker Compose, GitHub Actions.

---

## Execution Contract

The authority is `docs/superpowers/specs/2026-08-23-kid-25-agent-os-clean-contraction-design.md`. The runtime/deployment implementation authority is `docs/superpowers/plans/2026-08-24-kid-25-mcp-v2-runtime-train.md`; it replaces every container CLI, stdio, UDS, or API-local process instruction that remains in an older plan revision. These six tasks are substantial integrated Terra work units; do not split them into file-sized subagent tasks. Every implementation subagent uses Terra with `max` reasoning. Task numbers are review checkpoints, not compatibility boundaries: move replacement/deletion work across them when necessary for a coherent clean cutover, and never preserve a legacy entrypoint or fallback merely for an intermediate task. The parent verifies every integrated unit against its TDD/focused gates. Sol `max` review is selective for important security, authority, transport, process-isolation, or deployment boundaries rather than mandatory per task. Final completion is QA-driven: run the complete local matrix, real Codex canary, deterministic Claude contracts, negative authority probes, and required Windows CI. Use another targeted review only when QA exposes a boundary ambiguity.

Do not add any of the following while implementing:

- Session lifecycle/deletion cutoff/generation or deletion Operation;
- Task `continuationMode`, Attempt `continuationKey`, background coordinator,
  Operation-to-Agent trigger, or automatic successor reasoning;
- PostgreSQL advisory executor lock, multiple API executors, capacity queue, or
  distributed signal;
- automatic mutation release drain, compatibility workflow/image, isolated
  restore rehearsal, RPO/RTO evidence, or automatic dependency upgrade;
- transcript/replay/artifact/cost/provider-session/credential/grant/outbox
  persistence; or
- compatibility routes, dual-write, backfill, conversion, or legacy reader.

All shell commands below include the repository-required `rtk` prefix. Database
commands must use the explicit task-specific disposable URL shown; an empty URL
is a hard stop.

## Fixed Final Contract

| Authority | Final value |
|---|---|
| Models | `AgentVersion`, `AgentSession`, `AgentTask`, `AgentAttempt`, `AgentCapabilityInvocation`, `AgentCapabilityApproval` |
| Session state | no lifecycle column |
| Task status | `open \| completed \| failed \| cancelled` |
| Attempt status | `starting \| running \| succeeded \| failed \| process_interrupted \| cancelled` |
| Invocation status | `authorized \| approval_pending \| ready \| executing \| succeeded \| failed` |
| Approval status | `pending \| approved \| rejected \| expired` |
| Authorization | `agent_default_scope \| cross_domain_read_grant \| explicit_execution_grant` |
| Admission | one API process, process-local max 4, immediate reject, no queue/DB lock |
| Follow-up | current-user message/Continue creates a successor Attempt; never automatic |
| Replay | same logical key/input returns existing work; never creates a successor |
| HITL completion | advances only admitted deterministic mutation/Operation; never wakes or relaunches CLI reasoning |
| Web work view | source Task/Attempt/Approval/Invocation/Operation/child facts only; no Task presentation enum |
| CLI permission | trusted full-access/non-interactive mode under the dedicated non-administrator OS account |
| Deletion | terminal-only transactional hard delete; otherwise `session_busy` |
| Restart | same-SHA Attempt/read interruption, manual Continue, durable Approval/mutation recovery |

## Task 1: Establish Final Registries, Replacement Tables, Shared Contracts, and Legacy Scanner

**Files:**

- Create: `apps/server/src/agent-os/domain/catalog/domain-definition.registry.ts`
- Create: `apps/server/src/agent-os/domain/catalog/domain-definition.registry.spec.ts`
- Create: `apps/server/src/agent-os/domain/capability/capability-definition.ts`
- Create: `apps/server/src/agent-os/domain/capability/capability-routing.policy.ts`
- Create: `apps/server/src/agent-os/domain/capability/capability-routing.policy.spec.ts`
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Modify: `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`
- Modify: `apps/server/src/agent-os/application/port/out/capability/agent-capability-handler.port.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-capability-registry.service.ts`
- Create: `scripts/check-agent-os-contraction.mjs`
- Create: `scripts/__tests__/check-agent-os-contraction.test.mjs`
- Modify: `scripts/check-agent-os-hexagonal.mjs`
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/system.prisma`
- Create: `apps/server/src/agent-os/__tests__/agent-work-schema.static.spec.ts`
- Create: `packages/shared/src/agent-interaction/work.ts`
- Create: `packages/shared/src/agent-interaction/work.spec.ts`
- Modify: `packages/shared/src/agent-interaction/index.ts`
- Modify: `packages/shared/src/identifiers/index.ts`
- Modify: `packages/shared/src/identifiers/index.spec.ts`
- Create: `apps/server/src/agent-os/application/port/out/work/agent-work-repository.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/work/agent-work-transaction.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/work/prisma-agent-work.repository.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/work/prisma-agent-work.transaction.ts`
- Create: `apps/server/src/agent-os/__tests__/agent-work-repository.pg.integration.spec.ts`

- [x] **Step 1: Write failing domain, Agent, capability, and schema contract tests**

Require the exact catalog and six Agent definitions:

```typescript
expect(DOMAIN_KEYS).toEqual([
  'advertising', 'agent_os', 'ai', 'analytics', 'automation', 'channels',
  'finance', 'inventory', 'orders', 'operations', 'products', 'rules',
  'sourcing', 'supply',
]);

expect(AGENT_DEFINITIONS).toEqual([
  { key: 'operator', assignedDomains: ['agent_os', 'automation', 'operations'] },
  { key: 'sourcing', assignedDomains: ['sourcing'] },
  { key: 'merchandising', assignedDomains: ['products', 'ai'] },
  { key: 'supply', assignedDomains: ['supply'] },
  { key: 'channel_operations', assignedDomains: ['channels', 'orders', 'inventory'] },
  { key: 'advertising', assignedDomains: ['advertising'] },
]);
```

Require one owner-prefixed definition and implementation per capability, no
unique domain-owner mapping, and this routing/HITL matrix:

```typescript
expect(route(ownRead)).toBe('direct');
expect(route(crossDomainRead)).toBe('direct');
expect(route(ownMutation)).toBe('direct');
expect(route(crossDomainMutation)).toBe('delegate');
expect(requiresHumanApproval(mediumMutation)).toBe(true);
expect(requiresHumanApproval(highMutation)).toBe(true);
```

The static schema test must require the four fixed status sets, string-backed
columns, replacement physical tables, and absence of Session lifecycle,
`continuationMode`, `continuationKey`, and native PostgreSQL enums.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/domain/catalog/domain-definition.registry.spec.ts \
  src/agent-os/domain/__tests__/agent-definition.registry.spec.ts \
  src/agent-os/domain/capability/capability-routing.policy.spec.ts \
  src/agent-os/__tests__/agent-work-schema.static.spec.ts
```

Expected: FAIL because the final registries and replacement graph do not exist.

- [x] **Step 2: Implement the final registry and policy source**

Use this mutation policy:

```typescript
export const MUTATION_EFFECTS = new Set<CapabilityEffect>([
  'db_write',
  'external_write',
  'job_enqueue',
]);

export function isMutation(definition: CapabilityDefinition): boolean {
  return definition.effects.some((effect) => MUTATION_EFFECTS.has(effect));
}

export function requiresDomainDelegation(
  assignedDomains: readonly DomainKey[],
  definition: CapabilityDefinition,
): boolean {
  return !assignedDomains.includes(definition.ownerDomain) && isMutation(definition);
}

export function requiresHumanApproval(definition: CapabilityDefinition): boolean {
  return isMutation(definition) &&
    (definition.approvalRisk === 'medium' || definition.approvalRisk === 'high');
}
```

`CapabilityDefinition` contains key, owner domain, description, real Zod
input/output schemas, effects, `approvalRisk`, idempotency, and owner input-port
identity. Keep descriptive `read|browser|external_io|llm` effects, remove `cost`,
and do not add `requirements`. Boot rejects non-owner-prefixed keys, medium/high
queries, and mutations whose idempotency is not `required`.

Contract the implementation handler to `{ capabilityKey, invoke }`; it returns
only concise summary, resource refs, operation refs, and typed output. It does
not repeat schemas/effects/risk/idempotency and cannot return an artifact.

- [x] **Step 3: Add the physically separate replacement graph**

Use final logical Prisma symbols `AgentVersion`, `AgentSession`, and
`AgentTask`, mapped to physical tables `agent_work_versions`,
`agent_work_sessions`, and `agent_work_tasks`. Add `AgentAttempt`,
`AgentCapabilityInvocation`, and `AgentCapabilityApproval` against them. Do not
modify populated legacy rows or write both graphs.

The exact fields are:

```text
AgentVersion
  id, agentDefinitionKey, version, assignedDomains, capabilityKeys,
  runtimeType, instructionProfileRef, manifestHash,
  activatedAt?, retiredAt?, createdAt

AgentSession
  id, organizationId, createdByUserId, createdAt, updatedAt

AgentTask
  id, organizationId, sessionId, parentTaskId?, assignedAgentVersionId,
  objective, completionCriteria, inputResourceRefs, status,
  delegatedFromAttemptId?, delegationIdempotencyKey?,
  delegationRequestHash?, createdAt, updatedAt, finishedAt?

AgentAttempt
  id, organizationId, sessionId, taskId, agentVersionId, ordinal,
  predecessorAttemptId?, input, runtimeType, instructionProfileRef,
  applicationVersion, authorizingGitSha, cliVersion, reportedModel?,
  status, result?, error?, inputTokens?, outputTokens?,
  startedAt?, finishedAt?, createdAt

AgentCapabilityInvocation
  id, organizationId, sessionId, taskId, attemptId, agentVersionId,
  initiatingUserId, capabilityKey, ownerDomain, authorizationKind,
  authorizationExpiresAt, inputHash, canonicalInput?, effects,
  approvalRisk, idempotencyRequirement, ownerIdempotencyKey?,
  applicationVersion, authorizingGitSha, capabilityContractFingerprint,
  runtimeType, reportedModel?, status, leaseOwner?, leaseExpiresAt?,
  attemptCount, result?, error?, createdAt, updatedAt, finishedAt?

AgentCapabilityApproval
  id, organizationId, sessionId, invocationId, inputHash, status,
  expiresAt, decidedByUserId?, decisionReason?, createdAt, decidedAt?
```

Add partial unique constraints for one root Task, one live Attempt, delegated
Task idempotency, and mutation owner idempotency; add unique Task ordinal and
one Approval per Invocation. All relations are organization-fenced.

- [x] **Step 4: Implement shared work schemas and narrow persistence ports**

Use a common result envelope with no continuation/artifact/transcript fields:

```typescript
export const AgentResultEnvelopeSchema = z.object({
  outcome: z.enum(['completed', 'needs_input', 'failed']),
  summary: z.string().min(1),
  resourceRefs: z.array(ResourceRefSchema),
  operationRefs: z.array(OperationRefSchema),
  needsInput: z.object({ code: z.string(), prompt: z.string() }).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  output: z.unknown().optional(),
});
```

Repository/transaction ports expose named operations for admission,
Invocation authorization, Approval decision/expiry, worker claim/finalize,
projection load, reconciliation, and terminal-only Session deletion. They do
not expose Prisma delegates or a general transaction callback. Every mutation
takes `organizationId`; every single-resource read uses `{ id, organizationId }`.

- [x] **Step 5: Add report/enforce legacy scanning**

`scripts/check-agent-os-contraction.mjs` supports `--report` during Tasks 1–4
and `--enforce` after Task 5. It finds legacy AgentRun/Execution,
conversation/replay, artifact/cost, authority/grant/policy, provider
session/credential/handle codecs, Hermes/OpenAI, gateway/HMAC, fixed playbook,
background continuation, advisory lock, release drain, coordinated deletion,
and old shared/Web/API paths. It must allow the process-memory-only
`liveControlHandle` fixture and never maintain a production finding allowlist.

Run:

```bash
rtk node --test scripts/__tests__/check-agent-os-contraction.test.mjs
rtk node scripts/check-agent-os-contraction.mjs --report
```

Expected: scanner tests PASS and report mode lists current legacy findings.

- [x] **Step 6: Verify additive persistence and commit**

```bash
rtk node -e "if (!process.env.KID25_AGENT_TEST_DATABASE_URL) throw new Error('KID25_AGENT_TEST_DATABASE_URL is required')"
rtk env DATABASE_URL="$KID25_AGENT_TEST_DATABASE_URL" npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk env DATABASE_URL="$KID25_AGENT_TEST_DATABASE_URL" npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-work-repository.pg.integration.spec.ts
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/domain/catalog \
  src/agent-os/domain/capability \
  src/agent-os/__tests__/agent-work-schema.static.spec.ts
rtk git add prisma packages/shared apps/server/src/agent-os scripts
rtk git commit -m "refactor: add minimal Agent work contracts"
```

Expected: PASS; no destructive push or legacy data rewrite occurs in this task.

## Task 2: Implement Single-Process Admission, Task Lifecycle, Exact Invocation, HITL, and Terminal Delete

**Files:**

- Create: `apps/server/src/agent-os/application/service/work/agent-attempt-capacity.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-attempt-admission.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-task-lifecycle.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-capability-invocation.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-capability-approval.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-approval-expiry.service.ts`
- Delete: `apps/server/src/agent-os/application/service/work/agent-work-projection.service.ts`
- Modify: `apps/server/src/agent-os/application/service/work/agent-work-query.service.ts`
- Modify: `apps/server/src/agent-os/application/port/out/work/agent-work-repository.port.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-session-terminal-delete.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/__tests__/agent-work-lifecycle.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/agent-work-races.pg.integration.spec.ts`
- Replace internals under: `apps/server/src/agent-os/application/service/session-control/`
- Replace internals under: `apps/server/src/agent-os/adapter/out/transaction/session-control/`

- [x] **Step 1: Extend the failing admission and lifecycle matrix**

Cover these exact cases:

```text
new Session/root/first Attempt: capacity then one atomic transaction
root replay same message key/input: existing root/Attempt, no live duplicate
root replay same key/changed input: idempotency conflict
same Session/different root key: root_task_already_exists, no live/successor
follow-up/Continue: terminal predecessor plus no live Attempt
live message: in-memory delivery, no successor row
accepted live message versus terminal race: close stream, no successor replay
same-Task concurrent follow-up: one winner, attempt_already_running
live parent delegation: allowed; child first Attempt created atomically
delegation replay same hash: existing child/latest Attempt, no slot/relaunch/successor
delegation replay changed hash: delegation_idempotency_conflict
four live Attempts: accepted; fifth: agent_capacity_exhausted, no row
cancel Task: live Attempt cancelled, pending Approval expired,
             ready/executing mutation preserved
cancelled Task ordinary message: task_cancelled
explicit current-user Reopen: open plus immutable successor Attempt
approval decision: deterministic admitted work only, no live CLI wake/successor
facts-only work view: no Task presentation enum or needs_continue state
terminal-only Session delete versus admission: one winner, no orphan/slot leak
busy Session delete: session_busy, no row removed
```

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/work/__tests__/agent-work-lifecycle.spec.ts
rtk npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-work-races.pg.integration.spec.ts
```

Expected: FAIL before the common boundary exists.

- [x] **Step 2: Implement immediate process-local capacity and common admission**

`AGENT_CLI_MAX_CONCURRENCY` defaults to `4`. `tryReserve()` returns a
single-release lease or throws `agent_capacity_exhausted`; it never waits or
writes capacity state.

Root, follow-up, explicit retry/Continue, and delegation use one admission
service. A bounded logical message key distinguishes transport replay from a
new command. Root same-key/same-input replay returns the existing root Attempt;
same-key drift conflicts and never becomes live input. Follow-up locks Session
then Task and validates current user/active organization, Task status, pinned
AgentVersion/runtime, predecessor terminality, and no live Attempt. Delegation
fast-reads an existing same-key/same-hash child and latest Attempt without
relaunching or creating a successor; otherwise it reserves capacity, locks
Session then the live parent Task, proves the exact delegating Attempt, and
creates child plus first Attempt atomically. Every rejection/race releases its
provisional lease.

Do not acquire a PostgreSQL advisory lock and do not add background admission.

- [x] **Step 3: Implement exact Invocation authorization and Approval**

Canonicalize input before authorization and atomically create one Invocation:

```typescript
const initialStatus = isMutation(definition)
  ? requiresHumanApproval(definition)
    ? 'approval_pending'
    : 'ready'
  : 'authorized';
```

Reads retain only `inputHash` and execute inline. Mutations retain canonical
input, hash, required owner idempotency key, release/SHA, and capability
fingerprint. Medium/high mutations create a pending Approval in the same
transaction before any notice. Approval decision locks Session, Invocation,
and Approval, validates exact hash/current user/expiry, and atomically changes
Approval plus Invocation. The expiry service uses the same fence and changes
due pending Approval to `expired` and Invocation to `failed/approval_expired`.

- [x] **Step 4: Implement explicit Task transitions and facts-only work view**

Only the lifecycle service writes Task status. Process errors never directly
write Task terminal state. Enforce:

```text
open -> completed|failed      validated business outcome and no pending work
open -> cancelled             explicit current-user command
completed|failed -> open      explicit follow-up/retry
cancelled -> open             explicit current-user Reopen only
```

Return Task status, latest Attempt, Approval rows, admitted Invocation/
Operation references, child Tasks, and structured result content directly.
Do not define or return Task-facing `running`, `awaiting_approval`,
`awaiting_operation`, `awaiting_child`, `needs_input`, `needs_continue`,
terminal, or error presentation values. `result.needsInput` remains bounded
result content, not a lifecycle. Continue is an explicit action available when
there is no live Attempt and the Task is not cancelled. Replaying a delegation
key returns existing source facts and cannot synthesize Continue.

- [x] **Step 5: Implement terminal-only transactional Session deletion**

Lock the organization-fenced Session row, then inspect Tasks/Attempts/
Invocations/Approvals. If any Attempt or Invocation is nonterminal or Approval
is pending, return `session_busy`. Otherwise hard-delete the Session-owned
graph by cascade. Admission uses the same Session-before-Task lock order, so a
delete/admission race cannot leave post-delete work or require a `deleting`
state. Operations/business resources remain.

- [ ] **Step 6: Run lifecycle/race gates and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/work
rtk npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-work-races.pg.integration.spec.ts \
  src/agent-os/__tests__/agent-work-repository.pg.integration.spec.ts
rtk git add apps/server/src/agent-os packages/shared
rtk git commit -m "refactor: implement single-node Agent admission"
```

Expected: PASS with no continuation/deletion/capacity state columns.

## Task 3: Move Owner Capabilities and Integrate the Native Host Runner

**Files:**

- Modify: `apps/server/src/common/capability-definition.ts`
- Modify: `apps/server/src/sourcing/domain/capability/sourcing.capabilities.ts`
- Modify: `apps/server/src/channels/domain/capability/channels.capabilities.ts`
- Modify: `apps/server/src/ai/domain/capability/ai.capabilities.ts`
- Create: `apps/server/src/products/domain/capability/products.capabilities.ts`
- Create: `apps/server/src/supply/domain/capability/supply.capabilities.ts`
- Create: `apps/server/src/analytics/domain/capability/analytics.capabilities.ts`
- Create: `apps/server/src/agent-os/domain/capability/agent-os.capabilities.ts`
- Modify: `apps/server/src/products/application/port/in/capability/listing-generation.port.ts`
- Modify: `apps/server/src/products/adapter/in/agent/products-listing-generation-capability.adapter.ts`
- Modify: `apps/server/src/channels/application/port/in/capability/channels-final-capability.port.ts`
- Modify: `apps/server/src/channels/application/port/in/capability/marketplace-registration.port.ts`
- Modify: `apps/server/src/channels/application/port/in/capability/wing-thumbnail.port.ts`
- Modify: `apps/server/src/channels/adapter/in/agent/channels-final-capability.adapter.ts`
- Modify: `apps/server/src/channels/adapter/in/agent/channel-registration-capability.adapter.ts`
- Modify: `apps/server/src/channels/adapter/in/agent/channels-wing-thumbnail-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/application/port/in/capability/sourcing-final-capability.port.ts`
- Modify: `apps/server/src/sourcing/application/port/in/capability/sourcing-final-discovery-capability.port.ts`
- Modify: `apps/server/src/sourcing/application/port/in/capability/sourcing-frozen-registration-capability.port.ts`
- Modify: `apps/server/src/sourcing/application/port/in/capability/market-shadow-capability.port.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-final-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-final-discovery-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-frozen-registration-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/market-shadow-signal-capability.adapter.ts`
- Modify: `apps/server/src/supply/application/port/in/capability/purchase-order.port.ts`
- Modify: `apps/server/src/supply/adapter/in/agent/supply-agent-capability.adapter.ts`
- Modify: `apps/server/src/analytics/dashboard/application/port/in/analytics-overview-capability.port.ts`
- Modify: `apps/server/src/analytics/adapter/in/agent/analytics-overview-capability.adapter.ts`
- Modify: `apps/server/src/agent-os/application/port/in/capability/platform-probe.port.ts`
- Modify: `apps/server/src/agent-os/adapter/in/agent/agent-os-platform-probe-capability.adapter.ts`
- Modify: `apps/server/src/agent-os/seed-agent-os.ts`
- Modify: `scripts/seed-agent-os.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-version-publication.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/capability-owner-boundary.spec.ts`
- Runtime/control/MCP/Runner/deployment files: execute the exact file manifest in `docs/superpowers/plans/2026-08-24-kid-25-mcp-v2-runtime-train.md`

- [x] **Step 1: Write failing owner and publication tests**

Require the current exact eighteen-key Agent-facing catalog:

```text
agent_os.platform_probe
analytics.readOverview
channels.register_confirmed_listing
channels.submit_coupang_listing
channels.submit_wing_thumbnail
products.create_listing_generation_package
sourcing.collect_shadow_signals
sourcing.createReviewBatch
sourcing.duplicateCheck
sourcing.ingestCandidate
sourcing.inspectRecommendationRun
sourcing.refreshCollection
sourcing.refreshValidation
sourcing.retrieveWorkspaceEvidence
sourcing.scrapeProductUrl
sourcing.scrapeUrlWorkflow
supply.create_purchase_order_draft
supply.submit_purchase_order
```

Require Sourcing AgentVersion `capabilityKeys` to contain exactly its ten keys
above and require all ten in MCP discovery and exact-context invocation.

Assert one definition/implementation, correct owner input port, immutable
AgentVersion capability snapshot, and no wrapper Agent/AgentRun caller.

Reject session/resume IDs, budget flags, user config import, serialized
principal, HMAC, DB URL, Nest secret, business credential, provider-history
path, and capability-owned provider policy. Runtime non-persistence and network
listener assertions live in the native Host Runner plan.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/__tests__/capability-owner-boundary.spec.ts
```

Expected: FAIL on misplaced capability keys and owner-boundary violations.

- [x] **Step 2: Move capabilities to exact owner input ports and publish versions**

Move generation-package work to Products and Wing submission to Channels.
Keep shadow-signal collection as both a Sourcing-owned Operation and an Agent
capability. Advertising/Rules/AI judgment remains ordinary owner capability
behavior, not a wrapper Agent. A `job_enqueue` implementation returns
`operation_ref` immediately after durable enqueue.

Keep Sourcing's ten independent capabilities. `scrapeProductUrl` returns a
bounded normalized result/hash and never writes a candidate; `ingestCandidate`
admits only an exact same-Attempt scrape result/hash; `scrapeUrlWorkflow` uses
the existing scrape Operation and returns a discriminated existing-candidate or
enqueued-operation result. `retrieveWorkspaceEvidence` includes bounded source
documents. Exact owner idempotency reaches scrape, ingest, validation, daily
collection, review batch, and shadow Operation owners. Tests prove same-key
same-input replay, same-key changed-input conflict, missing-key rejection before
the owner call, and no duplicate candidate, validation write, or OperationRun.
Keep bounded synchronous validation as a DB mutation unless runtime evidence
requires an Operation.

Publish six AgentVersions from code-owned Agent/domain/capability registries.
Manifest hash covers Agent key/version, domains, resolved capability keys,
runtime, and instruction-profile reference. It contains no model/policy/tool
allowlist/credential. Later capability publication creates a new AgentVersion
and never mutates an existing one.

- [ ] **Step 3: Execute the native Host Runner/MCP v2 runtime train**

Execute every task in
`docs/superpowers/plans/2026-08-24-kid-25-mcp-v2-runtime-train.md` against this
same diff. The final topology is native `macos | windows` Runner execution,
outbound HTTP long-poll/event POST, and direct loopback MCP v2 Streamable HTTP
`2026-07-28`. API/worker containers neither install nor spawn provider CLIs.

The runtime train preserves the 18-capability catalog and all owner boundaries
established above. It does not authorize any AgentVersion, capability, schema,
status, or Web changes. Expected: exact logged-in Codex/Claude readiness,
non-persistent Attempts, trusted full-access/non-interactive provider mode
under the dedicated non-administrator account, bounded live control, complete
process-tree cleanup, and no provider credential/session/history persistence.

## Task 4: Dispatch Durable Mutations and Prove Basic Same-SHA Restart Recovery

**Files:**

- Create: `apps/server/src/agent-os/application/service/work/agent-mutation-dispatcher.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-inline-read-reconciler.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-attempt-reconciler.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-runtime-directory-reconciler.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-mutation-dispatcher.spec.ts`
- Modify: `apps/server/src/worker.ts`
- Modify: `apps/server/src/agent-worker-application.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-worker.module.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/operations/application/service/operation-run-worker.service.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os-automation-boundary.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/agent-restart-recovery.pg.integration.spec.ts`

- [x] **Step 1: Write failing dispatch/restart tests**

Cover:

```text
ready mutation -> executing lease -> succeeded|failed
expired executing lease after worker restart -> same owner idempotency key
same-SHA API restart -> live Attempt process_interrupted
abandoned authorized/executing read -> failed/process_interrupted, no retry
pending Approval -> preserved
ready mutation -> preserved
Task -> remains open and projects manual Continue
root/delegation transport replay -> existing projection, no automatic successor
stale workspace/socket -> safely removed beneath configured root only
changed SHA/fingerprint -> failed/stale_capability_version, no owner call
job enqueue -> succeeded with operation_ref; Operation never starts Attempt
automation workflow -> deterministic capability allowed; Agent Attempt forbidden
```

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/work/agent-mutation-dispatcher.spec.ts \
  src/agent-os/__tests__/agent-os-automation-boundary.spec.ts
rtk npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-restart-recovery.pg.integration.spec.ts
```

Expected: FAIL while old generic worker/recovery paths remain.

- [x] **Step 2: Implement Invocation-row mutation dispatch**

Use the Invocation table as the only work source. Claim `ready` rows with
bounded lease/`FOR UPDATE SKIP LOCKED`; on expired lease use the same canonical
input and owner idempotency key. Before owner call revalidate membership,
Session/Task existence, AgentVersion scope, current Git SHA, capability
fingerprint, resource version, and owner preconditions. Store concise
result/resource/operation refs only.

Changed SHA/fingerprint returns `failed/stale_capability_version`; changed
resource returns `failed/stale_resource`. A `job_enqueue` succeeds when its
Operation is durably created. Worker never creates an Attempt.

- [x] **Step 3: Implement API boot reconciliation**

On same-SHA boot:

```typescript
for (const attempt of priorLiveAttempts) {
  await markAttemptProcessInterrupted(attempt.id);
  await failNonterminalInlineReads(attempt.id, 'process_interrupted');
  await releaseProcessLocalCapacityIfPresent(attempt.id);
}
```

Leave Task `open`, pending Approval unchanged, and mutations on the worker lease
path. Remove only non-symlink validated Attempt directories/sockets beneath the
configured root and terminate only owned orphan process groups. Never recreate
canonical read input or provider session.

- [x] **Step 4: Wire worker Approval expiry and restart-safe leases**

Worker polling includes due pending Approval expiry and ready/expired-lease
mutation dispatch. Approval expiry and a concurrent user decision use the same
transaction fence and produce one winner. Worker restart has no durable worker
identity/session; lease expiry plus owner idempotency is the recovery contract.

Do not add release drain, background continuation polling, or Operation post-
accepting Agent hooks.

- [x] **Step 5: Recompose API/worker dependency roots**

API root owns live executor and boot reconciliation. Worker root owns mutation
dispatch, Approval expiry, and Operations. Worker/MCP roots cannot import or
resolve the CopilotKit HTTP adapter. Remove `AGENT_RUNTIME_WORKER_ENABLED`; the
existing worker process is always the deterministic work boundary.

- [x] **Step 6: Run restart gates and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/work \
  src/agent-os/__tests__/agent-os-automation-boundary.spec.ts
rtk npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-restart-recovery.pg.integration.spec.ts
rtk npm run build --workspace=apps/server
rtk git add apps/server/src
rtk git commit -m "refactor: recover durable Agent work after restart"
```

Expected: PASS for same-SHA API and worker restart with no duplicate mutation.

## Task 5: Cut CopilotKit/Web to Durable Work and Delete the Entire Legacy Graph

**Files:**

- Modify: `apps/server/src/agent-os/adapter/in/http/interaction/agent-os-copilotkit.controller.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/interaction/agent-os-copilotkit.agent.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/interaction/agent-os-copilotkit.runner.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/interaction/copilotkit-v2-runtime.ts`
- Replace: `apps/server/src/agent-os/adapter/in/http/interaction/agent-interaction-actions.controller.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-interaction-http.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-session.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-api-execution.module.ts`
- Modify: `apps/web/src/components/agent-interaction/AgentInteractionProvider.tsx`
- Modify: `apps/web/src/components/agent-interaction/AgentInteractionPanel.tsx`
- Modify: `apps/web/src/components/agent-interaction/AgentInteractionSurface.tsx`
- Modify: `apps/web/src/components/agent-interaction/AgentInteractionTaskList.tsx`
- Modify: `apps/web/src/components/agent-interaction/useAgentInteraction.ts`
- Modify: `apps/web/src/components/agent-interaction/__tests__/AgentInteractionSurface.spec.tsx`
- Modify: `apps/web/src/components/agent-interaction/useKidItemConversation.ts`
- Modify: `apps/web/src/components/agent-interaction/useInteractionBootstrap.ts`
- Modify: `apps/web/src/components/agent-interaction/interaction-store.ts`
- Replace: `apps/web/src/app/agent-os/page.tsx`
- Delete: `apps/web/e2e/agent-session-interaction.spec.ts`
- Delete: `apps/web/e2e/interaction-os/durable-session.spec.ts`
- Delete: `apps/web/e2e/fixtures/agent-interaction-harness.ts`
- Delete: `playwright.config.ts`
- Delete: `apps/web/src/app/(automation)/agents/`
- Delete legacy files under: `apps/web/src/app/agent-os/lib/`
- Modify AgentRun callers under: `apps/web/src/app/(product-pipeline)/`
- Delete legacy production files under: `apps/server/src/agent-os/`
- Delete: `packages/shared/src/agent-os.ts`
- Delete: `packages/shared/src/schemas/agent-os.ts`
- Delete: `packages/shared/src/schemas/agent-os.spec.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/agent-interaction/index.spec.ts`
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/system.prisma`
- Modify: `docs/ERD.md`
- Modify: `docs/erd/agentos.md`
- Modify: `docs/erd/core.md`
- Modify: `docs/erd/system.md`
- Modify: `package.json`

- [x] **Step 1: Extend failing HTTP/Web/no-replay tests**

Require authenticated same-origin `/api/copilotkit`, one root Task, future live
AG-UI, disconnect without Attempt cancellation, durable projection on refresh,
manual Continue successor, exact Approval actions, Task cancel/reopen, terminal-
only Session delete, facts-only work data with no Task presentation enum,
Approval completion without CLI wake/successor, and no past chat replay.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/in/http/interaction \
  src/agent-os/__tests__/agent-os-interaction-http.module.wiring.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction
```

Expected: FAIL on Copilot thread/replay/Execution assumptions.

- [x] **Step 2: Implement the focused Nest incoming adapter and facts-only Web view**

Nest authenticates user/organization, calls application ports in process, and
owns no replay/session/authority/active-process state. First prompt defaults to
Operator; follow-up/Continue creates a successor on the same Task; unrelated
work creates a new Session. Expose application actions for Approval, manual
Continue, live interrupt, Task cancel/reopen, and terminal Session delete.

Keep `runtimeUrl="/api/copilotkit"`. Web stores only future live UI events in
memory and renders durable Task tree, Attempt, Approval, mutation/Operation,
summary, refs, and optional structured `result.needsInput` content as source
facts. It defines no Task presentation enum. Continue is a user action, not a
state or automatic trigger. No transcript is rebuilt after refresh.

Delete `AgentWorkProjectionService` and the `presentation` field. Rename any
remaining query/repository/Web aggregate type to facts/view terminology rather
than preserving a presentation-layer compatibility alias.

- [x] **Step 3: Switch retained product/domain callers before deletion**

Replace every `AGENT_RUNNER_PORT`/legacy AgentRun caller with the correct owner
capability, deterministic Operation endpoint, or explicit Agent OS entrypoint.
In particular, retained product-pipeline actions use Products/Channels owner
contracts rather than silently losing functionality. Worker and Web compile
against replacement work contracts only. No live request writes the legacy
graph.

- [x] **Step 4: Delete legacy code/shared exports and finalize Prisma symbols**

Delete generic AgentRun/Instance, Execution/policy/authority/grant/outbox,
conversation/replay, artifact/materialization, cost/usage, Hermes/OpenAI,
provider session/credential/handle codec, fixed playbook/wrapper Agent, full-
Nest MCP child/HMAC context, background continuation, advisory lock, release
drain, coordinated deletion, and old API/Web paths.

Delete old legacy Agent OS models and every dependent model while retaining the
`agent_work_*` physical tables. Remove old reverse relations. Final schema has
only the six fixed models and no lifecycle/continuation/deletion fields.

Remove `@kiditem/shared/agent-os` exports/typesVersions/tsup entry and retain the
focused `@kiditem/shared/agent-interaction` contract.

- [x] **Step 5: Enforce zero legacy findings and verify destructive schema on a disposable database**

Wire `check-agent-os-contraction --enforce` into `check:conventions` and script
inventory. Rewrite old deletion/hexagonal scanners for terminal-only deletion
and the final graph.

Run only against an explicit disposable database containing representative
legacy Agent OS rows plus unrelated business/Operation rows:

```bash
rtk node -e "if (!process.env.KID25_CUTOVER_TEST_DATABASE_URL) throw new Error('KID25_CUTOVER_TEST_DATABASE_URL is required')"
rtk node scripts/check-agent-os-contraction.mjs --enforce
rtk env DATABASE_URL="$KID25_CUTOVER_TEST_DATABASE_URL" npm run db:push -- --accept-data-loss
rtk npx prisma generate
rtk npm run db:erd
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:conventions
```

Expected: PASS; destructive output drops only approved legacy Agent OS objects,
unrelated rows remain, and scanner reports zero findings.

- [ ] **Step 6: Run HTTP/Web/cutover gates and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os src/operations
rtk npm run test:integration --workspace=apps/server --
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git diff --check
rtk git add -A
rtk git commit -m "refactor: remove legacy Agent OS graph"
```

Expected: PASS with no compatibility route, worker, fallback, or old schema.

## Task 6: Align the Home-Server Release Surface, Perform Basic Cutover Safety, and Ship

**Files:**

- Modify: `deploy/office/compose.office.yml`
- Modify: `deploy/office/office.env.example`
- Modify: `deploy/office/apply-deployment.ps1`
- Modify: `.github/workflows/build-image.yml`
- Modify: `.github/workflows/office-images.yml`
- Modify: `.github/workflows/pr-checks.yml`
- Modify: `apps/server/.env.example`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/interaction-platform.md`
- Modify: `docs/runbooks/office-deploy.md`
- Create: `docs/runbooks/agent-os-clean-cutover.md`
- Modify: `scripts/smoke-interaction-os.mjs`
- Modify: `scripts/seed-agent-os.ts`
- Modify: `scripts/__tests__/office-deployment-contract.test.mjs`
- Modify: `apps/server/src/agent-os/AGENTS.md`
- Modify: `prisma/AGENTS.md`

- [x] **Step 1: Make deployment exactly one Web/API/worker stack plus one native Host Runner**

The Office/home host is Windows and runs the existing Linux containers through
Docker Desktop. Compose declares one API replica. API owns CopilotKit, durable
Agent authority, Runner admission, and direct MCP v2 HTTP. One Task
Scheduler-managed native Windows `apps/agent-runner` owns Codex/Claude process
trees; worker owns mutation/Approval/Operations. Runner control is outbound
command long-poll plus idempotent event POST, and the CLI reaches Nest only
through host-loopback MCP HTTP. Remove container CLI packages/login volume,
stdio/UDS/private-socket glue, gateway URLs, `AGENT_RUNTIME_WORKER_ENABLED`,
old runtime concurrency/wait/budget values, obsolete internal-signing or
credential-broker paths, advisory lock, release drain, compatibility
canary/image, and old run-root mounts.

The only adjustable capacity variable is:

```text
AGENT_CLI_MAX_CONCURRENCY=4
```

Update deployment contract tests to reject a second API replica, Runner inbound
listener, LAN-exposed internal route, or any removed surface. The immutable
Office bundle includes the exact Windows Runner/CLI artifact; GitHub Actions
remains the only supported release entrypoint.

- [x] **Step 2: Add the basic destructive-cutover safety sequence**

The workflow/operator runbook performs:

```text
1. stop API and worker writers;
2. confirm worker shutdown/drain and writers stopped;
3. verify no ready/executing Agent mutation;
4. pg_dump --format=custom to protected local backup;
5. pg_restore --list the archive;
6. compute SHA-256 and record database/VERSION/Git SHA;
7. record content-free unrelated business/Operation row checks;
8. run db:push -- --accept-data-loss and generate;
9. seed AgentVersions, boot API/worker, smoke, compare row checks;
10. keep service stopped and manually restore full backup if verification fails.
```

Do not automate restore rehearsal, archive retention policy, RPO/RTO, or release
drain. Never log the database URL, archive contents, credentials, prompts, or
canonical mutation input.

- [x] **Step 3: Rewrite durable architecture/runbooks/instructions**

`docs/ARCHITECTURE.md` and Agent OS `AGENTS.md` describe only the single-node
six-model graph, process-local capacity, terminal deletion, explicit Continue,
native Host Runner/loopback MCP boundary, and same-SHA restart recovery. Remove
stale history instead of appending exceptions. Document dedicated-account CLI
login and trusted full-access/non-interactive execution as operator
prerequisites. The account is non-administrator, contains no DB/Nest/business
or unrelated credentials, and is not claimed as a hostile-process containment
boundary. Document code upgrade as stop/start after confirming no ready/
executing mutation.

PR release decision is: destructive unreleased Agent OS cutover, no backfill;
basic custom backup/list/checksum; actual legacy Agent data discarded.

- [x] **Step 3a: Apply the validated PR 479 architecture convergence report**

Implement all five recommendations from the validated 2026-08-25 PR 479
architecture review on the existing diff:

- replace public Runner queue/lease/event/readiness/runtime-control seams with
  one API `HostRunnerControlSession` and one native
  `NativeRunnerControlSession`; retain only narrow HTTP, Attempt-control, and
  readiness views;
- route REST and CopilotKit root/continue work through one
  `AGENT_WORK_INTAKE_PORT`;
- make selected Agent, draft, Session URL, and durable-session pinning one Web
  interaction-state Module consumed by every entrypoint;
- move definition-to-owner-handler pairing into the six owner-local capability
  compositions and leave the central registrar aggregation-only;
- replace the 15-operation Work transaction Interface with admission,
  invocation/approval, mutation, and lifecycle/recovery Interfaces sharing the
  same Prisma atomicity and lock ordering.

Required focused evidence includes Runner protocol traces and native build,
REST/Copilot parity, Sourcing-to-selected-Agent UI integration, exact 18-entry
capability composition, persistence static deletion checks, PostgreSQL races,
restart reconciliation, exact root/live/delegation replay without automatic
successors, server/Web builds, and Nest module compilation. Delete the
old broad Work port, API runtime-control facade, split Web store, duplicated
controller orchestration, and central 18-key handler map; do not retain legacy
forwarders.

- [ ] **Step 4: Run the full mandatory acceptance matrix**

Use one explicit disposable acceptance database for schema/seed/boot/smoke:

```bash
rtk node -e "if (!process.env.KID25_ACCEPTANCE_DATABASE_URL) throw new Error('KID25_ACCEPTANCE_DATABASE_URL is required')"
rtk npm run check:conventions
rtk npm run check:copilotkit-train
rtk npm run test:scripts
rtk npm exec --workspace=apps/server vitest -- run src/agent-os src/operations
rtk npm run test:integration --workspace=apps/server --
rtk env DATABASE_URL="$KID25_ACCEPTANCE_DATABASE_URL" npm run db:push -- --accept-data-loss
rtk npx prisma generate
rtk npm run db:erd
rtk env DATABASE_URL="$KID25_ACCEPTANCE_DATABASE_URL" npm run seed:agent-os
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/agent-runner
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk env DATABASE_URL="$KID25_ACCEPTANCE_DATABASE_URL" npm run smoke:interaction-os
rtk env DATABASE_URL="$KID25_ACCEPTANCE_DATABASE_URL" npm run dev:server
```

Confirm Nest boot, an authenticated native Runner lease, selected CLI
readiness, direct modern-only MCP HTTP, same-origin CopilotKit, and no legacy
module resolution error. Verify unauthenticated Runner/MCP, readiness,
CopilotKit root, and CopilotKit run requests are rejected before runtime
execution, then stop the API and Runner cleanly. The legacy browser harness is
deleted with the replay/session graph and is not recreated as a release gate.

In a separate terminal, start the worker against the same acceptance database:

```bash
rtk env DATABASE_URL="$KID25_ACCEPTANCE_DATABASE_URL" \
  node apps/server/dist/worker.js
```

Confirm mutation/Approval/Operation pollers boot, then stop it cleanly. The
integration suite uses its own isolated test database and must not reuse the
acceptance DB. The Office deployment contract additionally proves that the
Windows PowerShell entrypoint deploys one matching native Host Runner artifact
under Task Scheduler, keeps the internal port loopback-only, and never launches
Codex/Claude inside API or worker containers. The `windows-latest` Runner/Job
Object/ACL/package job must pass before completion.

Expected: all mandatory runtime/admission/cutover/restart gates PASS from one
Git SHA. No scheduled compatibility or restore-rehearsal gate is required.

- [ ] **Step 5: Run the final QA correction loop**

Treat executable evidence as the final blocking gate. Run the complete unit and
PostgreSQL integration suites, clean schema/seed/boot, authenticated and
unauthenticated HTTP probes, real Codex MCP v2 canary, deterministic Claude
contracts, Office deployment contracts, scanners, and Windows CI. Fix every
reproduced failure and rerun its focused gate plus the complete matrix. A
targeted Sol review remains available only for an important boundary that QA
cannot decide from executable facts.

- [ ] **Step 6: Commit the final release surface**

```bash
rtk git add .github apps/server/.env.example apps/server/src/agent-os/AGENTS.md \
  deploy docs prisma/AGENTS.md scripts package.json package-lock.json
rtk git commit -m "docs: finalize single-node Agent OS cutover"
rtk git status --short
rtk git log --oneline --decorate origin/codex/kid-25-copilotkit-interaction-os..HEAD
```

Expected: clean worktree with only intentional KID-25 commits.

- [ ] **Step 7: Push the existing branch and update existing PR 479**

Do not create another PR:

```bash
rtk git push origin codex/kid-25-copilotkit-interaction-os
rtk gh pr view 479 --json number,headRefName,baseRefName,commits,body,url
```

Stop if head/base/commit history is unexpected. Update the body from
`.github/PULL_REQUEST_TEMPLATE.md` with:

```text
Release decision: destructive unreleased Agent OS six-model contraction.
DB/backfill: no backfill; legacy Agent OS rows intentionally discarded after
basic custom backup/list/checksum and unrelated-row verification.
Dev data: no legacy Agent OS preservation.
Deployment: one home-server Web/API/worker stack; same-SHA restart recovery.
```

Read it back and run guards/checks:

```bash
rtk gh pr view 479 --json body --jq .body
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk gh pr checks 479
```

- [ ] **Step 8: Update Linear KID-24 and KID-25**

Comment on KID-24 with the final six Agents, owner-capability routing, explicit
delegation, and single-node scope. Update KID-25 with pushed SHA, PR 479,
mandatory verification evidence, discarded legacy surface, and excluded
enterprise operations features. Move KID-25 to **In Review**, not Done.

## Design Traceability

| Design section | Task |
|---|---|
| 0–2 authority, selected scope, non-goals | Tasks 1, 5, 6 |
| 3 six-model schema/status/invariants | Tasks 1, 2, 5 |
| 4 Agents/domains/capabilities | Tasks 1, 3 |
| 5 routing/delegation/process-local admission | Tasks 1–3 |
| 6 exact authorization/HITL/mutation | Tasks 2, 4 |
| 7 Codex/Claude/MCP/live control | Task 3 |
| 8 same-SHA restart | Task 4 |
| 9 CopilotKit/Web/no replay | Task 5 |
| 10 terminal-only delete | Task 2 |
| 11 clean cutover | Tasks 1, 5, 6 |
| 12 removed surface | Tasks 1, 5 |
| 13 home deployment | Task 6 |
| 14 implementation order | Tasks 1–6 |
| 15 acceptance | each focused gate; full matrix in Task 6 |
| 16 locked ledger | execution contract and zero-finding scanner |

## Completion Definition

KID-25 is merge-ready only when all six integrated tasks are checked, the six
final models are the only Agent OS graph, runtime/admission and same-SHA restart
tests pass, the clean destructive cutover and final QA matrix pass on the
explicit acceptance database with basic backup safety documented, the branch
is pushed to existing PR 479, KID-24 is cross-updated, and KID-25 is in **In
Review** with green remote evidence.
