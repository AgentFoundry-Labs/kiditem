# KID-25 Native Host Runner and MCP v2 Runtime Train Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move disposable Codex/Claude execution out of the Nest container into one native host Runner, connect it to Nest through authenticated outbound HTTP long-poll/event POST and direct MCP v2 Streamable HTTP, and preserve KidItem as the only durable work authority.

**Architecture:** One Nest API container owns admission, Task/Attempt/Invocation/Approval/Operation authority, short-lived Attempt tokens, the MCP v2 tool implementation, and all durable transitions. One native `apps/agent-runner` process owns provider command construction, isolated per-Attempt homes/workspaces, CLI stdin/stdout, process-tree supervision, and cleanup. The Runner has no inbound listener: it polls Nest for strict structured commands and posts idempotent events; each CLI calls Nest's loopback-only Attempt MCP endpoint directly. Windows is the Office production host, macOS is the supported development and integration-test host.

**Tech Stack:** Node.js 22, TypeScript, NestJS/Express, Zod 3 shared control contracts, Zod 4 only inside the MCP SDK adapter, MCP TypeScript SDK v2, MCP `2026-07-28`, Codex CLI `0.149.1`, Claude Code `2.1.241`, Vitest, tsup, .NET 8 Windows Job Objects, PowerShell Task Scheduler, Docker Compose, GitHub Actions.

---

## 0. Authority, workspace, and execution discipline

This plan is the runtime/deployment implementation authority for:

```text
/Users/dev125/.codex/worktrees/e5b4/kiditem
branch: codex/kid-25-copilotkit-interaction-os
primary design:
  docs/superpowers/specs/2026-08-23-kid-25-agent-os-clean-contraction-design.md
```

It completely replaces the earlier version of this file that launched CLIs
inside the API container and bridged stdio to a Unix socket. Reconcile the
existing interrupted MCP v2 diff in place. Keep its useful modern-only server,
strict MCP wire schemas, bounded tool result, and conformance tests; delete or
replace its UDS, Linux peer-PID, stdio bridge, API-local provider process, and
container-login assumptions. Do not reset, discard, or recreate the current
worktree.

The six tasks below are substantial integrated checkpoints, not compatibility
boundaries. The locked final topology and contracts are authoritative; numbered
task/file lists organize review and verification only. Move a replacement or
deletion across task boundaries when that is the shortest coherent clean
cutover. Never preserve a legacy entrypoint, adapter, fallback, or fixture only
so an intermediate task remains backward compatible.

For every substantial implementation unit:

- use one `gpt-5.6-terra` subagent with reasoning effort `max`;
- give that subagent the whole task, not file-sized fragments;
- start by changing/adding failing tests, then implement, then rerun the
  focused gate;
- preserve unrelated user changes and stage only the explicitly integrated
  files needed for the final architecture;
- have the parent inspect the diff and verification transcript before moving
  to the next integrated unit.

Keep every task's TDD and focused verification, but do not run a full Sol
review for every task. The parent selects only material security, authority,
transport, process-isolation, or deployment boundaries for an independent
`gpt-5.6-sol` review with reasoning effort `max`, and fixes/re-reviews concrete
P1/P2 findings there. Ordinary task quality is established by tests, parent
diff inspection, and the final integrated review.

After all implementation units, use a fresh `gpt-5.6-sol` reviewer with
reasoning effort `max` for one final integrated
correctness/security/operations review. Do not open another PR: push this
existing branch and update PR 479 only after the final gates.

This runtime follow-up is a declared platform-boundary reconstruction
exception. It may touch Agent OS runtime adapters, the new Runner app, shared
runtime contracts, Office deployment, scanners, and matching runbooks. It must
not change capability ownership/catalog behavior, lifecycle schemas, Prisma
models, migrations, backfills, seed semantics, CopilotKit/Web state, or other
business domains.

## 1. Locked decisions

### 1.1 Latest-resolved runtime train

The registry was resolved on **2026-08-24**. Commit exact resolved versions so
the application/runtime train is reproducible; “latest” is re-resolved only
when deliberately upgrading the train.

| Component | Exact resolved version | Final owner |
|---|---:|---|
| `@modelcontextprotocol/server` | `2.0.0` | Nest runtime |
| `@modelcontextprotocol/client` | `2.0.0` | Nest conformance tests |
| `zod-v4` alias | `npm:zod@4.4.3` | Nest MCP wire adapter only |
| `@openai/codex` | `0.149.1` | native Runner package/artifact |
| `@anthropic-ai/claude-code` | `2.1.241` | native Runner package/artifact |
| MCP revision | `2026-07-28` | shared runtime contract |
| control revision | `kiditem-runner-control-v1` | shared runtime contract |
| CLI contract identity | `office-cli-contract-v2` | shared runtime contract |

Immediately before Task 1, rerun:

```bash
rtk npm view @modelcontextprotocol/server version --json
rtk npm view @modelcontextprotocol/client version --json
rtk npm view @openai/codex version --json
rtk npm view @anthropic-ai/claude-code version --json
rtk npm view zod version --json
```

If the registry changed, update the table, exact package dependencies,
`AttemptRuntimeTrain` constants, Runner artifact manifest, tests, and runbooks
together before implementation. Never commit `latest`, `^`, `~`, or an
unbounded install for these five selected packages. Do not add
`@modelcontextprotocol/node` unless source code actually imports it; the
fetch-style v2 handler is sufficient for the Nest HTTP adapter.

### 1.2 Final process and network topology

```text
Browser
  -> nginx -> Web/API public routes

Host Runner (native macOS or Windows)
  -> POST http://127.0.0.1:4401/api/internal/agent-runtime/runner/commands:poll
  -> POST http://127.0.0.1:4401/api/internal/agent-runtime/runner/events

Codex/Claude child (native, owned by Runner)
  -> POST http://127.0.0.1:4401/api/internal/agent-runtime/attempts/:attemptId/mcp

Docker Desktop host loopback 127.0.0.1:4401
  -> one Nest API container :4000
```

There is no WebSocket, Runner inbound listener, LAN route, gateway, stdio MCP
child, UDS, named pipe, custom MCP relay, provider session/history persistence,
or provider resume. Office nginx continues to return `404` for
`/api/internal/`. Loopback is a network-exposure boundary, not an
authentication boundary: Runner and Attempt bearer authentication remain
mandatory.

### 1.3 Durable ownership stays unchanged

- `AgentTask` stores only `open | completed | failed | cancelled`.
- `AgentAttempt` stores one disposable CLI process lifecycle.
- `AgentCapabilityApproval` durably stores exact canonical mutation input/hash
  before authorization.
- `AgentCapabilityInvocation` and owner idempotency own mutation admission and
  replay safety.
