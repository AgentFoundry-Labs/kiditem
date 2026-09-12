# Agent Session Interaction Vertical Slice Implementation Plan

> Superseded (2026-08-23). Do not resume unchecked tasks. A new implementation
> plan will be derived from the
> [KID-25 Agent OS Clean Contraction Design](../specs/archive/2026-08-23-kid-25-agent-os-clean-contraction-design.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first complete CopilotKit conversation path in which the
panel remains read-only until send, the first AG-UI run creates one official
AgentSession, and users can resume the same thread, read scoped KidItem facts,
and use safe typed responses from both the global panel and `/agent-os`.

**Architecture:** A dedicated `apps/interaction-gateway` workspace owns
CopilotKit OSS Runtime v2 and the AG-UI protocol edge. It obtains a short-lived
run intent from Nest, authorizes the run against the session/event control plane
built in Foundation, and forwards only validated authorization to a Nest AG-UI
agent. KidItem PostgreSQL supplies history and replay; one reusable React v2
surface provides panel, reconnect, agent selection before first submit, typed
renderers, suggested replies, and verified navigation without a legacy or
vendor-side transcript store. Public KidItem references use the canonical
resource names defined by Foundation; the gateway treats CopilotKit thread/run
IDs as opaque external protocol identities.

**Tech Stack:** Node.js 22, TypeScript, CopilotKit Runtime/React Core `1.67.1`,
AG-UI client/core/encoder `0.0.57`, React 19, Next.js 16 App Router, NestJS 11,
Zod, RxJS, Vitest, Testing Library, Playwright

---

## File Responsibility Map

### Dependency train and gateway workspace

- `package.json` and `package-lock.json`: exact workspace-wide CopilotKit/AG-UI
  train and root build/dev scripts.
- `apps/interaction-gateway/AGENTS.md`: gateway ownership, identity, KidItem
  persistence boundary, and verification rules.
- `apps/interaction-gateway/package.json`: isolated runtime dependencies and
  scripts.
- `apps/interaction-gateway/tsconfig.json` and `tsconfig.build.json`: ESM build.
- `apps/interaction-gateway/src/config.ts`: fail-fast environment parsing.
- `apps/interaction-gateway/src/nest-control-client.ts`: narrow Nest HTTP
  client; never forwards browser scope headers.
- `apps/interaction-gateway/src/authorized-agent-os-http-agent.ts`: run intent,
  authorization, KidItem replay, atomic live join, and AG-UI forwarding.
- `apps/interaction-gateway/src/runtime.ts`: dynamic allowed-agent projection
  and CopilotRuntime v2.
- `apps/interaction-gateway/src/server.ts`: native CopilotKit handler plus
  liveness/readiness.

### AG-UI Operator and safe reads

- `apps/server/src/agent-os/application/port/in/agent-session-execution.port.ts`:
  official session execution/connect/stop use case, named independently of
  AG-UI/HTTP callers.
- `apps/server/src/agent-os/application/service/agent-session-execution.service.ts`:
  policy-checked tool/model loop that durably appends normalized conversation
  events before emitting AG-UI.
- `apps/server/src/agent-os/application/port/out/event/agent-conversation-live-publisher.port.ts`:
  non-authoritative event-pointer publish/subscribe contract.
- `apps/server/src/agent-os/adapter/out/event/in-process-agent-conversation-live-publisher.adapter.ts`:
  local low-latency notifier; correctness always falls back to PostgreSQL
  catch-up.
- `apps/server/src/agent-os/adapter/in/http/agent-agui.controller.ts`: SSE AG-UI
  route and stop route.
- `apps/server/src/analytics/dashboard/application/port/in/analytics-overview-read.port.ts`:
  owner-published business read use case shared by all incoming adapters.
- `apps/server/src/analytics/dashboard/adapter/in/agent/analytics-overview-agent.adapter.ts`:
  bounded Agent-facing translation into the read port and registration in
  `AgentCapabilityRegistry`.
- Refactor the existing sourcing Agent adapter to call its owner-published
  workspace-read input port; reuse only the two registered read handlers and
  do not add a parallel sourcing query implementation.

### Shared response vocabulary

- Create `packages/shared/src/agent-interaction/ui.ts` and `ui.spec.ts`:
  registered metric/resource/comparison/notice/navigation/suggestion tool
  result schemas.
- Modify `packages/shared/package.json` and `tsup.config.ts`: keep everything
  beneath `@kiditem/shared/agent-interaction`; do not add a root export.
- Consume `@kiditem/shared/identifiers` for canonical resource references and
  opaque presentation-action references; do not define local UUID aliases.

### Shared web surface

- `apps/web/src/components/agent-interaction/AgentInteractionProvider.tsx`:
  CopilotKit provider and same-origin runtime URL.
- `apps/web/src/components/agent-interaction/useInteractionBootstrap.ts`:
  validated read-only bootstrap and selected session/agent state.
- `apps/web/src/components/agent-interaction/useKidItemConversation.ts`:
  KidItem session history hydration, cursor replay, and live AG-UI join using
  public CopilotKit OSS hooks only.
- `apps/web/src/components/agent-interaction/AgentInteractionSurface.tsx`:
  shared headless conversation composition.
- `apps/web/src/components/agent-interaction/AgentInteractionPanel.tsx`:
  responsive right panel/full-screen sheet.
- `apps/web/src/components/agent-interaction/InteractionHeader.tsx`:
  agent, session, history, and connection state.
- `apps/web/src/components/agent-interaction/renderers.tsx`: registered typed
  UI, suggestions, and verified navigation.
- `apps/web/src/components/agent-interaction/dashboard-context.ts`: allowlisted
  route/resource/filter/summary projection.
- `apps/web/src/components/QuickActionFab.tsx`: add one AgentOS action to the
  existing fan; do not add another floating button.
- `apps/web/src/components/layout/AppLayout.tsx`: mount one provider/panel.
- `apps/web/src/app/agent-os/components/AgentOsInteractionWorkspace.tsx` and
  `page.tsx`: reuse the same selected session/thread, replacing the legacy
  Operator transcript panel in the workspace area.

## Task 1: Scaffold The OSS-Only Interaction Gateway

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `apps/interaction-gateway/AGENTS.md`
- Create: `apps/interaction-gateway/package.json`
- Create: `apps/interaction-gateway/tsconfig.json`
- Create: `apps/interaction-gateway/tsconfig.build.json`
- Create: `apps/interaction-gateway/src/__tests__/config.spec.ts`
- Create: `apps/interaction-gateway/src/config.ts`

- [ ] **Step 1: Write workspace and config RED tests**

Create a config test with no environment fallback:

```typescript
it('requires every production gateway value and telemetry opt-out', () => {
  expect(() => parseGatewayConfig({})).toThrow('INTERACTION_GATEWAY_PORT');
  expect(() => parseGatewayConfig({
    INTERACTION_GATEWAY_PORT: '4100',
    KIDITEM_API_INTERNAL_URL: 'http://api:4000',
    AGENT_OS_AGUI_INTERNAL_URL: 'http://api:4000/api/agent-os/ag-ui',
    INTERACTION_GATEWAY_SHARED_SECRET: 's'.repeat(32),
    COPILOTKIT_TELEMETRY_DISABLED: '0',
  })).toThrow('COPILOTKIT_TELEMETRY_DISABLED');

  expect(() => parseGatewayConfig({
    ...validGatewayEnvironment(),
    COPILOTKIT_ENTERPRISE_API_URL: 'https://intelligence.example.com',
  })).toThrow('Enterprise configuration is not supported');
});
```

Extend `check-copilotkit-train` tests so a gateway range, wrong version,
Enterprise environment key/import, `useThreads`, or direct
`CopilotKitIntelligence` construction fails. The legacy web
`@copilotkit/react-ui` import remains temporarily allowed until Task 7 deletes
its component in the same plan.

- [ ] **Step 2: Run and record RED**

```bash
npm test --workspace=apps/interaction-gateway -- src/__tests__/config.spec.ts
npm run test:scripts -- --runInBand
npm run check:copilotkit-train
```

Expected: missing workspace/config test fails. The train check stays GREEN for
the Foundation-normalized manifests and turns RED only when the fixture adds
an excluded Enterprise dependency.

- [ ] **Step 3: Create the exact-pinned workspace**

Use this manifest:

```json
{
  "name": "@kiditem/interaction-gateway",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@ag-ui/client": "0.0.57",
    "@ag-ui/core": "0.0.57",
    "@copilotkit/runtime": "1.67.1",
    "@kiditem/shared": "*",
    "rxjs": "^7.8.2",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.21.0",
    "typescript": "^5.0.0",
    "vitest": "^4.1.2"
  }
}
```

Foundation already pins root/server/web packages. Add only the new gateway
workspace, `dev:interaction-gateway`, and gateway build script, then run
`npm install --legacy-peer-deps`; do not hand-edit the lockfile. Legacy server
runtime and web UI dependencies remain until their guarded cutover tasks.

- [ ] **Step 4: Implement strict config parsing**

```typescript
const GatewayEnvironmentSchema = z.object({
  INTERACTION_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535),
  KIDITEM_API_INTERNAL_URL: z.string().url(),
  AGENT_OS_AGUI_INTERNAL_URL: z.string().url(),
  INTERACTION_GATEWAY_SHARED_SECRET: z.string().min(32),
  COPILOTKIT_TELEMETRY_DISABLED: z.literal('1'),
}).passthrough().superRefine(rejectExcludedCopilotKitProductKeys);
```

`parseGatewayConfig` explicitly rejects Enterprise/Premium key names, then maps
only the declared names to readonly camelCase properties. Unrelated container
environment variables are ignored. Tests may call it with an explicit record;
production calls it with `process.env`.

- [ ] **Step 5: Run train/config/build gates**

```bash
npm test --workspace=apps/interaction-gateway -- src/__tests__/config.spec.ts
npm run build --workspace=apps/interaction-gateway
npm run check:copilotkit-train
npm ls @copilotkit/runtime @copilotkit/react-core @ag-ui/client @ag-ui/core
```

Expected: PASS and one exact train only.

- [ ] **Step 6: Commit the workspace train**

```bash
git add package.json package-lock.json apps/interaction-gateway
git commit -m "feat: add interaction gateway workspace"
```

## Task 2: Authorize Gateway Runs And Keep Reconnect Read-Only

**Files:**

- Create: `apps/interaction-gateway/src/__tests__/runtime.spec.ts`
- Create: `apps/interaction-gateway/src/nest-control-client.ts`
- Create: `apps/interaction-gateway/src/authorized-agent-os-http-agent.ts`
- Create: `apps/interaction-gateway/src/runtime.ts`
- Create: `apps/interaction-gateway/src/server.ts`

- [ ] **Step 1: Write gateway RED tests**

Use real `AuthorizedAgentOsHttpAgent` with control/HttpAgent doubles and prove:

```typescript
it('authorizes before dispatch and forwards no browser scope headers', async () => {
  const calls: string[] = [];
  control.prepareRunIntent.mockImplementation(async () => {
    calls.push('intent');
    return runIntentFixture();
  });
  control.authorizeRun.mockImplementation(async () => {
    calls.push('authorize');
    return authorizationFixture();
  });
  vi.spyOn(HttpAgent.prototype, 'run').mockImplementation(() => {
    calls.push('dispatch');
    return of({ type: 'RUN_FINISHED' } as BaseEvent);
  });

  await lastValueFrom(agent.run(runInput()));
  expect(calls).toEqual(['intent', 'authorize', 'dispatch']);
  expect(control.forwardedBrowserHeaders()).toEqual({ cookie: 'kiditem_session=opaque' });
});

it('reconnects without preparing or authorizing an execution', async () => {
  const events = await collect(agent.connect(connectionInput({ cursor: 'opaque-cursor' })));
  expect(control.authorizeConnection).toHaveBeenCalledOnce();
  expect(control.prepareRunIntent).not.toHaveBeenCalled();
  expect(control.authorizeRun).not.toHaveBeenCalled();
  expect(events.map((event) => event.id)).toEqual(['event-4', 'event-5']);
});
```

Also prove intent failure/authorization failure stops dispatch, dynamic agent
discovery exposes only server-authorized agents, `identifyUser` uses only the
opaque principal HMAC, attacker scope headers are dropped, and readiness fails
closed when Nest authorization/replay or the private AG-UI endpoint is
unavailable. Add a race test that appends an event between replay-page read and
live subscription and still observes it exactly once.

- [ ] **Step 2: Run focused RED**

```bash
npm test --workspace=apps/interaction-gateway -- src/__tests__/runtime.spec.ts
```

Expected: FAIL because runtime/client/agent modules do not exist.

- [ ] **Step 3: Implement the narrow Nest control client**

The browser-facing discovery/intent calls forward only the existing session
cookie. Service calls add `x-kiditem-interaction-gateway`; never copy
`authorization`, `x-organization-id`, role, model, policy, or capability
headers.

```typescript
async prepareRunIntent(request: Request, input: PrepareRunInput) {
  return this.post(
    '/api/agent-os/interaction/runs/intent',
    input,
    this.browserHeaders(request),
    AguiRunIntentSchema,
  );
}

async authorizeRun(input: AuthorizeRunInput) {
  return this.post(
    '/api/agent-os/interaction/runs/authorize',
    input,
    this.serviceHeaders(),
    AguiRunAuthorizationSchema,
  );
}
```

`authorizeConnection` posts the opaque cursor and returns the validated bounded
`AgentConversationReplay` plus a server-issued live-join token. The gateway
never decodes a cursor or supplies a numeric sequence as authority.

Return stable gateway errors containing control status and code but never
secret/token content.

- [ ] **Step 4: Implement the authorized AG-UI adapter**

```typescript
run(input: RunAgentInput): Observable<BaseEvent> {
  const userEvent = normalizeSingleSubmittedUserEvent(input.messages);
  const dashboardContext = readDashboardContext(input.state);
  return defer(async () => {
    const intent = await this.dependencies.control.prepareRunIntent(
      this.dependencies.request,
      {
        agentDefinitionKey: this.dependencies.agentDefinitionKey,
        copilotThreadId: input.threadId,
        aguiRunId: input.runId,
        dashboardContext,
        userEvent,
      },
    );
    return this.dependencies.control.authorizeRun({
      runIntent: intent.runIntent,
      copilotThreadId: input.threadId,
      aguiRunId: input.runId,
      dashboardContext,
      userEvent,
    });
  }).pipe(switchMap((authorization) => super.run({
    ...input,
    forwardedProps: {
      ...input.forwardedProps,
      kiditemAuthorization: authorization,
    },
  })));
}
```

`connect` calls only connection authorization, translates the returned
KidItem event envelopes into the locked AG-UI schemas, completes replay through
the returned sequence, then joins the private live endpoint with the
short-lived signed join token. It rejects gaps, duplicates, wrong thread/run IDs, and
unknown schema versions. Dashboard context defaults to the strict empty
context and always passes `DashboardContextSchema`.

- [ ] **Step 5: Create dynamic runtime and health listener**

Build one OSS `CopilotRuntime` with dynamic allowed agents and `identifyUser`
returning only `principalKey`. Register only the public custom/remote-agent
extension surface; do not instantiate `CopilotKitIntelligence`, configure an
Enterprise URL/key, or call `useThreads`. Use the supported public CopilotKit
Node/Fetch handler to serve `/api/copilotkit`, `/info`, `/agent/:id/run`,
`/connect`, and `/stop/:threadId` without a second message protocol.

`GET /health/live` returns `{status:'ok'}`. `GET /health/ready` checks Nest
interaction health plus the private AG-UI route contract, returning 503 when
either fails.

- [ ] **Step 6: Run gateway GREEN and build**

```bash
npm test --workspace=apps/interaction-gateway -- src/__tests__/runtime.spec.ts
npm run build --workspace=apps/interaction-gateway
npm run check:copilotkit-train
```

Expected: all PASS. If exact `1.67.1` lacks a public required extension point,
stop under the platform-proof condition; do not patch private runtime internals.

- [ ] **Step 7: Commit the gateway runtime**

```bash
git add apps/interaction-gateway/src
git commit -m "feat: authorize copilotkit gateway runs"
```

## Task 3: Implement A Policy-Safe AG-UI Operator Loop

**Files:**

- Create: `apps/server/src/agent-os/application/port/in/agent-session-execution.port.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-execution.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-execution.service.ts`
- Create: `apps/server/src/agent-os/application/port/out/event/agent-conversation-live-publisher.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/event/in-process-agent-conversation-live-publisher.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/event/__tests__/in-process-agent-conversation-live-publisher.adapter.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-agui.controller.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-agui.controller.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`

- [ ] **Step 1: Write AG-UI service/controller RED tests**

Prove an authorized run:

```typescript
const events = await collect(service.run({
  authorization: authorizationFixture(),
  threadId: 'thread-1',
  runId: 'run-1',
  messages: [{ id: 'message-1', role: 'user', content: '재고 위험을 알려줘' }],
  state: { kiditemDashboardContext: dashboardContext },
}));

expect(events[0]).toMatchObject({ type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' });
expect(events.at(-1)).toMatchObject({ type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1' });
expect(policy.authorizeCapability).toHaveBeenCalledWith(expect.objectContaining({
  session: sessionName,
  execution: executionName,
}));
expect(calls.slice(0, 2)).toEqual([
  'persist:RUN_STARTED',
  'publish:RUN_STARTED',
]);
```

Add cases rejecting mismatched thread/run/session/agent/model/policy, browser
capability injection, a duplicated first user event, mutation capability
without approval, duplicate/out-of-order conversation events, duplicate
terminal events, provider-specific events, and stop affecting only the current
execution. Assert the controller uses `text/event-stream`, aborts the iterator
on disconnect without cancelling durable work, and maps failures to a persisted
normalized `RUN_ERROR` before terminal reconciliation. Add a read-only connect
test that streams stored events after the authorized sequence and then tails
new durable events without a gap. Prove a forged/omitted browser history array
cannot change model input: the runner loads prior user/assistant/tool turns from
the canonical repository and accepts only the current signed user event.

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-session-execution.service.spec.ts \
  src/agent-os/adapter/out/event/__tests__/in-process-agent-conversation-live-publisher.adapter.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-agui.controller.spec.ts
```

Expected: missing service/controller modules.

- [ ] **Step 3: Define the incoming port and normalized loop**

```typescript
export interface AgentSessionExecutionPort {
  run(input: AuthorizedAguiRunInput): AsyncIterable<BaseEvent>;
  stop(input: {
    organization: OrganizationName;
    session: AgentSessionName;
    execution: AgentExecutionName;
    copilotThreadId: CopilotThreadId;
  }): Promise<void>;
}
```

The service validates `AguiRunAuthorizationSchema`, checks thread/run and
session correlation, resolves only capability keys from the policy snapshot,
routes tool calls through `AgentCapabilityRegistry`, and passes the exact
server-resolved model/runtime plus the repository-derived bounded conversation
view to the registered runtime. The vertical slice fails explicitly at the
configured context bound; Plan 3 adds durable summary snapshots. It emits only official
AG-UI event schemas. Before yielding each event, it converts it to a version-1
KidItem conversation envelope and calls the repository's atomic
`appendExecutionEvent`; terminal append and execution reconciliation happen in
one transaction. It preserves sequence, marks terminal state once, records
usage, and never copies message text into task, usage, analytics, or audit
records. The initial user event already written by `authorizeExecution` is
verified by ID/hash and is not appended again. After commit, publish a
content-free `{organization,session,event,sequence}` resource-name pointer to the local
publisher; publisher failure does not roll back the event and the database
catch-up path remains authoritative.

For this vertical slice, permit only handlers with `sideEffects=['read']` and
`approvalRisk='none'`. A model request for any other handler emits a stable
policy error; Plan 3 later adds HITL for elevated handlers.

- [ ] **Step 4: Add the private AG-UI HTTP boundary**

Expose:

```text
POST /api/agent-os/ag-ui/:agentDefinitionKey
POST /api/agent-os/ag-ui/:agentDefinitionKey/connect
POST /api/agent-os/ag-ui/:agentDefinitionKey/stop
```

All require the gateway service guard. The run controller verifies the
forwarded authorization and agent route key, parses official AG-UI input, and
streams SSE. The connect route verifies a short-lived signed live-join token,
reads events strictly after its sequence, subscribes to the local durable-event
notifier, rereads after subscribing to close the race, then tails outbox-backed
events. A bounded database catch-up poll covers cross-replica notification
loss; neither polling nor connect writes control or conversation rows. The
controller never derives organization or capabilities from URL/body values.

- [ ] **Step 5: Reach service/controller/module GREEN**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-session-execution.service.spec.ts \
  src/agent-os/adapter/out/event/__tests__/in-process-agent-conversation-live-publisher.adapter.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-agui.controller.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
```

Expected: all PASS.

- [ ] **Step 6: Commit the AG-UI loop**

```bash
git add apps/server/src/agent-os/application/port/in/agent-session-execution.port.ts \
  apps/server/src/agent-os/application/service/agent-session-execution.service.ts \
  apps/server/src/agent-os/application/service/__tests__/agent-session-execution.service.spec.ts \
  apps/server/src/agent-os/adapter/in/http/agent-agui.controller.ts \
  apps/server/src/agent-os/adapter/in/http/__tests__/agent-agui.controller.spec.ts \
  apps/server/src/agent-os/agent-os.module.ts \
  apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts
git commit -m "feat: stream policy-safe agent sessions"
```

## Task 4: Publish Initial Organization-Scoped Read Capabilities

**Files:**

- Create: `apps/server/src/analytics/dashboard/application/port/in/analytics-overview-read.port.ts`
- Create: `apps/server/src/analytics/dashboard/adapter/in/agent/__tests__/analytics-overview-agent.adapter.spec.ts`
- Create: `apps/server/src/analytics/dashboard/adapter/in/agent/analytics-overview-agent.adapter.ts`
- Modify: `apps/server/src/analytics/dashboard/dashboard.module.ts`
- Modify: `apps/server/src/analytics/dashboard/__tests__/dashboard.module.wiring.spec.ts`
- Refactor: `apps/server/src/sourcing/adapter/in/agent/sourcing-workspace-agent.adapter.ts`
- Verify: `apps/server/src/sourcing/__tests__/sourcing-capabilities.spec.ts`
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Modify: `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`

- [ ] **Step 1: Write capability RED tests**

Define a bounded output independent of full dashboard response shapes:

```typescript
expect(await handler.execute(execution({ input: {} }))).toMatchObject({
  resourceType: 'analytics_overview',
  outputSummary: {
    sales: { revenue: 120000, orders: 8 },
    inventory: { outOfStockSkus: 3, mappingAttentionSkus: 2 },
    freshness: expect.any(Object),
  },
});
expect(handler.sideEffects).toEqual(['read']);
expect(handler.approvalRisk).toBe('none');
```

Assert organization ID is forwarded to every owner service, input accepts only
an optional allowlisted period, and output contains no raw row/customer/order
payload. Existing sourcing tests must prove only
`sourcing.retrieveWorkspaceEvidence` and
`sourcing.inspectRecommendationRun` enter this foundation profile.

- [ ] **Step 2: Run focused RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/analytics/dashboard/adapter/in/agent/__tests__/analytics-overview-agent.adapter.spec.ts \
  src/sourcing/__tests__/sourcing-capabilities.spec.ts \
  src/agent-os/domain/__tests__/agent-definition.registry.spec.ts
```

Expected: analytics adapter missing and Operator capability list mismatch.

- [ ] **Step 3: Implement the owner-published analytics port**

```typescript
export const ANALYTICS_OVERVIEW_READ_PORT = Symbol(
  'ANALYTICS_OVERVIEW_READ_PORT',
);

export interface AnalyticsOverviewReadPort {
  readOverview(input: {
    organizationId: OrganizationId;
    now: Date;
    period?: 'today' | 'month';
  }): Promise<AnalyticsOverview>;
}
```

The analytics owner implements this business read use case independently of
its callers. The Agent incoming adapter derives organization from trusted
invocation context, calls the read port, projects only normalized
totals/warnings/freshness, and registers `analytics.readOverview` with
`sideEffects=['read']` and `approvalRisk='none'`. It never imports AgentOS
application services. HTTP or Operations adapters may call the same input port
without routing through the Agent adapter.

- [ ] **Step 4: Set the immutable Operator profile**

The active Operator `AgentVersion`/registry contract declares exactly:

```typescript
[
  'agent_os.platform_probe',
  'analytics.readOverview',
  'sourcing.retrieveWorkspaceEvidence',
  'sourcing.inspectRecommendationRun',
]
```

Do not name the profile after a conversation class. Model and runtime remain
explicit, and missing configuration fails readiness.

- [ ] **Step 5: Run capability/module gates**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/analytics/dashboard/adapter/in/agent/__tests__/analytics-overview-agent.adapter.spec.ts \
  src/analytics/dashboard/__tests__/dashboard.module.wiring.spec.ts \
  src/sourcing/__tests__/sourcing-capabilities.spec.ts \
  src/agent-os/domain/__tests__/agent-definition.registry.spec.ts
npm run build --workspace=apps/server
npm run check:tenant-scope
```

Expected: all PASS.

- [ ] **Step 6: Commit safe reads**

```bash
git add apps/server/src/analytics/dashboard apps/server/src/agent-os/domain
git commit -m "feat: expose agent session read capabilities"
```

## Task 5: Define Registered Interaction UI Contracts

**Files:**

- Create: `packages/shared/src/agent-interaction/ui.spec.ts`
- Create: `packages/shared/src/agent-interaction/ui.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`

- [ ] **Step 1: Write schema RED tests**

Cover these discriminated results:

```typescript
const result = InteractionUiResultSchema.parse({
  kind: 'metric_group',
  title: '오늘 운영 요약',
  items: [
    { key: 'revenue', label: '매출', value: 120000, format: 'krw', trend: null },
  ],
  freshness: { observedAt: '2026-08-13T00:00:00.000Z', label: '오늘' },
});
expect(result.kind).toBe('metric_group');
```

Test `notice`, `resource_list`, `comparison`, `navigation`, and
`suggested_replies`; maximum three suggestions; route key/resource reference
instead of raw URL; no component/style/action authority; bounded labels/items;
strict top-level objects; and valid text fallback required for every tool
result.

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=packages/shared vitest -- run src/agent-interaction/ui.spec.ts
```

Expected: missing module.

- [ ] **Step 3: Implement the schemas**

```typescript
export const SuggestedRepliesResultSchema = z.object({
  kind: z.literal('suggested_replies'),
  messageId: AguiMessageIdSchema,
  replies: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(80),
    content: z.string().min(1).max(500),
  }).strict()).min(1).max(3),
  textFallback: z.string().min(1).max(2_000),
}).strict();

