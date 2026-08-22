# CopilotKit Nest Incoming Adapter Contraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan as one
> integrated Terra task, followed by one integrated Sol review. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the unshipped standalone Interaction Gateway and serve the
existing same-origin CopilotKit v2 contract directly from an authenticated Nest
Agent OS incoming adapter.

**Architecture:** Nest owns one API-only CopilotKit adapter that translates
browser callbacks into direct Agent OS input-port calls. PostgreSQL remains the
canonical session/event store, Operations remains the durable execution owner,
and Codex/Claude keep exact run-scoped MCP children. No service-to-service HTTP,
gateway secret, run-intent token, replay/live token, interaction analytics
HMAC, second replay projector, or gateway process remains.

**Tech Stack:** NestJS, Express, CopilotKit Runtime v2, AG-UI, RxJS,
PostgreSQL/Prisma, Next.js rewrites, Vitest, Testcontainers PostgreSQL 17,
Playwright

**Approved design:**
`docs/superpowers/specs/2026-08-23-copilotkit-nest-incoming-adapter-design.md`

---

## Execution Boundaries

- Work in `/Users/dev125/.codex/worktrees/e5b4/kiditem` and preserve the large
  existing KID-24/KID-25 dirty diff. Never reset, checkout, rebase, format
  unrelated Prisma files, or touch existing `kiditem-postgres`/`kiditem-minio`.
- Hermes is outside this change. Local Codex/Claude use only the dedicated OS
  account's native CLI login; do not introduce provider credential, HMAC, or
  encryption handling.
- KID-25 has no production traffic. There is no compatibility route, feature
  toggle, dual write, or gateway shim.
- No Prisma schema, migration, backfill, or VERSION change is allowed. A schema
  need is a stop condition.
- Use `apply_patch` for edits, `rtk` for commands, TDD for every production
  behavior, and disposable Testcontainers for database tests.
- Do not commit until all four tasks are complete and the integrated Sol review
  has no open P1/P2 finding.

## Task 1: Collapse Run And Connection Authorization Into Direct Ports

**Files:**

- Modify: `apps/server/src/agent-os/application/port/in/interaction/agent-interaction-bootstrap.port.ts`
- Modify: `apps/server/src/agent-os/application/port/in/interaction/agent-interaction-authorization.port.ts`
- Modify: `apps/server/src/agent-os/application/port/in/interaction/agent-interaction-live-events.port.ts`
- Create: `apps/server/src/agent-os/application/port/in/interaction/interaction-clock.port.ts`
- Modify: `apps/server/src/agent-os/application/service/interaction/agent-interaction-bootstrap.service.ts`
- Modify: `apps/server/src/agent-os/application/service/interaction/agent-interaction-authorization.service.ts`
- Modify: `apps/server/src/agent-os/application/service/interaction/agent-interaction-live-events.service.ts`
- Modify: `apps/server/src/agent-os/application/service/interaction/interaction-replay-projector.ts`
- Delete: `apps/server/src/agent-os/application/service/interaction/interaction-token-codec.ts`
- Delete: `apps/server/src/agent-os/application/port/in/interaction/interaction-gateway-config.port.ts`
- Modify: `packages/shared/src/agent-interaction/index.ts`
- Modify: `packages/shared/src/agent-interaction/index.spec.ts`
- Modify: `packages/shared/src/identifiers/index.ts`
- Modify: `packages/shared/src/identifiers/index.spec.ts`
- Modify focused service and PG specs under the same directories.

- [ ] **Step 1: Write direct-authorization RED tests**

Add tests proving the public application contracts contain no `runIntent`,
`liveJoinToken`, HMAC key, opaque replay token, or principal key. The desired
authorization input is:

```typescript
export interface AuthorizeRunInput {
  organizationId: string;
  userId: string;
  agentDefinitionKey: string;
  copilotThreadId: string;
  aguiRunId: string;
  dashboardContext: unknown;
  userEvent: unknown;
}
```

`authorizeConnection` accepts authenticated organization/user/thread plus an
optional non-negative decimal `afterSequence`. It returns the canonical replay
and an internal exact live coordinate, not a signed token. `open()` accepts the
already-authorized live coordinate plus `AbortSignal`; it does not call a token
verifier.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/interaction/__tests__/agent-interaction-authorization.service.behavior.spec.ts \
  src/agent-os/application/service/interaction/__tests__/agent-interaction-bootstrap.service.spec.ts \
  src/agent-os/application/service/interaction/__tests__/interaction-replay-projector.spec.ts