- `Operation` remains the durable source of truth for long-running work.
- Runner leases, command replay, event sequence, process handles, readiness,
  and Attempt token bindings are process-memory only.
- API/Runner restart never reconstructs a CLI or provider session. Durable
  state creates an immutable successor Attempt only when the user continues.

MCP v2 Tasks and production MRTR state are not adopted. The existing Approval,
Invocation, and Operation records remain authoritative.

### 1.4 Exact identities and timing

- Runner installation token: one unpadded base64url value encoding 32 random
  bytes, protected by Windows ACL or macOS mode `0600`, mounted into Nest as a
  Docker secret, explicitly rotatable, never logged.
- Attempt token: a separate unpadded base64url value encoding 32 random bytes,
  one immutable Attempt binding, SHA-256 digest in the token registry, and raw
  value only in the unacknowledged in-memory start command until ACK;
  expiration at the earlier of Attempt deadline and 30 minutes, immediate
  terminal/interrupt/lease-loss/API-restart revocation, never logged or
  persisted.
- Empty command poll: Nest holds at most 20 seconds and returns `204`.
- Runner poll request deadline: 25 seconds.
- Runner lease loss: 30 seconds without a successfully re-established poll.
- Exactly one outstanding poll per lease.
- Commands: at-least-once delivery, stable `commandId` and canonical hash until
  acknowledgement.
- Events: one serialized batch in flight, strictly increasing `eventSeq`,
  exact-batch retry until acknowledgement.

### 1.5 Strict launch boundary

Nest may send only an `AttemptLaunchSpec` with:

- protocol/CLI contract identity;
- Attempt ID;
- `codex_cli | claude_cli`;
- explicit model;
- bounded effective prompt;
- `empty_ephemeral_v1` workspace policy;
- bounded timeout;
- loopback MCP URL;
- one Attempt token;
- MCP revision `2026-07-28`.

The shared schema must not contain an executable, shell, raw argument array,
arbitrary environment map, host path, provider credential, DB/Nest secret, or
organization/user/session/business authority field. Runner-owned provider
builders resolve exact executable entrypoints relative to the installed Runner
artifact and construct all arguments, environment, sandbox, non-persistence,
and MCP configuration.

## Task 1: Freeze the shared runtime/control contract and fail-first scanners

**Files:**

- Create: `packages/shared/src/agent-runtime/runtime-train.ts`
- Create: `packages/shared/src/agent-runtime/control.ts`
- Create: `packages/shared/src/agent-runtime/index.ts`
- Create: `packages/shared/src/agent-runtime/runtime-train.spec.ts`
- Create: `packages/shared/src/agent-runtime/control.spec.ts`
- Modify: `packages/shared/tsup.config.ts`
- Modify: `packages/shared/package.json`
- Delete: `apps/server/src/agent-os/domain/execution/attempt-runtime-train.ts`
- Delete: `apps/server/src/agent-os/domain/execution/attempt-runtime-train.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-readiness.service.ts`
- Modify: `apps/server/package.json`
- Modify: `package-lock.json`
- Modify: `scripts/check-agent-os-contraction.mjs`
- Modify: `scripts/__tests__/check-agent-os-contraction.test.mjs`
- Modify: `scripts/check-agent-os-hexagonal.mjs`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`

- [ ] **Step 1: Add failing exact-train and strict-schema tests**

The neutral shared subpath owns the only runtime/control values:

```typescript
export const ATTEMPT_RUNTIME_TRAIN = Object.freeze({
  controlRevision: 'kiditem-runner-control-v1',
  cliContractIdentity: 'office-cli-contract-v2',
  mcpProtocolRevision: '2026-07-28',
  codexVersion: '0.149.1',
  claudeVersion: '2.1.241',
  nodeMajor: 22,
} as const);

export const RunnerPlatformSchema = z.enum(['macos', 'windows']);
export const AgentCliRuntimeSchema = z.enum(['codex_cli', 'claude_cli']);
```

Use strict, bounded Zod 3 schemas and inferred TypeScript types for:

- `RunnerHello` and `RunnerPoll` as a discriminated request union;
- `RunnerLeaseResponse`;
- `AttemptLaunchSpec`;
- `attempt.start | attempt.input | attempt.interrupt` command union;
- `command_ack | attempt.started | attempt.output | attempt.terminal |
  attempt.rejected` event union;
- `RunnerEventBatch` and event acknowledgement.

The launch and control schemas must encode these bounds:

```typescript
export const OpaqueBearerSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const LoopbackHttpUrlSchema = z.string().url().max(2_048).refine(value => {
  const url = new URL(value);
  return url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === '[::1]') &&
    !url.username && !url.password && !url.search && !url.hash;
}, 'loopback_http_url_required');

export const AttemptLaunchSpecSchema = z.object({
  attemptId: UuidSchema,
  runtime: AgentCliRuntimeSchema,
  model: z.string().trim().min(1).max(256),
  prompt: z.string().min(1).max(24_000),
  workspacePolicy: z.literal('empty_ephemeral_v1'),
  timeoutMs: z.number().int().min(1_000).max(30 * 60_000),
  mcpUrl: LoopbackHttpUrlSchema,
  attemptToken: OpaqueBearerSchema,
  mcpProtocolRevision: z.literal('2026-07-28'),
  cliContractIdentity: z.literal('office-cli-contract-v2'),
}).strict();
```

Tests must reject unknown keys and recursively reject `command`, `executable`,
`shell`, `args`, `env`, `cwd`, `path`, `loginHome`, `organizationId`,
`userId`, `sessionId`, and active secret/credential material. This is a generic
security boundary, not a vocabulary of retired implementations: a current
`signingSecret` is rejected because it is a secret, while a non-secret hash or
digest is not rejected merely because its historical name contains `hmac`.
They also prove:

- `process.platform === 'darwin'` maps to `macos`;
- `process.platform === 'win32'` maps to `windows`;
- Linux/unknown mapping throws `runner_platform_unsupported`;
- non-loopback, HTTPS-to-another-host, credential-bearing, and query-bearing
  MCP URLs are rejected;
- command batches are bounded to eight commands;
- event batches are bounded to 32 events and 128 KiB of output;
- terminal results parse through the existing bounded
  `AgentResultEnvelopeSchema`.

- [ ] **Step 2: Make server and future Runner import the focused shared subpath**

Add `@kiditem/shared/agent-runtime` to shared package exports and tsup entries.
Delete the server-domain train files after moving their only production import
to the focused shared subpath; there must be one value source, not a re-export
or copied constant.

Move Codex/Claude packages out of `apps/server/package.json`. Keep
`@modelcontextprotocol/server` and `zod-v4` as exact server runtime
dependencies and `@modelcontextprotocol/client` as an exact test dependency.
The Runner package added in Task 3 becomes the only CLI package owner.

- [ ] **Step 3: Expand final-invariant scanners before or alongside deletion**

The contraction/architecture gates must fail while any production code still
contains:

- `attempt-mcp-stdio-to-uds`, `attempt-mcp-socket-server`, Linux `/proc` peer
  verification, or proprietary `{ tool, arguments }` relay;
- `KIDITEM_ATTEMPT_LOGIN_HOME`, API login volume, API-side `codex`/`claude`
  package dependency, Docker CLI assertion, or API-side provider spawn;
- provider resume/session/history persistence;
- Runner inbound listener, public/LAN internal route, raw-shell launch fields,
  or control persistence;
- a runtime/platform enum outside the exact shared contract.

The scanner explicitly allows `child_process` only under
`apps/agent-runner` and unrelated existing domain adapters. It requires all
internal Agent runtime routes to remain below
`/api/internal/agent-runtime/` and requires nginx's deny boundary.

Keep only invariants required by the final architecture:

- active credentials/secrets cannot enter the Runner launch/control boundary
  or Agent OS runtime persistence; and
- Runner lease, poll, command, event, Attempt-token, acknowledgement, and
  process state remain ephemeral rather than Prisma-owned.

Do not special-case retired HMAC field names, credential readers, or other
legacy vocabulary when no final code path can reintroduce them. Delete
legacy-only fixtures together with the implementation they describe. The
scanner may remain red while a replacement is being wired, but no legacy
surface is kept alive merely until Task 6.

- [ ] **Step 4: Run the focused red gate, implement, and commit**

```bash
rtk npm uninstall --workspace=apps/server \
  @openai/codex @anthropic-ai/claude-code
