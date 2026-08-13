# Interaction OS Production Cutover And Legacy Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operate the CopilotKit-native Interaction OS as a recoverable production platform, cut every product surface to it, and delete the legacy chat/transcript/polling system without permanent dual write.

**Architecture:** Production Enterprise Intelligence runs as a separately operated Kubernetes platform plane with organization-aware lifecycle, backups, restore drills, and exact version canaries; the Office release train builds and pins the Interaction Gateway beside API/web images. Cutover uses expand/prove/freeze/migrate/contract releases: scanners first prevent new legacy dependencies, selected active official records receive new Enterprise threads plus validated handoffs, legacy writes are frozen, all surfaces move, then obsolete APIs/models/renderers/identities are removed in a later contract release. The `AgentFoundry-Labs/CopilotKit` fork stays a clean upstream mirror with bounded patch branches and never becomes a floating production dependency.

**Tech Stack:** Kubernetes/Helm, PostgreSQL/Redis, OIDC, S3-compatible backups, Docker Compose, GitHub Actions, GHCR, PowerShell Office deployer, CopilotKit/AG-UI compatibility canaries, Prisma migrations, NestJS, Next.js, Vitest, Playwright, k6

## Global Constraints

- All three preceding plans must have accepted production-like evidence before this plan changes a user entry point.
- Enterprise Intelligence and its PostgreSQL/Redis/object backups remain isolated from the KidItem business database.
- Default retention is 90 days after archive for Quick Ask and 365 days after terminal state for official sessions; organization legal hold overrides deletion. Policy values are stored as organization settings and may only be lengthened without an approved privacy/legal migration.
- Data residency is `KR`; primary, replicas, backups, logs, and restore environments remain in the approved Korean residency boundary.
- Target platform objectives are RPO ≤ 15 minutes and RTO ≤ 4 hours, verified quarterly.
- Production vendor telemetry is disabled; KidItem correlation metrics/logs/traces exclude message content and secrets.
- Thread deletion is idempotent, organization/user authorized, legal-hold aware, and produces a non-content tombstone before binding removal.
- Organization removal revokes principal access immediately, archives threads, and schedules non-held physical deletion under the organization policy.
- Legacy writes are frozen before migration starts. There is no phase in which one user message is written to both Enterprise Intelligence and a KidItem transcript table.
- Only continuing official work is migrated. Completed/transient legacy chats are not copied merely for compatibility.
- Migrated legacy work receives a new Enterprise thread with one migration notice and a server-validated current-state handoff; old transcript messages are never replayed into the new authority context.
- Schema contraction occurs in a release after production cutover evidence and rollback window, following the repository release-train procedure.
- Office deployment remains GitHub Actions-only and uses immutable digest references for API, web, and Interaction Gateway.
- `AgentFoundry-Labs/CopilotKit:main` must stay a fast-forwardable upstream mirror with zero KidItem commits.
- Patch packages are internally namespaced, exact-pinned as a full train, SBOM/license/provenance attached, upstream PR linked, and removed when upstream ships the fix.
- Slack, Teams, mobile, and additional channels are not enabled by this cutover.

---

## Release Sequence

| Release | State | Rollback |
|---|---|---|
| Expand | New platform/schema/gateway available to internal allowlist; legacy production path unchanged | Disable allowlist, leave additive tables idle |
| Prove | Quick Ask + official canaries pass; scanners prevent new legacy use | Route allowlist back to legacy; no dual-written messages to reconcile |
| Freeze | Legacy conversation creation/write endpoints return `410 LEGACY_CONVERSATION_FROZEN`; selected migration runs | Re-enable only before any selected record is marked migrated |
| Cutover | Purple FAB and AgentOS workspace use only CopilotKit; legacy reads remain admin-only for rollback window | Route surface to frozen read-only view, not to legacy writes |
| Contract | Legacy API/code/models/data removed after one stable production release | Database backup/archived release image only; no runtime toggle |

Each transition is a separate PR/Office artifact. Do not compress Freeze, Cutover, and Contract into one deploy.

## Task 1: Implement Thread Lifecycle, Retention, Legal Hold, And Tombstones

