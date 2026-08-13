# Quick Ask Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fast, chatbot-like Quick Ask experience backed by the selected AgentOS agent while proving it can read and navigate but never create official work or perform a mutation.

**Architecture:** The Operator is an immutable, explicitly modeled AgentOS version with a `quick_ask` authority snapshot containing only handlers whose side effects are exactly `read`. CopilotKit v2 renders the Enterprise Intelligence thread in one reusable interaction surface mounted as a desktop right panel or narrow full-screen view; the same surface is embedded in `/agent-os`. Server presentation projectors emit a small allowlisted set of typed UI tool events, while navigation and suggested replies remain client interactions with server-minted, stale-safe contracts.

**Tech Stack:** CopilotKit React Core v2 1.67.1, AG-UI 0.0.57, React/Next.js, NestJS, Zod, Prisma, existing AgentOS capability registry, existing analytics and sourcing domain services, Vitest, Testing Library, Playwright

## Global Constraints

- The global constraints in [the execution index](./2026-08-13-copilotkit-native-interaction-os-index.md) and accepted outputs of [the foundation plan](./2026-08-13-interaction-platform-foundation.md) are mandatory.
- Quick Ask creates `AgentInteractionThreadBinding`, `AgentPolicySnapshot`, and `AgentExecution` only; `AgentSession`, `AgentSessionTask`, delegation, approval, artifact work, and Operations runs remain absent.
- Only handlers with `sideEffects.length > 0` and every side effect equal to `read` are exposable; `external_io`, `db_write`, `external_write`, `browser`, `job_enqueue`, and empty side-effect declarations fail closed.
- Operator is the default; an allowed agent list comes only from the server. Changing the selected agent resumes that agent's active Quick Ask thread.
- One active thread exists per organization, user, and agent version; an expired thread is archived only when the next question creates a replacement.
- Browser context is normalized through `DashboardContextSchema`; unknown fields are stripped and never become authority.
- Generative UI uses only `kiditem.ui.*.v1` names registered in this plan.
- Metrics/resources/comparisons are projected from validated capability output, not trusted model-authored facts.
- Every card is preceded or followed by an assistant text summary that remains understandable without clicking an action.
- Navigation requires a server-minted action ID and click-time authorization; it creates no agent run, task, or mutation.
- Suggested replies have at most three values, appear only on the latest eligible response, and one click creates one normal user message.
- Copy, feedback, retry, and stop use CopilotKit utilities; there is no custom answer-expansion action.
- Product analytics stores event names, correlation IDs, agent version, surface, latency bucket, and action type only; it never stores prompt or response text.

---

## File Map

| Path | Responsibility |
|---|---|
| `packages/shared/src/agent-interaction/quick-ask.ts` | UI event, navigation, suggestion, and audit contracts |
| `apps/server/src/agent-os/application/service/quick-ask-authority.service.ts` | Read-only capability filter and policy snapshot |
| `apps/server/src/agent-os/application/service/quick-ask-run.service.ts` | Model/tool loop and AG-UI normalization without session creation |
| `apps/server/src/agent-os/application/service/agent-presentation-projector.service.ts` | Validated capability result → registered UI event |
| `apps/server/src/agent-os/application/service/interaction-navigation.service.ts` | Mint and redeem verified navigation actions |
| `apps/server/src/analytics/adapter/in/agent/analytics-overview-capability.adapter.ts` | Organization-scoped dashboard overview read capability |
| `apps/web/src/components/interaction-os/*` | Provider, surface, agent selector, renderers, suggestions, navigation |
| `apps/web/src/store/interaction-os-store.ts` | Panel visibility and selected agent key only |
| `apps/web/src/components/QuickActionFab.tsx` | Existing purple global entry with added AgentOS action |
| `apps/web/src/components/layout/AppLayout.tsx` | Provider/panel composition without DOM button clicking |
| `apps/web/src/app/agent-os/page.tsx` | Dedicated workspace consuming the same interaction surface |

## Task 1: Define Quick Ask Response And Action Contracts

**Files:**
- Create: `packages/shared/src/agent-interaction/quick-ask.ts`
- Create: `packages/shared/src/agent-interaction/quick-ask.spec.ts`
- Modify: `packages/shared/src/agent-interaction/index.ts`

**Interfaces:**
- Consumes: `CanonicalResourceRefSchema` and `InteractionClassSchema` from the foundation.
- Produces: `QuickAskUiEventSchema`, `SuggestedRepliesSchema`, `NavigationActionSchema`, `InteractionAnalyticsEventSchema`, and inferred types.

- [ ] **Step 1: Write failing cardinality and action tests**

```typescript
import { describe, expect, it } from 'vitest';
import { NavigationActionSchema, SuggestedRepliesSchema } from './quick-ask';

describe('Quick Ask UI contracts', () => {
  it('permits at most three unique suggestions', () => {
    expect(() => SuggestedRepliesSchema.parse({
      messageId: 'assistant-1',
      suggestions: ['A', 'B', 'C', 'D'],
    })).toThrow();
    expect(() => SuggestedRepliesSchema.parse({
      messageId: 'assistant-1',
      suggestions: ['A', 'A'],
    })).toThrow(/unique/);
  });

  it('requires an opaque server action instead of a route from the model', () => {
    expect(() => NavigationActionSchema.parse({ label: '열기', href: '/products/1' })).toThrow();
    expect(NavigationActionSchema.parse({
      actionId: 'nav_01K2', label: '상품 열기', resourceKind: 'product', expiresAt: '2026-08-13T10:00:00.000Z',
    })).not.toHaveProperty('href');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run packages/shared/src/agent-interaction/quick-ask.spec.ts`

Expected: FAIL because `quick-ask.ts` is missing.

- [ ] **Step 3: Implement exact UI schemas**