rtk npm install --workspace=apps/server --save-exact \
  @modelcontextprotocol/server@2.0.0 zod-v4@npm:zod@4.4.3
rtk npm install --workspace=apps/server --save-dev --save-exact \
  @modelcontextprotocol/client@2.0.0
rtk npm exec --workspace=packages/shared vitest -- run \
  src/agent-runtime/runtime-train.spec.ts \
  src/agent-runtime/control.spec.ts
rtk npm exec --workspace=apps/server vitest -- run \
  src/__tests__/application-roots.architecture.spec.ts
rtk node --test scripts/__tests__/check-agent-os-contraction.test.mjs \
  scripts/__tests__/check-agent-os-hexagonal.test.mjs
rtk npm run build --workspace=packages/shared
rtk git diff --check
```

First execution must fail on the old transport/container surface. After the
implementation, every command passes. Stage only the files listed in this task
and commit:

```bash
rtk git commit -m "refactor: define native Agent runtime contracts"
```

## Task 2: Replace API-local execution with Nest Runner admission and direct MCP HTTP

**Files:**

- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-installation-token.service.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-lease.registry.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-command.queue.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/attempt-token.registry.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/host-runner-attempt-executor.service.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-event-handler.service.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-installation-token.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-lease.registry.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-command.queue.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/attempt-token.registry.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/host-runner-attempt-executor.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-event-handler.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/runtime/runner-control.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/runtime/attempt-mcp-http.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/runtime/mcp-http-response.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/runtime/__tests__/runner-control.controller.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/runtime/__tests__/attempt-mcp-http.controller.spec.ts`
- Create: `apps/server/src/agent-os/agent-os-runtime-http.module.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-wire-contract.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-tool-result.ts`
- Modify: `apps/server/src/agent-os/application/port/in/mcp/attempt-mcp-actions.port.ts`
- Modify: `apps/server/src/agent-os/application/port/in/capability/live-attempt-execution.capability.port.ts`
- Modify: `apps/server/src/agent-os/application/port/out/runtime/attempt-runtime-control.port.ts`
- Modify: `apps/server/src/agent-os/application/service/work/agent-delegated-attempt-starter.service.ts`
- Modify: `apps/server/src/agent-os/application/service/work/agent-delegated-attempt-starter.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/attempt/attempt-future-output-channel.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/attempt/attempt-future-output-channel.spec.ts`
- Modify: `apps/server/src/agent-runtime-application.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-api-execution.module.ts`
- Modify: `apps/server/src/api-application.module.ts`
- Modify: `apps/server/src/common/http/copilotkit-body-parser.ts`
- Modify: `apps/server/src/main.ts`

- [ ] **Step 1: Write failing control, identity, lifecycle, and HTTP tests**

Cover the complete process-memory state machine:

1. First strict hello validates `macos | windows`, Node 22, control identity,
   exact CLI versions, login checks, and non-persistence capability, then
   issues a `probing` lease.
2. Duplicate same-instance/same-hello returns the same lease; changed hello
   conflicts.
3. A new Runner instance invalidates the prior lease and interrupts its live
   Attempts.
4. Exactly one poll is outstanding; an empty poll resolves `204` at 20
   seconds; concurrent polling is `409`.
5. Unacknowledged commands are redelivered with the same ID/hash.
6. Same Attempt/start hash reuses one queued/running command; changed launch
   input conflicts; terminal Attempts never relaunch.
7. Input and interrupt commands are idempotent.
8. Same `eventSeq`/same body replays the prior acknowledgement; changed body
   or a gap conflicts.
9. Missing, wrong, expired, terminal, stale-lease, or wrong-Attempt tokens are
   rejected before the MCP factory/actions port.
10. No token, Authorization header, prompt, provider stderr, or canonical
    mutation input appears in logs/errors.

Use fake timers for 20/25/30-minute boundaries; do not sleep.

- [ ] **Step 2: Implement token/lease/command registries without persistence**

`RunnerInstallationTokenService` reads one configured Docker-secret file at
boot, requires the 43-character unpadded base64url form to decode to exactly 32
bytes, stores only its SHA-256 comparison digest, and authenticates with
`timingSafeEqual`. It never accepts the token from an ordinary environment
value.

`AttemptTokenRegistry` issues the raw token once, stores:

```typescript
type AttemptTokenBinding =
  | { kind: 'business'; digest: Buffer; expiresAt: Date; binding: AttemptMcpBinding }
  | { kind: 'readiness'; digest: Buffer; expiresAt: Date; canaryId: string };
```

`AttemptMcpBinding` retains immutable
`attemptId/sessionId/taskId/agentVersionId/organizationId/userId/capabilityKeys`
only; remove `socketPath` and `processGroupId`. Every business MCP call
revalidates that durable coordinate through the existing actions service.

`RunnerLeaseRegistry` owns one installation lease, the single open poll,
pending commands, acknowledged command IDs, event sequence/body hash, assigned
Attempt IDs, and `probing | ready` readiness projection. Bound all maps and
evict terminal entries. No Prisma access or serialization is allowed in these
registries.

- [ ] **Step 3: Implement strict HTTP control routes and lifecycle projection**