**Files:**
- Modify: `packages/shared/src/agent-interaction/index.ts`
- Create: `packages/shared/src/agent-interaction/lifecycle.ts`
- Create: `packages/shared/src/agent-interaction/lifecycle.spec.ts`
- Modify: `prisma/models/agents.prisma`
- Create: `apps/server/src/agent-os/application/port/out/platform/interaction-thread-store.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/platform/enterprise-intelligence-thread-store.adapter.ts`
- Create: `apps/server/src/agent-os/application/service/interaction-thread-lifecycle.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/interaction-thread-lifecycle.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction-thread-lifecycle.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/interaction-thread-lifecycle.controller.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

**Interfaces:**
- Consumes: supported Enterprise Intelligence thread archive/delete API, current organization/user, binding lifecycle.
- Produces: `InteractionThreadStorePort.archive/delete/get`, lifecycle request/tombstone models, and scoped archive/delete/legal-hold endpoints.

- [ ] **Step 1: Write retention and legal-hold tests**

```typescript
describe('InteractionThreadLifecycleService', () => {
  it('blocks deletion under legal hold', async () => {
    const service = createLifecycleService({ lifecycle: 'legal_hold' });
    await expect(service.requestDelete(deleteInput())).rejects.toMatchObject({ code: 'THREAD_LEGAL_HOLD' });
    expect(service.threadStore.delete).not.toHaveBeenCalled();
  });

  it('uses class-specific retention', () => {
    expect(service.deletionDueAt('quick_ask', new Date('2026-08-13T00:00:00Z')).toISOString()).toBe('2026-11-11T00:00:00.000Z');
    expect(service.deletionDueAt('official_task', new Date('2026-08-13T00:00:00Z')).toISOString()).toBe('2027-08-13T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/interaction-thread-lifecycle.service.spec.ts`

Expected: FAIL because the service/port do not exist.

- [ ] **Step 3: Define strict lifecycle contracts**

```typescript
export const ThreadLifecycleCommandSchema = z.object({
  threadBindingId: z.string().uuid(),
  command: z.enum(['archive', 'delete', 'place_legal_hold', 'release_legal_hold']),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().min(20).max(200),
}).strict();

export const InteractionRetentionPolicySchema = z.object({
  quickAskArchiveDays: z.number().int().min(90).default(90),
  officialTerminalDays: z.number().int().min(365).default(365),
  residency: z.literal('KR'),
}).strict();
```

- [ ] **Step 4: Add lifecycle request and tombstone persistence**

```prisma
model AgentThreadLifecycleRequest {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @db.Uuid
  threadBindingId String   @db.Uuid
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

model AgentThreadTombstone {
  id                  String   @id @default(uuid()) @db.Uuid
  organizationIdHash  String
  copilotThreadIdHash String   @unique
  interactionClass    String
  deletionReasonCode  String
  deletedAt           DateTime
  legalPolicyVersion  String
  @@index([organizationIdHash, deletedAt])
}
```

Tombstones contain hashes and policy metadata only: no raw org/user/thread ID, title, message, goal, resource, action, or model output.

- [ ] **Step 5: Implement store adapter and lifecycle transaction**

```typescript
export interface InteractionThreadStorePort {
  get(input: { principalKey: string; copilotThreadId: string }): Promise<{ id: string; archived: boolean } | null>;
  archive(input: { principalKey: string; copilotThreadId: string; idempotencyKey: string }): Promise<void>;
  delete(input: { principalKey: string; copilotThreadId: string; idempotencyKey: string }): Promise<void>;
}
```

The adapter uses only the support-approved public Enterprise Intelligence API recorded in the matrix. The service re-derives principal, selects binding in organization/user scope, enforces legal hold/retention, creates the request, calls the store, verifies absence on delete, writes the tombstone, and physically removes control rows whose legal/audit retention has elapsed. Failures remain retryable with the same idempotency key.

- [ ] **Step 6: Run lifecycle, schema, and scope gates**

Run:

```bash
npm run db:push
npx prisma generate
npx vitest run apps/server/src/agent-os/application/service/__tests__/interaction-thread-lifecycle.service.spec.ts apps/server/src/agent-os/adapter/in/http/__tests__/interaction-thread-lifecycle.controller.spec.ts
npm run check:idor
npm run check:tenant-scope
```

Expected: tests/scanners pass; legal hold prevents store deletion; repeated commands are idempotent.

- [ ] **Step 7: Commit lifecycle controls**

```bash
git add packages/shared/src/agent-interaction prisma apps/server/src/agent-os
git commit -m "feat: govern interaction thread lifecycle"
```

## Task 2: Productionize Enterprise Intelligence Operations

**Files:**
- Modify: `deploy/interaction-intelligence/values-office.yaml`
- Create: `deploy/interaction-intelligence/values-dr.yaml`
- Create: `deploy/interaction-intelligence/backup-restore-runbook.md`
- Create: `deploy/interaction-intelligence/retention-runbook.md`
- Create: `deploy/interaction-intelligence/alerts.yaml`
- Create: `deploy/interaction-intelligence/k6/reconnect-storm.js`
- Create: `deploy/interaction-intelligence/k6/long-stream.js`
- Create: `deploy/interaction-intelligence/residency-policy.json`
- Create: `deploy/interaction-intelligence/__tests__/production-contract.test.mjs`
- Create: `scripts/check-interaction-residency.mjs`
- Create: `scripts/__tests__/check-interaction-residency.test.mjs`
- Modify: `docs/runbooks/interaction-platform.md`

**Interfaces:**
- Consumes: support-approved chart and lifecycle service.
- Produces: HA/backup/restore/DR/observability/capacity contract meeting KR residency, RPO, and RTO.

- [ ] **Step 1: Write production values tests**

```javascript
test('requires HA services, KR residency and backup targets', () => {
  const values = loadValues('deploy/interaction-intelligence/values-office.yaml');
  assert.ok(values.appApi.replicaCount >= 3);
  assert.ok(values.realtimeGateway.replicaCount >= 3);
  assert.equal(values.database.existingSecret, 'cpki-db');
  assert.equal(values.redis.existingSecret, 'cpki-redis');
  assert.equal(values.objectStorage.enabled, true);
  assert.equal(values.objectStorage.region, 'ap-northeast-2');
  assert.equal(values.appFrontend.telemetry.enabled, false);
  assert.deepEqual(
    values.appApi.env.find(({ name }) => name === 'COPILOTKIT_TELEMETRY_DISABLED'),
    { name: 'COPILOTKIT_TELEMETRY_DISABLED', value: '1' },
  );
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test deploy/interaction-intelligence/__tests__/production-contract.test.mjs`

Expected: FAIL until production values contain the complete contract.

- [ ] **Step 3: Complete production values and alerts**

Configure three API/realtime replicas, HPA, PDB, anti-affinity/topology spread, TLS Redis, external HA PostgreSQL, S3-compatible `ap-northeast-2` object event persistence, External Secrets, workload identity, encryption key rotation, network policies, migrations, OIDC, TLS ingress, `appFrontend.telemetry.enabled: false`, and `COPILOTKIT_TELEMETRY_DISABLED=1` in `appApi.env`. The separately deployed Interaction Gateway carries the same environment variable. `values-dr.yaml` runs scaled-to-zero warm dependencies in the same residency boundary and cannot accept traffic without an explicit incident promotion.

`residency-policy.json` contains `{ "allowedRegions": ["ap-northeast-2"], "denyCrossRegionReplication": true }`. `check-interaction-residency.mjs` consumes that policy plus the immutable cloud inventory JSON emitted by the deployment workflow and fails if PostgreSQL, Redis, object storage, backups, replicas, log sinks, or DR targets fall outside the allowlist. Unit tests use a committed synthetic inventory; production deployment supplies the real inventory path through `INTERACTION_PLATFORM_INVENTORY`. Do not encode a fictitious residency field in Helm values.

Alerts must cover availability, 5xx/SSE disconnect, websocket/reconnect error, event lag, database saturation/replication lag, Redis loss/evictions, migration failure, backup age, restore drill age, culler/deletion backlog, OIDC failure, and cross-plane correlation gaps. No label contains message text or raw user/thread ID.

- [ ] **Step 4: Implement load tests with exact thresholds**

`reconnect-storm.js` creates 500 authenticated websocket/SSE reconnects over 60 seconds and requires ≥99% successful replay with zero duplicated terminal/tool events and p95 reconnect ≤5 seconds. `long-stream.js` runs 200 concurrent 30-minute synthetic streams and requires HTTP error rate <1%, event-order violation 0, and gateway/ EI memory below configured pod limits.

- [ ] **Step 5: Execute backup and restore drill**

The runbook performs point-in-time PostgreSQL restore, Redis cold reconstruction, object event restore, OIDC client rebind, gateway configuration switch, thread replay verification, and correlation sampling. Record start/end timestamps, achieved RPO/RTO, restored thread count, hash comparison, and cleanup. Expected: RPO ≤15 minutes, RTO ≤4 hours, no cross-region copy, and no business-database dependency.

- [ ] **Step 6: Run platform production gates**

Run:

```bash
node --test deploy/interaction-intelligence/__tests__/production-contract.test.mjs
node --test scripts/__tests__/check-interaction-residency.test.mjs
node scripts/check-interaction-residency.mjs --policy deploy/interaction-intelligence/residency-policy.json --inventory "$INTERACTION_PLATFORM_INVENTORY"
k6 run deploy/interaction-intelligence/k6/reconnect-storm.js
k6 run deploy/interaction-intelligence/k6/long-stream.js
```

Expected: contract and thresholds pass in the isolated production-like cluster; attach backup/restore evidence to the platform change record.

- [ ] **Step 7: Commit platform operations**

```bash
git add deploy/interaction-intelligence docs/runbooks/interaction-platform.md
git commit -m "ops: harden interaction intelligence platform"
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
- Produces: Office manifest schema 2 with immutable `interactionGatewayImage`/digest and fail-closed EI readiness validation.

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

`apply-deployment.ps1` validates schema 2, all three approved GHCR digest refs, digest/ref equality, revision labels, required EI URL/service token/principal key secrets, and external EI readiness before changing the live archive. It pulls all images first, starts gateway/API/web, checks `/health/ready`, verifies nginx `/api/copilotkit/info`, then promotes the bundle. Any failure restores the previous compose/env/archive and keeps the previous immutable images.

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
- Consumes: `platform-lock.json`, canonical upstream, KidItem fork, isolated EI canary environment.
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

The script takes explicit `--copilotkit`, `--ag-ui`, `--enterprise-chart`, and `--environment isolated-canary`; rejects `latest`, ranges, branches, or missing versions; installs the full candidate train in a disposable worktree/environment; and reports these required scenarios:

```javascript
const REQUIRED_SCENARIOS = [
  'threadCreateResumeArchiveDelete', 'threadReconnect', 'orderedReplay',
  'concurrentTabOwnership', 'promotionInterrupt', 'hitlResume',
  'duplicateToolCall', 'quickAskStop', 'officialCancel',
  'gatewayRestart', 'workerRestart', 'runtimeReconnect', 'crossOrgRejection',
];
```

It also snapshots transitive licenses/SBOM, diffs AG-UI event/schema and EI Helm values from the locked train, and fails on unresolved breaking changes. The scheduled workflow runs weekly and on lockfile PRs; production promotion consumes the immutable canary artifact.

Use canonical `CopilotKit/aimock` only as a pinned test/chaos fixture for delayed chunks, duplicated events, disconnects, and provider failure. Do not ship aimock or an example/demo repository in a production image.

- [ ] **Step 4: Add fast-forward-only fork sync**

In the fork workflow, fetch `https://github.com/CopilotKit/CopilotKit.git main`, verify `git merge-base --is-ancestor origin/main upstream/main`, verify fork `main` has zero commits not in upstream, then fast-forward and push. If either check fails, stop and open an issue; never merge/rebase/force-push automatically. `KIDITEM_PATCH_POLICY.md` specifies branch prefixes, upstream issue/PR, exact base tag, internal package suffix, SBOM/license/provenance, expiry owner/date, and deletion once upstream release lands.

- [ ] **Step 5: Run script tests and one isolated canary**

Run:

```bash
node --test scripts/__tests__/copilotkit-compatibility-canary.test.mjs
node scripts/copilotkit-compatibility-canary.mjs \
  --copilotkit 1.67.1 --ag-ui 0.0.57 --enterprise-chart 0.10.23 \
  --environment isolated-canary
```

Expected: test and all required scenarios pass, or the train remains unapproved. If support-approved chart differs from the exact platform lock, use the locked exact value in both the command and workflow; never substitute `latest`.

- [ ] **Step 6: Commit KidItem canary; submit fork workflow separately**

```bash
git add .github/workflows/copilotkit-compatibility-canary.yml scripts/copilotkit-compatibility-canary.mjs scripts/__tests__/copilotkit-compatibility-canary.test.mjs docs/runbooks/copilotkit-upgrades.md
git commit -m "ci: canary copilotkit compatibility train"
```

Open a separate PR in `AgentFoundry-Labs/CopilotKit` for its two files. Do not combine fork commits into the KidItem branch or vendor the fork tree.

## Task 5: Turn The Conversation Boundary Scanner Into A Cutover Gate

**Files:**
- Modify: `scripts/check-conversation-boundary.mjs`
- Modify: `scripts/__tests__/check-conversation-boundary.test.mjs`
- Create: `scripts/check-interaction-cutover.mjs`
- Create: `scripts/__tests__/check-interaction-cutover.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/pr-checks.yml`
- Modify: `.github/workflows/develop-validation.yml`

**Interfaces:**
- Consumes: foundation scanner temporary allowlist and known legacy inventory.
- Produces: `check:interaction-cutover` with phase-specific manifests and an empty allowlist at Contract.

- [ ] **Step 1: Write freeze/contract scanner tests**

```javascript
test('contract phase rejects every legacy conversation symbol', () => {
  const violations = scanCutover('contract', [{
    path: 'apps/server/src/example.ts',
    text: 'AgentConversation AgentMessage /api/chat/copilot agent-os-chat-api Chatbot',
  }]);
  assert.deepEqual(new Set(violations.map((item) => item.code)), new Set([
    'LEGACY_TRANSCRIPT_MODEL', 'LEGACY_CHAT_ROUTE', 'LEGACY_POLLING_CLIENT', 'DIVERGENT_CHATBOT_IDENTITY',
  ]));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test scripts/__tests__/check-interaction-cutover.test.mjs`

Expected: FAIL because the cutover scanner is missing.

- [ ] **Step 3: Implement phase manifest and tracked-source scan**

```javascript
const PHASES = {
  expand: { allowLegacyReads: true, allowLegacyWrites: true, allowLegacyModels: true },
  freeze: { allowLegacyReads: true, allowLegacyWrites: false, allowLegacyModels: true },
  cutover: { allowLegacyReads: true, allowLegacyWrites: false, allowLegacyModels: true },
  contract: { allowLegacyReads: false, allowLegacyWrites: false, allowLegacyModels: false },
};
```

Read the active phase from tracked `deploy/interaction-intelligence/cutover-phase.json`, never an untracked environment override. Scan imports, route decorators/strings, Prisma models/relations, fetch clients, v1 CopilotKit/UI packages, polling timers, duplicate conversation components, transcript append methods, Chatbot identifiers, and direct provider streams. The freeze phase permits exact read-only admin export files and rejects all message/conversation create/update calls.

- [ ] **Step 4: Wire CI gates**

Add `check:interaction-cutover` to `check:conventions`, PR checks, develop validation, Office image preflight, and release-contract guard. A phase change must include migration/runbook evidence and cannot skip sequence order.

- [ ] **Step 5: Run scanner suite**

Run:

```bash
node --test scripts/__tests__/check-conversation-boundary.test.mjs scripts/__tests__/check-interaction-cutover.test.mjs
npm run check:conversation-boundary
npm run check:interaction-cutover
npm run check:pr-reconstruction -- --base origin/develop --head HEAD
npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Expected: all guards pass and deliberate fixture violations are detected by code.

- [ ] **Step 6: Commit cutover gates**

```bash
git add scripts package.json .github/workflows/pr-checks.yml .github/workflows/develop-validation.yml deploy/interaction-intelligence/cutover-phase.json
git commit -m "test: gate interaction system cutover"
```

## Task 6: Freeze Legacy Writes And Migrate Continuing Official Work

**Files:**
- Create: `scripts/data-migrations/v0.1.30/006_migrate_continuing_agent_sessions.ts`
- Create: `scripts/data-migrations/v0.1.30/006_migrate_continuing_agent_sessions.spec.ts`
- Create: `scripts/verify-interaction-migration.ts`
- Create: `scripts/__tests__/verify-interaction-migration.spec.ts`
- Modify: `scripts/data-migrations/index.ts`
- Create: `apps/server/src/agent-os/application/service/legacy-agent-session-migration.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/legacy-agent-session-migration.service.spec.ts`
- Modify: `apps/server/src/chat/chat.controller.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/agent-conversations.controller.ts`
- Modify: `deploy/interaction-intelligence/cutover-phase.json`
- Create: `docs/runbooks/interaction-cutover.md`

**Interfaces:**
- Consumes: legacy conversations/task sessions/runs/artifacts and supported EI thread-create API.
- Produces: frozen legacy write path, idempotent mapping of continuing official records to new thread/session/task/handoff/artifact refs, verification report.

- [ ] **Step 1: Write classification/idempotency tests**

```typescript
it.each([
  [{ status: 'active', hasNonterminalTask: true, hasPendingApproval: false, hasDurableArtifact: false }, true],
  [{ status: 'archived', hasNonterminalTask: false, hasPendingApproval: true, hasDurableArtifact: false }, true],
  [{ status: 'archived', hasNonterminalTask: false, hasPendingApproval: false, hasDurableArtifact: true }, true],
  [{ status: 'archived', hasNonterminalTask: false, hasPendingApproval: false, hasDurableArtifact: false }, false],
])('classifies continuing official value', (record, expected) => {
  expect(classifyContinuingOfficialWork(record)).toBe(expected);
});

it('re-running migration reuses the mapped thread and session', async () => {
  const first = await service.migrate(legacyFixture());
  const second = await service.migrate(legacyFixture());
  expect(second).toEqual(first);
  expect(threadStore.create).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/legacy-agent-session-migration.service.spec.ts`

Expected: FAIL because the migration service is missing.

- [ ] **Step 3: Freeze legacy writes**

Set phase to `freeze`. Legacy create/send/retry/write routes return HTTP 410 with code `LEGACY_CONVERSATION_FROZEN` and a verified route to the Interaction OS. Keep authenticated admin export reads only. Record a database freeze timestamp and assert message/conversation `updatedAt` remains unchanged after it, excluding migration mapping metadata stored in the new schema.

- [ ] **Step 4: Implement migration without transcript copying**

For each classified row in stable `(organizationId, legacyConversationId)` order:

1. revalidate organization membership/ownership and current domain resources;
2. create or reuse one Enterprise thread with title `이관된 AgentOS 작업` and a single system notice that historical chat was not copied;
3. create binding, context epoch 1, official session, root task, and migration mapping under idempotency `legacy-agent-session:<legacyConversationId>`;
4. build a validated handoff from current resource refs, remaining objective, authority profile, assigned agent version, and actor—not legacy message text;
5. carry durable artifact storage refs only after hash/ownership validation;
6. map a live external runtime only if its adapter can inspect/reconnect; otherwise pause task with `MIGRATED_RUNTIME_RESTART_REQUIRED` and require explicit user resume;
7. mark the new mapping complete and leave legacy rows frozen for rollback/export.

Add `AgentLegacyMigrationMapping` with unique legacy record type/ID and new binding/session/task IDs. Do not store copied messages in it.

- [ ] **Step 5: Implement dry-run/apply/verify migration CLI**

The registered migration exports a pure `planContinuingSessionMigration` function used by its test as the dry-run preview, requires an explicit organization batch size in the migration definition, writes a content-free ledger report of counts/hashes, and stops on per-record validation failure. `scripts/verify-interaction-migration.ts` checks selected=mapped, unselected unmapped, one EI thread/session per selected record, artifact hashes, zero copied messages, and zero post-freeze legacy writes.

- [ ] **Step 6: Run freeze and migration gates**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/legacy-agent-session-migration.service.spec.ts
npx vitest run scripts/data-migrations/v0.1.30/006_migrate_continuing_agent_sessions.spec.ts scripts/__tests__/verify-interaction-migration.spec.ts
npm run data:migrate -- status --release-version 0.1.30
npm run data:migrate -- up --phase post-schema --release-version 0.1.30 --target local --confirm APPLY_DATA_MIGRATIONS
npm run data:migrate -- up --phase post-schema --release-version 0.1.30 --target local --confirm APPLY_DATA_MIGRATIONS
npx tsx scripts/verify-interaction-migration.ts --target local --release-version 0.1.30
npm run data:migrate -- status --release-version 0.1.30
npm run check:interaction-cutover
```

Expected: the first local `up` applies `v0.1.30:006_migrate_continuing_agent_sessions`, the second is a ledger skip, verification passes, post-freeze write count is zero, and no transcript is copied. This dated plan is bound to open train `0.1.30`; if that train has reached `main` before execution, stop and refresh the plan into the next release rather than editing an applied migration.

- [ ] **Step 7: Commit freeze/migration in its release PR**

```bash
git add scripts/data-migrations scripts/verify-interaction-migration.ts scripts/__tests__/verify-interaction-migration.spec.ts apps/server/src/agent-os apps/server/src/chat/chat.controller.ts deploy/interaction-intelligence/cutover-phase.json docs/runbooks/interaction-cutover.md
git commit -m "migrate: move continuing agent sessions to copilotkit"
```

## Task 7: Cut Product Surfaces To CopilotKit Only

**Files:**
- Modify: `deploy/interaction-intelligence/cutover-phase.json`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Modify: `apps/web/src/app/agent-os/page.tsx`
- Modify: `apps/web/src/app/agent-os/__tests__/page.spec.tsx`
- Create: `apps/web/e2e/interaction-os/cutover.spec.ts`
- Modify: `docs/runbooks/interaction-cutover.md`

**Interfaces:**
- Consumes: accepted platform/Quick Ask/official slices and verified migration.
- Produces: `cutover` phase where every production conversation entry renders the canonical Interaction Surface and legacy is admin-read-only.

- [ ] **Step 1: Write route/surface tests**

```tsx
it('has no legacy chat surface in production layout', () => {
  render(<AppLayout><Dashboard /></AppLayout>);
  expect(screen.getAllByTestId('interaction-surface')).toHaveLength(1);
  expect(screen.queryByTestId('legacy-chatbot')).not.toBeInTheDocument();
  expect(screen.queryByTestId('legacy-operator-chat')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace=apps/web -- src/app/agent-os/__tests__/page.spec.tsx`

Expected: FAIL if any legacy route/component remains reachable.

- [ ] **Step 3: Set cutover phase and remove runtime toggles**

Set tracked phase to `cutover`. Remove organization allowlists and legacy-write routing toggles; the only user-visible path is `/api/copilotkit` + shared `InteractionSurface`. Keep the admin export route behind admin role and an expiry date one release ahead. A failed new interaction displays a recoverable platform error and never falls back to `/api/chat`.

- [ ] **Step 4: Run product cutover E2E**

Playwright covers Quick Ask, promotion, official progress, migration mapping, panel/workspace same-thread rendering, gateway unavailable fail-closed behavior, and verifies network logs contain no `/api/chat`, conversation polling, provider endpoint, or direct runtime call.

Run:

```bash
npm test --workspace=apps/web -- src/app/agent-os/__tests__/page.spec.tsx
npx playwright test apps/web/e2e/interaction-os/cutover.spec.ts
npm run check:interaction-cutover
npm run build --workspace=apps/web
```

Expected: tests/build/scanner pass with phase `cutover`; no legacy request occurs.

- [ ] **Step 5: Commit surface cutover**

```bash
git add deploy/interaction-intelligence/cutover-phase.json apps/web docs/runbooks/interaction-cutover.md
git commit -m "feat: cut ai surfaces to interaction os"
```

## Task 8: Delete Legacy Backend APIs, Polling, Stores, And Identity

**Files:**
- Delete: `apps/server/src/chat/chat.controller.ts`
- Delete: `apps/server/src/chat/chat.service.ts`
- Delete: `apps/server/src/chat/chat.module.ts`
- Delete: `apps/server/src/chat/claude-cli-adapter.ts`
- Delete: `apps/server/src/chat/claude-cli-env.ts`
- Delete: `apps/server/src/chat/claude-cli-env.spec.ts`
- Delete: `apps/server/src/chat/AGENTS.md`
- Delete: `apps/server/src/chat/CLAUDE.md`
- Delete: `apps/server/src/agent-os/adapter/in/http/agent-conversations.controller.ts`
- Delete: `apps/server/src/agent-os/adapter/in/http/dto/agent-conversations.dto.ts`
- Delete: `apps/server/src/agent-os/application/service/agent-conversation.service.ts`
- Delete: `apps/server/src/agent-os/application/service/__tests__/agent-conversation.service.spec.ts`
- Delete: `apps/server/src/agent-os/application/port/in/agent-interaction.port.ts`
- Modify: `apps/server/src/app.module.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Modify: `apps/server/src/agent-os/domain/agent-os.types.ts`
- Modify: `apps/server/src/agent-os/seed-agent-os.ts`
- Modify: `prisma/models/agents.prisma`
- Modify: `deploy/interaction-intelligence/cutover-phase.json`

**Interfaces:**
- Consumes: one stable production release of cutover evidence, migration verification, rollback backup.
- Produces: contract-phase backend with no generic chat API, transcript model, polling completion, divergent Chatbot identity, or superseded conversation service.

- [ ] **Step 1: Change scanner fixture to require zero allowlist**

Set phase to `contract`, remove temporary scanner allowlist entries, and run `npm run check:interaction-cutover`.

Expected: FAIL listing exact legacy backend/web/model paths still present.

- [ ] **Step 2: Remove legacy HTTP/module/runtime paths**

Delete the listed chat directory and AgentOS conversation controller/service/port. Remove `ChatModule` import from `AppModule`, legacy route registration, old conversation provider wiring, Claude chat environment variables, and old CLI adapter path. Keep only the isolated official runtime adapters from the official plan.

- [ ] **Step 3: Remove Chatbot identity and compatibility resolution**

Delete `chat`/`Chatbot` definitions, seed compatibility alias, model env, catalog exposure, prompts/assets used only by that identity, and any logic that maps Chatbot to Operator. Existing allowed agent discovery must return Operator directly and fail unknown `chat` agent IDs.

- [ ] **Step 4: Contract transcript and superseded run models**

After the release-train backup and migration verification, create the registered schema migration that removes `AgentConversation`, `AgentMessage`, their relation fields, and database tables. Remove old polling-only relations/columns/controllers that have no consumer under `rg`/Knip and are superseded by `AgentSession`, `AgentSessionTask`, `AgentExecution`, attempts, approvals, artifacts, and Operations checkpoints. Do not delete capability definitions or domain audit records still referenced by the new authority path.

The migration asserts zero non-migrated continuing official records before `DROP TABLE`. It preserves content-free `AgentLegacyMigrationMapping` and tombstones for audit according to policy.

- [ ] **Step 5: Run backend/schema contract gates**

Run:

```bash
npm run db:push
npx prisma generate
npm run check:interaction-cutover
npm run check:conversation-boundary
npm run check:idor
npm run check:tenant-scope
npm run check:directory-architecture
npm run dev:server
```

Expected: all finite commands pass; server boots with no `/api/chat`, legacy conversation controller, transcript model, Chatbot identity, or route collision. Stop the watch process.

- [ ] **Step 6: Commit backend contraction**

```bash
git add -A apps/server/src/chat apps/server/src/agent-os apps/server/src/app.module.ts prisma deploy/interaction-intelligence/cutover-phase.json
git commit -m "refactor: remove legacy conversation backend"
```

## Task 9: Delete Remaining Legacy Web Code And Dependencies

**Files:**
- Delete: `apps/web/src/components/chat/ChatBot.tsx`
- Delete any remaining: `apps/web/src/components/layout/CopilotChat.tsx`
- Delete any remaining: `apps/web/src/app/agent-os/lib/agent-os-chat-api.ts`
- Delete any remaining: `apps/web/src/app/agent-os/components/OperatorChatPanel.tsx`
- Delete any remaining: `apps/web/src/app/agent-os/components/ConversationList.tsx`
- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/next.config.mjs`
- Modify: `scripts/check-conversation-boundary.mjs`

**Interfaces:**
- Consumes: contract-phase backend and shared Interaction Surface.
- Produces: v2-only frontend and exact dependency tree with no `@copilotkit/react-ui`, v1 hooks, legacy route, polling client, or duplicate message renderer.

- [ ] **Step 1: Run scanner to enumerate remaining frontend violations**

Run:

```bash
npm run check:interaction-cutover
rg -n '@copilotkit/react-ui|@copilotkit/react-core(?!/v2)|/api/chat|agent-os-chat-api|AgentConversation|Chatbot' apps/web package.json package-lock.json
```

Expected before deletion: scanner/rg list only files scheduled in this task. Use `rg --pcre2` for the negative lookahead if the local ripgrep requires it.

- [ ] **Step 2: Delete duplicate UI and transport paths**

Remove the remaining files and imports. `proxy.ts`/Next rewrites keep `/api/copilotkit` only; they contain no `/api/chat/copilot`. Remove `@copilotkit/react-ui` from all manifests/lockfile and ensure v2 UI/styles come exclusively from exact `@copilotkit/react-core` `1.67.1`.

- [ ] **Step 3: Make boundary scanner allowlist empty**

Delete grandfathered path logic. The scanner must now reject any future legacy symbol/path everywhere. Add a fixture proving a newly created `apps/web/src/components/chat/ChatBot.tsx` would fail even if the directory returns.

- [ ] **Step 4: Run web/dependency contract gates**

Run:

```bash
npm install
npm run check:copilotkit-train
npm run check:interaction-cutover
npm run check:conversation-boundary
npm ls @copilotkit/react-core @copilotkit/react-ui @copilotkit/runtime @ag-ui/client @ag-ui/core
npm test --workspace=apps/web -- src/components/interaction-os
npm run build --workspace=apps/web
```

Expected: scanners/tests/build pass; npm shows no `@copilotkit/react-ui`, one exact CopilotKit `1.67.1` train, and one exact AG-UI `0.0.57` train.

- [ ] **Step 5: Commit frontend contraction**

```bash
git add -A apps/web package.json package-lock.json scripts/check-conversation-boundary.mjs scripts/__tests__/check-conversation-boundary.test.mjs
git commit -m "refactor: remove legacy ai conversation ui"
```

## Task 10: Final Architecture, Disaster Recovery, And Release Acceptance

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `docs/runbooks/office-deploy.md`
- Modify: `docs/runbooks/interaction-platform.md`
- Modify: `docs/runbooks/interaction-cutover.md`
- Modify: `docs/runbooks/README.md`
- Modify: `apps/server/src/agent-os/AGENTS.md`
- Modify: `apps/server/src/operations/AGENTS.md`
- Modify: `apps/web/src/components/interaction-os/AGENTS.md`
- Modify: `apps/interaction-gateway/AGENTS.md`
- Create: `docs/references/interaction-os-acceptance-2026-08.md`

**Interfaces:**
- Consumes: production/contract evidence from Tasks 1–9.
- Produces: final ownership/runbook map and signed acceptance report.

- [ ] **Step 1: Update durable ownership documentation**

Document CopilotKit/EI ownership, AG-UI boundary, principal flow, session/task/Operations split, exact runtime matrices, lifecycle/retention/legal hold, backup/restore, fork policy, upgrade canary, Office topology, endpoints to keep, and deleted concepts. Remove every document claiming KidItem stores chat transcripts, `/api/chat` is canonical, Chatbot exists, or frontend polls AgentOS conversation completion.

- [ ] **Step 2: Run a quarterly-style DR and upgrade rehearsal**

In the isolated production-like environment:

1. take PostgreSQL/object backups and record checkpoint;
2. create Quick Ask and official threads with an open approval;
3. simulate loss of EI namespace and one Operations worker;
4. restore inside KR, rotate service credentials, reconnect gateway;
5. resume Quick Ask, resolve official approval, finish task;
6. run exact candidate upgrade canary and rollback to locked train;
7. verify retention deletion and legal hold;
8. verify all six correlation IDs and zero duplicate capability invocation.

Record actual RPO/RTO and evidence links in `interaction-os-acceptance-2026-08.md`.

- [ ] **Step 3: Run complete repository and release gates**

Run:

```bash
npm run check:agents-hygiene
npm run check:copilotkit-train
npm run check:interaction-cutover
npm run check:conversation-boundary
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
npm run dev:server
```

Expected: all finite commands pass; Nest boots; no scanner allowlist remains; no legacy conversation route/model/component/identity exists. Stop the watch process.

- [ ] **Step 4: Perform production smoke after Office deployment**

Verify gateway/API/web immutable SHAs match, EI readiness succeeds, one Quick Ask resumes, one official task continues across panel close, one approval resolves, cancel propagates, archived Quick Ask lifecycle works, and logs/traces correlate without content. Roll back the immutable Office bundle if any required smoke fails; do not enable a legacy conversation fallback.

- [ ] **Step 5: Commit final docs and acceptance record**

```bash
git add docs apps/server/src/agent-os/AGENTS.md apps/server/src/operations/AGENTS.md apps/web/src/components/interaction-os/AGENTS.md apps/interaction-gateway/AGENTS.md
git commit -m "docs: finalize interaction os operations"
```

## Plan Acceptance Evidence

- [ ] Production EI uses HA external stores, OIDC, TLS/encryption, KR residency, backups, restore drills, retention, legal hold, capacity tests, alerts, and disabled vendor telemetry.
- [ ] Achieved RPO is ≤15 minutes and RTO is ≤4 hours.
- [ ] Office release builds API/web/gateway from one SHA and deploys immutable digest refs with atomic health validation.
- [ ] Weekly canary covers thread lifecycle/reconnect/replay/HITL/duplicate tool/cancel/gateway+worker restart and blocks an unproven train.
- [ ] Fork `main` is zero commits ahead of upstream; patches are bounded/upstreamed/expiring and never branch-installed by KidItem.
- [ ] Legacy writes freeze before migration; no user message is dual-written.
- [ ] Only continuing official work migrates, via new EI thread + validated handoff, with no transcript copy.
- [ ] Contract phase contains no `/api/chat`, legacy polling, duplicate transcript model/renderer, direct runtime stream, or divergent Chatbot identity.
- [ ] Scanner allowlists are empty and CI/Office preflight enforce the boundary.
- [ ] Quick Ask and official work pass production smoke, retention/deletion/legal hold, restart, approval, cancellation, and correlation verification.
- [ ] Architecture, environment, deployment, ownership, cutover, upgrade, and DR docs match the final system.