```

Expected RED: old token preparation/signing or live-join verification remains.

- [ ] **Step 2: Implement one authenticated database authorization call**

Move active-version resolution, authority-profile creation, policy/input hash,
and `AGENT_RUN_AUTHORIZATION_TRANSACTION.authorizeExecution()` into the direct
`authorizeRun()` path. It must use the current organization/user supplied by
the incoming adapter and the exact requested agent definition. Exact retry
returns the same graph; drift still conflicts through the existing transaction.

Remove `resolvePrincipal()` and `prepareRunIntent()` from bootstrap. Bootstrap
only lists allowed agents and accessible sessions. Move the clock symbol to the
focused clock port because expiry-free database/replay logic still needs a
testable clock only where genuinely required.

- [ ] **Step 3: Replace signed replay/live credentials with scoped sequence revalidation**

Parse a client sequence as a non-negative bigint. Reauthorize the current user,
organization, thread, session, context epoch, and agent version before reading
events. Return a next sequence when another page exists; never trust the client
position as identity. The live service consumes the exact authorized coordinate
returned in process and continues its existing DB catch-up plus publisher join.

Change complete canonical messages to one START/CONTENT/END projection. Remove
the `TEXT_MESSAGE_CHUNK` divergence.

- [ ] **Step 4: Contract shared wire types**

Delete `AguiRunIntentSchema` and gateway-only live token fields. Replace opaque
replay cursors in the interaction connection contracts with the existing
non-negative decimal sequence schema. Do not remove identifier types still used
outside interaction; verify with `rg` before deleting each export.

- [ ] **Step 5: Run unit and real-PG authorization gates**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/interaction \
  src/agent-os/adapter/out/transaction/interaction/__tests__/prisma-agent-interaction.pg.integration.spec.ts \
  --config vitest.config.integration.ts
rtk npm exec --workspace=packages/shared vitest -- run \
  src/agent-interaction/index.spec.ts src/identifiers/index.spec.ts
```

Expected GREEN: direct run authorization creates one exact execution graph;
cross-user/org and sequence tampering remain non-enumerating; replay/live has no
token/HMAC dependency.

## Task 2: Move CopilotKit Runtime Into A Nest Incoming Adapter

**Files:**

- Create: `apps/server/src/agent-os/adapter/in/http/interaction/agent-os-copilotkit.agent.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction/agent-os-copilotkit.runner.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction/agent-os-copilotkit.runtime.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction/agent-os-copilotkit.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction/__tests__/agent-os-copilotkit.runtime.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/interaction/__tests__/agent-os-copilotkit.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/agent-os-interaction-http.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/api-application.module.ts`
- Modify: `apps/server/src/main.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/in/http/interaction/agent-agui.controller.ts`
- Delete: `apps/server/src/agent-os/adapter/in/http/interaction/agent-interaction-control.controller.ts`
- Delete gateway guard/config/DTO/tests that serve only those controllers.

- [ ] **Step 1: Move gateway behavior tests and make them fail against Nest**

Port the useful cases from
`apps/interaction-gateway/src/__tests__/runtime.spec.ts` into the new Agent OS
incoming-adapter spec. Cover info, dynamic allowed agents, run, reconnect,
fresh-thread empty connect, status, stop, approval resume, cross-request
principal isolation, bounded replay, and event correlation.

Add a real TestingModule/controller RED that resolves `/api/copilotkit` from the
API root while worker and MCP roots cannot resolve the controller/runtime.

- [ ] **Step 2: Implement a direct in-process AG-UI agent**

Replace `AuthorizedAgentOsHttpAgent` with an Agent implementation that:

1. validates the final user message and dashboard context;
2. calls direct `AGENT_INTERACTION_AUTHORIZATION_PORT.authorizeRun()` with the
   authenticated principal;
3. calls `AGENT_AGUI_RUNNER_PORT.run()` with the returned authorization in
   server-owned forwarded props;