Both controllers use `@SkipAuth()` and class-level `@SkipThrottle()` plus
their dedicated bearer validation;
exclude the internal prefix from `SessionAuthMiddleware` so Runner/Attempt
tokens are never treated as user sessions. Apply a strict 512 KiB JSON parser
to the internal prefix and `@SkipThrottle()` to the 20-second control poll.
Continue to run the normal global exception/redaction boundary.

`HostRunnerAttemptExecutorService.start`:

```typescript
async start(input: LiveAttemptStart): Promise<void> {
  await this.admission.assert(input.mcp, input.runtime);
  const prompt = await this.prompts.resolve(input.instructionProfileRef, input.prompt);
  const issued = this.attemptTokens.issueBusiness(input.mcp, input.deadline);
  const launch = AttemptLaunchSpecSchema.parse({
    attemptId: input.attemptId,
    runtime: input.runtime,
    model: input.profile.model,
    prompt,
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: ATTEMPT_TIMEOUT_MS,
    mcpUrl: this.loopback.attemptMcpUrl(input.attemptId),
    attemptToken: issued.raw,
    mcpProtocolRevision: ATTEMPT_RUNTIME_TRAIN.mcpProtocolRevision,
    cliContractIdentity: ATTEMPT_RUNTIME_TRAIN.cliContractIdentity,
  });
  this.commands.enqueueStart(launch);
}
```

The canonical start hash replaces the raw token with its SHA-256 digest before
hashing. A retry reuses the exact raw token retained in the unacknowledged
command; API restart intentionally loses it and reconciles the Attempt as
interrupted.

The Runner event handler is the only new adapter that transitions
`starting -> running -> terminal`. It releases the existing process-local
capacity slot exactly once, invalidates the Attempt token before publishing
terminal output, finalizes the Task through existing policy, and sends bounded
future-only AG-UI deltas through `AttemptFutureOutputChannel`. Output is not
stored.

`AgentDelegatedAttemptStarterService` injects
`LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT` and the existing work/admission ports;
remove `ModuleRef` lookup of concrete `AgentAttemptExecutorService` and remove
`loginHome` from `LiveAttemptRuntimeProfile`.

- [ ] **Step 4: Replace the broker with request-scoped modern MCP HTTP**

The controller accepts only `POST` at:

```text
/api/internal/agent-runtime/attempts/:attemptId/mcp
```

After bearer/path/TTL/durable-coordinate validation, create a fresh modern-only
handler for that request:

```typescript
const handler = createMcpHandler(
  context => {
    if (context.era !== 'modern') throw new Error('attempt_mcp_legacy_rejected');
    return createKidItemAgentOsMcpServer(actions, immutableBinding);
  },
  { legacy: 'reject' },
);

const response = await handler.fetch(webRequest, { parsedBody: request.body });
await writeFetchResponseToExpress(response, expressResponse);
```

The adapter copies only bounded safe headers/status/body, preserves streaming
backpressure, closes the request-scoped server/stream on abort, never issues an
MCP session ID, and rejects the 2025 initialize path. Keep exactly the current
11 transport tools and 18 CapabilityDefinitions, including all ten Sourcing
capabilities. Do not alter owner ports, approval/idempotency routing, or tool
semantics.

- [ ] **Step 5: Run focused gates and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/runtime/runner \
  src/agent-os/adapter/in/http/runtime \
  src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.spec.ts \
  src/agent-os/adapter/out/runtime/attempt/attempt-future-output-channel.spec.ts \
  src/agent-os/application/service/work/agent-delegated-attempt-starter.service.spec.ts
rtk npm run build --workspace=apps/server
rtk git diff --check
rtk git commit -m "refactor: admit native Host Runner attempts"
```

## Task 3: Build the native macOS/Windows Runner and provider adapters

**Files:**

- Create: `apps/agent-runner/package.json`
- Create: `apps/agent-runner/AGENTS.md`
- Create: `apps/agent-runner/CLAUDE.md`
- Create: `apps/agent-runner/tsconfig.json`
- Create: `apps/agent-runner/tsup.config.ts`
- Create: `apps/agent-runner/src/main.ts`
- Create: `apps/agent-runner/src/config/runner-config.ts`
- Create: `apps/agent-runner/src/control/runner-control.client.ts`
- Create: `apps/agent-runner/src/control/runner-command-dispatcher.ts`
- Create: `apps/agent-runner/src/control/runner-event-outbox.ts`
- Create: `apps/agent-runner/src/attempt/attempt-executor.ts`
- Create: `apps/agent-runner/src/attempt/attempt-process.registry.ts`
- Create: `apps/agent-runner/src/attempt/attempt-workspace.service.ts`
- Create: `apps/agent-runner/src/provider/provider-command.ts`
- Create: `apps/agent-runner/src/provider/agent-result-output-schema.ts`
- Create: `apps/agent-runner/src/provider/provider-auth-reference.ts`
- Create: `apps/agent-runner/src/provider/codex-command.ts`
- Create: `apps/agent-runner/src/provider/codex-app-server-session.ts`
- Create: `apps/agent-runner/src/provider/claude-command.ts`
- Create: `apps/agent-runner/src/provider/claude-stream-parser.ts`
- Create: `apps/agent-runner/src/platform/process-supervisor.ts`
- Create: `apps/agent-runner/src/platform/macos/macos-process-supervisor.ts`
- Create: `apps/agent-runner/src/platform/macos/process-tree-watchdog.ts`
- Create: `apps/agent-runner/src/platform/windows/windows-job-supervisor.ts`
- Create: `apps/agent-runner/src/security/redaction.ts`
- Create: `apps/agent-runner/src/config/runner-config.spec.ts`
- Create: `apps/agent-runner/src/control/runner-control.client.spec.ts`
- Create: `apps/agent-runner/src/control/runner-command-dispatcher.spec.ts`
- Create: `apps/agent-runner/src/control/runner-event-outbox.spec.ts`
- Create: `apps/agent-runner/src/attempt/attempt-executor.spec.ts`
- Create: `apps/agent-runner/src/attempt/attempt-workspace.service.spec.ts`
- Create: `apps/agent-runner/src/provider/provider-auth-reference.spec.ts`
- Create: `apps/agent-runner/src/provider/agent-result-output-schema.spec.ts`
- Create: `apps/agent-runner/src/provider/codex-command.spec.ts`
- Create: `apps/agent-runner/src/provider/codex-app-server-session.spec.ts`
- Create: `apps/agent-runner/src/provider/claude-command.spec.ts`
- Create: `apps/agent-runner/src/provider/claude-stream-parser.spec.ts`
- Create: `apps/agent-runner/src/platform/macos/macos-process-supervisor.integration.spec.ts`
- Create: `apps/agent-runner/src/platform/windows/windows-job-supervisor.integration.spec.ts`
- Create: `apps/agent-runner/src/security/redaction.spec.ts`
- Create: `apps/agent-runner/windows/KidItem.JobRunner/KidItem.JobRunner.csproj`
- Create: `apps/agent-runner/windows/KidItem.JobRunner/Program.cs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add failing Runner state-machine and command-builder tests**