export const NavigationResultSchema = z.object({
  kind: z.literal('navigation'),
  actionRef: PresentationActionRefSchema,
  routeKey: z.enum([
    'dashboard',
    'agent_os',
    'sourcing_recommendations',
    'sourcing_candidate',
    'inventory_stock_ops',
  ]),
  resource: AllowedCanonicalResourceNameSchema.nullable(),
  label: z.string().min(1).max(80),
  disabledReason: z.string().min(1).max(200).nullable(),
  expiresAt: z.string().datetime(),
  textFallback: z.string().min(1).max(2_000),
}).strict();
```

`PresentationActionRefSchema` is a bounded opaque server-minted capability
reference with expiry; it is not a resource ID and has no UUID contract. Store
only its digest if the action must be persisted. Resource links use an
allowlisted canonical resource-name union, not raw database IDs. Union the full
vocabulary and infer types. Export it from the focused `agent-interaction`
subpath only.

- [ ] **Step 4: Run package gates**

```bash
npm exec --workspace=packages/shared vitest -- run \
  src/agent-interaction/index.spec.ts src/agent-interaction/ui.spec.ts
npm run build --workspace=packages/shared
npm run check:shared-root-imports
npm run check:shared-interface-names
```

Expected: all PASS.

- [ ] **Step 5: Commit UI contracts**

```bash
git add packages/shared/src/agent-interaction packages/shared/package.json \
  packages/shared/tsup.config.ts
