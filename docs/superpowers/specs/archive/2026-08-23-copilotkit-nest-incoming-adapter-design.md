# CopilotKit Nest Incoming Adapter Contraction Design

> Superseded in full (2026-08-23). The Nest adapter conclusion remains, but
> conversation replay and the old execution graph do not. Use the
> [KID-25 Agent OS Clean Contraction Design](2026-08-23-kid-25-agent-os-clean-contraction-design.md).

Status: approved on 2026-08-23

This design supersedes every separate-process Interaction Gateway decision in
`2026-08-13-ai-chat-interactive-response-design.md` and the corresponding
deployment portions of the Interaction OS implementation plans. CopilotKit OSS
remains the browser/runtime protocol adapter. It no longer owns an independently
deployed KidItem application or an internal HTTP control plane.

## Goal

Serve the existing same-origin `/api/copilotkit` contract directly from the
Nest API process while preserving PostgreSQL conversation durability,
organization and user authorization, AG-UI compatibility, exact session and
execution fencing, and the isolated Codex/Claude MCP child boundary.

## Why The Boundary Changes

The separate `apps/interaction-gateway` process has no demonstrated independent
scaling, failure-isolation, release-cadence, or infrastructure requirement. The
Office image workflow builds API and Web only; Office Compose and nginx do not
deploy or route a gateway service; and the gateway has no production Docker
image. At the same time the Nest server already depends directly on
`@copilotkit/runtime`.

The separate process therefore adds an unshipped internal protocol rather than
isolating a deployable subsystem. It duplicates replay projection, turns one
authenticated run authorization into a short-lived token exchange, adds a
health proxy and process-local active map that are not authoritative, and makes
the browser depend on a deployment target that does not exist.

## Scope

### In scope

- Move the browser-facing CopilotKit Runtime v2 endpoint into a Nest incoming
  adapter under Agent OS.
- Keep the public browser contract at same-origin `/api/copilotkit`.
- Call Agent OS application input ports directly in process for bootstrap,
  run authorization and start, reconnect, replay/live join, stop, approvals,
  and runtime status.
- Produce replay and live AG-UI events through one Nest-owned projection path.
- Delete the standalone gateway workspace, its private HTTP client/server
  protocol, its health proxy, and its process-local active-run authority.
- Remove secrets, environment variables, guards, DTOs, tests, and runbooks that
  exist only to authenticate or coordinate the removed process boundary.
- Preserve the exact CopilotKit/AG-UI package train and upstream review lock.
- Update browser, smoke, startup, release, architecture, and environment
  contracts to the single API process.

### Out of scope

- Changing the PostgreSQL AgentSession or AgentConversationEvent ownership
  model.
- Replacing CopilotKit OSS or AG-UI.
- Moving durable task execution out of Operations workers.
- Combining Codex/Claude MCP children with the browser adapter.
- Storing or forwarding Codex/Claude provider credentials. Their native CLIs
  continue to use the dedicated OS service account's existing login state.
- Adding automatic retention, legal hold, a managed transcript provider, or a
  second conversation store.
- Adding a new production service, queue, cache, or database table.

## Target Architecture

```text
Browser CopilotKitProvider
  -> same-origin /api/copilotkit
  -> Nest session authentication + organization scope
  -> Agent OS CopilotKit incoming adapter
       -> interaction authorization transaction
       -> AgentSession / AgentConversationEvent PostgreSQL ledger
       -> one replay + live AG-UI projector
       -> AgentSession runtime/task/approval input ports
  -> Operations-owned durable task execution
       -> isolated Codex or Claude CLI
       -> exact run-scoped MCP child
```

The incoming adapter translates between CopilotKit Runtime v2 callbacks and
Agent OS input ports. It does not own sessions, runs, replay cursors, live
state, task state, or business writes. All authoritative state remains in
PostgreSQL or the existing Operations execution envelope.

## Nest Composition

Create an API-only `AgentOsInteractionHttpModule` or equivalently focused
incoming-adapter module. It may import the controller-free Agent OS session and
API-execution seams required for interaction, but it must not leak browser
controllers into worker or MCP roots.

The module owns:

- the `/api/copilotkit` HTTP entry and all CopilotKit subpaths;
- conversion between Express/Nest requests and the public CopilotKit runtime
  handler;
- the CopilotKit `AgentRunner` implementation backed by Agent OS input ports;
- request-bound authenticated organization and user context;
- AG-UI event serialization at the final HTTP boundary.

The module does not own:

- an internal service credential;
- an HTTP client back into the same Nest process;
- a process-local map used as execution authority;
- replay pagination or canonical-event validation already owned by Agent OS;
- a second health endpoint that proxies API health.

If CopilotKit's callback API requires request context that is not present in a
callback argument, construct the runner/handler per request with an immutable
authenticated principal closure. Do not retain cross-request principal state.
Use AsyncLocalStorage only if the public CopilotKit API makes a request-bound
closure impossible, and then cover cross-request isolation explicitly.

## Authentication And Authorization

The browser request uses the normal KidItem session authentication and active
organization membership. DTOs never accept organization or user identity.

### Run

The current user, organization, agent definition, Copilot thread ID, AG-UI run
ID, dashboard context, and user event enter one Agent OS application call. The
existing transaction validates authority and persists the exact official
session/run graph without issuing a token that is immediately returned to the
same process for verification.

The removed 30-second run-intent token is not replaced by another internal
token. Idempotency, exact run identity, lifecycle state, policy snapshot, and
Operation attempt fencing remain durable database constraints.

### Connect and replay

The current user and organization authorize the requested thread directly.
The service computes the replay boundary and opens live events without a
gateway-issued live-join credential. A client-supplied sequence or cursor is an
untrusted position hint only; authorization and session scope are revalidated
before any event is returned. Tampering returns the same non-enumerating denial
as an inaccessible thread.