Use fixture provider processes, not mocks around the code under test, to prove:

- hello reports exactly one supported platform mapping and both exact CLI
  versions/readiness facts;
- the client keeps one 25-second poll open, immediately repolls after `204`,
  and kills all Attempts when a stale lease is rejected or 30 seconds elapse;
- one event batch is in flight and retries byte-for-byte with the same sequence;
- duplicate start/hash returns the same process; changed hash conflicts;
- duplicate input/interrupt does not duplicate provider actions;
- terminal start replay is rejected;
- output/result buffers are bounded and raw stderr/provider payload is neither
  uploaded nor logged;
- abrupt Runner/watchdog exit kills the full fixture descendant tree;
- Attempt directories and generated configuration are removed while the
  provider login artifact remains;
- tokens are absent from diagnostics, generated stdout, model-visible output,
  and tool-shell environments.

`apps/agent-runner/package.json` owns exact CLI packages:

```json
{
  "name": "@kiditem/agent-runner",
  "private": true,
  "main": "dist/main.cjs",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "start": "node dist/main.cjs",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/claude-code": "2.1.241",
    "@openai/codex": "0.149.1",
    "@kiditem/shared": "*",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsup": "^8.5.1",
    "typescript": "~5.8.3",
    "vitest": "^4.1.2"
  },
  "bundledDependencies": [
    "@anthropic-ai/claude-code",
    "@openai/codex"
  ]
}
```

tsup bundles Runner code, `@kiditem/shared/agent-runtime`, and Zod into
`dist/main.cjs`; provider packages remain bundled package dependencies so a
Windows-built `npm pack` artifact carries the Windows provider binaries. The
workflow generates the outer `runner-runtime-contract.json` by importing the
built shared constant, never from a second hand-maintained version table. The
host prerequisite is Node 22; readiness fails on another major.

- [ ] **Step 2: Implement the outbound control client and exact replay rules**

The Runner starts with a fresh UUID `runnerInstanceId`, reads its installation
token from a protected file, validates a loopback `http://127.0.0.1` control
origin, and never opens a server socket. It sends the raw token only in the
Authorization header.

Runner accepts exactly one host-owned argument,
`--config <absolute-json-path>`. The protected JSON is strict and contains:

```json
{
  "controlOrigin": "http://127.0.0.1:4401",
  "tokenFile": "<absolute protected token file>",
  "attemptRoot": "<absolute Runner-owned ephemeral root>"
}
```

The installed package root is derived from the real path of `dist/main.cjs`
and the persistent login root is the dedicated account's `os.homedir()`; neither
is accepted from Nest or an arbitrary command. Configuration rejects symlinked
config/token/attempt roots, non-loopback origins, unsupported platforms,
unknown JSON keys, and any additional command-line flag.

The dispatcher stores `attemptId -> { launchHash, state, supervisor }` in
memory. It acknowledges a command only after the requested state change is
installed locally. Same hash returns the installed state; drift emits one
`attempt.rejected` conflict and never starts another process. The event outbox
serializes one stable JSON body at a time and advances `eventSeq` only after
Nest acknowledges it.

- [ ] **Step 3: Port provider protocol logic behind Runner-owned builders**

Resolve provider entrypoints only beneath the installed Runner package:

```typescript
type ProviderCommand = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<NodeJS.ProcessEnv>;
}>;

export function buildProviderCommand(
  launch: AttemptLaunchSpec,
  paths: AttemptWorkspacePaths,
  runtimeRoot: string,
): ProviderCommand;
```

Nest data never supplies `executable/args/cwd/env`. Builders generate:

- Codex: isolated `CODEX_HOME`, `history.persistence="none"`,
  `thread/start.ephemeral=true`, explicit model, strict config, MCP
  `2026-07-28` feature, `CODEX_MCP_PROTOCOL_VERSION=2026-07-28`, direct HTTP
  server URL, and
  `bearer_token_env_var = "KIDITEM_ATTEMPT_MCP_TOKEN"`;
- Claude: isolated `CLAUDE_CONFIG_DIR`, empty setting sources,
  `--no-session-persistence`, `--strict-mcp-config`, stream-json
  input/output, explicit model, `MCP_SDK_GENERATION=v2`,
  `MCP_PROTOCOL_NEGOTIATION=auto`, and an HTTP MCP config whose Authorization
  header expands `KIDITEM_ATTEMPT_MCP_TOKEN`;
- both: no user settings/plugins/hooks/memories/history, no provider resume,
  no arbitrary browser/network tool, no model-visible shell environment
  containing the Attempt token, no prompt/token in command-line args, and
  provider auto-update disabled.

Port the existing Codex app-server steering and Claude stream-json parser into
the Runner. A live second message uses the same provider process. Provider
native subagents are allowed but remain descendants of the same supervisor,
Attempt token, slot, timeout, workspace, and sandbox.

Claude's `auto` is only the documented client negotiation setting. Nest's
`legacy: 'reject'` handler plus the observed canary revision make any v1/2025
fallback a readiness failure.

- [ ] **Step 4: Implement isolated auth references and process supervisors**

Use the dedicated account's ordinary home as the persistent login source.
Validate the exact Codex `auth.json` or Claude `.credentials.json` selected by
the resolved train without reading its contents. macOS creates a validated
symlink; Windows creates a same-volume hard link. Any other credential-storage
shape is unsupported for this train and fails readiness closed rather than
copying bytes or reusing the full persistent provider home.

Each Attempt gets a private directory under the configured Runner attempt root:

```text
<attempt-root>/<attemptId>-<random>/
  workspace/
  home/
  codex-home/ or claude-config/
  generated MCP/provider config
```

macOS launches a detached process group through the control-pipe watchdog. EOF
from an abruptly dead Runner makes the watchdog send TERM, wait one second,
send KILL, and remove the group. Windows launches the provider through
`KidItem.JobRunner.exe`, assigns it to a Job Object with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` before provider input is accepted, and
closes the Job on Runner pipe EOF. The helper has no listener and accepts only
Runner-local structured launch data. Normal interrupt/timeout/shutdown uses the
same complete-tree path.

- [ ] **Step 5: Run unit and real macOS process gates and commit**

```bash
rtk npm install
rtk npm exec --workspace=apps/agent-runner vitest -- run
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/agent-runner
rtk npm pack --workspace=apps/agent-runner --dry-run
rtk env KIDITEM_RUNNER_REAL_PROCESS_TEST=1 \
  npm exec --workspace=apps/agent-runner vitest -- run \
  src/platform/macos/macos-process-supervisor.integration.spec.ts