4. handles one resolved approval by calling
   `AGENT_SESSION_APPROVAL_DECISION_PORT` directly;
5. never forwards browser tools, authorization headers, organization IDs, or
   arbitrary `x-*` headers.

The runner calls direct authorization/replay/live/stop ports. It does not keep
an active-grant map; `isRunning` and stop reconstruct exact current execution
state through the existing query/runner ports.

- [ ] **Step 3: Implement the public Nest transport**

Use CopilotKit's public v2 runtime handler at base path `/api/copilotkit`. The
Nest entry must cover both the base and all subpaths, use normal session auth
and organization scope, preserve streaming backpressure/disconnect abort, and
write the returned Fetch `Response` to Express without a second Node server.

Construct a request-bound runner/agents config using immutable current
organization/user values. Do not keep cross-request principal state. If the
library forces AsyncLocalStorage, add two overlapping-request tests proving no
principal crossover.

Move any JSON body handling required by CopilotKit from the old raw chat route
into this focused incoming adapter. Add a RED production-caller scan, then
delete the obsolete `/api/chat/copilot` bootstrap path and its legacy
ChatService/Claude path. Stop and report a concrete caller only if that scan
finds a non-test production consumer; do not add another global raw route or a
compatibility shim.

- [ ] **Step 4: Compose the API-only interaction module**

Move interaction controllers/providers out of the general HTTP module into
`AgentOsInteractionHttpModule`. Delete the private AG-UI and gateway control
controllers. Keep public bootstrap/navigation/session endpoints that are still
called by Web. Remove `InteractionProductAnalyticsAdapter` and inject no-op
analytics nowhere; delete analytics recording from `AgentAguiRunService`
instead of hiding it behind a default.

- [ ] **Step 5: Run focused, module, and real-PG transport gates**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/in/http/interaction \
  src/agent-os/application/service/__tests__/agent-agui-run.service.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts \
  src/__tests__/application-roots.architecture.spec.ts
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/in/http/interaction/__tests__/agent-os-copilotkit.pg.integration.spec.ts \
  src/agent-os/adapter/out/transaction/interaction/__tests__/prisma-agent-interaction.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected GREEN: actual API root handles CopilotKit without an internal fetch;
one replay projector produces ordered AG-UI events; worker/MCP roots remain
interaction-HTTP-free.

## Task 3: Delete The Gateway Workspace And Deployment Contract

**Files:**