git commit -m "feat: define interaction ui vocabulary"
```

## Task 6: Build One Reusable CopilotKit Session Surface

**Files:**

- Create: `apps/web/src/components/agent-interaction/__tests__/AgentInteractionSurface.spec.tsx`
- Create: `apps/web/src/components/agent-interaction/__tests__/useInteractionBootstrap.spec.tsx`
- Create: `apps/web/src/components/agent-interaction/__tests__/useKidItemConversation.spec.tsx`
- Create: `apps/web/src/components/agent-interaction/AgentInteractionProvider.tsx`
- Create: `apps/web/src/components/agent-interaction/useInteractionBootstrap.ts`
- Create: `apps/web/src/components/agent-interaction/useKidItemConversation.ts`
- Create: `apps/web/src/components/agent-interaction/AgentInteractionSurface.tsx`
- Create: `apps/web/src/components/agent-interaction/AgentInteractionPanel.tsx`
- Create: `apps/web/src/components/agent-interaction/InteractionHeader.tsx`
- Create: `apps/web/src/components/agent-interaction/interaction-store.ts`
- Modify: `apps/web/src/lib/query-keys.ts`

- [ ] **Step 1: Write surface/bootstrap RED tests**

Test this user flow:

```typescript
render(<AgentInteractionPanel defaultOpen />);
expect(await screen.findByRole('dialog', { name: 'AgentOS 대화' })).toBeVisible();
expect(apiClient.get).toHaveBeenCalledWith('/api/agent-os/interaction/bootstrap');
expect(apiClient.post).not.toHaveBeenCalled();