rtk git diff --check
rtk git commit -m "feat: add native Codex Claude Host Runner"
```

The real-process test is mandatory on the implementation Mac. It may use
fixture child processes and does not require provider login yet; Task 4 owns
the actual logged-in CLI canary.

## Task 4: Prove readiness, direct MCP conformance, and same-SHA recovery

**Files:**

- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-readiness.service.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runner/runner-readiness.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/readiness-canary-mcp-server.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/readiness-canary-mcp-server.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-readiness.service.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-readiness-canary.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-readiness-canary.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/work/agent-attempt-reconciler.service.ts`
- Create: `apps/server/src/agent-os/application/service/work/agent-attempt-reconciler.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/work/agent-api-startup-reconciler.service.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-restart-recovery.pg.integration.spec.ts`
- Modify: `apps/server/src/readiness/readiness.service.ts`
- Modify: `apps/server/src/readiness/readiness.controller.ts`
- Modify: `apps/server/src/readiness/readiness.module.ts`
- Modify: `apps/server/src/readiness/readiness-state.module.ts`
- Modify: `apps/server/src/readiness/__tests__/readiness.service.spec.ts`
- Modify: `apps/server/src/readiness/__tests__/readiness-state.module.spec.ts`
- Create: `apps/agent-runner/src/__tests__/runner-nest-loopback.integration.spec.ts`
- Create: `apps/agent-runner/src/__tests__/real-cli-readiness.integration.spec.ts`

- [ ] **Step 1: Add failing readiness/recovery tests**

Readiness is a process-memory projection with two phases:

1. A strict hello creates a `probing` control lease after local
   platform/Node/version/login/non-persistence facts validate.
2. Nest sends an ordinary synthetic `attempt.start` plus `attempt.input` using
   an in-memory readiness token binding. The request-scoped canary MCP server
   exposes only its one canary tool. Successful discovery/list/call, live
   second input, terminal parse, token revocation, complete-tree kill, and
   workspace cleanup promote the lease to `ready`.

This adds no command kind, Attempt row, status, Prisma model, or durable
canary. Business Attempt admission requires a `ready` lease for the exact
runtime/model pair selected by every active AgentVersion.

Tests prove:

- both modern clients negotiate `2026-07-28`; 2025 initialize and quiet
  fallback fail before tool invocation;
- the canary exposes one tool while business MCP exposes exactly 11 tools and
  discovers all 18 CapabilityDefinitions/all ten Sourcing definitions;
- MCP responses contain strict bounded structured output;
- the token cannot call a different Attempt or survive terminalization;
- readiness failure removes `ready` and blocks row admission;
- lease loss after 30 seconds kills the Runner process tree, invalidates
  tokens, transitions `starting|running` Attempts to `process_interrupted`,
  fails nonterminal inline reads, releases capacity, and leaves Task `open`;
- API boot has no old lease/token and performs the same durable reconciliation;
- pending Approvals and `ready` mutations remain; expired `executing` mutation
  leases retry under the existing owner idempotency key;
- Continue creates a new immutable Attempt and never resumes provider state.

- [ ] **Step 2: Implement readiness without circular durable state**

`AgentAttemptReadinessService` no longer imports `child_process`, resolves host
login paths, or executes provider binaries. It queries
`RunnerReadinessService.assertReady(runtime, model, deployIdentity)`.
`ReadinessService.getAgentAttemptRuntimeReadiness` deduplicates active
AgentVersion runtime/model pairs and reports the verified Runner instance,
platform, runtime versions, and contract identity without secrets/host paths.

The first canary command uses the same strict `AttemptLaunchSpec` and queue as a
business Attempt. Its token registry binding is `kind: 'readiness'`; its MCP
HTTP controller routes only to `createReadinessCanaryMcpServer` and cannot
reach `AttemptMcpActionsPort`.

- [ ] **Step 3: Simplify API reconciliation and implement Runner loss handling**

Remove API-local process/directory reaping from `AgentAttemptReconciler`. API
boot calls the existing durable reconciliation and releases capacity; the
native Runner independently kills/cleans children when its control lease is
rejected. The lease registry has a bounded timer that invokes the same
terminalization service once per assigned Attempt when 30 seconds elapse.

Runner behavior:

- transient poll failure may reconnect with the same lease inside 30 seconds;
- unknown/stale lease response or the 30-second deadline kills all live trees
  before a new hello;
- SIGTERM/shutdown kills all trees before exit;
- watchdog/Job Object handles abrupt Runner death;
- a browser stream disconnect never interrupts the CLI.

- [ ] **Step 4: Run focused conformance/recovery plus real CLI readiness**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/in/mcp \
  src/agent-os/adapter/out/runtime/runner \
  src/agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service.spec.ts \
  src/agent-os/application/service/work/agent-attempt-reconciler.service.spec.ts
rtk npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-restart-recovery.pg.integration.spec.ts
rtk npm exec --workspace=apps/agent-runner vitest -- run \
  src/__tests__/runner-nest-loopback.integration.spec.ts
rtk env KIDITEM_RUNNER_REAL_CLI_CANARY=1 \
  npm exec --workspace=apps/agent-runner vitest -- run \
  src/__tests__/real-cli-readiness.integration.spec.ts
rtk git diff --check
rtk git commit -m "test: prove Host Runner readiness and recovery"
```

The real canary runs on the implementation Mac using its logged-in Codex and
Claude accounts. It must exercise strict MCP discovery/call, one scoped
capability canary, live second input, result parsing, and cleanup for both
runtimes. Never print login artifacts or Attempt tokens.

## Task 5: Package and deploy the native Windows Runner through the Office release

**Files:**

- Modify: `apps/server/Dockerfile`
- Modify: `deploy/office/compose.office.yml`
- Modify: `deploy/office/office.env.example`
- Modify: `deploy/office/nginx.conf`
- Modify: `deploy/office/apply-deployment.ps1`
- Modify: `.github/workflows/office-images.yml`
- Modify: `.github/workflows/pr-checks.yml`
- Modify: `scripts/__tests__/office-deployment-contract.test.mjs`
- Modify: `scripts/check-agent-os-contraction.mjs`
- Modify: `apps/server/.env.example`
- Modify: `package-lock.json`

- [ ] **Step 1: Add failing Office/Windows contract tests**

Require:

- API Dockerfile has no Codex/Claude dependency, binary assertion, login home,
  UDS entrypoint, `procps` dependency for Attempt control, or provider auth
  volume;
- Compose publishes only `127.0.0.1:4401:4000` for internal runtime access,
  mounts the Runner token as a Docker secret, declares one API replica, and
  never exposes the internal port/LAN;
- nginx returns `404` for `/api/internal/` before generic API proxying;
- Office manifest schema 2 contains Runner artifact filename, SHA-256,
  control/CLI contract identity, platform `windows`, and exact CLI versions;
- deployment verifies the artifact/hash, stops the existing scheduled Runner,
  atomically switches versioned roots, preserves/validates the dedicated task
  principal, starts the matching Runner after API boot, and rolls back API/Web/
  Runner as one release identity;
- `RotateRunnerToken` performs a short stop, atomically replaces the one ACL
  file, restarts API/Runner, and requires full readiness;
- Windows package/build tests run on `windows-latest` and no script creates a
  firewall/LAN listener.

- [ ] **Step 2: Remove provider execution from the API image and wire loopback**

Compose:

```yaml
services:
  api:
    ports:
      - "127.0.0.1:4401:4000"
    secrets:
      - agent_runner_token
    environment:
      KIDITEM_AGENT_RUNNER_TOKEN_FILE: /run/secrets/agent_runner_token
      KIDITEM_AGENT_RUNTIME_LOOPBACK_ORIGIN: http://127.0.0.1:4401

