# KID-25 Host-Installed CLI Runner Design

**Status:** Approved architecture; implementation not yet complete  
**Date:** 2026-08-24  
**Scope:** Agent OS runtime/admission correctness, clean runtime cutover, and
basic restart recovery for one user operating one Office instance

## 1. Authority and replacement scope

This design replaces only the CLI placement, process ownership, and MCP
transport assumptions in:

- section 7 of
  `2026-08-23-kid-25-agent-os-clean-contraction-design.md`; and
- `2026-08-24-kid-25-mcp-v2-runtime-train.md`.

The prior documents assumed that the Linux API container installed and spawned
Codex and Claude, mounted a Docker login volume, and carried MCP over a private
Unix socket. That assumption is no longer authoritative.

The approved runtime boundary is a host-installed CLI Runner:

- development runs on a macOS host;
- Office production runs on a native Windows host;
- the Nest API and durable worker remain in Linux Docker containers;
- Codex and Claude run on the host under the host user's provider login;
- Nest owns durable Agent OS state, admission, grants, and MCP tool behavior;
- the Runner owns only disposable host process execution.

This replacement does not reopen the previously approved capability catalog,
owner-domain ports, Task/Attempt lifecycle, approval, idempotency, or restart
decisions. It does not declare KID-25 complete.

## 2. Goals

1. Use the host's existing Codex and Claude login state without mounting,
   copying, encrypting, HMAC-signing, or persisting provider credential bytes
   in KidItem.
2. Run every Agent Attempt as a disposable native host process while KidItem
   retains durable Task, Attempt, Approval, Invocation, and Operation state.
3. Keep one strict structured launch contract. Nest never sends a raw shell
   command, arbitrary executable, free-form argument array, environment map, or
   host filesystem path to the Runner.
4. Use MCP `2026-07-28` over modern stateless Streamable HTTP directly from the
   host CLI to the Nest-owned MCP factory.
5. Authenticate the installed Runner and every individual Attempt without a
   credential broker, request-signing HMAC, provider session, or new database
   model.
6. Support actual macOS development/integration testing and native Windows
   Office execution through the same Runner core and platform-specific process
   supervisor adapters.
7. Fail closed on API restart, Runner loss, token expiry, protocol downgrade,
   runtime drift, or process-supervision failure.

## 3. Non-goals

This design does not add:

- Linux as a supported host Runner platform;
- native-Windows containers or a WSL-based Agent runtime;
- a second durable workflow engine or MCP Tasks;
- production MRTR approval state;
- provider resume IDs, provider session/history persistence, or conversation
  replay;
- AgentVersion provider credentials or model/provider session fields;
- organization RBAC, quotas, delegation-depth, or fan-out policy;
- a general remote command service, arbitrary shell endpoint, SSH boundary, or
  LAN-visible Runner API;
- a separate interaction gateway or CopilotKit service;
- schema changes, data migration, or backfill.

## 4. Runtime topology

```text
Browser
  -> web/nginx
  -> Nest API container
       |- durable Agent OS application services
       |- in-memory Runner admission
       |- in-memory Attempt-token admission
       `- modern-only MCP HTTP factory

Native host
  `- KidItem Agent Runner
       |- outbound authenticated Runner channel to Nest
       |- strict launch-spec interpreter
       |- macOS or Windows process supervisor
       `- host-installed Codex/Claude CLI
            `- authenticated Streamable HTTP MCP -> Nest

PostgreSQL
  `- Task / Attempt / Approval / Invocation / Operation durability