await user.click(screen.getByRole('button', { name: '새 대화' }));
expect(apiClient.post).not.toHaveBeenCalled();

await user.type(screen.getByRole('textbox', { name: '메시지' }), '오늘 재고 위험은?');
await user.click(screen.getByRole('button', { name: '전송' }));
expect(copilotRun).toHaveBeenCalledWith(expect.objectContaining({
  agentId: 'operator',
  threadId: expect.any(String),
}));
```

Also prove exactly one default agent, pre-submit agent selection, agent lock
after session creation, selected existing session reconnect, history/route
change/reload with no control POST, new conversation generating a different
thread, persisted replay before live events, duplicate replay/live boundary
suppression, desktop panel versus narrow full screen, and error state staying
on the same session.

- [ ] **Step 2: Run and record RED**

```bash
npm test --workspace=apps/web -- \
  src/components/agent-interaction/__tests__/useInteractionBootstrap.spec.tsx \
  src/components/agent-interaction/__tests__/useKidItemConversation.spec.tsx \
  src/components/agent-interaction/__tests__/AgentInteractionSurface.spec.tsx
```

Expected: missing modules.

- [ ] **Step 3: Implement validated bootstrap and local UI state**

`useInteractionBootstrap` calls `apiClient.get`, parses
`InteractionBootstrapSchema`, stores no server response in Zustand, and lets
React Query own freshness. Local state contains only open/closed, selected
agent before first submit, selected canonical session name/external thread,
and an unsent draft. The web app treats resource names as typed opaque values;
it never extracts UUID segments to make authorization or routing decisions.

Do not mint a KidItem database ID. For a new conversation, generate one
RFC4122 UUID with `crypto.randomUUID()` as the external AG-UI thread ID and
hold it only in component state until the first run. This UUID shape is an
external CopilotKit protocol requirement, not KidItem's resource-ID scheme.

- [ ] **Step 4: Bridge KidItem history into React v2 OSS primitives**

`AgentInteractionProvider` points to same-origin `/api/copilotkit` with
credentials included and provides allowlisted shared state.
`useKidItemConversation` uses the public React v2 `useAgent`/chat surface with
the selected agent and thread ID. Existing sessions come from the KidItem
bootstrap projection; connection events hydrate messages, tool activity,
state, and HITL through AG-UI before live events are accepted. Do not import
`useThreads`, `CopilotKitIntelligence`, or any Premium/Enterprise component.
Import v2 APIs only from the exact public `@copilotkit/react-core/v2` or
documented focused v2 subpaths verified by the train canary; do not reach into
package internals.
Do not keep a parallel Zustand/React message array; CopilotKit owns in-memory
render state and AgentOS owns durable history.

The header renders selected/primary agent, connection/run state, thread
history, and workspace link only after a session exists. There is no class
badge, expiry countdown, promotion card, or rotation state.

- [ ] **Step 5: Reach component GREEN and build**

```bash
npm test --workspace=apps/web -- \
  src/components/agent-interaction/__tests__/useInteractionBootstrap.spec.tsx \
  src/components/agent-interaction/__tests__/useKidItemConversation.spec.tsx \
  src/components/agent-interaction/__tests__/AgentInteractionSurface.spec.tsx