secrets:
  agent_runner_token:
    file: ${KIDITEM_AGENT_RUNNER_TOKEN_FILE:?protected Runner token file required}
```

The URL sent to the host CLI is the host-loopback origin, not
`http://api:4000`. Remove `KIDITEM_ATTEMPT_LOGIN_HOME` and its volume. The API
image keeps MCP server packages but removes provider CLI packages and all
provider/UDS image assertions.

- [ ] **Step 3: Build one immutable Windows Runner artifact**

Add a `build_runner_windows` job on `windows-latest`:

1. checkout the exact release SHA and install Node 22;
2. `npm ci` from the lock;
3. build shared and Runner;
4. `dotnet publish` `KidItem.JobRunner` for `win-x64`, self-contained,
   single-file;
5. `npm pack --workspace=apps/agent-runner` so exact Windows CLI dependencies
   are bundled;
6. create one outer `kiditem-agent-runner-windows-x64.zip` containing that
   tgz, `KidItem.JobRunner.exe`, and `runner-runtime-contract.json`;
7. unpack the zip and tgz into a clean directory, run both bundled providers'
   `--version` commands, then run Runner/Windows fixture tests;
8. calculate the outer zip's SHA-256 and upload it as an intermediate artifact.

`publish_manifest` downloads that artifact and puts it inside the existing
Office operator bundle. Manifest schema 2 binds the artifact SHA and runtime
train to the same Git SHA/API/Web digests. No floating download or npm install
occurs on the Office machine.

- [ ] **Step 4: Extend the existing PowerShell deployment transaction**

Do not add a second deploy script. `apply-deployment.ps1` owns:

- protected roots under `C:\ProgramData\KidItem\agent-runner\releases\<gitSha>`;
- a `current` pointer switched only after package/hash/runtime-manifest checks;
- Task Scheduler task `KidItem Agent Runner` under the pre-provisioned
  dedicated account, S4U logon with its user profile, limited privilege,
  start-at-boot plus restart-on-failure;
- host config containing only loopback origin, protected token path, attempt
  root, and versioned Runner root;
- ACL: inheritance removed; dedicated Runner account and SYSTEM can read the
  token, Administrators can rotate it; ordinary Users cannot;
- deploy order: stop Runner, deploy API/Web/worker, start API, switch/start
  matching Runner, wait for full Agent runtime readiness, then finish;
- rollback order: stop Runner, restore prior API/Web/Runner manifest together,
  start and reverify;
- token rotation: stop Runner/API, atomically write an unpadded base64url
  encoding of 32 newly generated random bytes to the same protected file,
  restart both, rerun readiness.

Provider login is an operator prerequisite performed interactively once under
the dedicated account. Deployment never reads/copies provider credential
bytes.

- [ ] **Step 5: Run Office and Windows gates and commit**

```bash
rtk node --test scripts/__tests__/office-deployment-contract.test.mjs
rtk npm run check:agent-os-contraction -- --enforce
rtk docker compose \
  --env-file deploy/office/office.env.example \
  -f deploy/office/compose.office.yml config
rtk npm run build --workspace=apps/server
rtk git diff --check
rtk git commit -m "feat: deploy native Windows Agent Runner"
```

The matching `windows-latest` PR job must also pass:

```powershell
npm ci
npm run build --workspace=packages/shared
npm run build --workspace=apps/agent-runner
npm exec --workspace=apps/agent-runner vitest -- run
dotnet publish apps/agent-runner/windows/KidItem.JobRunner/KidItem.JobRunner.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
npm pack --workspace=apps/agent-runner --dry-run
```

## Task 6: Delete superseded runtime glue, align durable docs, and finish KID-25

The delete list below is a final-state inventory, not a sequencing constraint.
Files removed during an earlier coherent Runner/direct-MCP cutover stay
removed; this task verifies that no listed production surface or compatibility
shim remains.

**Files:**

- Delete: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-proxy.ts`
- Delete: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-socket-server.ts`
- Delete: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-socket-server.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-stdio-to-uds.ts`
- Delete: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-stdio-to-uds.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-executor.service.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-process-registry.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/attempt-filesystem.service.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/attempt-filesystem.service.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/attempt-live-control.registry.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/codex-attempt.adapter.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/claude-attempt.adapter.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/codex-app-server-session.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/codex-app-server-session.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/codex-attempt-isolation-canary.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/codex-attempt-isolation-canary.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-attempt-runtime.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/attempt/agent-result-output-schema.ts`
- Delete: `apps/server/src/agent-os/application/service/work/agent-runtime-directory-reconciler.service.ts`
- Delete: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-broker.service.ts`
- Delete: `apps/server/src/agent-os/adapter/in/mcp/attempt-mcp-broker.spec.ts`
- Modify: `apps/server/src/agent-runtime-application.module.ts`
- Delete: `apps/server/src/agent-mcp-application.module.ts`
- Modify: `apps/server/src/__tests__/application-root-policy.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Modify: `scripts/check-agent-os-contraction.mjs`
- Modify: `scripts/__tests__/check-agent-os-contraction.test.mjs`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/interaction-platform.md`
- Modify: `docs/runbooks/office-deploy.md`
- Modify: `docs/runbooks/agent-os-clean-cutover.md`
- Modify: `apps/server/src/agent-os/AGENTS.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-08-23-kid-25-agent-os-clean-contraction.md`

- [ ] **Step 1: Make zero-legacy findings a failing gate, then delete**

Before deletion, tests must enumerate every superseded production file,
dependency, env var, Compose mount, Docker assertion, and doc statement. Then
delete the API-owned provider/UDS tree, including `AttemptMcpBrokerService`.
Bind the request-scoped MCP factory directly in the HTTP adapter; do not keep
an empty compatibility class.

The final server runtime tree may retain only:

- shared runtime/control contracts;
- Runner token/lease/command/event/readiness registries;
- Host Runner execution/control ports;
- direct Attempt MCP HTTP adapter;
- Nest-owned 11-tool factory and strict result/wire helpers;
- existing durable work/capability application services.

- [ ] **Step 2: Rewrite nearby durable documentation, not append history**

All durable docs must say:

- platform `macos | windows` and runtime `codex_cli | claude_cli` are separate;
- Windows Office uses one native Task Scheduler Runner; macOS development
  starts Runner explicitly;
- API/worker containers never spawn provider CLIs or mount provider login;
- control is outbound long-poll/event POST; MCP is direct loopback Streamable
  HTTP `2026-07-28`;
- Runner token and Attempt token are separate, protected, rotatable/revocable,
  and never logged;
- provider login persists only in the dedicated account; provider
  session/history does not;
- restart means `process_interrupted` plus manual immutable successor, never
  provider resume;
- exactly 11 MCP tools, 18 capabilities, and ten Sourcing capabilities remain;
- no new schema, status, migration, Web state, gateway, internal signing or
  credential broker, durable control queue, quota, or multi-instance protocol
  was added.

Update stale architecture paragraphs that still call the API process the CLI
owner or mention a private MCP socket. The top-level architecture map and
Agent OS instructions must agree.

- [ ] **Step 3: Run the complete local acceptance matrix**

```bash
rtk npm run check:conventions
rtk npm run check:copilotkit-train
rtk npm run test:scripts
rtk npm exec --workspace=packages/shared vitest -- run src/agent-runtime
rtk npm exec --workspace=apps/agent-runner vitest -- run
rtk npm exec --workspace=apps/server vitest -- run src/agent-os src/readiness
rtk npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-version-publication.pg.integration.spec.ts \
  src/agent-os/__tests__/agent-restart-recovery.pg.integration.spec.ts
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/agent-runner
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:pr-reconstruction -- \
  --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- \
  --base origin/develop --head HEAD