```

The Runner is a necessary OS execution boundary, unlike the rejected
interaction gateway. The API container cannot directly spawn a native Windows
or macOS executable. The Runner has an independently observable process
lifecycle because it must survive and supervise outside Docker, but it does not
own business state or protocol authority.

## 5. Platform and runtime axes

Platform and provider runtime are separate closed enums:

```ts
export type HostRunnerPlatform = 'macos' | 'windows';
export type AgentRuntimeType = 'codex_cli' | 'claude_cli';
```

The Runner maps Node platform values internally:

```text
darwin -> macos
win32  -> windows
other  -> unsupported_host_runner_platform
```

Platform is Runner readiness information. It is not stored on AgentVersion,
AgentTask, AgentAttempt, CapabilityDefinition, or another database row. The
Runner reports it during its authenticated handshake, and Nest admits only the
two supported values.

Both platforms expose the same process-supervisor port:

```ts
interface AttemptProcessSupervisor {
  start(spec: ResolvedAttemptProcessSpec): Promise<AttemptProcessHandle>;
  send(attemptId: string, input: string): Promise<void>;
  interrupt(attemptId: string): Promise<void>;
  terminateAll(reason: string): Promise<void>;
}
```

- macOS uses a detached process group and exact group termination.
- Windows uses a Job Object configured with
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.

The Windows adapter uses a small repository-owned PowerShell/.NET Job Object
launcher shipped with the Runner bundle. The launcher, not PID-tree guessing,
owns the Job Object handle. Runner loss closes its control pipe; launcher exit
closes the handle and terminates the complete CLI/native-subagent tree.

## 6. Components and ownership

### 6.1 `apps/agent-runner`

The host application owns:

- Runner authentication and one outbound control connection;
- strict control-envelope parsing;
- exact runtime-train readiness probes;
- provider-specific command construction from trusted fields;
- ephemeral Attempt directories and generated CLI/MCP configuration;
- native process start, live input, interrupt, timeout, and cleanup;
- parsing provider output into the existing strict `AgentResultEnvelope`;
- bounded diagnostics that never persist raw provider output or token values.

It does not import Prisma, connect to PostgreSQL, execute a capability, decide
approval, mint an Invocation, enqueue an Operation, or reconstruct authority.

### 6.2 Nest Runner adapter

The API-owned incoming/runtime adapter owns:

- runner-token verification;
- admission of exactly one active Runner for the single-instance Office
  contract;
- strict Runner protocol negotiation and readiness projection;
- structured Attempt start/input/interrupt messages;
- binding Runner events to the exact immutable AgentAttempt;
- invalidating Attempt tokens and terminalizing Attempt lifecycle;
- refusing new Attempts when the Runner is absent, incompatible, logged out,
  over capacity, or not canary-ready.

The Runner connection is process memory only. It is not reconstructed after an
API restart.

### 6.3 MCP HTTP adapter

Nest owns one modern-only MCP server factory and an Attempt-token admission
registry. The HTTP adapter:

- accepts only MCP revision `2026-07-28`;
- rejects fallback/legacy initialization;
- validates the bearer token, path Attempt ID, TTL, terminal state, and
  in-memory immutable binding before constructing a request-scoped MCP server;
- revalidates the durable Session/Task/Attempt/AgentVersion/user/organization
  coordinate through the existing application port for every public tool
  action;
- exposes the exact existing 11 MCP transport tools;
- uses strict Zod 4 wire schemas and bounded structured/text result envelopes;
- never accepts caller-supplied organization, user, session, AgentVersion, or
  grant authority.

The 18 CapabilityDefinitions, including all ten Sourcing capabilities, remain
unchanged.

## 7. Runner identity

Each Runner installation has one cryptographically random bearer token with at
least 256 bits of entropy.

- The Windows copy is stored in an ACL-protected file readable only by the
  dedicated Runner account and SYSTEM.
- The macOS development copy is stored in a mode-`0600` file under the local
  Runner configuration root.
- Nest receives the matching value through a Docker secret, not an ordinary
  checked-in env file or database row.
- The Runner sends it only in the private control-channel handshake.
- Nest uses bounded parsing and constant-time comparison.
- Neither side logs the raw value, request Authorization header, secret path
  contents, or derived token material.
- Rotation is an explicit offline operation: stop Runner and API admission,
  replace both protected copies, then restart and pass readiness. No dual-token
  database state is required for this single-user deployment.

The token proves only that the expected installed Runner is connecting. It is
not a provider credential, user session, capability grant, or Attempt token.

## 8. Attempt identity

Nest generates a new cryptographically random opaque bearer token for each
AgentAttempt.

- It is bound to exactly one immutable Attempt MCP binding.
- Its expiry is the earlier of the Attempt deadline and 30 minutes after issue.
- It cannot be refreshed or reused by a successor Attempt.
- The raw value is sent once over the authenticated Runner channel.
- The Runner passes it to the CLI in a process environment variable.
- Generated Codex and Claude MCP configuration refers to the environment
  variable and never contains the token value.
- Nest retains only a SHA-256 digest and binding in process memory.
- Every MCP request hashes the presented token and compares it in constant
  time.
- Terminalization, cancellation, interrupt, timeout, Runner loss, API restart,
  or explicit cleanup invalidates it immediately.
- Raw values and Authorization headers are redacted from logs, exceptions,
  metrics, traces, and provider result envelopes.

This digest is an in-memory lookup boundary, not an HMAC signature or durable
credential model.

## 9. Private network boundary

The Runner exposes no inbound listener.

1. The API container's existing Nest server is additionally published to one
   Windows/macOS host-loopback-only port, for example
   `127.0.0.1:4401 -> api:4000`.
2. nginx returns `404` for the internal Runner/MCP route prefix and never
   proxies that prefix from the Office LAN origin.
3. The Runner opens one outbound WebSocket to the loopback-only Nest endpoint.
4. Host CLIs call the loopback-only MCP HTTP endpoint.
5. Docker Compose does not publish a Runner port, and Windows Firewall does not
   open one.

Runner and Attempt tokens remain mandatory even on loopback. Network placement
does not replace admission.

## 10. Control protocol

The control protocol is versioned and strict. All messages use bounded Zod
contracts and reject unknown keys.

```text
runner.hello
runner.ready
runner.heartbeat
attempt.start
attempt.started
attempt.input
attempt.interrupt
attempt.terminal
attempt.rejected
```

The Runner initiates the channel and reports:

- protocol identity;
- Runner build identity;
- `macos | windows` platform;
- exact Codex and Claude versions;
- login/readiness status without credential contents;
- supported MCP revision;
- configured concurrency capacity.

Nest admits one connection only when the complete compatibility train matches.
A second Runner, an unknown platform, version drift, login failure, legacy MCP
support, or malformed readiness result fails closed.

Heartbeats are sent every five seconds. Missing three consecutive heartbeats or
closing the WebSocket expires the Runner lease. The Runner terminates all live
Attempt process groups/Job Objects; Nest revokes their tokens and terminalizes
them as `process_interrupted`.

### 10.1 Strict launch specification

Nest sends a business-neutral, bounded `AttemptLaunchSpec`:

```ts
interface AttemptLaunchSpec {
  protocolIdentity: 'kiditem-host-runner-v1';
  attemptId: string;
  runtime: 'codex_cli' | 'claude_cli';
  model: string;
  prompt: string;
  workspacePolicy: 'empty_ephemeral_v1';
  timeoutMs: number;
  mcp: {
    url: string;
    bearerToken: string;
    protocolRevision: '2026-07-28';
  };
}
```

Implementation uses shared strict schemas rather than a handwritten
TypeScript-only interface. Bounds include a UUID Attempt ID, explicit non-empty
model, prompt at most 24 KiB, timeout at most 30 minutes, exact loopback MCP URL
shape, and exact protocol literals.

The spec deliberately excludes:

- executable and shell names;
- raw argument arrays or command strings;
- arbitrary environment variables;
- host workspace/config/login paths;
- organization, user, Session, Task, AgentVersion, capability, grant, DB, or
  provider credential values.

The Runner owns exact provider command builders and derives the Attempt root
from the Attempt ID plus a random suffix below its configured private root.
Nest cannot request another host path.

### 10.2 Launch replay

The Runner computes a canonical launch-spec hash excluding the bearer-token
value but including its token digest.

- same Attempt ID and same hash returns the existing process state;
- same Attempt ID and a different hash returns
  `attempt_launch_idempotency_conflict`;
- a terminal or unknown Attempt ID cannot be relaunched;
- a successor always has a new AgentAttempt ID and token.

This process-memory replay guard prevents duplicate CLI processes during a
transient control-channel retry. It does not become a durable idempotency row.

## 11. Host filesystem and provider login

The dedicated production Runner account is logged into Codex and Claude using
their normal host CLIs. macOS development uses the invoking developer's
explicitly selected Runner login profile.

Every Attempt receives empty, private directories for:

- workspace;
- generated provider configuration;
- MCP configuration;
- bounded transient diagnostics.

Production Windows directories live below the dedicated account's local
application-data root. macOS development directories live below the configured
Runner data root. Directory permissions admit only the Runner account and the
minimum operating-system authority.

The Runner makes the verified provider auth artifact available in the
per-Attempt provider home through an OS hard link on the same volume. It first
verifies that the source is a regular non-reparse file under the configured
login root. Creating the link does not read or copy credential bytes. Cleanup
removes only the Attempt link and directory, never the original login artifact.

If an exact supported CLI train cannot use this credential-reference contract,
readiness fails. KidItem must not silently fall back to copying credentials or
using the persistent provider home as the complete Attempt home.

Generated configuration explicitly enforces:

- selected model;
- no provider history/session persistence;
- no resume/continue identifier;
- strict MCP configuration containing only KidItem's Attempt endpoint;
- MCP `2026-07-28` modern controls;
- bounded allowed tools;
- platform-appropriate filesystem and command sandbox;
- no inherited plugin, hook, skill, memory, project MCP, or arbitrary network
  configuration.

## 12. Provider MCP configuration

Both providers use modern Streamable HTTP directly. No stdio MCP child, Unix
socket, named pipe, byte bridge, custom JSON relay, or transport proxy remains.

Codex receives an isolated generated configuration equivalent to:

```toml
[mcp_servers.kiditem_attempt]
url = "http://127.0.0.1:4401/api/internal/agent-runtime/attempts/<attempt-id>/mcp"
bearer_token_env_var = "KIDITEM_ATTEMPT_TOKEN"
required = true
```

Claude receives an isolated strict MCP configuration equivalent to:

```json
{
  "mcpServers": {
    "kiditem_attempt": {
      "type": "http",
      "url": "http://127.0.0.1:4401/api/internal/agent-runtime/attempts/<attempt-id>/mcp",
      "headers": {
        "Authorization": "Bearer ${KIDITEM_ATTEMPT_TOKEN}"
      }
    }
  }
}
```

The Runner applies the selected train's exact Codex feature/protocol controls
and Claude MCP SDK/negotiation controls after its minimal code-owned
environment. Codex shell-environment policy removes
`KIDITEM_ATTEMPT_TOKEN` from model-invoked commands. Claude allows only the
KidItem MCP and provider-native orchestration tools and denies Bash/shell
execution. Provider-owned native subagents may share the token only inside the
same supervised Attempt process tree; they cannot extend its binding or TTL.
The token is never included in model-visible output.

## 13. Attempt data flow

1. Authenticated KidItem user creates or continues durable work.
2. Nest creates one immutable AgentAttempt after the existing runtime/model and
   concurrency admission checks.
3. Nest requires one compatible, authenticated, canary-ready Runner.
4. Nest creates the Attempt token, stores its digest/binding in memory, and
   sends the strict launch spec.
5. Runner validates the spec, creates the isolated host workspace/config, links
   the verified login artifact, and starts the exact CLI through the platform
   supervisor.
6. Runner reports `attempt.started`; Nest transitions the existing Attempt
   process lifecycle to running.
7. CLI performs modern HTTP MCP discovery/calls using the Attempt bearer token.
8. Nest validates transport identity and durable authority for every call, then
   invokes the same existing Agent OS application ports.
9. Reads execute inline. Mutations retain durable Invocation, Approval,
   owner-idempotency, and Operation behavior.
10. Runner parses a strict provider terminal result and reports exactly one
    bounded `attempt.terminal` event.
11. Nest durably terminalizes the AgentAttempt and immediately revokes the
    Attempt token.
12. Runner closes the process supervisor handle and deletes the ephemeral
    workspace/config. The host login remains.

Live user Continue sends `attempt.input` only to the same active process.
Interrupt sends `attempt.interrupt`; it never mutates Task business status by
itself.

## 14. Approval and long-running work

The approved KID-25 behavior remains unchanged:

- a live Codex/Claude Attempt may wait a bounded time for HITL approval;
- Approval stores exact canonical mutation input/hash before authorization;
- timeout, process exit, Runner loss, or API restart does not cancel an already
  admitted durable mutation;
- worker-owned Invocation/Operation recovery continues with the same owner
  idempotency key;
- later reasoning uses a new immutable successor Attempt;
- MCP Tasks and provider resume are not used.

## 15. Failure and restart behavior

### Runner process crash

- macOS process-group and Windows Job Object ownership terminates the complete
  CLI/native-subagent tree.
- The control channel closes.
- Nest revokes Attempt tokens and marks live Attempts
  `process_interrupted`.
- Task remains `open` unless it already has a business terminal state.

### API container restart

- The in-memory Runner connection and all Attempt token digests disappear.
- The Runner detects channel loss and terminates all live Attempt processes.
- Existing boot reconciliation marks prior starting/running Attempts
  `process_interrupted`.
- Durable ready mutations and expired executing leases continue through the
  worker; inline reads are not reconstructed.

### Temporary channel stall

- Missing three five-second heartbeats expires the Runner lease.
- Fail-closed termination is preferred over keeping an ungoverned CLI alive.
- A retry creates a successor Attempt; it never reconnects to the provider
  process.

### Host reboot

- All host processes disappear.
- Task and mutation durability remain in PostgreSQL.
- Task Scheduler restarts the Windows Runner; macOS development restarts it
  explicitly.
- Readiness must pass before another Attempt is admitted.

### Token expiry or mismatch

- MCP returns an authentication failure without constructing a tool server or
  invoking an application port.
- Runner control messages cannot extend an expired Attempt token.
- Token failure terminalizes the affected live process rather than falling
  back to an unauthenticated or legacy MCP lane.

## 16. Readiness

Runtime readiness is valid only while the authenticated Runner connection is
live and all of the following pass:

- supported platform (`macos | windows`);
- exact Runner/control contract identity;
- exact selected Codex and Claude versions;
- both host login-status commands;
- required non-persistent provider controls;
- modern MCP `2026-07-28` with no legacy fallback;
- one strict MCP discovery/list/call canary through the loopback HTTP endpoint;
- one live second input;
- provider result parsing;
- platform-supervisor cleanup with no leftover Attempt workspace/process;
- token redaction and revocation.

Readiness is a projection/cache. It is not stored as a new database state.
Removing a required modern opt-in, changing a CLI version, logging out, losing
the Runner, or failing the process supervisor makes admission unavailable.

## 17. Deployment and rotation

The existing GitHub Actions Office release remains the only deployment
entrypoint.

1. Add a versioned `apps/agent-runner` artifact and runtime-contract manifest
   to the existing immutable Office deployment bundle.
2. Extend the existing Office apply/rollback transaction to stop the scheduled
   Runner task, atomically replace its artifact, update/verify the Task
   Scheduler definition, and restart it.
3. Install the exact resolved Codex/Claude train on the host under the
   dedicated Runner account. The runtime contract and readiness reject drift.
4. Remove Codex/Claude packages and provider login volume ownership from the
   API image and Compose `cli-login` profile.
5. Mount the Runner bearer token into Nest as a Docker secret. Store the host
   copy in the protected Runner configuration root.
6. Publish the API container's internal runtime route on host loopback only and
   explicitly deny the route through Office nginx.
7. Keep API/worker/web image digest and `release/office` protections intact.

Runner-token rotation is a short planned outage: stop admission and Runner,
replace the protected host token and Docker secret, restart the deployment,
and require full readiness. Attempt tokens are never rotated; they expire or
are revoked with their Attempt.

## 18. macOS development and verification

Local implementation may be completed on macOS. The macOS Runner is a real
supported platform, not a fake Windows mode.

Required macOS tests:

- strict Runner/control schemas and unknown-key rejection;
- runner bearer authentication, rotation fixture, redaction, and one-runner
  admission;
- strict launch-spec generation and raw command/path/env rejection;
- same-Attempt replay and changed-spec conflict;
- actual detached process-group start/input/interrupt/timeout/cleanup;
- real loopback Runner channel and modern HTTP MCP request path;
- exact 11 MCP tools, strict input/output, bounded canonical result;
- Attempt token digest, binding, TTL, terminal invalidation, and API-restart
  invalidation;
- provider fixture processes for Codex app-server and Claude stream-json
  behavior;
- optional authenticated real-CLI canary when the developer's selected login
  profile and explicit models are available;
- complete Agent OS, scanner, build, and Nest boot gates.

Windows-specific verification runs in GitHub `windows-latest`:

- PowerShell/.NET Job Object launcher build/parse;
- child and grandchild termination on interrupt, Runner pipe close, and helper
  crash;
- private-directory and token-file ACL assertions;
- exact Windows CLI command/path quoting;
- Runner startup and Task Scheduler definition contract;
- no LAN listener and no raw shell control surface.

Manual Office execution is not required to finish implementation when the
automated macOS and Windows CI gates pass. The first Office deployment still
must pass authenticated runtime readiness before business Attempts are
admitted.

## 19. Clean cutover from the interrupted MCP v2 diff

The interrupted worktree diff is preserved and reconciled rather than blindly
discarded.

Potentially reusable pieces:

- exact MCP v2 dependency train and code-owned runtime contract;
- Zod 4 MCP wire contracts;
- bounded MCP tool result envelope;
- Nest-owned 11-tool MCP server factory and focused tests;
- modern protocol scanner assertions that remain transport-independent.

Obsolete under this design:

- `attempt-mcp-stdio-to-uds` bridge;
- `AttemptMcpSocketServer` and Unix socket lifecycle;
- Linux `/proc` peer/process-group admission for MCP;
- `attempt-mcp-proxy` and any custom line/byte relay;
- API-owned Codex/Claude process spawning and process registry;
- container CLI packages, Docker login volume, and `cli-login` profile;
- Docker image CLI version assertions.

Replacement pieces:

- `apps/agent-runner` and shared control contracts;
- Nest Runner connection/client port;
- platform process supervisors;
- in-memory Attempt-token admission registry;
- modern-only MCP Streamable HTTP adapter;
- host-loopback Office route and nginx denial;
- Runner artifact/deployment/readiness tests.

The implementation must first add failing replacement contracts and scanners,
then remove obsolete code. It must not mix capability, lifecycle, schema, web,
or unrelated business-domain changes into the cutover.

## 20. Acceptance criteria

The host Runner migration is complete only when all of the following are true:

- Host Runner platforms are exactly `macos | windows`; Linux is rejected.
- Provider runtimes remain exactly `codex_cli | claude_cli` and are independent
  of platform.
- The API container does not install or spawn Codex/Claude and does not mount a
  provider login volume.
- No Runner inbound/LAN API exists; the Runner initiates one authenticated
  loopback control connection.
- Nest never sends raw commands, arbitrary arguments/env, or host paths.
- Windows processes use Job Object kill-on-close; macOS processes use exact
  process groups.
- Runner and Attempt tokens satisfy the approved storage, TTL, binding,
  rotation, revocation, and redaction contracts.
- Both providers use direct modern Streamable HTTP MCP `2026-07-28` with no
  stdio bridge, UDS, custom relay, or legacy fallback.
- Nest retains the exact 11 MCP tools and revalidates durable authority on every
  call.
- The 18 domain capabilities and all owner-domain ports remain unchanged.
- No provider credential bytes, session/history IDs, or MCP session state enter
  KidItem persistence.
- Task, Attempt, Approval, Invocation, Operation, owner idempotency, and basic
  restart behavior remain the approved durable sources of truth.
- No new Prisma model, lifecycle status, migration, backfill, or web state is
  introduced.
- macOS integration, Windows CI platform tests, Agent OS suites, scanners,
  builds, and Nest boot pass.
- Existing PR #479 is updated only after implementation and integrated Sol
  review; no new PR is opened.