npm run build --workspace=apps/web
```

Expected: tests/build PASS.

- [ ] **Step 6: Commit the shared surface**

```bash
git add apps/web/src/components/agent-interaction apps/web/src/lib/query-keys.ts
git commit -m "feat: build session interaction surface"
```

## Task 7: Connect The Global Entry And AgentOS Workspace

**Files:**

- Modify: `apps/web/src/components/__tests__/QuickActionFab.spec.tsx`
- Modify: `apps/web/src/components/QuickActionFab.tsx`
- Modify: `apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Delete after replacement: `apps/web/src/components/layout/CopilotChat.tsx`
- Delete after replacement: `apps/web/src/components/layout/__tests__/CopilotChat.spec.tsx`
- Create: `apps/web/src/app/agent-os/components/AgentOsInteractionWorkspace.tsx`
- Modify: `apps/web/src/app/agent-os/__tests__/page.spec.tsx`
- Modify: `apps/web/src/app/agent-os/page.tsx`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/AGENTS.md`

- [ ] **Step 1: Write entry/workspace RED tests**

```typescript
expect(screen.getAllByTestId('quick-action-fab')).toHaveLength(1);
await user.click(screen.getByRole('button', { name: '퀵 메뉴 열기' }));
await user.click(screen.getByRole('button', { name: 'AgentOS 대화 열기' }));
expect(screen.getByRole('dialog', { name: 'AgentOS 대화' })).toBeVisible();
expect(screen.queryByRole('button', { name: /copilot/i })).not.toBeInTheDocument();
```

The `/agent-os` test selects a session in history and asserts the workspace and
global panel receive the same `threadId`; neither renders legacy
`OperatorChatPanel` messages or calls legacy chat APIs.

- [ ] **Step 2: Run and record RED**

```bash
npm test --workspace=apps/web -- \
  src/components/__tests__/QuickActionFab.spec.tsx \
  src/components/layout/__tests__/AppLayout.auth.spec.tsx \
  src/app/agent-os/__tests__/page.spec.tsx