rtk git diff --check
```

Run the required Nest boot against the explicit acceptance database:

```bash
rtk node -e "if (!process.env.KID25_ACCEPTANCE_DATABASE_URL) throw new Error('KID25_ACCEPTANCE_DATABASE_URL is required')"
rtk env DATABASE_URL="$KID25_ACCEPTANCE_DATABASE_URL" npm run dev:server
```

Confirm API boot/reconciliation, start the macOS Runner, obtain a ready lease,
run one Codex and one Claude real canary, and stop both cleanly. This follow-up
has no Prisma diff, so do not run `db:push` merely for the Runner change; the
overall KID-25 clean-cutover gate in the parent plan remains responsible for
its already-approved schema push.

- [ ] **Step 4: Require Windows CI and one integrated Sol review**

Do not claim completion while the Windows Runner job is absent, skipped, or
failing. Give the Sol reviewer:

- primary design and both implementation plans;
- full branch diff including the interrupted work reconciled in place;
- shared control schemas and token/lease state machines;
- provider builders and macOS/Windows supervisors;
- direct MCP controller and 11-tool/18-capability evidence;
- restart/readiness tests;
- Compose/nginx/PowerShell/workflow diff;
- complete local and Windows verification transcripts.

Ask specifically for authority confusion, token leakage, replay/drift bugs,
process escape/orphan risks, MCP legacy/session fallback, LAN exposure,
restart double-terminalization, deploy/rollback skew, and unintended schema/
capability/Web changes. Fix all P1/P2 findings and rerun affected tests plus
the complete matrix.

- [ ] **Step 5: Commit, push the existing branch, and update PR/Linear**

```bash
rtk git status --short
rtk git diff --check
rtk git commit -m "docs: finalize native Agent runtime cutover"
rtk git push origin codex/kid-25-copilotkit-interaction-os
rtk gh pr view 479 --json number,headRefName,baseRefName,commits,body,url
```

Stop if PR 479's head/base/history is unexpected. Update its existing body from
the repository template, then read the live body back and run both PR guards.
Do not create a new PR. Move KID-25 to Review only after all mandatory gates
and the Sol re-review pass. Update KID-24 with the accurate dependency/status
impact; do not mark it complete unless its own acceptance is complete.

## 2. Final acceptance matrix

| Boundary | Required evidence |
|---|---|
| Platform/runtime | exact `macos | windows` and `codex_cli | claude_cli`; Linux fails closed |
| Packages | latest-resolved exact train; CLIs only in Runner artifact; MCP v2 only in Nest |
| Control | authenticated outbound long-poll/event POST; one poll; 20/25/30 timing |
| Replay | same command/event hash reuses; drift/gap conflicts; no duplicate process/transition |
| Identity | protected rotatable Runner token; per-Attempt digest/TTL/binding/revocation |
| Launch | no raw shell/executable/args/env/path/authority from Nest |
| Isolation | empty workspace, auth reference only, non-persistent provider settings |
| Process tree | macOS watchdog/group and Windows Job Object kill descendants on all exits |
| MCP | direct loopback Streamable HTTP `2026-07-28`, modern-only, stateless/request-scoped |
| Catalog | exactly 11 tools, 18 definitions, all ten Sourcing capabilities |
| Durability | no new schema/status; Task/Attempt/Approval/Invocation/Operation ownership unchanged |
| Restart | live process killed; Attempt/read interrupted; Task open; mutation/idempotency preserved |
| Network | loopback port only; nginx internal deny; Runner has no listener; no firewall rule |
| Deployment | one matching API/Web/worker/Runner manifest, transactional deploy/rollback/rotation |
| Verification | Mac real canary, Windows job/helper CI, Nest/server/shared/web builds, scanners |
| Review/ship | integrated Sol max clean re-review, existing PR 479 only, accurate Linear updates |

## 3. Explicit non-goals

Do not add:

- Prisma models, migrations, backfills, or new lifecycle/status columns;
- transcript/replay/artifact/cost/provider-session/credential persistence;
- provider resume/session IDs or full persistent provider home reuse;
- Runner inbound API, WebSocket, message broker, durable command/event table,
  named pipe, UDS, stdio MCP bridge, or custom JSON-RPC relay;
- MCP Tasks or production MRTR authority;
- AgentVersion/CapabilityDefinition provider credentials, models, sessions, or
  history;
- capability catalog changes, owner-port changes, new HMAC keys, RBAC, quota,
  delegation depth/fan-out, distributed admission, or multi-API lease;
- Web/AG-UI durable states or a new interaction service;
- alternate local deploy scripts, mutable runtime downloads, automatic
  upgrade PRs, scheduled compatibility pipelines, or restore-rehearsal scope.

The completion claim is deliberately narrow: runtime/admission correctness,
clean schema preservation, direct MCP v2, native host process containment,
basic same-SHA restart recovery, and a deployable single-user Windows Office
topology.
