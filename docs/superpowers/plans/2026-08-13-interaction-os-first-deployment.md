# Interaction OS Pre-Launch Contraction And First Deployment Implementation Plan

Last amended: 2026-08-21 — replaced the unused staged production cutover with
a zero-data pre-launch contraction and first-deployment proof.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first CopilotKit-native Interaction OS production artifact as
one recoverable platform with every product surface on the official session
path and no legacy chat, polling, transcript, or generic AgentRun runtime.

**Architecture:** AgentOS/PostgreSQL owns production conversation durability,
replay, retention, recovery, and observability; Operations owns durable run
envelopes/checkpoints but never the conversation or business capabilities. The Office release
train builds and pins the stateless CopilotKit OSS Interaction Gateway beside
API/web images. KID-25 has never served production traffic or established a
production AgentRun/conversation data contract, so delivery is a one-way
pre-launch contraction rather than an expand/freeze/cutover/contract sequence.
Scanners and a read-only database preflight first prove that every legacy caller
has a replacement and the legacy schema is wholly absent or contains only the
exact empty/seed state defined below; the same unreleased
train then removes obsolete APIs, models, renderers, identities, worker wiring,
and the generic non-session AgentRun lane before the first deployment. Existing
UUID rows in retained owners are not rekeyed while public/cross-domain contracts
use canonical resource names. The CopilotKit fork remains review-only lineage,
never a floating dependency.

**Tech Stack:** PostgreSQL, Prisma schema/db:push, transactional outbox, optional
ephemeral live fan-out, S3-compatible attachments/backups, Docker Compose,
GitHub Actions, GHCR, PowerShell Office deployer, CopilotKit OSS/AG-UI
compatibility canaries, NestJS, Next.js, Vitest, Playwright, k6

---

## Global Constraints

- All three preceding plans must have accepted production-like evidence before this plan changes a user entry point.
- `AgentSession` and `AgentConversationEvent` in KidItem PostgreSQL are the one
  canonical conversation store. Ephemeral fan-out and the Interaction Gateway
  are reconstructable and never authoritative.
- Default retention is 365 days after session archive or terminal state;
  organization legal hold overrides deletion. Organization-specific policy
  values are read from `AgentInteractionRetentionPolicy`; the first deployment
  exposes no ordinary mutation API, and any shorter policy requires a separate
  approved privacy/legal design change.
- Data residency is `KR`; primary, replicas, backups, logs, and restore environments remain in the approved Korean residency boundary.
- Target platform objectives are RPO ≤ 15 minutes and RTO ≤ 4 hours, verified quarterly.
- Production vendor telemetry is disabled; KidItem correlation metrics/logs/traces exclude message content and secrets.
- Session deletion is idempotent, organization/user authorized, legal-hold aware, and produces a non-content tombstone before conversation/control removal.
- Organization removal revokes principal access immediately, archives sessions, and schedules non-held physical deletion under the organization policy.
- KID-25 has no production legacy writes or continuing legacy work to migrate.
  The intended deployment database must have a wholly absent legacy schema or
  zero rows/associations in every legacy execution, conversation, task-session,
  approval, tool-policy, authorization, cost, and artifact boundary before
  contraction; only the exact code-owned instance/runtime seed projection may
  remain. An unexpected row or partial schema is a stop condition and requires
  an explicit design and plan amendment; it is never silently discarded,
  copied, or dual-written.
- Local and disposable integration databases may be reset and reseeded through
  the normal development-data flow. The preflight never mutates a database.
- Existing physical UUID keys in retained models are not rekeyed. Pre-launch
  contraction projects canonical resource names from owner scope plus existing
  IDs and converts public/cross-domain contracts to those names. Because the
  database preflight requires zero legacy execution data, no identifier
  migration mapping is created.
- Pre-launch contraction removes the generic non-session AgentRun lane.
  Deterministic callers migrate to owning-domain input ports/Operations;
  judgment callers migrate to official AgentSession executions. Operations
  handlers never dispatch through `AgentCapabilityRegistry`.
- Empty legacy schema contraction occurs in the same unreleased train after
  source and database preflights pass. Before the destructive push, the guarded
  Office deployer creates and verifies a full custom-format database backup
  while every application writer is stopped. A post-push failure keeps writers
  stopped, restores and verifies that backup, then starts the prior immutable
  artifact. There is no legacy runtime toggle or selective legacy user-data
  migration path.
- GitHub Actions remains the only Office release entrypoint and produces the
  immutable API, web, and Interaction Gateway bundle. The intended Office
  database is not network-reachable from the GitHub-hosted job: its read-only
  preflight runs only through the SHA-verified `apply-deployment.ps1` bundled by
  that workflow, against the guarded `release/office` checkout and local
  environment. This is part of the existing Office lane, not an alternate
  local deployment entrypoint.
- `AgentFoundry-Labs/CopilotKit:main` must stay a fast-forwardable upstream mirror with zero KidItem commits.
- Patch packages are internally namespaced, exact-pinned as a full train, SBOM/license/provenance attached, upstream PR linked, and removed when upstream ships the fix.
- Slack, Teams, mobile, and additional channels are not enabled by this first
  deployment.

---

## Pre-Launch Delivery Sequence

| Stage | Required evidence | Rollback |
|---|---|---|
| Prove replacement | Plans 1–3 acceptance, production-like PostgreSQL/browser/restart evidence, exact package train | Revert unreleased commits; no deployed traffic changes |
| Inventory | Source dependency matrix is complete; target DB preflight reports absent schema or the exact empty/seed state | Stop and amend the design if any caller, partial schema, or row is unclassified |
| Contraction | Official ports own every caller; legacy API/web/worker/schema are absent; all gates pass | Restore the verified pre-push database backup and previous commit |
| First deploy | One immutable API/web/gateway artifact set passes readiness and smoke | Restore and verify the same-attempt database backup before starting the previous artifact; never enable a legacy runtime toggle |

These are implementation and verification stages on the single KID-25 delivery,
not separately operated production phases. Keep cohesive reviewer-sized commits,
but do not create Freeze, Cutover, and Contract deployment PRs for an unshipped
system.
Tasks are sequencing/checkpoint boundaries, not mandatory PR or review
boundaries. Adjacent tasks may be implemented as coherent bundles when their
contracts are already fixed. Request one integrated review after final local
verification; repeat only to close concrete findings or a stop condition.

## Task 1: Implement Session Lifecycle, Retention, Legal Hold, And Tombstones