```

Expected: AgentOS fan action/workspace integration absent.

- [ ] **Step 3: Replace the legacy layout chat mount**

Keep one `QuickActionFab`; add an `onAgentInteractionOpen` button action to its
existing fan. `AppLayout` mounts one lazy `AgentInteractionProvider` and panel
for authenticated non-editor surfaces. Remove hidden `.copilotKitButton`
clicking and the old `/api/chat/copilot` `CopilotSidebar` wrapper. Remove direct
`@copilotkit/react-ui` declarations from root/web and regenerate the lockfile;
the new surface uses only the locked OSS React v2 core APIs.

Update Next rewrite ownership:

```javascript
{
  source: '/api/copilotkit/:path*',
  destination: `${interactionGatewayBase}/api/copilotkit/:path*`,
}
```

`INTERACTION_GATEWAY_URL` is server-only with a local default allowed only for
development config; no browser-visible direct gateway URL.

- [ ] **Step 4: Reuse the surface in `/agent-os`**

Add `AgentOsInteractionWorkspace` using the same provider/store/session thread.
Replace only the conversation area; preserve AgentOS network, policy,
observability, and action-board ownership. Do not copy messages into page state.

- [ ] **Step 5: Run tests, build, and instruction hygiene**

```bash
npm test --workspace=apps/web -- \
  src/components/__tests__/QuickActionFab.spec.tsx \
  src/components/layout/__tests__/AppLayout.auth.spec.tsx \
  src/app/agent-os/__tests__/page.spec.tsx