### Stop and approval

Stop and approval requests use the same authenticated principal and exact
canonical session/execution/approval resource names. They call the existing
Agent OS input ports directly. They do not trust a gateway active map or a
service-to-service header.

## Removed Secret And Analytics Surface

Remove these requirements from API boot and Office configuration:

- `INTERACTION_GATEWAY_SHARED_SECRET`;
- `INTERACTION_PRINCIPAL_HMAC_KEY`;
- `INTERACTION_RUN_INTENT_HMAC_KEY`;
- `INTERACTION_REPLAY_CURSOR_HMAC_KEY`;
- `INTERACTION_ANALYTICS_HMAC_KEY`.

Remove the matching tokens, codecs, guards, internal headers, rotation
instructions, and tests. Normal browser session security, organization
authorization, CSRF/same-origin policy, durable idempotency, and exact resource
fences remain required.

The unused interaction product-analytics adapter and event emission are
deleted rather than replaced. Product analytics may return only through a
separate design with an actual consumer and data contract.

## Replay And Live Projection

`AgentConversationEvent` is the only canonical event log. Nest owns one
projection from canonical events to AG-UI events and uses it for both replay
and live delivery. The CopilotKit adapter serializes those projected events but
does not reinterpret complete messages, synthesize a second cursor, or
revalidate up to a second independent pagination limit.

Replay follows this sequence:

1. authenticate the browser request;
2. authorize organization, user, agent definition, and thread;
3. read canonical events after the validated sequence boundary;
4. project each event exactly once through the Nest projector;
5. subscribe to live projected events at the server-selected boundary;
6. stream replay then live events without a gap or duplicate sequence.

Reconnect remains read-only. A fresh, never-authorized thread returns an empty
connection without revealing another organization's existence.

## Web And Deployment

The Web app continues to use `/api/copilotkit`. Its rewrite targets the Nest API
base, not `INTERACTION_GATEWAY_URL`. Production may route the entire `/api`
prefix to Nest through the existing nginx/API boundary.

Delete:

- `apps/interaction-gateway` and its workspace entry;
- gateway dev/build scripts and package-lock workspace node;
- gateway-only smoke process startup;
- gateway health/readiness checks;
- gateway URL/port/internal URL environment variables;
- gateway-specific deployment and runbook ownership.

Keep the exact CopilotKit package train check. Relocate any durable upstream
fork/version lock from a gateway-named directory to a CopilotKit-owned path and
update its script inventory and CI references. No third runtime image or
service is introduced.

## Failure Handling

- Unauthenticated requests return the existing `auth_required` contract.
- Missing active organization returns the existing non-enumerating
  organization-context error.
- Invalid or inaccessible thread/run/resource coordinates reveal no resource
  existence.
- PostgreSQL authorization or append failures fail the request; the adapter
  does not cache an alternate success state.
- A disconnected browser cancels only the HTTP stream. It does not erase the
  durable run unless the explicit stop contract is invoked.
- API restart reconstructs replay and run state from PostgreSQL and Operations;
  there is no gateway state to restore.
- CopilotKit adapter failure cannot bypass durable session or Operation
  terminalization.

## Contraction Order

Because KID-25 has not served production traffic, there is no compatibility
window or dual route.

1. Add failing composition and HTTP tests for a Nest-owned `/api/copilotkit`
   route and direct input-port calls.
2. Move the CopilotKit runner/handler and the single AG-UI projection boundary
   into Agent OS incoming adapters.
3. Switch Web and browser smoke tests to the real Nest endpoint.
4. Delete the gateway HTTP client, private control/AG-UI endpoints, guards,
   tokens, HMAC codecs, analytics adapter, and environment requirements.
5. Delete the gateway workspace and update package/deployment/script
   inventories.
6. Run source-absence, module-root, browser, restart, replay/live, approval,
   stop, and build gates.

There is no database migration or backfill. Any schema change proposed during
implementation is a stop condition requiring a separate design amendment.

## Verification

### Focused behavior

- `/api/copilotkit/info`, run, connect, status, stop, and approval use the
  authenticated Nest request and call direct Agent OS ports.
- Cross-user and cross-organization requests return non-enumerating responses.
- Run authorization persists one exact graph without a run-intent token.
- Replay plus live produces one ordered AG-UI sequence with no duplicate
  projector behavior.
- A complete message has one canonical START/CONTENT/END representation.
- API restart reconstructs connection state without gateway memory.
- Stop reaches the exact active execution; approval reaches the exact stored
  approval predecessor.

### Composition and absence

- API root resolves the CopilotKit incoming adapter.
- Worker and MCP roots cannot resolve/import the adapter or interaction HTTP
  providers.
- No production source references the removed gateway service secret,
  run-intent/principal/replay/analytics HMAC tokens, `NestControlClient`,
  `x-kiditem-interaction-gateway`, or `INTERACTION_GATEWAY_URL`.
- `apps/interaction-gateway` is absent.
- CopilotKit package train and upstream lock checks still pass.

### End to end

- Browser same-origin CopilotKit run, reconnect, replay/live, stop, approval,
  and complete AgentSession deletion pass through the actual Nest API root.
- API-only restart recovery passes with no gateway process.
- Server, Web, shared packages, scanners, and Office smoke build from one SHA.
- Process audit shows API/Web plus the existing worker topology only; no
  gateway listener or container exists.

## Acceptance

The contraction is accepted only when the standalone gateway and its private
control plane are absent, the browser's observable CopilotKit behavior passes
through Nest, authorization and durable replay remain intact, and Codex/Claude
MCP children and Operations workers retain their existing isolated durable
boundaries.