```typescript
import { z } from 'zod';
import { CanonicalResourceRefSchema } from './index';

const CitationSchema = z.object({
  label: z.string().min(1).max(120),
  resource: CanonicalResourceRefSchema,
  observedAt: z.string().datetime().nullable(),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
}).strict();

const NoticeSchema = z.object({
  tone: z.enum(['info', 'warning', 'data_gap']),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
}).strict();

const MetricSchema = z.object({
  key: z.string().min(1), label: z.string().min(1), value: z.union([z.string(), z.number()]),
  unit: z.string().max(20).nullable(), delta: z.number().nullable(),
}).strict();

export const NavigationActionSchema = z.object({
  actionId: z.string().startsWith('nav_'),
  label: z.string().min(1).max(80),
  resourceKind: z.string().min(1).max(50),
  expiresAt: z.string().datetime(),
}).strict();

export const SuggestedRepliesSchema = z.object({
  messageId: z.string().min(1),
  suggestions: z.array(z.string().trim().min(1).max(120)).max(3)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', message: 'suggestions must be unique' });
      }
    }),
}).strict();

export const MetricsUiEventSchema = z.object({
  name: z.literal('kiditem.ui.metrics.v1'),
  title: z.string().max(120),
  metrics: z.array(MetricSchema).min(1).max(8),
}).strict();

export const QuickAskUiEventSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('kiditem.ui.citations.v1'), citations: z.array(CitationSchema).max(10) }).strict(),
  z.object({ name: z.literal('kiditem.ui.notice.v1'), notice: NoticeSchema }).strict(),
  MetricsUiEventSchema,
  z.object({ name: z.literal('kiditem.ui.resources.v1'), title: z.string().max(120), resources: z.array(CanonicalResourceRefSchema).min(1).max(20), actions: z.array(NavigationActionSchema).max(20) }).strict(),
  z.object({ name: z.literal('kiditem.ui.comparison.v1'), title: z.string().max(120), columns: z.array(z.string()).min(2).max(6), rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).max(20) }).strict(),
  z.object({ name: z.literal('kiditem.ui.suggestions.v1'), payload: SuggestedRepliesSchema }).strict(),
]);

export const InteractionAnalyticsEventSchema = z.object({
  event: z.enum(['opened', 'question_sent', 'response_finished', 'suggestion_used', 'navigation_used', 'stopped', 'failed']),
  copilotThreadId: z.string().min(1),
  aguiRunId: z.string().min(1).nullable(),
  agentVersionId: z.string().min(1),
  surface: z.enum(['global_panel', 'agentos_workspace']),
  latencyBucket: z.enum(['lt_1s', '1_3s', '3_10s', 'gte_10s']).nullable(),
  actionType: z.enum(['suggestion', 'navigation', 'stop']).nullable(),
}).strict();
```

Export the schemas/types from the focused subpath only. Do not export UI component types from the shared package.

- [ ] **Step 4: Run contract gates**

Run:

```bash
npx vitest run packages/shared/src/agent-interaction/quick-ask.spec.ts
npm run build --workspace=packages/shared
```

Expected: tests and build pass.

- [ ] **Step 5: Commit the contracts**

```bash
git add packages/shared/src/agent-interaction
git commit -m "feat: define quick ask interaction contracts"
```

## Task 2: Create Immutable Operator Version And Read-Only Authority