npm run build --workspace=apps/web
npm run check:agents-hygiene
```

Expected: all PASS and only one global AI floating entry.

- [ ] **Step 6: Commit global integration**

```bash
git add apps/web/src/components/QuickActionFab.tsx \
  apps/web/src/components/__tests__/QuickActionFab.spec.tsx \
  apps/web/src/components/layout apps/web/src/app/agent-os \
  apps/web/next.config.mjs apps/web/AGENTS.md apps/web/package.json \
  package.json package-lock.json
git commit -m "feat: connect global agent session ui"
```

## Task 8: Register Typed Renderers, Suggestions, Navigation, And Context

**Files:**

- Create: `apps/web/src/components/agent-interaction/__tests__/renderers.spec.tsx`
- Create: `apps/web/src/components/agent-interaction/__tests__/dashboard-context.spec.ts`
- Create: `apps/web/src/components/agent-interaction/renderers.tsx`
- Create: `apps/web/src/components/agent-interaction/dashboard-context.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-interaction-presentation.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-interaction-presentation.service.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-actions.controller.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-interaction-actions.controller.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

- [ ] **Step 1: Write renderer/action/context RED tests**

Prove:

- unknown tool kinds render text fallback, never dynamic components;
- suggested replies show at most three, are latest-message-only, and one click
  sends one user turn while consuming siblings;
- navigation submits only `actionRef`, refetches server authorization, and calls
  `router.push` with the returned allowlisted href;
- expired/inaccessible actions remain disabled with visible reason;
- dashboard context strips arbitrary DOM, hidden fields, raw URLs, org/role,
  secrets, and values beyond limits; and
- server projection rejects model-authored component names, styles, URLs,
  action IDs, unsafe resource refs, or missing text fallback.

- [ ] **Step 2: Run and record RED**

```bash
npm test --workspace=apps/web -- \
  src/components/agent-interaction/__tests__/renderers.spec.tsx \
  src/components/agent-interaction/__tests__/dashboard-context.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-interaction-presentation.service.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-interaction-actions.controller.spec.ts
```

Expected: missing modules.

- [ ] **Step 3: Implement server-minted presentation**

The presentation service validates tool results against
`InteractionUiResultSchema`, resolves route keys/resource names through an
allowlist, mints opaque action references with short expiry, and returns only
typed results. The action controller receives `actionRef`, derives actor/org
from the authenticated session, parses the expected canonical resource type,
revalidates resource access/version, and returns one allowlisted href.
Navigation never creates an AgentExecution or task.

- [ ] **Step 4: Implement registered web renderers**

Map the fixed discriminated union to static React components. Use semantic
tokens, Lucide icons, and existing formatting helpers. Never index a component
map with unchecked model text. Every renderer displays `textFallback` when
rich rendering cannot proceed.

- [ ] **Step 5: Run full typed-interaction gates**

```bash
npm test --workspace=apps/web -- \
  src/components/agent-interaction/__tests__/renderers.spec.tsx \
  src/components/agent-interaction/__tests__/dashboard-context.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-interaction-presentation.service.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-interaction-actions.controller.spec.ts
npm run build --workspace=apps/web
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
```