- Delete: `apps/interaction-gateway/**`
- Modify: root `package.json` and `package-lock.json`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/src/__tests__/next-config.spec.ts`
- Modify: `apps/web/e2e/fixtures/agent-interaction-harness.ts`
- Modify: `apps/web/e2e/agent-session-interaction.spec.ts`
- Move: `deploy/interaction-gateway/platform-lock.json` to `deploy/copilotkit/platform-lock.json`
- Replace gateway smoke with a Nest-only official interaction smoke under the
  durable script/deploy owner selected by `scripts/AGENTS.md`.
- Modify: `scripts/check-copilotkit-train.mjs` and tests/inventory references.
- Modify: `.github/workflows/office-images.yml` only if its checks reference the
  gateway workspace; do not add a third image.
- Modify relevant architecture, environment, deployment, Office, interaction,
  and first-deployment plan/runbook documents.
- Modify: `apps/server/src/agent-os/AGENTS.md`, `apps/web/AGENTS.md`.

- [ ] **Step 1: Add contraction RED scanners**

Add tests that fail while any production path contains:

```text
apps/interaction-gateway
NestControlClient
x-kiditem-interaction-gateway
INTERACTION_GATEWAY_URL
INTERACTION_GATEWAY_SHARED_SECRET
INTERACTION_PRINCIPAL_HMAC_KEY
INTERACTION_RUN_INTENT_HMAC_KEY
INTERACTION_REPLAY_CURSOR_HMAC_KEY
INTERACTION_ANALYTICS_HMAC_KEY
AGENT_OS_AGUI_INTERNAL_URL
KIDITEM_API_INTERNAL_URL
```

The scanner may contain those literals only in its own forbidden-pattern
fixture. Do not obfuscate source strings to satisfy it.

- [ ] **Step 2: Point Web directly at Nest**

Keep browser `runtimeUrl="/api/copilotkit"`. Next rewrites the base/subpaths to
the existing server API base in development/standalone mode, and production
uses the same API origin/nginx contract as every `/api` route. Remove the
gateway URL production requirement and update next-config tests.

- [ ] **Step 3: Delete workspace and glue**

Remove the workspace package, root dev/build scripts, lockfile workspace node,
gateway config/server/client/runtime, health proxy, private service header, and
gateway process spawn/cleanup in browser fixtures. Preserve the CopilotKit train
check and upstream lock under the neutral CopilotKit path.

- [ ] **Step 4: Update durable docs and environment inventory**

Document Nest incoming-adapter ownership, direct auth, single replay projector,
OS-owned local CLI login, and absence of a third service. Delete gateway/HMAC
rotation instructions and unused analytics claims. Amend older specs/plans with
a one-line supersession reference rather than rewriting historical task text.

- [ ] **Step 5: Run web, scripts, train, and absence gates**

```bash
rtk npm exec --workspace=apps/web vitest -- run src/__tests__/next-config.spec.ts
rtk npm run build --workspace=apps/web
rtk npm run check:copilotkit-train
rtk npm run check:scripts-inventory
rtk npm run test:scripts
rtk npm run check:agents-hygiene
rtk npm run check:conventions
```

Expected GREEN: no gateway workspace/process/config remains; CopilotKit train
and same-origin Web behavior still pass.

## Task 4: Integrated Browser, Restart, Deletion, And Release Verification

**Files:**

- Modify the existing E2E, official smoke, and root-verifier fixtures to boot
  the real Nest route with API and Web only, and to reject any gateway process.
- Modify docs/tests revealed by exact absence or build failures; exclude
  unrelated refactoring.

- [ ] **Step 1: Run complete focused and PG regression sets**

Run the Task 6 caller/runtime suites already changed in the worktree plus:

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/interaction \
  src/agent-os/adapter/in/http/interaction \
  src/agent-os/application/service/session-execution \
  src/agent-os/adapter/out/runtime \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts \
  src/__tests__/application-roots.architecture.spec.ts
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/interaction/__tests__/prisma-agent-interaction.pg.integration.spec.ts \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts \
  src/agent-os/__tests__/agent-session-deletion.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Use disposable PostgreSQL 17 only.

- [ ] **Step 2: Run real browser behavior through Nest**

The browser harness boots API and Web only. Prove bootstrap, new run, reconnect,
replay/live join, approval, stop, restart recovery, cross-user/org denial,
complete AgentSession deletion, and zero canonical graph after deletion. No
gateway child process or listener may exist.

```bash
rtk npx playwright test apps/web/e2e/agent-session-interaction.spec.ts \
  --config playwright.config.ts
rtk npm run smoke:interaction-os
```

- [ ] **Step 3: Build and boot the actual roots**

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk timeout 60 npm run dev:server
```

Supply safe disposable configuration only. Confirm actual Nest listening or
report a proven unrelated baseline DI/config blocker. Do not connect the dev
boot to Office/shared databases.

- [ ] **Step 4: Run final source, diff, and process audits**

```bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:agent-os-hexagonal
rtk npm run check:agent-session-deletion
rtk npm run check:conventions
rtk git diff --check
```

Run exact production-only `rg` absence probes for every Task 3 forbidden
symbol. Confirm no owned Testcontainers, Node server, Playwright, gateway, or
watch process remains and existing user containers were untouched.

- [ ] **Step 5: Integrated Sol review and correction loop**

Dispatch one read-only Sol reviewer over the entire KID-24/KID-25 branch diff,
the approved design, this plan, production source, tests, and verification
evidence. It must report only actionable P1/P2 findings. If rejected, resume one
Terra implementer to fix all concrete findings together, rerun the relevant
gates, and repeat one integrated Sol review. Stop after approval or five total
review loops.

- [ ] **Step 6: Commit, push, PR, and Linear handoff**

After Sol approval, stage only reviewed changes, inspect the cached diff and
commit history, create cohesive commits without amending prior shared commits,
push the existing branch, and update the existing PR rather than opening a new
one. Read back the live PR body and run reconstruction/release guards. Update
KID-24 with the interaction-boundary correction and KID-25 to `In Review` with
the final evidence and PR link.