**Files:**
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Create: `apps/server/src/agent-os/application/service/quick-ask-authority.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/quick-ask-authority.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-catalog.service.ts`
- Modify: `apps/server/src/agent-os/seed-agent-os.ts`
- Modify: `apps/server/src/agent-os/__tests__/seed-agent-os.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

**Interfaces:**
- Consumes: existing `AgentCapabilityRegistry`, Operator definition, `AgentVersion`, `AgentPolicySnapshot`.
- Produces: `QuickAskAuthorityService.resolve({ organizationId, agentVersionId }): QuickAskAuthority`; allowed handler invariant is `sideEffects.every(value => value === 'read') && sideEffects.length > 0`.

- [ ] **Step 1: Write fail-closed authority tests**

```typescript
describe('QuickAskAuthorityService', () => {
  it('keeps only declared local reads', async () => {
    const service = createServiceWithHandlers([
      handler('analytics.readOverview', ['read']),
      handler('sourcing.externalLookup', ['read', 'external_io']),
      handler('orders.cancel', ['db_write', 'external_write']),
      handler('unknown.empty', []),
    ]);
    const authority = await service.resolve({ organizationId: 'org-1', agentVersionId: 'version-1' });
    expect(authority.capabilityKeys).toEqual(['analytics.readOverview']);
  });

  it('throws when model selection is absent', async () => {
    await expect(createService({ modelIdentity: null }).resolve({
      organizationId: 'org-1', agentVersionId: 'version-1',
    })).rejects.toMatchObject({ code: 'AGENT_MODEL_NOT_CONFIGURED' });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/quick-ask-authority.service.spec.ts`

Expected: FAIL because `QuickAskAuthorityService` is missing.

- [ ] **Step 3: Implement authority resolution**

```typescript
export interface QuickAskAuthority {
  policySnapshotId: string;
  agentVersionId: string;
  runtimeType: string;
  modelIdentity: string;
  capabilityKeys: string[];
}

@Injectable()
export class QuickAskAuthorityService {
  async resolve(scope: { organizationId: string; agentVersionId: string }): Promise<QuickAskAuthority> {
    const version = await this.versions.requireActive(scope);
    if (!version.modelIdentity) throw new AgentOsError('AGENT_MODEL_NOT_CONFIGURED');
    if (!version.runtimeType) throw new AgentOsError('AGENT_RUNTIME_NOT_CONFIGURED');
    const capabilityKeys = version.capabilityKeys.filter((key) => {
      const handler = this.registry.resolve(key);
      return handler !== null && handler.sideEffects.length > 0 && handler.sideEffects.every((value) => value === 'read');
    }).sort();
    const snapshot = await this.policies.createSnapshot({
      organizationId: scope.organizationId,
      agentVersionId: version.id,
      authorityClass: 'quick_ask_read_only',
      capabilityKeys,
    });
    return { policySnapshotId: snapshot.id, agentVersionId: version.id, runtimeType: version.runtimeType, modelIdentity: version.modelIdentity, capabilityKeys };
  }
}
```

Seed one immutable Operator version from the code-owned Operator definition using the explicit `AGENT_OPERATOR_MODEL` value and configured runtime type. Remove the divergent `chat`/Chatbot definition from allowed discovery now, but leave its legacy rows for Plan 4 cleanup. Seed idempotency is `(agentDefinitionKey, version)` and changing prompt/policy/model requires a new integer version rather than updating an active row.

- [ ] **Step 4: Run authority and seed tests**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/quick-ask-authority.service.spec.ts apps/server/src/agent-os/__tests__/seed-agent-os.spec.ts
npm run check:tenant-scope
```

Expected: focused tests pass; model absence and non-read handlers fail closed; scope scanner exits 0.

- [ ] **Step 5: Commit authority policy**

```bash
git add apps/server/src/agent-os
git commit -m "feat: add read-only quick ask authority"
```

## Task 3: Add Organization-Scoped Analytics And Sourcing Reads

**Files:**
- Create: `apps/server/src/analytics/adapter/in/agent/analytics-overview-capability.adapter.ts`
- Create: `apps/server/src/analytics/adapter/in/agent/__tests__/analytics-overview-capability.adapter.spec.ts`
- Modify: `apps/server/src/analytics/analytics.module.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-workspace-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/__tests__/sourcing-workspace-capability.adapter.spec.ts`

**Interfaces:**
- Consumes: `StatisticsService.overview(organizationId, period?)`, existing sourcing workspace read capabilities, `AgentCapabilityRegistry`.
- Produces: `analytics.readOverview`, `sourcing.retrieveWorkspaceEvidence`, and `sourcing.inspectRecommendationRun` as the initial Operator Quick Ask read set.

- [ ] **Step 1: Write the analytics adapter test**

```typescript
describe('AnalyticsOverviewCapabilityAdapter', () => {
  it('passes repository scope only from execution input', async () => {
    const statistics = { overview: vi.fn().mockResolvedValue({ revenue: 120000, orders: 12 }) };
    const adapter = new AnalyticsOverviewCapabilityAdapter(statistics as never);
    const handler = adapter.handler();
    expect(handler.sideEffects).toEqual(['read']);
    await handler.execute({
      organizationId: 'org-1', agentInstanceId: 'agent-1', agentType: 'operator',
      input: { period: '2026-08' },
    });
    expect(statistics.overview).toHaveBeenCalledWith('org-1', '2026-08');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/analytics/adapter/in/agent/__tests__/analytics-overview-capability.adapter.spec.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement the analytics read handler**

```typescript
const inputSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() }).strict();
const outputSchema = z.object({
  revenue: z.number(), orders: z.number(), products: z.number().optional(), period: z.string().optional(),
}).passthrough();

handler(): AgentCapabilityHandler<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  return {
    key: 'analytics.readOverview', ownerDomain: 'analytics', executionKind: 'tool',
    inputSchema, outputSchema, sideEffects: ['read'], approvalRisk: 'none',
    idempotencyKey: () => null,
    execute: async ({ organizationId, input }) => ({
      outputSummary: outputSchema.parse(await this.statistics.overview(organizationId, input.period)),
    }),
  };
}
```

Register it through the analytics module's agent adapter boundary. Keep sourcing handlers unchanged if their exact side effects are already `['read']`; add regression assertions that both stay read-only. This is the declared cross-domain exception: AgentOS depends on capability interfaces/registrations, not analytics or sourcing repositories.

- [ ] **Step 4: Run cross-domain and authority tests**

Run:

```bash
npx vitest run apps/server/src/analytics/adapter/in/agent/__tests__/analytics-overview-capability.adapter.spec.ts apps/server/src/sourcing/adapter/in/agent/__tests__/sourcing-workspace-capability.adapter.spec.ts apps/server/src/agent-os/application/service/__tests__/quick-ask-authority.service.spec.ts
npm run check:directory-architecture
```

Expected: all tests pass and the architecture scanner permits only the capability registration boundary.

- [ ] **Step 5: Commit read capabilities**

```bash
git add apps/server/src/analytics apps/server/src/sourcing apps/server/src/agent-os
git commit -m "feat: expose quick ask read capabilities"
```

## Task 4: Implement The Quick Ask AG-UI Model And Tool Loop

**Files:**
- Create: `apps/server/src/agent-os/application/port/out/runtime/agent-runtime-adapter.port.ts`
- Create: `apps/server/src/agent-os/application/service/agent-runtime-adapter.registry.ts`
- Create: `apps/server/src/agent-os/application/service/quick-ask-run.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/quick-ask-run.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/openai-responses-operator-runtime.adapter.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-agui-run.service.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

**Interfaces:**
- Consumes: `QuickAskAuthority`, AG-UI `RunAgentInput`, read capability handlers, execution repository.
- Produces: canonical `AgentRuntimeAdapter`, `NormalizedRuntimeEvent`, and `QuickAskRunService.run(input): AsyncIterable<BaseEvent>`; Plan 3 extends the registry with durable adapters without changing this interface.

- [ ] **Step 1: Write tool and session exclusion tests**

```typescript
describe('QuickAskRunService', () => {
  it('executes an allowlisted read and streams normalized output', async () => {
    const service = createQuickAskService({
      runtimeEvents: [
        { sequence: 1, type: 'tool_request', callId: 'call-1', capabilityKey: 'analytics.readOverview', arguments: { period: '2026-08' } },
        { sequence: 2, type: 'text_delta', messageId: 'm1', delta: '매출은 12만원입니다.' },
        { sequence: 3, type: 'completed' },
      ],
    });
    const events = await collect(service.run(runInput()));
    expect(events.some((event) => event.type === 'TEXT_MESSAGE_CONTENT')).toBe(true);
    expect(service.sessions.create).not.toHaveBeenCalled();
    expect(service.operations.start).not.toHaveBeenCalled();
  });

  it('rejects a capability outside the policy snapshot', async () => {
    await expect(collect(createQuickAskService({ requestedCapability: 'orders.cancel' }).run(runInput())))
      .rejects.toMatchObject({ code: 'QUICK_ASK_CAPABILITY_DENIED' });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/quick-ask-run.service.spec.ts`

Expected: FAIL because `QuickAskRunService` and the runtime port are missing.

- [ ] **Step 3: Define the stable runtime contract**

```typescript
export interface RuntimeStartInput {
  correlation: AgentCorrelation;
  interactionClass: 'quick_ask' | 'official_task';
  modelIdentity: string;
  systemInstructions: string;
  messages: RunAgentInput['messages'];
  tools: Array<{ capabilityKey: string; description: string; inputSchema: Record<string, unknown> }>;
  context: DashboardContext;
}

export interface RuntimeHandle { runtimeType: string; externalRunId: string; reconnectTokenRef: string | null; }
export interface RuntimeDecision { interruptId: string; status: 'resolved' | 'cancelled'; payload: Record<string, unknown> | null; }
export interface RuntimeStatus { status: 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelled' | 'unknown'; lastEventSequence: number; }
export interface RuntimeCapabilities { detached: boolean; reconnect: boolean; interrupt: boolean; cancel: boolean; inspect: boolean; }
export type NormalizedRuntimeEvent = { sequence: number } & (
  | { type: 'text_delta'; messageId: string; delta: string }
  | { type: 'tool_request'; callId: string; capabilityKey: string; arguments: Record<string, unknown> }
  | { type: 'approval_request'; requestId: string; capabilityKey: string; arguments: Record<string, unknown> }
  | { type: 'artifact'; artifact: AgentCapabilityArtifactOutput }
  | { type: 'usage'; provider: string; modelIdentity: string; inputTokens: number; outputTokens: number; costMicros: bigint; currency: 'USD' }
  | { type: 'completed' }
  | { type: 'failed'; code: string; message: string }
);

export interface AgentRuntimeAdapter {
  readonly runtimeType: string;
  readonly capabilities: { detached: boolean; reconnect: boolean; interrupt: boolean; cancel: boolean; inspect: boolean };
  start(input: RuntimeStartInput): Promise<RuntimeHandle>;
  connect(handle: RuntimeHandle): AsyncIterable<NormalizedRuntimeEvent>;
  interrupt(handle: RuntimeHandle, decision: RuntimeDecision): Promise<void>;
  cancel(handle: RuntimeHandle): Promise<void>;
  inspect(handle: RuntimeHandle): Promise<RuntimeStatus>;
}

export interface QuickAskRunInput {
  principal: InteractionPrincipal;
  binding: ThreadBinding;
  agentInstanceId: string;
  agentDefinitionKey: string;
  runId: string;
  correlation: AgentCorrelation;
  messages: RunAgentInput['messages'];
  dashboardContext: DashboardContext;
}
```

- [ ] **Step 4: Implement the Quick Ask loop**

```typescript
async *run(input: QuickAskRunInput): AsyncIterable<BaseEvent> {
  const authority = await this.authority.resolve({
    organizationId: input.principal.organizationId,
    agentVersionId: input.binding.agentVersionId,
  });
  const adapter = this.runtimes.require(authority.runtimeType);
  const handle = await adapter.start(this.runtimeInput(input, authority));
  let expectedSequence = 1;
  for await (const event of adapter.connect(handle)) {
    if (event.sequence !== expectedSequence) {
      throw new AgentOsError('AGENT_RUNTIME_EVENT_ORDER_VIOLATION', {
        expectedSequence, receivedSequence: event.sequence,
      });
    }
    expectedSequence += 1;
    if (event.type === 'usage') {
      await this.executions.recordExecutionUsage({
        organizationId: input.principal.organizationId,
        executionId: input.correlation.executionId,
        modelIdentity: event.modelIdentity,
        provider: event.provider,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        costMicros: event.costMicros,
        currency: event.currency,
      });
      continue;
    }
    if (event.type === 'tool_request') {
      if (!authority.capabilityKeys.includes(event.capabilityKey)) {
        throw new AgentOsError('QUICK_ASK_CAPABILITY_DENIED');
      }
      const handler = this.capabilities.resolve(event.capabilityKey);
      if (!handler || handler.sideEffects.length === 0 || handler.sideEffects.some((effect) => effect !== 'read')) {
        throw new AgentOsError('QUICK_ASK_CAPABILITY_DENIED');
      }
      const parsed = handler.inputSchema.parse(event.arguments);
      const result = await handler.execute({
        organizationId: input.principal.organizationId,
        agentInstanceId: input.agentInstanceId,
        agentType: input.agentDefinitionKey,
        requestedByUserId: input.principal.userId,
        runId: input.runId,
        input: parsed,
      });
      yield* this.presentations.projectCapability(event.callId, handler, result);
      continue;
    }
    yield* this.aguiNormalizer.normalize(event, input.correlation);
  }
}
```

The adapter receives CopilotKit-provided message history per run but AgentOS never persists it. On stop, call `adapter.cancel(handle)`, terminalize only the current `AgentExecution`, and leave the thread active. Reject `approval_request`, artifact, delegation, or any official-only normalized event as `QUICK_ASK_RUNTIME_PROTOCOL_VIOLATION`.

- [ ] **Step 5: Run model-loop and AG-UI tests**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/quick-ask-run.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-agui-run.service.spec.ts
npm run dev:server
```

Expected: tests pass; server boots with one explicit Operator runtime/model and no fallback warning. Stop the watch process.

- [ ] **Step 6: Commit the Quick Ask runtime**

```bash
git add apps/server/src/agent-os
git commit -m "feat: stream quick ask through agentos"
```

## Task 5: Project Validated Results Into Registered UI Events

**Files:**
- Create: `apps/server/src/agent-os/application/service/agent-presentation-projector.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-presentation-projector.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/interaction-navigation.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/interaction-navigation.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-interaction-actions.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-actions.controller.spec.ts`
- Modify: `prisma/models/agents.prisma`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

**Interfaces:**
- Consumes: validated `AgentCapabilityExecutionResult`, canonical resource refs, current principal.
- Produces: `AgentPresentationProjector.projectCapability`, `InteractionNavigationService.mint`, and `POST /api/agent-os/interaction/actions/:actionId/redeem` returning `{ route: string }`.

- [ ] **Step 1: Write stale navigation and projection tests**

```typescript
describe('InteractionNavigationService', () => {
  it('reauthorizes current resource version without creating work', async () => {
    const service = createNavigationService({ currentVersion: '8' });
    const action = await service.mint({ organizationId: 'org-1', userId: 'user-1', resource: { kind: 'product', id: 'p1', version: '7' }, routeKey: 'product.detail' });
    await expect(service.redeem({ organizationId: 'org-1', userId: 'user-1', actionId: action.actionId }))
      .rejects.toMatchObject({ code: 'NAVIGATION_RESOURCE_STALE' });
    expect(service.sessions.create).not.toHaveBeenCalled();
    expect(service.operations.start).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/interaction-navigation.service.spec.ts`

Expected: FAIL because the service is missing.

- [ ] **Step 3: Add action persistence**

```prisma
model AgentInteractionAction {
  id             String   @id @default(uuid()) @db.Uuid
  publicId       String   @unique
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  threadBindingId String  @db.Uuid
  actionType     String
  resourceKind   String
  resourceId     String
  resourceVersion String?
  routeKey       String
  expiresAt      DateTime
  consumedAt     DateTime?
  createdAt      DateTime @default(now())

  @@index([organizationId, userId, expiresAt])
}
```

Use opaque `nav_` public IDs generated from cryptographic random bytes. Redeem in a transaction that selects by `{ publicId, organizationId, userId }`, rejects expiry/consumption, resolves `routeKey` through a hard-coded route registry, re-reads the resource through its domain port, verifies version/access, marks consumed, and returns the verified route. It must not call AgentOS sessions/tasks or Operations.

- [ ] **Step 4: Implement the presentation projector**

Map each capability key to an explicit projector. For example, `analytics.readOverview` emits `kiditem.ui.metrics.v1`; sourcing evidence emits citations/resources/notices. Unknown capabilities emit text summary only. Parse every event with `QuickAskUiEventSchema` before AG-UI serialization.

The run presenter must emit a plain-text explanation for the same validated result before or after the tool-call event. A projector cannot suppress text, and a navigation-only response is rejected by the presentation conformance test.

```typescript
async *projectCapability(callId: string, handler: AgentCapabilityHandler, result: AgentCapabilityExecutionResult) {
  const event = await this.projectors.require(handler.key).project(result);
  const parsed = QuickAskUiEventSchema.parse(event);
  yield { type: EventType.TOOL_CALL_START, toolCallId: callId, toolCallName: parsed.name };
  yield { type: EventType.TOOL_CALL_ARGS, toolCallId: callId, delta: JSON.stringify(parsed) };
  yield { type: EventType.TOOL_CALL_END, toolCallId: callId };
}
```

- [ ] **Step 5: Run schema, action, and projector gates**

Run:

```bash
npm run db:push
npx prisma generate
npx vitest run apps/server/src/agent-os/application/service/__tests__/interaction-navigation.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-presentation-projector.service.spec.ts apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-actions.controller.spec.ts
npm run check:tenant-scope
```

Expected: all tests pass; replayed/expired/cross-org/stale actions fail; tenancy scanner exits 0.

- [ ] **Step 6: Commit server presentation controls**

```bash
git add prisma apps/server/src/agent-os
git commit -m "feat: project verified quick ask actions"
```

## Task 6: Build The Reusable CopilotKit V2 Interaction Surface

**Files:**
- Create: `apps/web/src/components/interaction-os/AGENTS.md`
- Create: `apps/web/src/components/interaction-os/InteractionOsProvider.tsx`
- Create: `apps/web/src/components/interaction-os/InteractionSurface.tsx`
- Create: `apps/web/src/components/interaction-os/AgentSelector.tsx`
- Create: `apps/web/src/components/interaction-os/InteractionHeader.tsx`
- Create: `apps/web/src/components/interaction-os/InteractionPanel.tsx`
- Create: `apps/web/src/components/interaction-os/InteractionThreadDrawer.tsx`
- Create: `apps/web/src/components/interaction-os/interaction-bootstrap.ts`
- Create: `apps/web/src/components/interaction-os/__tests__/InteractionPanel.spec.tsx`
- Create: `apps/web/src/store/interaction-os-store.ts`
- Create: `apps/web/src/store/interaction-os-store.spec.ts`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Delete: `apps/web/src/components/layout/CopilotChat.tsx`
- Delete: `apps/web/src/components/layout/__tests__/CopilotChat.spec.tsx`

**Interfaces:**
- Consumes: `/api/copilotkit`, `GET /api/agent-os/interaction/bootstrap`, CopilotKit v2 `CopilotKit`, `CopilotChat`, `CopilotChatConfigurationProvider`, `CopilotThreadsDrawer`.
- Produces: `useInteractionOsStore`, `InteractionOsProvider`, and `InteractionSurface({ surface })`; one component renders both global and workspace surfaces.

- [ ] **Step 1: Write panel-state and provider tests**

```typescript
it('opens from explicit state without querying a hidden Copilot button', async () => {
  render(<InteractionPanelHarness />);
  await userEvent.click(screen.getByRole('button', { name: 'AI에게 묻기' }));
  expect(screen.getByRole('dialog', { name: 'AgentOS Quick Ask' })).toBeVisible();
  expect(document.querySelector('.copilotKitButton')).toBeNull();
  expect(mockBindQuickAsk).not.toHaveBeenCalled();
});

it('uses the same-origin v2 provider', () => {
  render(<InteractionOsProvider><div>child</div></InteractionOsProvider>);
  expect(mockCopilotKit).toHaveBeenCalledWith(expect.objectContaining({
    runtimeUrl: '/api/copilotkit',
    credentials: 'include',
    publicLicenseKey: 'test-public-license-key',
  }));
});

it('uses a lazy server target without binding until the first submitted run', async () => {
  mockBootstrap({
    defaultAgentDefinitionKey: 'operator',
    agents: [operatorAgent],
    threadTargets: [{
      agentDefinitionKey: 'operator', agentVersionId: 'version-1',
      copilotThreadId: '550e8400-e29b-41d4-a716-446655440000',
      hasExplicitThreadId: false, interactionClass: 'quick_ask', refreshAt: null,
    }],
  });
  render(<InteractionSurface surface="global_panel" />);
  expect(await screen.findByPlaceholderText('KidItem 데이터에 대해 빠르게 물어보세요')).toBeVisible();
  expect(mockCopilotChatConfigurationProvider).toHaveBeenCalledWith(expect.objectContaining({
    agentId: 'operator',
    threadId: '550e8400-e29b-41d4-a716-446655440000',
    hasExplicitThreadId: false,
  }));
  expect(mockBindQuickAsk).not.toHaveBeenCalled();
});

it('disables submit and refreshes bootstrap at the server idle boundary', async () => {
  vi.useFakeTimers();
  mockBootstrap(activeQuickAsk({ refreshAt: '2026-08-13T12:00:00.000Z' }));
  vi.setSystemTime(new Date('2026-08-13T11:59:59.900Z'));
  render(<InteractionSurface surface="global_panel" />);
  await vi.advanceTimersByTimeAsync(100);
  expect(screen.getByText('새 Quick Ask를 준비하고 있어요')).toBeVisible();
  expect(mockRefetchBootstrap).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: '메시지 보내기' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace=apps/web -- src/components/interaction-os/__tests__/InteractionPanel.spec.tsx`

Expected: FAIL because the interaction components do not exist.

- [ ] **Step 3: Implement minimal client state**

```typescript
interface InteractionOsState {
  panelOpen: boolean;
  selectedAgentKey: string;
  openPanel(): void;
  closePanel(): void;
  selectAgent(agentKey: string): void;
}

export const useInteractionOsStore = create<InteractionOsState>((set) => ({
  panelOpen: false,
  selectedAgentKey: 'operator',
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  selectAgent: (selectedAgentKey) => set({ selectedAgentKey }),
}));
```

Do not store thread messages, response cards, user/organization identity, capability policy, or approval state in Zustand/localStorage.

- [ ] **Step 4: Implement provider and shared surface**

```tsx
'use client';

import { CopilotKit } from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';

export function InteractionOsProvider({ children }: { children: React.ReactNode }) {
  const publicLicenseKey = process.env.NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY;
  if (!publicLicenseKey) throw new Error('NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY is required');
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      credentials="include"
      publicLicenseKey={publicLicenseKey}
      enableInspector={process.env.NODE_ENV === 'development'}
    >
      {children}
    </CopilotKit>
  );
}
```

```tsx
export function InteractionSurface({ surface }: { surface: 'global_panel' | 'agentos_workspace' }) {
  const { data: bootstrap, error } = useInteractionBootstrap();
  const selectedAgentKey = useInteractionOsStore((state) => state.selectedAgentKey);
  if (error) return <InteractionUnavailable error={error} />;
  if (!bootstrap) return <InteractionSkeleton />;
  const selectedAgent = bootstrap.agents.find((agent) => agent.agentDefinitionKey === selectedAgentKey)
    ?? bootstrap.agents.find((agent) => agent.agentDefinitionKey === bootstrap.defaultAgentDefinitionKey);
  const target = bootstrap.threadTargets.find(
    (candidate) => candidate.agentDefinitionKey === selectedAgent?.agentDefinitionKey,
  );
  if (!selectedAgent || !target) return <InteractionUnavailable error={new Error('INVALID_INTERACTION_BOOTSTRAP')} />;
  return (
    <CopilotChatConfigurationProvider
      agentId={selectedAgent.agentDefinitionKey}
      threadId={target.copilotThreadId}
      hasExplicitThreadId={target.hasExplicitThreadId}
    >
      <div data-surface={surface} className="grid h-full min-h-0 grid-cols-[auto_minmax(0,1fr)]">
        <InteractionThreadDrawer agentId={selectedAgent.agentDefinitionKey} />
        <div className="flex min-w-0 flex-col">
          <InteractionHeader interactionClass={target.interactionClass} selectedAgentKey={selectedAgent.agentDefinitionKey} />
          <InteractionRenderers />
          <CopilotChat labels={{ chatInputPlaceholder: 'KidItem 데이터에 대해 빠르게 물어보세요' }} />
        </div>
      </div>
    </CopilotChatConfigurationProvider>
  );
}
```

`useInteractionBootstrap` fetches the authenticated Nest endpoint with `credentials: 'include'`, validates `InteractionBootstrapSchema`, and keeps only request state in memory. For a current binding the target is explicit and CopilotKit connects/replays it through the read-only connection-authorization endpoint; for a new or four-hour-expired Quick Ask the server returns the stable HMAC-derived target with `hasExplicitThreadId: false`, so CopilotKit shows its welcome/composer but lazily persists on the first run. When a target has `refreshAt`, the hook schedules a server refetch at that instant, marks the target refreshing, and the chat view replaces the composer with a short loading state until a new validated target arrives. Opening, switching routes, mounting the workspace, loading history, or reconnecting performs no bind, execution, policy-snapshot, model, or Operations write. Concurrent tabs receive the same pending target; on the first run the gateway idempotently archives an expired Enterprise predecessor before Nest binds the replacement and creates its execution.

`InteractionThreadDrawer` wraps `CopilotThreadsDrawer` with Korean labels and no custom transcript storage. Its “새 대화” control is hidden for Quick Ask because the server owns the one-active-thread rule; archived threads remain history-only. `InteractionHeader` renders the server-derived conversation class, `AgentSelector`, thread-history control, connection state, and current run state; its official workspace link remains absent until an `AgentSession` exists. `AgentSelector` uses only bootstrap agents, ensures exactly one default, and switches only after the validated list confirms the key. Agent changes select that agent's returned target and Enterprise thread list; they never rewrite a current official thread. When `interactionClass` is `official_task`, Plan 3 locks the selector to the session's primary agent.

- [ ] **Step 5: Replace AppLayout DOM manipulation**

Mount `InteractionOsProvider` once around authenticated application surfaces. `Sidebar.onChatToggle` and panel close/open call Zustand actions directly. Desktop panel uses a fixed right sheet of `min(480px, 42vw)` and adjusts content right padding so the dashboard remains visible; below `768px` it is full-screen. Remove the dynamic import, `document.querySelector('.copilotKitButton')`, and old `CopilotChat` component.

- [ ] **Step 6: Run UI and build gates**

Run:

```bash
npm test --workspace=apps/web -- src/components/interaction-os/__tests__/InteractionPanel.spec.tsx src/store/interaction-os-store.spec.ts src/components/layout/__tests__/AppLayout.auth.spec.tsx
npm run build --workspace=apps/web
```

Expected: focused tests pass and Next build exits 0 with only `@copilotkit/react-core/v2` imports.

- [ ] **Step 7: Commit the shared interaction surface**

```bash
git add apps/web/src/components/interaction-os apps/web/src/store/interaction-os-store.ts apps/web/src/store/interaction-os-store.spec.ts apps/web/src/components/layout
git commit -m "feat: add reusable quick ask surface"
```

## Task 7: Make The Purple Quick Action The Only Global AI Entry

**Files:**
- Modify: `apps/web/src/components/QuickActionFab.tsx`
- Modify: `apps/web/src/components/__tests__/QuickActionFab.spec.tsx`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Modify: `apps/web/src/app/agent-os/page.tsx`
- Create: `apps/web/src/app/agent-os/__tests__/interaction-surface.spec.tsx`
- Delete: `apps/web/src/app/agent-os/components/AgentOsOperatorWorkspace.tsx`
- Delete: `apps/web/src/app/agent-os/components/OperatorChatPanel.tsx`
- Delete: `apps/web/src/app/agent-os/components/ConversationList.tsx`
- Delete: `apps/web/src/app/agent-os/lib/agent-os-chat-api.ts`

**Interfaces:**
- Consumes: `useInteractionOsStore.openPanel` and `InteractionSurface` from Task 6.
- Produces: `QuickActionFab({ onAgentOsOpen })`; `/agent-os` renders the exact shared surface and may keep non-conversation execution canvas/observability panels.

- [ ] **Step 1: Write entry and workspace reuse tests**

```tsx
it('keeps existing actions and adds one AI entry', async () => {
  const onAgentOsOpen = vi.fn();
  render(<QuickActionFab onAgentOsOpen={onAgentOsOpen} />);
  await userEvent.click(screen.getByRole('button', { name: '퀵 메뉴 열기' }));
  expect(screen.getByRole('link', { name: '상품 생성' })).toBeVisible();
  expect(screen.getByRole('link', { name: '상세페이지 생성' })).toBeVisible();
  expect(screen.getByRole('link', { name: '썸네일 생성' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'AI에게 묻기' }));
  expect(onAgentOsOpen).toHaveBeenCalledOnce();
});

it('renders the canonical interaction surface in AgentOS workspace', () => {
  render(<AgentOsPage />);
  expect(screen.getByTestId('interaction-surface')).toHaveAttribute('data-surface', 'agentos_workspace');
  expect(screen.queryByTestId('legacy-operator-chat')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace=apps/web -- src/components/__tests__/QuickActionFab.spec.tsx src/app/agent-os/__tests__/interaction-surface.spec.tsx`

Expected: FAIL because `onAgentOsOpen` and the shared workspace surface are absent.

- [ ] **Step 3: Add the fourth fan action without a second floating trigger**

Change the action type to a discriminated union and include one button:

```typescript
type QuickAction =
  | { kind: 'link'; label: string; href: string; Icon: typeof Package; angle: number }
  | { kind: 'button'; label: string; action: 'open_agent_os'; Icon: typeof Bot; angle: number };

const ACTIONS: QuickAction[] = [
  { kind: 'link', label: '상품 생성', href: '/product-pipeline/productgenerate', Icon: Package, angle: 120 },
  { kind: 'link', label: '상세페이지 생성', href: '/product-pipeline/detail-template-generation', Icon: FileText, angle: 160 },
  { kind: 'link', label: '썸네일 생성', href: '/product-pipeline/thumbnail-generation', Icon: ImageIcon, angle: 200 },
  { kind: 'button', label: 'AI에게 묻기', action: 'open_agent_os', Icon: Bot, angle: 240 },
];
```

Render links and buttons with identical visual geometry. The button closes the fan and calls `onAgentOsOpen`; it does not create a thread until the first message is sent. Do not render CopilotKit's own floating launcher.

- [ ] **Step 4: Reuse the interaction surface in `/agent-os`**

Replace only the workspace's conversation list/chat column with `<InteractionSurface surface="agentos_workspace" />`. Keep execution canvas, task observability, and non-conversation workspace controls required by Plan 3. Delete the polling API and duplicate conversation components; do not delete server legacy endpoints until Plan 4 scanner/cutover.

- [ ] **Step 5: Run entry, workspace, and build gates**

Run:

```bash
npm test --workspace=apps/web -- src/components/__tests__/QuickActionFab.spec.tsx src/app/agent-os/__tests__/interaction-surface.spec.tsx
npm run build --workspace=apps/web
```

Expected: tests/build pass; DOM contains one global floating purple root and no CopilotKit launcher.

- [ ] **Step 6: Commit the entry/workspace convergence**

```bash
git add apps/web/src/components/QuickActionFab.tsx apps/web/src/components/__tests__/QuickActionFab.spec.tsx apps/web/src/components/layout/AppLayout.tsx apps/web/src/app/agent-os
git commit -m "feat: converge ai entry on quick action"
```

## Task 8: Register Renderers, Suggestions, Navigation, And Safe Context

**Files:**
- Create: `apps/web/src/components/interaction-os/InteractionRenderers.tsx`
- Create: `apps/web/src/components/interaction-os/SuggestedRepliesCard.tsx`
- Create: `apps/web/src/components/interaction-os/VerifiedNavigationButton.tsx`
- Create: `apps/web/src/components/interaction-os/DashboardContextBridge.tsx`
- Create: `apps/web/src/components/interaction-os/__tests__/InteractionRenderers.spec.tsx`
- Create: `apps/web/src/components/interaction-os/__tests__/SuggestedRepliesCard.spec.tsx`
- Create: `apps/web/src/components/interaction-os/__tests__/DashboardContextBridge.spec.tsx`
- Create: `apps/web/src/lib/interaction-os-api.ts`
- Modify: `apps/web/src/components/interaction-os/InteractionSurface.tsx`

**Interfaces:**
- Consumes: Task 1 schemas; v2 `useRenderTool`, `useAgent`, `useCopilotKit`, and `useAgentContext`; navigation redeem endpoint.
- Produces: typed renderers for every Quick Ask UI name, exactly-once suggestion sending, verified navigation, and allowlisted context.

- [ ] **Step 1: Write suggestion/context tests**

```tsx
it('consumes sibling suggestions and creates one user turn', async () => {
  render(<SuggestedRepliesCard messageId="assistant-1" suggestions={['매출 추이', '재고 위험']} />);
  await userEvent.click(screen.getByRole('button', { name: '매출 추이' }));
  expect(mockAgent.addMessage).toHaveBeenCalledOnce();
  expect(mockCopilotkit.runAgent).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: '재고 위험' })).not.toBeInTheDocument();
});

it('publishes only normalized dashboard context', () => {
  render(<DashboardContextBridge raw={{
    routeKey: 'analytics.dashboard', visibleRowIds: ['p1'], locale: 'ko-KR', timezone: 'Asia/Seoul',
    organizationId: 'browser-org', permissions: ['admin'], secret: 'value',
  }} />);
  expect(mockUseAgentContext).toHaveBeenCalledWith(expect.objectContaining({
    value: expect.not.objectContaining({ organizationId: expect.anything(), permissions: expect.anything(), secret: expect.anything() }),
  }));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace=apps/web -- src/components/interaction-os/__tests__/SuggestedRepliesCard.spec.tsx src/components/interaction-os/__tests__/DashboardContextBridge.spec.tsx`

Expected: FAIL because the components are missing.

- [ ] **Step 3: Register renderer-only tools**

Use `useRenderTool` from `@copilotkit/react-core/v2` for `kiditem.ui.citations.v1`, `notice`, `metrics`, `resources`, `comparison`, and `suggestions`. Each renderer parses completed arguments with `QuickAskUiEventSchema`; streaming partial args show a skeleton and parse errors show a non-actionable data-gap notice. None has a frontend tool handler that can mutate business data.

```tsx
useRenderTool({
  name: 'kiditem.ui.metrics.v1',
  parameters: MetricsUiEventSchema,
  render: ({ args, status }) => status === 'complete'
    ? <MetricGroup title={args.title} metrics={args.metrics} />
    : <MetricGroupSkeleton />,
});
```

Register one wildcard renderer that displays unknown tool calls as a safe unsupported notice without executing them.

- [ ] **Step 4: Implement exactly-once suggestion sending**

```tsx
const [consumed, setConsumed] = useState(false);
const { agent } = useAgent();
const { copilotkit } = useCopilotKit();

const choose = async (text: string) => {
  if (consumed || agent.isRunning) return;
  setConsumed(true);
  agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
  await copilotkit.runAgent({ agent });
};
```

The renderer is eligible only when `messageId` belongs to the final message in `agent.messages` and that final message is the assistant response carrying the suggestions. Any later free-form user message therefore consumes/hides the whole sibling set before the next run starts. Older cards render no buttons. Keep consumption local to the mounted tool call because Enterprise Intelligence already owns the message/tool history.

- [ ] **Step 5: Implement verified navigation**

`VerifiedNavigationButton` POSTs the opaque action ID with credentials, accepts only a same-origin route returned by the API, then invokes `router.push(route)`. Treat 404/409/410 as stale and keep the chat open with a Korean retry notice. Do not ask the model to rerun and do not call `copilotkit.runAgent`.

```typescript
export async function redeemNavigation(actionId: string): Promise<string> {
  const response = await apiClient(`/api/agent-os/interaction/actions/${encodeURIComponent(actionId)}/redeem`, { method: 'POST' });
  const body = z.object({ route: z.string().startsWith('/') }).strict().parse(await response.json());
  return body.route;
}
```

- [ ] **Step 6: Normalize dashboard context**

Parse source state with `DashboardContextSchema` before passing it to `useAgentContext({ description: 'KidItem current dashboard context', value })`. Route components contribute canonical resource IDs and aggregates through a small context registry; never serialize full table rows, cookies, user identity, organization ID, role, permissions, or arbitrary URL/query values.

- [ ] **Step 7: Run renderer and UI build gates**

Run:

```bash
npm test --workspace=apps/web -- src/components/interaction-os/__tests__/InteractionRenderers.spec.tsx src/components/interaction-os/__tests__/SuggestedRepliesCard.spec.tsx src/components/interaction-os/__tests__/DashboardContextBridge.spec.tsx
npm run build --workspace=apps/web
```

Expected: tests and build pass; unknown/stale actions cannot execute; no answer-expansion control exists.

- [ ] **Step 8: Commit interaction grammar**

```bash
git add apps/web/src/components/interaction-os apps/web/src/lib/interaction-os-api.ts
git commit -m "feat: render typed quick ask responses"
```

## Task 9: Add Text-Free Analytics And End-To-End Acceptance

**Files:**
- Create: `apps/server/src/agent-os/application/port/out/analytics/interaction-product-analytics.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/analytics/interaction-product-analytics.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/analytics/__tests__/interaction-product-analytics.adapter.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/quick-ask.pg.integration.spec.ts`
- Create: `apps/web/e2e/interaction-os/quick-ask.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `docs/runbooks/interaction-platform.md`

**Interfaces:**
- Consumes: all Quick Ask server/web outputs.
- Produces: metadata-only `InteractionProductAnalyticsPort.track` and full Quick Ask acceptance evidence.

- [ ] **Step 1: Write analytics privacy test**

```typescript
it('rejects prompt or response fields at the analytics boundary', async () => {
  const adapter = createAnalyticsAdapter();
  await expect(adapter.track({
    event: 'response_finished', copilotThreadId: 'thread-1', aguiRunId: 'run-1',
    agentVersionId: 'version-1', surface: 'global_panel', latencyBucket: '1_3s', actionType: null,
    prompt: 'show secret sales',
  } as never)).rejects.toThrow(/unrecognized key/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/adapter/out/analytics/__tests__/interaction-product-analytics.adapter.spec.ts`

Expected: FAIL because the analytics port/adapter are missing.

- [ ] **Step 3: Implement strict metadata analytics**

Parse every event with `InteractionAnalyticsEventSchema.strict()`, hash the external thread ID before exporting metrics, preserve the internal execution correlation only in AgentOS audit, and emit no message/tool arguments. The analytics adapter may publish counters/traces but must not write a conversation table.

- [ ] **Step 4: Add server integration assertions**

The PostgreSQL integration test must send a Quick Ask through the AG-UI endpoint, execute `analytics.readOverview`, stop a second run, rotate a thread after the four-hour boundary, and query:

```typescript
expect(await prisma.operationRun.count({ where: { organizationId, engineType: 'agent_os' } })).toBe(0);
expect(await prisma.agentExecution.count({ where: { organizationId, interactionClass: 'quick_ask' } })).toBe(2);
expect(await prisma.agentExecution.count({ where: { organizationId, interactionClass: 'quick_ask', sessionId: { not: null } } })).toBe(0);
expect(await prisma.agentExecutionUsage.count({ where: { organizationId } })).toBeGreaterThanOrEqual(1);
expect(await prisma.agentInteractionThreadBinding.count({ where: { organizationId, lifecycle: 'archived' } })).toBe(1);
```

Also assert that all existing `AgentConversation`/`AgentMessage` counts are unchanged from their pre-test baseline.

- [ ] **Step 5: Add browser acceptance flow**

Playwright must verify:

1. the purple quick menu is the only floating AI entry;
2. clicking “AI에게 묻기” opens a right panel while dashboard content stays visible at desktop width;
3. Operator is selected by default;
4. before submit, network and database probes show bootstrap/info only and zero binding/execution/session/Operations writes;
5. one question calls prepare → optional archive → authorize → AG-UI in order, then streams text and a metric card;
6. close/reload/reopen resumes the same thread through connection authorization only, with the execution count unchanged;
7. a suggested reply creates one visible user message and consumes siblings;
8. navigation moves to a verified resource without adding a conversation turn;
9. agent switch shows that agent's thread list;
10. `/agent-os` shows the same thread/transcript;
11. stop ends only the active Quick Ask run;
12. no promotion, approval, delegation, mutation, or answer-expansion button is visible.

- [ ] **Step 6: Run complete Quick Ask gates**

Run:

```bash
npx vitest run apps/server/src/agent-os/adapter/out/analytics/__tests__/interaction-product-analytics.adapter.spec.ts
npm run test:integration --workspace=apps/server -- src/agent-os/__tests__/quick-ask.pg.integration.spec.ts
npm test --workspace=apps/web -- src/components/interaction-os
npx playwright test apps/web/e2e/interaction-os/quick-ask.spec.ts
npm run check:conversation-boundary
npm run check:copilotkit-train
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/web
npm run dev:server
```

Expected: all finite commands pass; Nest boots; Quick Ask evidence shows one canonical Enterprise thread, zero official sessions/tasks/Operations runs, no transcript delta in KidItem, and successful resume after reload.

- [ ] **Step 7: Commit Quick Ask acceptance**

```bash
git add apps/server/src/agent-os apps/web/e2e/interaction-os/quick-ask.spec.ts docs/runbooks/interaction-platform.md
git commit -m "test: prove quick ask interaction slice"
```

## Plan Acceptance Evidence

- [ ] Operator is default and every selectable agent comes from server discovery.
- [ ] Quick Ask feels like a normal chatbot: first message creates, text streams, history resumes, stop works, and the panel can be reopened quickly.
- [ ] Agent changes resume the selected agent's active Quick Ask instead of mutating another agent's thread.
- [ ] A four-hour-idle thread archives on the next ask and a replacement thread is created exactly once under concurrent tabs.
- [ ] Panel open/history/reconnect uses read-only connection authorization and leaves binding, execution, policy, model, and Operations counts unchanged.
- [ ] On rotation, Enterprise Intelligence archives the expired thread before replacement authorization; archive failure dispatches no AG-UI run.
- [ ] Read capability policy rejects every mutation/external/browser/job handler and rejects missing model/runtime selection.
- [ ] Text, citations/freshness/data-gap notices, metrics, resources, comparisons, suggestions, and verified navigation render through registered schemas.
- [ ] Suggested reply clicks create one normal visible user turn; navigation creates no turn/run/task.
- [ ] The same Enterprise thread appears in the global panel and `/agent-os` workspace.
- [ ] Desktop keeps dashboard visible, narrow layouts are full-screen, and the purple FAB remains the only floating entry.
- [ ] No `AgentSession`, `AgentSessionTask`, approval, delegation, artifact work, or Operations run is created.
- [ ] Analytics contains no prompt, response, tool argument, organization secret, or message text.
- [ ] There is no custom “더 자세히”/answer-expansion action.