Expected: all PASS.

- [ ] **Step 6: Commit renderers and safe actions**

```bash
git add apps/web/src/components/agent-interaction \
  apps/server/src/agent-os/application/service/agent-interaction-presentation.service.ts \
  apps/server/src/agent-os/application/service/__tests__/agent-interaction-presentation.service.spec.ts \
  apps/server/src/agent-os/adapter/in/http/agent-interaction-actions.controller.ts \
  apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-actions.controller.spec.ts \
  apps/server/src/agent-os/agent-os.module.ts
git commit -m "feat: render safe interaction results"
```

## Task 9: Add Text-Free Analytics And End-To-End Acceptance

**Files:**

- Create: `apps/server/src/agent-os/application/port/out/event/interaction-product-analytics.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/event/interaction-product-analytics.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/event/__tests__/interaction-product-analytics.adapter.spec.ts`
- Create: `apps/web/e2e/agent-session-interaction.spec.ts`
- Create: `docs/runbooks/interaction-platform.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `apps/server/src/agent-os/AGENTS.md`

- [ ] **Step 1: Write analytics and browser acceptance RED tests**

Analytics events contain only:

```typescript
{
  event: 'interaction_run_finished',
  organizationHash: '8c1f1046219ddd216a023f792356ddf127fce372a6a36b47fe9ba1a9f371721d',
  sessionHash: 'a71b...',
  executionHash: 'c92d...',
  agentDefinitionKey: 'operator',
  surface: 'global_panel',
  durationMs: 1200,
  outcome: 'completed',
  rendererKinds: ['metric_group'],
}
```

The adapter test rejects message text, model output, resource names, raw IDs,
tokens, cookies, and dashboard payload. Analytics correlation uses dedicated
HMAC digests and is never accepted back as an operational resource identity.

Playwright covers: open panel → zero control writes; choose agent → zero
writes; first send → exactly one session/root/epoch/policy/execution/user-event
and outbox row; close and reload → persisted events replay in order with no
extra execution or write; second message → one extra execution/user event only;
new conversation/send → different session; failed dispatch → same session
retry; replay/live boundary → no missing or duplicate event; safe analytics
and sourcing tool render; suggestion exactly once; navigation authorized;
cross-org session unavailable; panel and workspace same thread.

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/event/__tests__/interaction-product-analytics.adapter.spec.ts
npx playwright test apps/web/e2e/agent-session-interaction.spec.ts
```

Expected: missing adapter/spec or failing unimplemented acceptance.

- [ ] **Step 3: Implement metadata-only analytics**

Define a narrow port and adapter that hashes organization identity with a
dedicated analytics HMAC, allowlists event names/properties, and rejects any
unknown key before emission. Analytics failure is non-authoritative and cannot
change run state.

- [ ] **Step 4: Complete the browser fixture and assertions**

Use a disposable PostgreSQL 17 database, real Interaction Gateway, and a fake
model/runtime adapter behind the Nest AG-UI port. Assert the canonical
`AgentConversationEvent` rows and rendered replay while redacting message text
from test diagnostics. No Enterprise service, project credential, or chart is
started.

- [ ] **Step 5: Run complete Plan 2 gates**

```bash
npm run check:copilotkit-train
npm run check:agent-interaction-lifecycle
npm run check:identifier-contracts
npm run build --workspace=packages/shared
npm run build --workspace=apps/interaction-gateway
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npm run check:idor
npm run check:tenant-scope
npm run check:conventions
npx playwright test apps/web/e2e/agent-session-interaction.spec.ts
```

Start Nest and gateway against disposable dependencies and confirm both
readiness endpoints, then stop them. Expected: all finite commands and browser
acceptance PASS.

- [ ] **Step 6: Update durable ownership docs**

Document CopilotKit OSS presentation ownership, AgentOS/PostgreSQL conversation
ownership, session-on-first-submit semantics, gateway identity boundary, one
global entry, shared panel/workspace surface, no direct frontend DB access,
environment variables, local verification, and replay/restore operations.
Remove current instructions that name `/api/chat/copilot` or Enterprise
Intelligence as the supported route/store.

- [ ] **Step 7: Commit vertical-slice acceptance**

```bash
git add apps/server/src/agent-os/application/port/out/event \
  apps/server/src/agent-os/adapter/out/event apps/web/e2e \
  docs/ARCHITECTURE.md docs/TESTING.md docs/runbooks/environment-variables.md \
  docs/runbooks/interaction-platform.md \
  apps/web/AGENTS.md apps/server/src/agent-os/AGENTS.md
git commit -m "feat: complete agent session interaction slice"
```

## Plan 2 Acceptance

- [ ] Opening, history, agent selection, empty new conversation, and reconnect
  perform zero AgentOS control writes.
- [ ] First submit creates one complete session graph, canonical user event,
  and outbox row; exact retry returns all of them.
- [ ] Same-thread continuation and new-thread session behavior are proven.
- [ ] Gateway, HTTP, AG-UI, UI resources, and analytics obey the identifier
  taxonomy: canonical resource names, opaque external IDs/action references,
  and HMAC-only analytics correlation.
- [ ] Only policy-approved read handlers execute in this slice.
- [ ] Agent capability adapters call owner input ports; no Operations path or
  HTTP adapter calls the Agent capability registry as a business API.
- [ ] CopilotKit OSS renders every user-visible message/event while the one
  durable copy lives in `AgentConversationEvent`; no legacy or vendor-side
  transcript remains.
- [ ] Global panel and `/agent-os` render the same selected session thread.
- [ ] Typed UI, suggestions, and navigation remain server-validated and
  stale-safe.
- [ ] Exact dependency, server, gateway, web, tenant, convention, browser, and
  boot gates pass.