**Files:**
- Modify: `packages/shared/src/agent-interaction/index.ts`
- Create: `packages/shared/src/agent-interaction/lifecycle.ts`
- Create: `packages/shared/src/agent-interaction/lifecycle.spec.ts`
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/core.prisma`
- Create: `apps/server/src/agent-os/application/port/in/interaction/agent-interaction-session-lifecycle.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/transaction/interaction/agent-session-lifecycle.transaction.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/crypto/agent-session-tombstone-hasher.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-session-lifecycle.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/crypto/hmac-agent-session-tombstone-hasher.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/crypto/__tests__/hmac-agent-session-tombstone-hasher.adapter.spec.ts`
- Create: `apps/server/src/agent-os/application/service/interaction/agent-interaction-session-lifecycle.service.ts`
- Create: `apps/server/src/agent-os/application/service/interaction/__tests__/agent-interaction-session-lifecycle.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction/agent-interaction-session-lifecycle.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction/__tests__/agent-interaction-session-lifecycle.controller.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction/interaction-lifecycle.config.ts`
- Create: `apps/server/src/agent-os/domain/session/agent-session-retention.policy.ts`
- Create: `apps/server/src/agent-os/domain/session/__tests__/agent-session-retention.policy.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os-session.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`

**Interfaces:**
- Consumes: current organization/user, `AgentSession` lifecycle, canonical
  conversation rows, organization retention policy, and the API-only dedicated
  lifecycle HMAC key.
- Produces: one organization-scoped lifecycle transaction port and Prisma
  adapter, lifecycle request/tombstone models, and scoped
  archive/delete/legal-hold endpoints. The HTTP adapter injects a lifecycle
  input port; it never imports the concrete service or transaction adapter.

- [ ] **Step 1: Write retention and legal-hold tests**

```typescript
describe('AgentInteractionSessionLifecycleService', () => {
  it('blocks deletion under legal hold', async () => {
    const service = createLifecycleService({ legalHoldAt: new Date() });
    await expect(service.requestDelete(deleteInput())).rejects.toMatchObject({ code: 'THREAD_LEGAL_HOLD' });
    expect(repository.deleteSession).not.toHaveBeenCalled();
  });

  it('uses the unified session retention policy', () => {
    expect(service.deletionDueAt(new Date('2026-08-13T00:00:00Z')).toISOString()).toBe('2027-08-13T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/interaction/__tests__/agent-interaction-session-lifecycle.service.spec.ts`

Expected: FAIL because the service/port do not exist.

- [ ] **Step 3: Define strict lifecycle contracts**

```typescript
export const AgentSessionLifecycleCommandSchema = z.object({
  session: AgentSessionNameSchema,
  command: z.enum(['archive', 'delete', 'place_legal_hold', 'release_legal_hold']),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().min(20).max(200),
}).strict();

export const InteractionRetentionPolicySchema = z.object({
  sessionRetentionDays: z.number().int().min(365).default(365),
  residency: z.literal('KR'),
}).strict();
```

- [ ] **Step 4: Add lifecycle request and tombstone persistence**

Add the three shown fields to the existing `AgentSession` model; the snippet is
not a second model declaration.

```prisma
model AgentSession {
  // existing fields and relations remain
  legalHoldAt     DateTime?
  legalHoldReason String?   @db.Text
  retentionDueAt DateTime?
}

model AgentInteractionRetentionPolicy {
  organizationId      String   @id @db.Uuid
  sessionRetentionDays Int     @default(365)
  residency           String   @default("KR")
  legalPolicyVersion  String
  updatedByUserId     String?  @db.Uuid
  updatedAt           DateTime @updatedAt
}

model AgentSessionLifecycleRequest {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @db.Uuid
  sessionId       String   @db.Uuid
  command         String
  reason          String   @db.Text
  idempotencyKey  String
  status          String
  requestedByUserId String @db.Uuid
  deletionDueAt   DateTime?
  errorCode       String?
  createdAt       DateTime @default(now())
  finishedAt      DateTime?
  @@unique([organizationId, idempotencyKey])
  @@index([organizationId, status, deletionDueAt])
}

model AgentSessionTombstone {
  id                  String   @id @default(uuid()) @db.Uuid
  organizationIdHash  String
  copilotThreadIdHash String   @unique
  hashKeyVersion      String
  terminalLifecycle   String
  deletionReasonCode  String
  deletedAt           DateTime
  legalPolicyVersion  String
  @@index([organizationIdHash, deletedAt])
}
```

Tombstones contain versioned HMAC-SHA-256 values from a dedicated lifecycle
key and policy metadata only: no raw org/user/thread ID, unhashed identifier,
title, message, goal, resource, action, or model output.
While a session exists, its lifecycle request remains composite FK-fenced and
is removed by the physical-delete transaction (explicitly or by cascade). After
that deletion, only the tombstone's versioned `idempotencyKeyHash` and
`requestFingerprintHash` authorize an exact retry; neither hash preserves a raw
identifier or request payload.
`AgentOsHttpModule` fails fast without `INTERACTION_LIFECYCLE_HMAC_KEY`; the key
and hasher are not imported by MCP or any non-API process root.
Archive/terminal lifecycle and legal hold are orthogonal: archive or terminal
state computes `retentionDueAt`, while hold/release mutates only
`legalHoldAt`/`legalHoldReason`. Releasing a hold never guesses or rewrites the
session's prior lifecycle.
`AgentInteractionRetentionPolicy` has exact Organization/User relations in the
final Prisma schema. Absence projects the locked 365-day/KR default; shortening
the stored duration is outside this plan and requires a separately approved
privacy/legal change rather than an ordinary settings update.

- [ ] **Step 5: Implement the lifecycle repository transaction**

```typescript
export interface AgentSessionLifecycleTransactionPort {
  archiveSession(input: ScopedLifecycleMutation): Promise<AgentSessionRecord>;
  setLegalHold(input: ScopedLegalHoldMutation): Promise<AgentSessionRecord>;
  deleteSession(input: ScopedDeletionMutation): Promise<AgentSessionTombstoneRecord>;
}
```

The service derives actor/organization, parses the expected session resource
name, revalidates its organization parent, selects `AgentSession` in that scope,
and enforces lifecycle, legal hold, and retention. The Prisma adapter takes a
full-scope advisory transaction lock, creates/reuses the lifecycle request,
archives or deletes the canonical conversation events/projections/outbox and
eligible control rows in explicit FK order, writes the content-free tombstone,
and marks the request terminal in the same transaction. Exact retry returns the
same result; partial failure rolls back and remains retryable with the same
idempotency key. Artifact/audit records with a longer legal basis are detached
to their own retained owner before session deletion and never preserve message
content.
The pure retention policy is shared by lifecycle and session-transition
transactions. Completing, cancelling, or archiving a session sets
`retentionDueAt` from the exact organization policy in the same transaction;
placing a hold prevents the due-row claim rather than erasing that timestamp.
The existing real-PostgreSQL session-control suite proves the terminal path, so
retention cannot depend on a later best-effort lifecycle request.

- [ ] **Step 6: Run lifecycle, schema, and scope gates**

Run:

```bash
npm run db:push
npx prisma generate
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/domain/session/__tests__/agent-session-retention.policy.spec.ts \
  src/agent-os/application/service/interaction/__tests__/agent-interaction-session-lifecycle.service.spec.ts \
  src/agent-os/adapter/in/http/interaction/__tests__/agent-interaction-session-lifecycle.controller.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run check:idor
npm run check:tenant-scope
```

Expected: tests/scanners pass; legal hold prevents PostgreSQL deletion;
repeated commands are idempotent and no orphan event/outbox/control row remains.

- [ ] **Step 7: Commit lifecycle controls**

```bash
git add packages/shared/src/agent-interaction prisma apps/server/src/agent-os
git commit -m "feat: govern agent session lifecycle"
```

## Task 2: Productionize KidItem Conversation Persistence And Recovery

**Files:**
- Modify: `apps/server/src/agent-os/application/port/out/event/agent-conversation-live-publisher.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/transaction/interaction/agent-conversation-outbox.transaction.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-outbox.transaction.ts`
- Create: `apps/server/src/agent-os/application/service/interaction/agent-conversation-outbox-dispatcher.service.ts`
- Create: `apps/server/src/agent-os/application/service/interaction/__tests__/agent-conversation-outbox-dispatcher.pg.integration.spec.ts`
- Modify: `apps/server/src/agent-os/application/port/out/repository/interaction/agent-conversation-query.repository.port.ts`
- Modify: `apps/server/src/agent-os/adapter/out/repository/interaction/prisma-agent-conversation-query.repository.ts`
- Modify: `apps/server/src/agent-os/agent-os-session.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Create: `deploy/interaction-gateway/conversation-persistence-contract.json`
- Create: `deploy/interaction-gateway/backup-restore-runbook.md`
- Create: `deploy/interaction-gateway/retention-runbook.md`
- Create: `deploy/interaction-gateway/alerts.yaml`
- Create: `deploy/interaction-gateway/k6/reconnect-storm.js`
- Create: `deploy/interaction-gateway/k6/long-stream.js`
- Create: `deploy/interaction-gateway/residency-policy.json`
- Create: `deploy/interaction-gateway/__tests__/production-contract.test.mjs`
- Create: `scripts/check-interaction-residency.mjs`
- Create: `scripts/__tests__/check-interaction-residency.test.mjs`
- Modify: `docs/runbooks/interaction-platform.md`

**Interfaces:**
- Consumes: canonical event/outbox rows, lifecycle service, KidItem PostgreSQL,
  attachment storage, and Office backup inventory.
- Produces: a focused outbox transaction adapter, idempotent API-process
  delivery, database-backed catch-up, and a backup/restore/DR/observability/
  capacity contract meeting KR residency, RPO, and RTO. The controller-free
  session module owns persistence tokens; only the API HTTP composition starts
  the live dispatcher.

- [ ] **Step 1: Write production contract and outbox RED tests**

```javascript
test('locks KidItem-owned recovery and replay objectives', () => {
  const contract = loadContract();
  assert.equal(contract.canonicalStore, 'kiditem-postgresql');
  assert.equal(contract.enterpriseIntelligenceAllowed, false);
  assert.equal(contract.residency, 'KR');
  assert.equal(contract.rpoMinutes, 15);
  assert.equal(contract.rtoMinutes, 240);
  assert.equal(contract.replay.p95Seconds, 5);
  assert.equal(contract.replay.duplicateEventsAllowed, 0);
});
```

The PostgreSQL test inserts event/outbox rows, races two dispatchers, and
asserts one claim/publish completion, retry after publisher failure, monotonic
session delivery, and no payload/message content in publisher attributes or
logs. A lost live notification must still be recovered by bounded replay from
the last durable sequence.

- [ ] **Step 2: Run and verify failure**

```bash
node --test deploy/interaction-gateway/__tests__/production-contract.test.mjs
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/interaction/__tests__/agent-conversation-outbox-dispatcher.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: FAIL because the contract and dispatcher do not exist.

- [ ] **Step 3: Implement idempotent outbox delivery and catch-up**

The repository claims bounded outbox batches with one tagged, organization-safe
`FOR UPDATE SKIP LOCKED` transaction, increments attempt count, and marks a row
published only after the publisher returns. The publisher emits only event ID,
session ID, sequence, and execution correlation; consumers load payload from
the scoped repository. Those internal fields are branded owner IDs, never
untyped strings; HTTP/AG-UI projection uses canonical resource names. Duplicate
notification is allowed but duplicate visible event is rejected by
`(sessionId, sequence, eventId)`. The connect stream keeps a bounded PostgreSQL
catch-up loop, so local notification loss or another replica claiming the
outbox cannot create a replay gap.

- [ ] **Step 4: Define recovery, residency, alerts, and load thresholds**

`residency-policy.json` contains
`{ "allowedRegions": ["ap-northeast-2"], "denyCrossRegionReplication": true }`.
The scanner consumes the immutable Office/cloud inventory and fails if
PostgreSQL primary/replica/PITR archive, attachment storage, backups, log sinks,
or DR restore targets leave the allowlist. Unit tests use synthetic inventory;
production supplies `INTERACTION_PLATFORM_INVENTORY`.

Alerts cover API/gateway availability, SSE disconnect/reconnect failure,
outbox oldest-unpublished age, replay gap/duplicate detection, replay query
latency, database saturation/replication lag, migration failure, backup/restore
drill age, lifecycle deletion backlog, and correlation gaps. Labels contain no
message text or raw user/thread ID.

`reconnect-storm.js` creates 500 authenticated SSE reconnects over 60 seconds
and requires ≥99% successful replay, zero duplicate/gap/tool re-execution, and
p95 reconnect ≤5 seconds. `long-stream.js` runs 200 concurrent 30-minute
synthetic streams and requires HTTP error rate <1%, event-order violation 0,
outbox p95 age ≤2 seconds, and API/gateway memory below configured limits.

- [ ] **Step 5: Execute backup and restore drill**

The runbook performs KidItem PostgreSQL point-in-time restore, attachment/object
restore, secret rotation, API/gateway restart, event/outbox projection rebuild,
session replay verification, and correlation sampling. Record timestamps,
achieved RPO/RTO, restored session/event/outbox counts, sequence/hash
comparison, and cleanup. Expected: RPO ≤15 minutes, RTO ≤4 hours, no
cross-region copy, and no Enterprise service dependency.

- [ ] **Step 6: Run platform production gates**

Run:

```bash
node --test deploy/interaction-gateway/__tests__/production-contract.test.mjs
node --test scripts/__tests__/check-interaction-residency.test.mjs
node scripts/check-interaction-residency.mjs --policy deploy/interaction-gateway/residency-policy.json --inventory "$INTERACTION_PLATFORM_INVENTORY"
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/interaction/__tests__/agent-conversation-outbox-dispatcher.pg.integration.spec.ts \
  --config vitest.config.integration.ts
k6 run deploy/interaction-gateway/k6/reconnect-storm.js
k6 run deploy/interaction-gateway/k6/long-stream.js
```

Expected: contract and thresholds pass in the isolated production-like cluster; attach backup/restore evidence to the platform change record.

- [ ] **Step 7: Commit platform operations**

```bash
git add apps/server/src/agent-os deploy/interaction-gateway \
  scripts/check-interaction-residency.mjs \
  scripts/__tests__/check-interaction-residency.test.mjs \
  docs/runbooks/interaction-platform.md
git commit -m "feat: harden conversation persistence operations"
```

## Task 3: Add Interaction Gateway To The Immutable Office Release

**Files:**
- Modify: `.github/workflows/office-images.yml`
- Modify: `deploy/office/apply-deployment.ps1`
- Modify: `deploy/office/compose.office.yml`
- Modify: `deploy/office/digest.env.example`
- Modify: `deploy/office/office.env.example`
- Modify: `scripts/__tests__/office-deployment-contract.test.mjs`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `docs/runbooks/office-deploy.md`

**Interfaces:**
- Consumes: `apps/interaction-gateway/Dockerfile` and readiness endpoint.
- Produces: Office manifest schema 2 with immutable
  `interactionGatewayImage`/digest and fail-closed API/gateway readiness
  validation.

- [ ] **Step 1: Extend manifest contract tests first**

```javascript
test('office manifest schema 2 requires gateway digest', () => {
  const manifest = validManifest({
    schemaVersion: 2,
    interactionGatewayImage: 'ghcr.io/agentfoundry-labs/kiditem-interaction-gateway@sha256:' + 'a'.repeat(64),
    interactionGatewayDigest: 'sha256:' + 'a'.repeat(64),
  });
  assert.doesNotThrow(() => validateOfficeManifest(manifest));
  assert.throws(() => validateOfficeManifest({ ...manifest, interactionGatewayDigest: undefined }), /gateway/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test scripts/__tests__/office-deployment-contract.test.mjs`

Expected: FAIL because schema 1 has no gateway fields.

- [ ] **Step 3: Build and attest the gateway image**

Add a reusable build job using `apps/interaction-gateway/Dockerfile` and `ghcr.io/agentfoundry-labs/kiditem-interaction-gateway`. The bundle job waits for API, web, and gateway, verifies each OCI revision label equals `expected_git_sha`, generates an SBOM/provenance attestation, and writes manifest schema 2:

```json
{
  "schemaVersion": 2,
  "environment": "office",
  "gitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "apiImage": "ghcr.io/agentfoundry-labs/kiditem-api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "apiDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "webImage": "ghcr.io/agentfoundry-labs/kiditem-web@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "webDigest": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "interactionGatewayImage": "ghcr.io/agentfoundry-labs/kiditem-interaction-gateway@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "interactionGatewayDigest": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
}
```

The repeated hex values are deterministic test fixtures. The workflow replaces them with the dispatched SHA and build outputs; the validator rejects fixture SHAs/digests in a release artifact.

- [ ] **Step 4: Upgrade the Office deployer atomically**

`apply-deployment.ps1` validates schema 2, all three approved GHCR digest refs,
digest/ref equality, revision labels, required gateway-service/run-intent/
principal/replay-cursor secrets, `INTERACTION_ANALYTICS_HMAC_KEY`,
`INTERACTION_LIFECYCLE_HMAC_KEY`, and database schema compatibility before
changing the live archive. It rejects any Enterprise URL/key/license setting.
It pulls all images first, starts API/gateway/web, checks each `/health/ready`,
verifies nginx `/api/copilotkit/info` and a read-only KidItem replay probe, then
promotes the bundle. Any failure restores the previous compose/env/archive and
keeps the previous immutable images.

- [ ] **Step 5: Run release-contract tests**

Run:

```bash
node --test scripts/__tests__/office-deployment-contract.test.mjs
npm run check:pr-release-contract -- --base origin/develop --head HEAD
npm run check:schema-artifact-sync
```

Expected: tests/guards pass; schema-1 or missing/mismatched gateway artifacts fail.

- [ ] **Step 6: Commit Office release integration**

```bash
git add .github/workflows/office-images.yml deploy/office scripts/__tests__/office-deployment-contract.test.mjs docs/runbooks/deployment-architecture.md docs/runbooks/office-deploy.md
git commit -m "ci: ship interaction gateway in office release"
```

## Task 4: Automate Upstream Mirror Review And Compatibility Canaries

**Files:**
- Create: `.github/workflows/copilotkit-compatibility-canary.yml`
- Create: `scripts/copilotkit-compatibility-canary.mjs`
- Create: `scripts/__tests__/copilotkit-compatibility-canary.test.mjs`
- Create: `docs/runbooks/copilotkit-upgrades.md`
- Create in fork repository: `AgentFoundry-Labs/CopilotKit:.github/workflows/kiditem-upstream-sync.yml`
- Create in fork repository: `AgentFoundry-Labs/CopilotKit:KIDITEM_PATCH_POLICY.md`

**Interfaces:**
- Consumes: OSS `platform-lock.json`, canonical upstream, KidItem fork, and an
  isolated KidItem PostgreSQL/gateway/runtime canary environment.
- Produces: scheduled exact-train test report, fast-forward-only mirror workflow, patch provenance policy.

- [ ] **Step 1: Write canary result validation tests**

```javascript
test('candidate fails if any required scenario is absent', () => {
  assert.throws(() => assertCanaryResult({
    train: { copilotKit: '1.67.1', agUi: '0.0.57' },
    scenarios: { threadReconnect: 'pass', hitlResume: 'pass' },
  }), /duplicateToolCall/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test scripts/__tests__/copilotkit-compatibility-canary.test.mjs`

Expected: FAIL because the canary script is missing.

- [ ] **Step 3: Implement exact canary scenarios**

The script takes explicit `--copilotkit`, `--ag-ui`, and
`--environment isolated-canary`; rejects `latest`, ranges, branches, or missing
versions; installs the OSS candidate train in a disposable
worktree/environment; and reports these required scenarios:

```javascript
const REQUIRED_SCENARIOS = [
  'sessionCreateResumeArchiveDelete', 'sessionReconnect', 'orderedReplay',
  'concurrentTabOwnership', 'firstRunAtomicity', 'hitlResume',
  'duplicateToolCall', 'executionStop', 'sessionTaskCancel',
  'gatewayRestart', 'apiOperationsRestart', 'runtimeReconnect', 'crossOrgRejection',
];
```

It also snapshots exact tarball licenses/SBOM, diffs CopilotKit public exports
and AG-UI event/schema changes from the locked train, replays retained KidItem
event fixtures through both versions, and fails on unresolved breaking
changes. It rejects any new Enterprise import/configuration. The scheduled
workflow runs weekly and on lockfile PRs; production promotion consumes the
immutable canary artifact.

Use canonical `CopilotKit/aimock` only as a pinned test/chaos fixture for delayed chunks, duplicated events, disconnects, and provider failure. Do not ship aimock or an example/demo repository in a production image.

- [ ] **Step 4: Add fast-forward-only fork sync**

In the fork workflow, fetch `https://github.com/CopilotKit/CopilotKit.git main`, verify `git merge-base --is-ancestor origin/main upstream/main`, verify fork `main` has zero commits not in upstream, then fast-forward and push. If either check fails, stop and open an issue; never merge/rebase/force-push automatically. `KIDITEM_PATCH_POLICY.md` specifies branch prefixes, upstream issue/PR, exact base tag, internal package suffix, SBOM/license/provenance, expiry owner/date, and deletion once upstream release lands.

- [ ] **Step 5: Run script tests and one isolated canary**

Run:

```bash
node --test scripts/__tests__/copilotkit-compatibility-canary.test.mjs
node scripts/copilotkit-compatibility-canary.mjs \
  --copilotkit 1.67.1 --ag-ui 0.0.57 \
  --environment isolated-canary
```

Expected: test and all required scenarios pass, or the train remains
unapproved. Never substitute `latest` or add an Enterprise platform to obtain
a passing reconnect test.

- [ ] **Step 6: Commit KidItem canary; submit fork workflow separately**

```bash
git add .github/workflows/copilotkit-compatibility-canary.yml scripts/copilotkit-compatibility-canary.mjs scripts/__tests__/copilotkit-compatibility-canary.test.mjs docs/runbooks/copilotkit-upgrades.md
git commit -m "ci: canary copilotkit compatibility train"
```

Open a separate PR in `AgentFoundry-Labs/CopilotKit` for its two files. Do not combine fork commits into the KidItem branch or vendor the fork tree.

## Task 5: Lock The Zero-Legacy Source And Database Preflight

**Files:**
- Create: `scripts/check-agent-os-legacy-boundary.mjs`
- Create: `scripts/__tests__/check-agent-os-legacy-boundary.test.mjs`
- Create: `apps/server/src/agent-os/application/port/in/preflight/legacy-agent-run-preflight.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/query/preflight/legacy-agent-run-preflight.query.port.ts`
- Create: `apps/server/src/agent-os/application/service/preflight/legacy-agent-run-preflight.service.ts`
- Create: `apps/server/src/agent-os/application/service/preflight/__tests__/legacy-agent-run-preflight.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/query/preflight/prisma-legacy-agent-run-preflight.query.ts`
- Create: `apps/server/src/agent-os/adapter/out/query/preflight/__tests__/prisma-legacy-agent-run-preflight.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/cli/check-legacy-agent-run-preflight.ts`
- Create: `apps/server/src/agent-os/adapter/in/cli/__tests__/check-legacy-agent-run-preflight.spec.ts`
- Modify: `apps/server/Dockerfile`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/__tests__/check-script-inventory.test.mjs`
- Modify: `package.json`
- Create: `docs/runbooks/interaction-first-deployment.md`

**Interfaces:**
- Consumes: tracked source, Prisma metadata, and the name of an environment
  variable containing the target database URL.
- Produces: an exact source dependency report and a content-free database
  report proving whether pre-launch contraction is allowed.

The database preflight follows the same hexagonal boundary as the rest of
AgentOS: a CLI input adapter invokes a narrow input port/service; the service
depends on a read-only query port; and a Prisma output adapter owns the fixed
SQL. The Nest-free CLI manually composes only those three pieces, is compiled
into `apps/server/dist`, and is copied into the production API image. It is not
imported by an application module or runtime root. The Dockerfile fails its
build if that entrypoint is absent or cannot load with production-only
dependencies. Its pure policy remains directly testable, but the intended
Office database invocation belongs to the official Actions-produced deployment
bundle. It must not depend on host Node/npm/`tsx`, add a standalone production
deploy script, or require the GitHub-hosted runner to reach the Office database.

- [ ] **Step 1: Write source and database preflight RED tests**

```javascript
test('rejects every generic AgentRun boundary', () => {
  const violations = scan([{ path: 'apps/server/src/example.ts', text: `
    import { AGENT_RUNNER_PORT } from './agent-runner.port';
    fetch('/api/agent-os/runs');
    class AgentRunWorker {}
  ` }]);
  assert.deepEqual(violations.map((item) => item.code).sort(), [
    'GENERIC_AGENT_RUN_API',
    'GENERIC_AGENT_RUN_PORT',
    'GENERIC_AGENT_RUN_RUNTIME',
  ]);
});

test('does not confuse canonical conversation events with legacy transcripts', () => {
  assert.deepEqual(scan([{ path: 'canonical.ts', text: 'AgentConversationEvent' }]), []);
});
```

```typescript
it('blocks contraction when one runtime/content row exists', async () => {
  const report = await inspectLegacyAgentRunData(fakeCounts({ agentRuns: 1 }));
  expect(report.allowed).toBe(false);
  expect(report.blockers).toEqual(['agentRuns=1']);
});

it('accepts seed-only catalog state with zero execution totals', async () => {
  const report = await inspectLegacyAgentRunData(seedOnlyCounts());
  expect(report.allowed).toBe(true);
});

it('blocks partial schema and user-to-instance associations', async () => {
  await expect(inspectLegacyAgentRunData(partialSchemaCounts())).resolves.toMatchObject({
    allowed: false,
    schemaState: 'partial',
  });
  await expect(inspectLegacyAgentRunData(seedOnlyCounts({ assignedUsers: 1 })))
    .resolves.toMatchObject({ allowed: false });
});

it('accepts a wholly absent unshipped schema only for pre-contraction mode', async () => {
  expect(await assertExpectedSchema(absentReport(), 'present_empty_or_absent')).toBeDefined();
  expect(() => assertExpectedSchema(absentReport(), 'present_empty')).toThrow();
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test scripts/__tests__/check-agent-os-legacy-boundary.test.mjs
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/preflight/__tests__/legacy-agent-run-preflight.service.spec.ts \
  src/agent-os/adapter/in/cli/__tests__/check-legacy-agent-run-preflight.spec.ts
```

Expected: FAIL because both preflight implementations are missing.

- [ ] **Step 3: Implement the tracked-source scanner**

The scanner follows TypeScript import/re-export edges and exact Prisma model
names. It rejects generic run ports, services, repositories, controllers,
routes, web clients, polling, worker entrypoints/env, `Chatbot`, `/api/chat`,
legacy transcript models, and old shared DTOs. It has no phase manifest or
permanent allowlist. Before final contraction it is run in report mode to
produce the work list; final CI runs strict mode and requires zero findings.
Its fixed scope is deployable source, package/workflow/deployment composition,
shared runtime contracts, and the active Prisma schema. Durable documentation,
the scanner's own negative fixtures, and immutable historical data migrations
under `scripts/data-migrations/v*/` are evidence rather than executable legacy
paths and are excluded structurally, not through a finding allowlist. The only
production-source inspection boundary is the exact five-file preflight seam
listed in Step 4 (input port, query port, service, Prisma query adapter, and CLI
entrypoint); it is handled by a fixed path set plus an import-graph quarantine,
not a configurable suppression.

```javascript
export function scanAgentOsLegacyBoundary({ files, strict }) {
  const findings = inspectTrackedFiles(files);
  if (strict && findings.length > 0) {
    throw new AgentOsLegacyBoundaryViolation(findings);
  }
  return findings;
}
```

- [ ] **Step 4: Implement the read-only database preflight**

Hard-zero models are `AgentTaskSession`, `AgentRunRequest`, `AgentRun`,
`AgentRunEvent`, `AgentToolDefinition`, `AgentInstanceToolPolicy`,
`AgentAuthorizationEvent`, `AgentApprovalRequest`, `AgentCostEvent`,
`AgentConversation`, `AgentMessage`, `AgentToolInvocation`, and `AgentArtifact`.
The preflight also requires zero `User.agentInstanceId` references.
`AgentInstance` and `AgentRuntimeState` may exist only as reconstructable rows
created by the current `seed-agent-os.ts`: the instance projection must match
the exact code-owned definition/type/name/adapter/default fields with no parent,
pause, model, adapter/runtime config, or prompt override, and runtime state must
have zero runs/failures/tokens/cost, null last-run/status/error/heartbeat, and an
empty state object. The script compares a bounded canonical seed projection and
hash rather than trusting row counts. Generated row IDs/timestamps are excluded
from the hash, while organization, definition type, hierarchy, adapter, mutable
overrides, and runtime counters are checked. It selects counts and bounded
hashes only; it never logs message, prompt, payload, result, or resource text.

The allowlisted physical table inventory is fixed in source so spelling drift
cannot turn a missing query into a pass:

```typescript
const LEGACY_TABLES = {
  AgentInstance: 'agent_instances',
  AgentRuntimeState: 'agent_runtime_states',
  AgentTaskSession: 'agent_task_sessions',
  AgentRunRequest: 'agent_run_requests',
  AgentRun: 'agent_runs',
  AgentRunEvent: 'agent_run_events',
  AgentToolDefinition: 'agent_tool_definitions',
  AgentInstanceToolPolicy: 'agent_instance_tool_policies',
  AgentAuthorizationEvent: 'agent_authorization_events',
  AgentApprovalRequest: 'agent_approval_requests',
  AgentCostEvent: 'agent_cost_events',
  AgentConversation: 'agent_conversations',
  AgentMessage: 'agent_messages',
  AgentToolInvocation: 'agent_tool_invocations',
  AgentArtifact: 'agent_artifacts',
} as const;
```

The Prisma query adapter owns the same transaction that counts non-null
`users.agent_instance_id`. No dynamic identifier originating from CLI input is
interpolated into SQL. A real-PostgreSQL adapter test covers present-empty,
absent, partial, drifted seed, association, and unexpected-row states before
the legacy models are removed from the generated client.

```typescript
export interface LegacyAgentRunPreflightReport {
  allowed: boolean;
  checkedAt: string;
  schemaState: 'present_empty' | 'absent' | 'partial';
  hardZeroCounts: Record<string, number>;
  seedOnlyCounts: Record<string, number>;
  seedStateHash: string | null;
  blockers: string[];
}
```

CLI execution requires `--database-url-env <NAME> --confirm READ_ONLY_PREFLIGHT
--expect-schema <present_empty|absent|present_empty_or_absent>` and refuses a
URL literal. It runs one read-only repeatable-read transaction.
It uses a fixed allowlisted table map and Prisma tagged SQL so it remains
executable after Prisma removes the legacy models: all tables present and empty
is `present_empty`, all tables absent is `absent`, and a partial legacy schema
is a blocker. Before Task 8 `present_empty_or_absent` is accepted because the
unshipped schema may never have reached the target database; after contraction
only `absent` is accepted.
Any blocker exits nonzero and instructs the operator to amend the design; there
is no `--force`, delete, migrate, or ignore option.

Build and image-contract tests invoke the production entrypoint directly:

```bash
npm run build --workspace=apps/server
node apps/server/dist/agent-os/adapter/in/cli/check-legacy-agent-run-preflight.js \
  --database-url-env DATABASE_URL --confirm READ_ONLY_PREFLIGHT \
  --expect-schema present_empty_or_absent
```

The API image runs the same file from `/app/apps/server/dist`; no source
transpiler or development dependency is part of the production contract.
The source scanner treats this dedicated, non-runtime preflight capability as
inspection evidence rather than a legacy runtime only while an architecture
test proves that no Nest module, API, MCP, worker, owner domain, or runtime root
imports it. The fixed physical-table constants remain visible to scanner tests;
this is a structural boundary, not a mutable finding allowlist. Scanner
fixtures assert the exact five production paths, reject any sixth sibling or
prefix expansion, allow imports only within that set and the CLI entrypoint,
and report a hard violation if any deployable runtime root reaches any member.

- [ ] **Step 5: Wire tests now and strict CI only after Task 8**

Add scanner tests/inventory, the server CLI test, and
`"check:agent-os-legacy-boundary": "node scripts/check-agent-os-legacy-boundary.mjs"`
immediately. The command defaults to strict; implementation inventory must pass
the explicit `--report` flag. Do not add a non-blocking workflow step that
reviewers may mistake for enforcement. Task 8 adds
`check:agent-os-legacy-boundary` to `check:conventions`, PR checks, develop
validation, Office image preflight, and the release-contract guard only after
strict mode is green. The implementation branch may call report mode, but no
deployed artifact may bypass strict mode.

- [ ] **Step 6: Commit the pre-launch guards**

```bash
git add apps/server/Dockerfile apps/server/src/agent-os/application/port/in/preflight \
  apps/server/src/agent-os/application/port/out/query/preflight \
  apps/server/src/agent-os/application/service/preflight \
  apps/server/src/agent-os/adapter/in/cli \
  apps/server/src/agent-os/adapter/out/query/preflight scripts \
  package.json docs/runbooks/interaction-first-deployment.md
git commit -m "test: gate pre-launch interaction contraction"
```

## Task 6: Replace Every Generic AgentRun Caller And Runtime

**Files:**
- Create: `apps/server/src/agent-os/application/port/in/session-control/agent-judgment-submission.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/transaction/session-control/agent-judgment-submission.transaction.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-judgment-submission.transaction.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/agent-judgment-submission.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/agent-judgment-dispatch.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/__tests__/agent-judgment-submission.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/__tests__/agent-judgment-dispatch.service.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/agent-judgment-submission.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/agent-os-api-execution.module.ts`
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `apps/server/src/agent-os/application/port/out/capability/agent-capability-handler.port.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-session-capability-invocation.service.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-session-capability-invocation.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/agent/agent-os-platform-probe-capability.adapter.ts`
- Modify: `apps/server/src/agent-os/adapter/in/agent/analytics-overview-agent-capability.adapter.ts`
- Modify: `apps/server/src/ai/adapter/in/agent/ai-wing-registration-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/market-shadow-signal-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-collection-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-listing-prep-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-scrape-url-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-workspace-capability.adapter.ts`
- Modify: `apps/server/src/supply/adapter/in/agent/supply-agent-capability.adapter.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-session.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-capability.module.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Create: `apps/server/src/operations/operations-http.module.ts`
- Create: `apps/server/src/operations/__tests__/operations.module-boundary.spec.ts`
- Modify: `apps/server/src/api-application.module.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Create: `apps/server/src/advertising/application/port/out/cross-domain/ad-strategy-judgment.port.ts`
- Create: `apps/server/src/advertising/adapter/out/agent-os/agent-os-ad-strategy-judgment.adapter.ts`
- Modify: `apps/server/src/advertising/application/service/ad-strategy-agent.service.ts`
- Modify: `apps/server/src/advertising/application/service/__tests__/ad-strategy-agent.spec.ts`
- Modify: `apps/server/src/advertising/application/service/ad-strategy.service.ts`
- Modify: `apps/server/src/advertising/application/service/ad-recommend.service.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/ad-strategy-agent.controller.ts`
- Modify: `apps/server/src/advertising/advertising.module.ts`
- Create: `apps/server/src/rules/application/port/in/apply-rules-evaluation.port.ts`
- Create: `apps/server/src/rules/application/port/out/cross-domain/rules-judgment.port.ts`
- Create: `apps/server/src/rules/adapter/in/agent/rules-evaluation-capability.adapter.ts`
- Create: `apps/server/src/rules/adapter/out/agent-os/agent-os-rules-judgment.adapter.ts`
- Create: `apps/server/src/rules/domain/operation/rules.operations.ts`
- Create: `apps/server/src/rules/adapter/in/operation/rules-evaluation.operation-handler.ts`
- Modify: `apps/server/src/rules/services/rules.service.ts`
- Modify: `apps/server/src/rules/services/types.ts`
- Modify: `apps/server/src/rules/rules.module.ts`
- Modify: `apps/server/src/rules/__tests__/rules-flow.spec.ts`
- Modify: `apps/server/src/rules/__tests__/rules.service.spec.ts`
- Modify: `apps/server/src/sourcing/application/port/in/capability/sourcing-capability.ports.ts`
- Modify: `apps/server/src/sourcing/application/port/out/runtime/sourcing-agent.gateway.port.ts`
- Modify: `apps/server/src/sourcing/adapter/out/agent/sourcing-agent.gateway.adapter.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-agent-command.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing.service.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/server/src/sourcing/sourcing-agent-runtime.module.ts`
- Modify: `apps/server/src/sourcing/sourcing-agent-api-collection.module.ts`
- Modify: `apps/server/src/supply/supply-agent-runtime.module.ts`
- Modify: `apps/server/src/sourcing/adapter/out/agent/__tests__/sourcing-agent.gateway.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/__tests__/sourcing.module.wiring.spec.ts`
- Modify: `apps/server/src/supply/__tests__/supply.module.wiring.spec.ts`
- Modify: `apps/server/src/automation/application/port/in/workflow-run-cancellation.port.ts`
- Modify: `apps/server/src/automation/application/service/workflow-runner.service.ts`
- Modify: `apps/server/src/common/operation-cancellation-audit.ts`
- Modify: `packages/shared/src/schemas/operation-cancellation.ts`
- Modify: `packages/shared/src/schemas/operation-cancellation.spec.ts`
- Modify: `packages/shared/src/panel/__tests__/types.spec.ts`
- Modify: `apps/web/src/lib/operation-alert-actions.ts`
- Modify: `apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`
- Modify: `apps/server/src/operation-cancellation/adapter/in/http/dto/operation-cancel.dto.ts`
- Modify: `apps/server/src/operation-cancellation/application/service/operation-cancellation-result.ts`
- Modify: `apps/server/src/operation-cancellation/application/service/operation-cancellation.service.ts`
- Modify: `apps/server/src/operation-cancellation/operation-cancellation.module.ts`
- Modify: `apps/server/src/operation-cancellation/adapter/in/http/__tests__/operation-cancellation.parent-child.integration.spec.ts`
- Modify: `apps/server/src/automation/__tests__/automation-agent-os-boundary.spec.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/detail-page-ai.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-os-mcp-tool-executor.service.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-os-mcp-tool-executor.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/cli/run-openai-operator.ts`
- Delete after replacement: `apps/server/src/sourcing/adapter/out/runtime/sourcing-runtime.handler.ts`
- Delete after replacement: `apps/server/src/supply/adapter/out/runtime/order-agent-runtime.handler.ts`

**Interfaces:**
- Consumes: authenticated organization/actor scope, code-owned AgentVersion,
  immutable authority profile, typed resource references, official session
  transactions, and Operations.
- Produces: one owner-facing judgment submission port using canonical resource
  names, plus direct owner/Operation paths for deterministic work.

- [ ] **Step 1: Lock the caller classification in tests**

| Current caller | Classification | Replacement |
|---|---|---|
| Advertising manual `ad_strategy` | judgment | owner-local output port backed by official AgentSession submission |
| Rules `rules_evaluation` | deterministic evaluation | Rules-owned Operation and typed result-application input port |
| Rules `rules_suggest` | judgment | owner-local output port backed by official AgentSession submission |
| Sourcing assistant | judgment | the shared Interaction Surface with the Sourcing Agent selected |
| Sourcing URL scrape | deterministic browser workflow | Sourcing-owned Operation, directly or through an official capability |
| Product detail/content processing | deterministic AI job | AI owner API/direct-job ledger, never AgentSession |
| Operation cancellation | control | canonical AgentSession task/Operations cancellation ports |
| Operator CLI | explicit judgment | official session submission or delete if no supported operator use remains |
| MCP delegation/capability invocation | official runtime control | official execution context, session delegation, and capability ports |
| Sourcing/Supply legacy runtime handlers | superseded | owner capability adapters already registered in the official registry |

Add one failing contract test per row. The test asserts no fallback to
`AGENT_RUNNER_PORT`, no raw public database ID, and no `AgentRun` result bridge.
An unauthenticated/system caller cannot enter the judgment port; scheduled work
must use its owner Operation instead.

Add the composition RED before moving providers:

```typescript
it('keeps execution cores controller-free and HTTP roots API-only', () => {
  expect(moduleControllers(OperationsModule)).toEqual([]);
  expect(moduleControllers(AgentOsApiExecutionModule)).toEqual([]);
  expect(moduleControllers(OperationsHttpModule)).toEqual([
    OperationsController,
    OperationSchedulesController,
    BrowserOperationRuntimeController,
  ]);
  expect(importGraph(AgentMcpApplicationModule)).not.toContain(OperationsHttpModule);
  expect(importGraph(AgentMcpApplicationModule)).not.toContain(AgentOsApiExecutionModule);
});
```

- [ ] **Step 2: Define the official judgment submission port**

```typescript
export const AGENT_JUDGMENT_SUBMISSION_PORT = Symbol('AGENT_JUDGMENT_SUBMISSION_PORT');

export interface AgentJudgmentSubmissionPort {
  submit(input: {
    organization: OrganizationName;
    actor: UserName;
    agentDefinition: AgentDefinitionName;
    objective: string;
    resourceRefs: CanonicalResourceRef[];
    idempotencyKey: IdempotencyKey;
  }): Promise<{
    session: AgentSessionName;
    task: AgentSessionTaskName;
    execution: AgentExecutionName;
    operation: OperationRunName;
  }>;
}
```

`AgentJudgmentSubmissionService` parses every name and bounded objective,
resolves the active AgentVersion and organization authority profile, and uses
one transaction to create the official session/root-task/epoch/policy/
execution/initial user-command event plus an `AgentExecutionDispatchOutbox`
row. It uses a server-generated opaque Copilot thread ID and AG-UI run ID;
neither is accepted from the domain caller. Exact retry returns the same
resources and mismatched reuse conflicts.

`AgentJudgmentDispatchService` drains that outbox through
`AgentSessionTaskDispatchService`. Operations start and attempt reservation use
the stored idempotency key; only after both succeed does the outbox become
`dispatched`. A crash after session commit, Operation creation, or attempt
binding is recovered on API bootstrap and by the submitting request without
creating a second Operation. The outbox has exact organization/session/task/
execution composite foreign keys, one row per execution, `pending|dispatched`
state, and no prompt or result content.

`AgentOsApiExecutionModule` is controller-free and API-process-only. It imports
`AgentOsSessionModule` plus the controller-free `OperationsModule`, exports only
the judgment and session-control input-port tokens, and is imported by
`AgentOsHttpModule` and the API-domain composition modules whose outgoing
adapters submit judgment. First split the current Operations composition:
`OperationsModule` retains repositories, lifecycle, scheduling, dispatch, and
input-port exports without controllers; a new `OperationsHttpModule` imports it
and owns `OperationsController`, `OperationSchedulesController`, and
`BrowserOperationRuntimeController`. `ApiApplicationModule` imports the HTTP
module, while AgentOS and owner Operations adapters import only the
controller-free module. Owner application services continue to inject
owner-local output ports; they do not import AgentOS ports directly. Worker and
MCP application roots must not import either API-only module transitively.

- [ ] **Step 3: Replace legacy capability execution identity**

Change `AgentCapabilityExecutionInput` from nullable raw
`conversationId`/`agentInstanceId`/`requestId`/`runId` fields to one exact
official context:

```typescript
export interface AgentCapabilityExecutionInput<TInput extends Record<string, unknown>> {
  organization: OrganizationName;
  actor: UserName | null;
  agentVersion: AgentVersionName;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  execution: AgentExecutionName;
  attempt: AgentExecutionAttemptName;
  operation: OperationRunName;
  requestId: RequestId;
  input: TInput;
}
```

The official invocation service formats this context from the validated
execution graph and checks that every nested name has the same organization,
session, and execution parent before resolving a capability. Every owner
adapter derives idempotency from the branded request ID plus its own resource
key and receives no legacy lineage field. Update all registered AgentOS, AI,
Sourcing, and Supply capability adapters and their focused tests together.

- [ ] **Step 4: Move non-legacy capability providers out of quarantine**

Move `AgentApiCapabilityGrantService`, the official capability execution port,
and required readiness adapters into `AgentOsCapabilityModule` or
`AgentOsRuntimeSupportModule`. Split `AgentOsMcpToolExecutor` so the official
executor consumes `AgentExecutionContextRepositoryPort`,
`AgentSessionDelegationService`, and the official capability registry only.
Delete its optional legacy conversation graph, runner, and tool-router paths.
The MCP root continues to boot without Operations or interaction HTTP secrets.

- [ ] **Step 5: Migrate business callers without changing owner writes**

Advertising and Rules define owner-local output ports whose AgentOS adapters
call `AGENT_JUDGMENT_SUBMISSION_PORT`; their application services never depend
on AgentOS directly. They preserve existing operation-alert/user feedback using
the returned canonical `operation`/`session` resources. Rules evaluation moves
to a Rules-owned Operation; its result application is a Rules incoming port
that can also be called by a typed Agent capability adapter. No global
`agent.run.finalized` listener may write Rules rows.

Sourcing removes legacy `conversationId`/`parentRequestId`/`delegatedByRunId`
from its ports. Direct URL scrape starts the Sourcing Operation, and a Sourcing
Agent may call the same owner port as a capability. The embedded Sourcing
assistant is removed in Task 7 in favor of the shared Interaction Surface.
Product generation calls the existing AI direct-generation endpoint and polls
its owner ledger. Operation cancellation removes `agent_run` and
`agent_run_request` target variants, response arrays, audit fields, and
workflow cancellation counts; it delegates official session/operation control
to canonical resource-name ports.

- [ ] **Step 6: Remove the generic registry/runtime consumers**

Remove `AgentRuntimeHandlerRegistry` and `AgentToolRouter` imports from Sourcing
and Supply. Their official `AgentCapabilityRegistry` adapters remain. Update or
delete `run-openai-operator.ts` so it never calls `executeRequest` or resolves
`AGENT_RUNNER_PORT`. The legacy local CLI/process registry is not reused by the
durable isolated CLI adapter.

- [ ] **Step 7: Run focused and real-PostgreSQL replacement gates**

Use a disposable PostgreSQL 17 database for the integration suite and
`db:push`; never point this implementation gate at Office.

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/session-control/__tests__/agent-judgment-submission.service.spec.ts \
  src/agent-os/application/service/session-control/__tests__/agent-judgment-dispatch.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-capability-invocation.service.spec.ts \
  src/operations/__tests__/operations.module-boundary.spec.ts \
  src/advertising/application/service/__tests__/ad-strategy-agent.spec.ts \
  src/rules/__tests__/rules-flow.spec.ts \
  src/rules/__tests__/rules.service.spec.ts \
  src/sourcing/adapter/out/agent/__tests__/sourcing-agent.gateway.adapter.spec.ts \
  src/operation-cancellation/adapter/in/http/__tests__/operation-cancellation.parent-child.integration.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/__tests__/agent-judgment-submission.pg.integration.spec.ts \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts \
  src/agent-os/__tests__/session-delegation.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run db:push
npx prisma generate
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
```

Expected: all tests pass; a crash at every judgment dispatch boundary recovers
one Operation/attempt binding, every classified caller returns official
resource names or owner-domain job/Operation identity, and no caller creates a
generic AgentRun.

- [ ] **Step 8: Commit caller replacement**

```bash
git add apps/server/src/agent-os apps/server/src/operations \
  apps/server/src/api-application.module.ts apps/server/src/advertising \
  apps/server/src/rules apps/server/src/sourcing apps/server/src/supply \
  apps/server/src/automation apps/server/src/ai \
  apps/server/src/operation-cancellation apps/server/src/common \
  apps/web/src/lib apps/web/src/components/panel packages/shared prisma
git commit -m "refactor: route judgment through official agent sessions"
```

## Task 7: Remove Legacy Product, HTTP, And Polling Surfaces

**Files:**
- Modify: `apps/server/src/main.ts`
- Modify: `apps/server/src/api-application.module.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os-catalog.module.ts`
- Modify: `apps/server/src/agent-os/application/port/in/catalog/agent-catalog.port.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-catalog.service.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-policy.service.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/catalog/agent-catalog.controller.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/catalog/dto/agent-catalog.dto.ts`
- Delete: `apps/server/src/chat/**`
- Delete: `apps/server/src/agent-os/adapter/in/http/legacy-run/**`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-entry-recommendation.controller.ts`
- Delete: `apps/server/src/sourcing/application/service/sourcing-assistant.service.ts`
- Delete: `apps/server/src/sourcing/application/service/__tests__/sourcing-assistant.service.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/web/src/app/agent-os/page.tsx`
- Modify: `apps/web/src/app/agent-os/__tests__/page.spec.tsx`
- Delete: `apps/web/src/app/agent-os/network/page.tsx`
- Delete: `apps/web/src/app/agent-os/lib/{agent-os-chat-api,agent-os-helpers,agent-os-types,execution-canvas-graph}.ts`
- Delete: `apps/web/src/app/agent-os/lib/execution-canvas-graph.spec.ts`
- Delete: `apps/web/src/app/agent-os/components/{ActionBoardOverlay,AgentNetworkCanvas,AgentOsBottomDashboard,AgentOsHeader,AgentOsObservabilityOverlay,AgentOsOperatorWorkspace,AgentOsPolicyOverlay,AgentResultCard,AgentsListPanel,ApprovalCard,ConversationList,ExecutionCanvas,ExecutionNodeDetail,LiveActivityPanel,OperatorChatPanel,PriorityDot,RunInspector}.tsx`
- Delete: `apps/web/src/app/agent-os/components/{AgentOsHeader,ExecutionCanvas,ExecutionNodeDetail}.spec.tsx`
- Delete: `apps/web/src/components/chat/ChatBot.tsx`
- Modify: `apps/web/src/app/(automation)/agents/page.tsx`
- Delete: `apps/web/src/app/(automation)/agents/lib/agent-os-api.ts`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardChartPanel.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx`
- Delete: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/SourcingAssistantPanel.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/entry-recommendation-api.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateDetailPage.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api.spec.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/src/__tests__/proxy.spec.ts`
- Modify: `apps/web/src/__tests__/next-config.spec.ts`
- Create: `apps/web/e2e/interaction-os/prelaunch-contraction.spec.ts`

**Interfaces:**
- Consumes: official session/bootstrap/replay/control APIs and owner-domain AI
  job APIs from Task 6.
- Produces: one CopilotKit interaction surface and no browser request to a
  generic chat/run/request/conversation endpoint.

- [ ] **Step 1: Write route and network RED tests**

```tsx
it('renders only the official interaction workspace', () => {
  render(<AgentOsPage />);
  expect(screen.getByTestId('interaction-surface')).toBeInTheDocument();
  expect(screen.queryByLabelText('Operator workspace')).not.toBeInTheDocument();
});
```

The Playwright test records every request and rejects `/api/chat`,
`/api/chat/copilot`, `/api/agent-os/runs`, `/api/agent-os/requests`,
`/api/agent-os/conversations`, generic approvals, manual executor drain, direct
provider streams, and polling timers. It covers first submit, same-session
continuation, explicit new conversation, progress, approval, cancel, and
panel/workspace same-thread behavior.

- [ ] **Step 2: Delete legacy server routes**

Remove `ChatModule` from `ApiApplicationModule` and the pre-registered
`/api/chat/copilot` Express path from `main.ts`. Delete all six legacy AgentOS
controllers: run request, run query, observability, executor, approval, and
conversation. `AgentOsHttpModule` retains only catalog/version discovery,
interaction bootstrap/authorization/AG-UI/actions, and official session control.

Refactor the catalog endpoint away from `AgentInstance` and mutable instance
tool policies. Its read model uses code-owned `AgentVersion` plus immutable
authority profile summaries and returns canonical version resources. Mutating
instance/tool-policy routes are deleted rather than aliased. `AgentPolicyService`
validates immutable policy snapshots through focused version/profile ports; it
does not retain the broad legacy repository merely because the catalog used it.

- [ ] **Step 3: Delete legacy web renderers and polling**

`/agent-os` renders only the retained `AgentOsInteractionWorkspace`; the old
network, conversation list/chat, execution canvas, run/cost/authorization
polling overlays, and mutable instance policy UI are deleted. `/agents`
redirects to `/agent-os` rather than recreating a second operations surface.
Dashboard widgets that depended on `AgentInstance` are removed or use a focused
code-owned version/readiness projection.

The Sourcing decision center removes `assistant-ask` and its local transcript;
its “ask” action opens the shared Interaction Surface with the Sourcing Agent
and route context selected. Detail-page generation calls
`POST /api/ai/detail-page/generate` and reads the AI owner ledger. The stale
`productsApi.process` generic-run call is replaced by the existing owner route
`POST /api/sourcing/candidates/:id/quick-process`; it delegates through the
Sourcing product-generation input port and AI direct-job ledger already used by
`productsApi.quickProcess`. Neither path imports `AgentRunnerResult`,
`AgentRunSummary`, or `AgentRunRequestSummary`.
The legacy-boundary scanner rejects both the `SourcingAssistantPanel` path and
its component symbol so the local transcript cannot return under another
import path.

- [ ] **Step 4: Run surface and dependency gates**

```bash
npm test --workspace=apps/web -- src/app/agent-os src/components/agent-interaction
npx playwright test apps/web/e2e/interaction-os/prelaunch-contraction.spec.ts
npm run check:copilotkit-train
npm run build --workspace=apps/web
npm run build --workspace=apps/server
```

Expected: all pass and the browser network trace contains only official
Interaction OS and owner-domain APIs.

- [ ] **Step 5: Commit surface contraction**

```bash
git add -A apps/server/src/main.ts apps/server/src/api-application.module.ts \
  apps/server/src/__tests__ apps/server/src/chat apps/server/src/agent-os \
  apps/server/src/sourcing apps/web
git commit -m "refactor: remove legacy agent interaction surfaces"
```

## Task 8: Delete The Generic Runtime, Worker, Shared Contracts, And Empty Schema

**Files:**
- Delete: `apps/server/src/agent-os/agent-os-legacy-run.module.ts`
- Delete: `apps/server/src/agent-os/agent-os-worker.module.ts`
- Delete: `apps/server/src/agent-worker-application.module.ts`
- Delete: `apps/server/src/worker.ts`
- Modify: `apps/server/src/agent-runtime-application.module.ts`
- Modify: `apps/server/src/agent-mcp-application.module.ts`
- Delete: `apps/server/src/agent-os/application/port/in/agent-runner.port.ts`
- Delete: `apps/server/src/agent-os/application/port/in/legacy-run/**`
- Delete: `apps/server/src/agent-os/application/port/out/repository/agent-os-repository.port.ts`
- Delete: `apps/server/src/agent-os/application/port/out/runtime/{agent-mcp-session,agent-runtime-handler,agent-runtime}.port.ts`
- Delete: `apps/server/src/agent-os/application/port/out/storage/agent-log-store.port.ts`
- Delete: `apps/server/src/agent-os/application/event/agent-run-events.ts`
- Delete: `apps/server/src/agent-os/application/service/agent-runtime.config.ts`
- Delete: `apps/server/src/agent-os/application/service/{agent-approval,agent-conversation,agent-inline-run-reconciler,agent-interaction,agent-observability,agent-plan-validator,agent-run-coordinator,agent-run-executor,agent-run-graph,agent-run-worker,agent-runtime-handler-registry,agent-task-delegation,agent-tool-router,kiditem-mcp-tool-registry,operator-context-builder,operator-decision-executor,operator-decision-parser}.service.ts`
- Delete: `apps/server/src/agent-os/application/service/__tests__/{agent-approval,agent-conversation,agent-inline-run-reconciler,agent-interaction,agent-plan-validator,agent-run-coordinator,agent-run-executor,agent-run-graph,agent-run-worker,agent-task-delegation,agent-tool-router,kiditem-mcp-tool-registry,operator-context-builder,operator-decision-executor,operator-decision-parser}.service.spec.ts`
- Delete: `apps/server/src/agent-os/application/service/__tests__/operator-decision-eval-fixtures.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/automation/agent-run-operation-alert.bridge.ts`
- Delete: `apps/server/src/agent-os/adapter/out/automation/__tests__/agent-run-operation-alert.bridge.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/repository/agent-os.{approval,conversation,cost-audit,instance-session,lifecycle,request,run}.repository.ts`
- Delete: `apps/server/src/agent-os/adapter/out/repository/agent-os.repository.{adapter,mapper}.ts`
- Delete: `apps/server/src/agent-os/adapter/out/log-store/filesystem-agent-log-store.adapter.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/{agent-local-cli-answer,agent-local-cli-command,agent-local-cli-runtime.adapter,agent-local-process-registry,kiditem-mcp-session.adapter,operator-runtime.handler,routing-runtime.adapter}.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/__tests__/{agent-local-cli-command,agent-local-cli-runtime.adapter,agent-local-process-registry,kiditem-mcp-session.adapter,operator-decision-output-schema,operator-runtime.handler,routing-runtime.adapter}.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/repository/__tests__/agent-os.{approval,conversation,instance-session,lifecycle}.repository.spec.ts`
- Delete: `apps/server/src/agent-os/__tests__/{agent-inline-run-reconcile,agent-os-repository,agent-run-worker-finalize}.pg.integration.spec.ts`
- Delete: `apps/server/src/__tests__/agent-worker-application.pg.integration.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/__tests__/kiditem-agent-os-mcp-server.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-server-lifecycle.pg.integration.spec.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os-catalog.module.ts`
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Modify: `apps/server/src/agent-os/domain/agent-os.types.ts`
- Modify: `apps/server/src/agent-os/seed-agent-os.ts`
- Modify: `packages/shared/src/schemas/agent-os.ts`
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `package.json`
- Modify: `apps/server/package.json`
- Modify: `apps/server/.env.example`
- Modify: `deploy/office/compose.office.yml`
- Modify: `deploy/office/office.env.example`
- Modify: `deploy/office/apply-deployment.ps1`
- Modify: `scripts/__tests__/office-deployment-contract.test.mjs`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/office-deploy.md`
- Modify: `scripts/check-agent-os-legacy-boundary.mjs`
- Modify: `scripts/check-pr-release-contract.mjs`
- Modify: `scripts/__tests__/check-pr-release-contract.test.mjs`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/__tests__/check-script-inventory.test.mjs`
- Modify: `.github/workflows/pr-checks.yml`
- Modify: `.github/workflows/develop-validation.yml`
- Modify: `.github/workflows/office-images.yml`

**Interfaces:**
- Consumes: zero source findings from Tasks 6–7 and an allowed database
  preflight from Task 5.
- Produces: a first-deployable API/MCP/gateway system with only official session
  models/runtime and no generic Agent worker process.

- [ ] **Step 1: Run strict source inventory and prepare the guarded target preflight**

```bash
npm run check:agent-os-legacy-boundary -- --report
# Development/disposable proof only; never substitute a developer database for
# the intended Office preflight.
node apps/server/dist/agent-os/adapter/in/cli/check-legacy-agent-run-preflight.js \
  --database-url-env DATABASE_URL \
  --confirm READ_ONLY_PREFLIGHT \
  --expect-schema present_empty_or_absent
```

Expected before deletion: source report contains only files listed in this task;
database report shows either no legacy schema or zero hard-runtime rows plus the
exact allowed `AgentInstance`/`AgentRuntimeState` seed projection. Any
unexpected source, partial schema, or data stops the task. Do not create a
migration mapping, transcript export, 410 compatibility route, or force flag.
For the intended Office database, extend the Actions-bundled
`apply-deployment.ps1` with a fail-closed `Preflight` operation. It first runs
the existing branch/upstream/clean-tree/manifest-SHA/env guards, keeps every
application writer stopped, then runs the candidate API image without its
normal command:

```powershell
docker compose run --rm --no-deps api node `
  dist/agent-os/adapter/in/cli/check-legacy-agent-run-preflight.js `
  --database-url-env DATABASE_URL `
  --confirm READ_ONLY_PREFLIGHT `
  --expect-schema present_empty_or_absent
```

It emits only the content-free report. `Deploy -ApplySchema -AcceptDataLoss`
must refuse to contract the schema unless that exact guarded preflight succeeds
again in the same stopped-writer deployment attempt. Deployment-contract tests
prove the command uses the immutable candidate image and production
dependencies and never invokes host `node`, `npm`, `npx`, or `tsx`. The
GitHub-hosted workflow never receives the Office database URL, and no unbundled
local deployment command is introduced.

- [ ] **Step 2: Delete the exact generic runtime ownership**

Delete `AgentInteractionService`, `AgentApprovalService`,
`AgentConversationService`, `AgentObservabilityService`, `AgentPlanValidator`,
`OperatorContextBuilder`, `AgentRunCoordinator`, `AgentRunExecutor`,
`AgentRunGraphService`, `AgentRunWorker`, `AgentRuntimeHandlerRegistry`,
`AgentTaskDelegationService`, `AgentToolRouter`, the legacy half of
`AgentOsMcpToolExecutor`, `KidItemMcpToolRegistry`, legacy Operator decision and
routing runtime services, local CLI/process/MCP-session adapters, old log store,
legacy repository facade/ports/mappers, and the finalized-run alert bridge.
Retain official `AgentRuntimeAdapterRegistry`, durable Hermes/isolated CLI
adapters, session execution, official capability registry, AgentVersion
catalog, interaction event store, and Operations session adapter.

Remove `AgentOsLegacyRunModule` imports from Advertising, Rules, Sourcing,
Supply, Operation Cancellation, `AgentOsHttpModule`, and
`AgentRuntimeApplicationModule`. Delete the worker Nest root, package command,
Office compose service, `AGENT_RUNTIME_WORKER_ENABLED`, and
`AGENT_RUNTIME_WORKER_INTERVAL_MS`. The MCP root remains controller-free and
uses official execution/capability providers only.

- [ ] **Step 3: Contract the legacy shared and Prisma model graph**

Retain these official models:

```text
AgentVersion, AgentAuthorityProfileVersion, AgentSession, AgentSessionTask,
AgentContextEpoch, AgentPolicySnapshot, AgentExecution,
AgentConversationEvent, AgentConversationOutbox, AgentExecutionUsage,
AgentSessionTaskDelegation, AgentExecutionAttempt,
AgentExecutionAttemptOperationBinding, AgentSessionApproval,
AgentSessionApprovalContinuation, AgentSessionArtifact,
AgentInteractionRetentionPolicy, AgentSessionLifecycleRequest,
AgentSessionTombstone,
AgentExecutionDispatchOutbox
```

Remove these generic models and their relations:

```text
AgentInstance, AgentRuntimeState, AgentTaskSession, AgentRunRequest, AgentRun,
AgentRunEvent, AgentToolDefinition, AgentInstanceToolPolicy,
AgentAuthorizationEvent, AgentApprovalRequest, AgentCostEvent,
AgentConversation, AgentMessage, AgentToolInvocation, AgentArtifact
```

Update `Organization`, `User`, `WorkflowRun`, and related reverse relations in
`core.prisma`/`agents.prisma`. Trim shared `agent-os` schemas to official
definition/version/readiness contracts or move consumers to focused
`@kiditem/shared/agent-interaction` and `@kiditem/shared/identifiers` exports.
There is no `AgentLegacyMigrationMapping`: preflight proved there is no legacy
production record to map. Retained UUID rows are not rekeyed.

Apply this relation-level contraction explicitly:

| Retained owner | Remove | Preserve |
|---|---|---|
| `Organization` | `agentInstances`, `agentRuntimeStates`, `agentTaskSessions`, `agentRunRequests`, `agentRuns`, `agentRunEvents`, `agentInstanceToolPolicies`, `agentAuthorizationEvents`, `agentApprovalRequests`, `agentCostEvents`, `agentConversations`, `agentMessages`, `agentToolInvocations`, `agentArtifacts` | official session/policy/execution/usage/authority/retention/lifecycle-request relations |
| `User` | `agentInstanceId`, `agentInstance`, its index, and legacy run/authorization/approval/conversation actor arrays | `createdAgentSessions`, retention-policy updater/lifecycle requester relations, and unrelated owner-domain actor relations |
| `WorkflowRun` | `agentRunRequests` and the comment claiming workflow dispatch through `AgentRunnerPort` | deterministic workflow/Operation ownership |
| `AgentExecution` | nothing from the official graph | add the exact one-to-one `AgentExecutionDispatchOutbox` relation |

`seed-agent-os.ts` stops creating `AgentInstance` and mutable runtime-state
rows; no legacy tool-definition or instance-policy row may survive the
preflight. It continues publishing immutable AgentVersion manifests and
organization authority profiles idempotently.

- [ ] **Step 4: Apply the empty destructive schema change in isolation**

```bash
npm run db:push -- --accept-data-loss
npx prisma generate
npm run build --workspace=packages/shared
node apps/server/dist/agent-os/adapter/in/cli/check-legacy-agent-run-preflight.js \
  --database-url-env DATABASE_URL --confirm READ_ONLY_PREFLIGHT \
  --expect-schema absent
npm run db:erd
npm run check:schema-artifact-sync
```

Expected: a fresh/disposable PostgreSQL database accepts the final schema; a
snapshot containing only the exact allowed `AgentInstance`/`AgentRuntimeState`
seed rows (or no legacy schema at all) passes preflight before the drop; the same
preflight reports `schemaState=absent` after the drop; all generated artifacts
match. The PR release decision records:

```text
Release decision: keep VERSION 0.1.30; pre-launch empty legacy schema contraction,
no production backfill, rollback restores the verified same-attempt database backup
```

Before running the target Office push, `apply-deployment.ps1` stops API,
gateway, web, the prior generic worker, and nginx; leaves PostgreSQL/MinIO
running; reruns the `present_empty_or_absent` preflight; creates a PostgreSQL 17
custom-format full-database dump; verifies `pg_restore --list`; writes its
SHA-256; and copies it to `OFFICE_SCHEMA_BACKUP_ROOT` with a matching hash. It
then applies the candidate schema and reruns the preflight with
`--expect-schema absent` before any application writer starts.

If schema application, post-push verification, readiness, or smoke fails, the
deployer never takes the runtime-only rollback branch. It keeps writers
stopped, restores the verified dump with PostgreSQL 17
`pg_restore --clean --if-exists --single-transaction`, reruns the candidate
image preflight with
`--expect-schema present_empty_or_absent`, verifies the previous manifest's
schema/readiness contract, and only then starts the previous immutable images.
If restore or verification fails, the deployment remains stopped and reports a
manual recovery blocker. Contract tests inject a failure after schema push and
assert this exact stop → preflight → verified backup → push → restore → verify
→ previous-start ordering; they reject any catch path that starts the prior
runtime before database restoration.

- [ ] **Step 5: Make strict gates permanent**

Add `check:agent-os-legacy-boundary` to `check:conventions`, CI, the
Actions-produced Office bundle contract, and release-contract checks. The
Office deployer runs the database preflight before and after the schema change.
Strict mode requires no allowlist and rejects the
deleted models, paths, routes, symbols, worker command/env, UI imports, or
package dependencies if they return. Its fixed non-runtime exclusions remain
limited to durable documentation, its own negative fixtures, immutable
historical data migrations, and the exact five-file preflight inspection seam
defined in Task 5. Documentation/migrations cannot be imported by deployable
code; the preflight files may depend only on one another and are reachable only
from their CLI entrypoint. A new preflight file, broader directory prefix, or
import from a Nest module, API, MCP, worker, owner domain, or runtime root is a
hard scanner failure.

- [ ] **Step 6: Run process-root and architecture gates**

```bash
npm run check:agent-os-legacy-boundary
npm run check:agent-os-hexagonal
npm run check:identifier-contracts
npm run check:idor
npm run check:tenant-scope
npm run check:directory-architecture
npm run check:conventions
npm run build --workspace=apps/server
npm run dev:server
```

Expected: all finite commands pass; API boots with `AgentOsHttpModule` and
Operations, MCP initializes without interaction HTTP secrets, no worker process
is defined, and no legacy route/model/provider is reachable. Stop owned
processes.

- [ ] **Step 7: Commit runtime and schema contraction**

```bash
git add -A apps/server packages/shared prisma deploy/office package.json \
  package-lock.json scripts .github docs/runbooks/environment-variables.md \
  docs/ERD.md docs/erd
git commit -m "refactor: remove generic AgentRun runtime"
```

## Task 9: Final Architecture, Recovery, And First-Deployment Acceptance

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `docs/runbooks/office-deploy.md`
- Modify: `docs/runbooks/interaction-platform.md`
- Modify: `docs/runbooks/interaction-first-deployment.md`
- Modify: `docs/runbooks/README.md`
- Modify: `apps/server/src/agent-os/AGENTS.md`
- Modify: `apps/server/src/operations/AGENTS.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `apps/interaction-gateway/AGENTS.md`
- Create: `docs/references/interaction-os-acceptance-2026-08.md`

**Interfaces:**
- Consumes: pre-launch evidence from Tasks 1–8.
- Produces: final ownership/runbook map and signed acceptance report.

- [ ] **Step 1: Update durable ownership documentation**

Document CopilotKit OSS presentation ownership, AgentOS/PostgreSQL conversation
event ownership, the AG-UI boundary, principal flow, session/task/Operations
split, exact runtime matrices, lifecycle/retention/legal hold, backup/restore,
fork policy, upgrade canary, Office topology, endpoints to keep, and deleted
concepts. Remove every document claiming Enterprise Intelligence or a legacy
transcript is canonical, `/api/chat` is supported, Chatbot exists, or frontend
polls legacy AgentOS conversation completion. Remove the generic Agent worker
process from topology and document that API owns Operations-backed session task
execution while MCP is controller-free.

- [ ] **Step 2: Run a quarterly-style DR and upgrade rehearsal**

In the isolated production-like environment:

1. take PostgreSQL/object backups and record checkpoint;
2. create two session-backed threads, including one durable task with an open approval;
3. simulate loss of the KidItem database primary, the API, the gateway, and the
   Operations lifecycle owner;
4. restore PostgreSQL/attachments inside KR, rebuild outbox projections, rotate
   service/run-intent/replay-cursor credentials, and restart API/gateway;
5. replay the conversational session from its durable cursor, reconnect the
   active run, resolve the durable task approval, and finish the task;
6. run exact candidate upgrade canary and rollback to locked train;
7. verify retention deletion and legal hold;
8. verify opaque `copilotThreadId`/`aguiRunId` correlation with canonical
   `session`, `task`, `execution`, `attempt`, and `operation` resource names,
   and zero duplicate event or capability invocation;
9. verify request IDs, idempotency keys, sequences, tokens, digests, runtime
   handles, and deleted legacy identifiers cannot be substituted for resource
   names.

Record actual RPO/RTO and evidence links in `interaction-os-acceptance-2026-08.md`.

- [ ] **Step 3: Run complete repository and release gates**

Run:

```bash
npm run check:agents-hygiene
npm run check:copilotkit-train
npm run check:agent-os-legacy-boundary
npm run check:identifier-contracts
npm run check:idor
npm run check:tenant-scope
npm run check:web-db-boundary
npm run check:directory-architecture
npm run check:schema-artifact-sync
npm run check:pr-reconstruction -- --base origin/develop --head HEAD
npm run check:pr-release-contract -- --base origin/develop --head HEAD
npm run build --workspace=packages/shared
npm run build --workspace=apps/interaction-gateway
npm run build --workspace=apps/web
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/__tests__/agent-judgment-submission.pg.integration.spec.ts \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts \
  src/agent-os/__tests__/session-delegation.pg.integration.spec.ts \
  src/agent-os/adapter/out/transaction/interaction/__tests__/prisma-agent-interaction.pg.integration.spec.ts \
  --config vitest.config.integration.ts
node deploy/interaction-gateway/smoke-official-recovery.mjs
npm run dev:server
```

Expected: all finite commands pass; Nest boots; the persistent smoke passes
browser and recovery legs; no mutable scanner finding allowlist remains, the
fixed preflight quarantine holds, and no legacy conversation
route/model/component/identity or generic Agent worker exists. Initialize the
built MCP root once with all interaction HTTP secrets unset, then stop every
owned process and disposable database.

- [ ] **Step 4: Perform production smoke after Office deployment**

Verify gateway/API/web immutable SHAs match, PostgreSQL schema/outbox/replay
readiness succeeds, and the same SHA-verified Office deployer reruns the
read-only legacy preflight with `--expect-schema absent` after schema
application and before starting application traffic. Then verify one session
replays and reconnects, one durable task
continues across panel close, one approval resolves, cancel propagates,
archived session lifecycle works, and logs/traces correlate without content.
If any required smoke fails after the destructive push, keep writers stopped,
restore and verify the same-attempt pre-push database backup, and only then
restart the previous immutable bundle. Do not perform runtime-only rollback or
enable a legacy conversation/Enterprise fallback.

- [ ] **Step 5: Commit final docs and acceptance record**

```bash
git add docs apps/server/src/agent-os/AGENTS.md \
  apps/server/src/operations/AGENTS.md apps/web/AGENTS.md \
  apps/interaction-gateway/AGENTS.md
git commit -m "docs: finalize interaction os operations"
```

## Plan Acceptance Evidence

- [ ] KidItem PostgreSQL/outbox/attachment persistence meets encryption, KR
  residency, backup/restore, retention, legal hold, capacity, and alerting
  requirements; ephemeral fan-out is reconstructable.
- [ ] Achieved RPO is ≤15 minutes and RTO is ≤4 hours.
- [ ] Office release builds API/web/gateway from one SHA and deploys immutable digest refs with atomic health validation.
- [ ] Weekly OSS canary covers session lifecycle/reconnect/replay/HITL/
  duplicate tool/cancel/gateway+API Operations restart and blocks an unproven
  train.
- [ ] Fork `main` is zero commits ahead of upstream; patches are bounded/upstreamed/expiring and never branch-installed by KidItem.
- [ ] Read-only target-database preflight reports zero legacy execution,
  conversation, approval, tool, artifact, authorization, and cost rows; any
  allowed instance/runtime seed rows match the exact code-owned projection, and
  post-contraction schema state is `absent`.
- [ ] Programmatic judgment submission commits its official session graph and
  content-free dispatch outbox atomically; crashes before Operation creation,
  attempt binding, or dispatched marking recover exactly one Operation.
- [ ] The first production artifact contains no `/api/chat`, legacy polling,
  duplicate transcript model/renderer, direct runtime stream, or divergent
  Chatbot identity.
- [ ] The first production artifact contains no generic non-session AgentRun
  path or Agent worker process; deterministic
  work uses owner ports/Operations, judgment uses official sessions, and no
  Operations handler imports the Agent capability registry.
- [ ] `OperationsModule` and `AgentOsApiExecutionModule` are controller-free;
  `OperationsHttpModule` and `AgentOsHttpModule` are API-only, and neither HTTP
  module is reachable from MCP or any remaining non-API application root.
- [ ] Existing UUID rows were not rekeyed; canonical resource names are used at
  public/cross-domain boundaries and all other identifier classes remain
  separate.
- [ ] Mutable scanner finding allowlists are empty; the exact five-file
  non-runtime preflight quarantine and CI/Office preflight enforce the boundary;
  no runtime phase manifest or legacy fallback toggle exists.
- [ ] Single-lifecycle conversations and durable tasks pass production smoke, retention/deletion/legal hold, restart, approval, cancellation, and correlation verification.
- [ ] Architecture, environment, deployment, ownership, first-deployment,
  upgrade, and DR docs match the final system.
