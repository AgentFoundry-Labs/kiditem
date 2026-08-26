# Agent OS Global Chat Panel and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one provider-native KidItem conversation available from every authenticated work screen, keep its live runtime stable across route changes, and add the approved Agent OS folder/history/settings UX without adding PostgreSQL conversation state.

**Architecture:** The authenticated Web app shell mounts exactly one CopilotKit provider, one conversation runtime host, and one right auxiliary panel whose visible state is `notifications | ai_chat | null`. Nest remains the authenticated same-origin facade. The native Agent Gateway remains the owner of provider conversation references, a serialized local descriptor catalog, provider deletion, and one strict installation-user preference file. Conversation creation uses a browser-reserved opaque ID and is idempotent at the Gateway owner boundary; presentation components never own a second runtime subscription.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, TanStack Query, CopilotKit 1.69.0 v2 hooks, Radix UI, NestJS, Zod, native Codex app-server, Claude CLI provider-local JSONL state, Vitest, Testing Library.

---

## Source of Truth and Fixed Scope

Implement this plan on top of the current KID-25 branch and the approved design:

- docs/superpowers/specs/2026-08-26-agent-os-chat-workspace-ux-design.md
- docs/superpowers/specs/2026-08-23-kid-25-agent-os-clean-contraction-design.md
- docs/superpowers/plans/2026-08-23-kid-25-agent-os-clean-contraction.md

The 2026-08-26 design controls this UX extension. The older KID-25 plan remains
the source for capability, approval, MCP, execution-binding, and Gateway
process contracts.

Execute the seven integrated Tasks below. Task 2 keeps its three tightly
coupled Gateway-owner phases together, and Task 6 keeps Agent OS history and
Settings/history management together. Preserve focused tests and commits inside
those phases; do not turn them back into separate Task-level review boundaries.
Task 7 is the single cross-process acceptance and browser-QA checkpoint.

Execution uses Terra(max) implementation workers with TDD, focused tests, and a
short implementer self-check for every Task. Use a separate Terra(max)
spec-compliance review only for Task 1, Task 2, and the first-send/runtime
contract of Task 4. After Task 3, run one Sol(max) Batch A review over Tasks
1-3. After Task 6, run one Sol(max) Batch B review over Tasks 4-6. Do not run a
Sol review for each individual Task.

After all deterministic gates and boot checks pass, run one mandatory Sol(max)
integrated review over the complete implementation. Fix every
Critical/Important finding with a failing regression test first. Every
re-review receives only the prior finding list and its fix diff; it must not
restart a broad codebase review. Task 7 browser QA begins only after that final
review is clean and remains the final completion gate.

The following decisions are fixed:

| Concern | Fixed decision |
|---|---|
| Conversation truth | Provider-native Codex thread or Claude session |
| KidItem durable conversation state | Gateway-local bounded descriptor only |
| Transcript persistence | Provider-owned; never copied into PostgreSQL or preferences |
| Conversation creation | Browser reserves one opaque ID; first Send creates |
| Create idempotency | Same ID plus same runtime/Agent/title replays; drift conflicts |
| Provider | Selectable in a draft, immutable after creation |
| Model and reasoning | Explicit every turn; saved defaults are preferences, never fallback policy |
| Agent folders | General plus the exact five code-owned Agents |
| Native subagents | Stay inside the parent provider conversation |
| Global access | One app-shell AI chat panel from every authenticated normal work surface |
| Dashboard Agent OS UI | Label, organization chart, cards, and current actions remain unchanged |
| Right surface | Exactly `notifications | ai_chat | null`; selecting one replaces the other |
| Panel mode | Fixed 420 px non-modal desktop panel; full-width modal drawer below 768 px; no remaining-width calculation |
| History deletion | Provider removal first, descriptor removal second |
| Preferences | One strict Host Runner installation-user file; no organization copies |
| Schema | No Prisma change and no new Task, Session, Attempt, folder, archive, or retention model |
| Legacy cutover | Delete replaced UI shells, state, fixtures, exports, and route jumps; no wrappers, aliases, dual state, or migration |

Do not modify DESIGN.md or the user-edited KID-25 source documents while
implementing this plan. Update only the architecture/testing documents named in
Task 7 when their owned description becomes stale.

## First-Send Correctness Model

The implementation uses two complementary guarantees:

1. The native Gateway owns durable create idempotency. A retry after an HTTP
   response loss uses the exact same browser-reserved conversation ID and
   returns the one existing descriptor/provider conversation.
2. The route-stable Web runtime host owns the first-turn handoff. Concurrent
   clicks and presentation remounts share one in-flight first-send promise. The
   host marks the handoff consumed synchronously before invoking CopilotKit, so
   it never automatically reissues that first handoff.

If provider creation fails before the handoff, the draft remains retryable with
the same ID. If the provider turn has been handed off and then fails, the
Conversation remains and an explicit user retry is a new turn with a new turn
ID after the prior turn is terminal. No reconnect or route navigation silently
replays a prompt.

## Task 1: Fix the Shared Conversation and Preference Contracts

**Files:**

- Modify: packages/shared/src/agent-runtime/conversation.ts
- Modify: packages/shared/src/agent-runtime/conversation.spec.ts
- Modify: packages/shared/src/agent-runtime/control.ts
- Modify: packages/shared/src/agent-runtime/control.spec.ts
- Modify: packages/shared/src/agent-runtime/index.ts

- [ ] **Step 1: Add failing strict-schema tests**

In conversation.spec.ts, add public-contract tests proving:

- create requires conversationId, runtime, nullable agentKey, and title;
- server authority, provider references, credentials, transcript data, and
  execution bindings are rejected as unknown fields;
- General and the exact five Agent keys are the only preference contexts;
- each preference contains one bounded model and one bounded reasoning effort;
- the preference document is exactly schemaVersion 1 and has at most six
  contexts times two providers; and
- unknown keys at every nested level fail strict parsing.

In control.spec.ts, add round-trip tests for:

- conversation.create carrying the browser-reserved conversationId;
- conversation.preferences.get;
- conversation.preferences.set;
- conversation.preferences.loaded; and
- conversation.preferences.updated.

Run:

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/agent-runtime/conversation.spec.ts src/agent-runtime/control.spec.ts
~~~

Expected: FAIL because create does not accept the reserved ID and no preference
or control schemas exist.

- [ ] **Step 2: Add the strict preference schemas**

Add these public types to conversation.ts. Define the six context properties
explicitly so Zod cannot admit arbitrary keys:

~~~typescript
export const ConversationPreferenceContextSchema = z.union([
  z.literal('general'),
  AgentKeySchema,
]);

export const ConversationPreferenceSchema = z.object({
  model: ModelSchema,
  reasoningEffort: ReasoningEffortSchema,
}).strict();

const ProviderPreferenceMapSchema = z.object({
  codex_cli: ConversationPreferenceSchema.optional(),
  claude_cli: ConversationPreferenceSchema.optional(),
}).strict();

export const ConversationPreferencesSchema = z.object({
  schemaVersion: z.literal(1),
  contexts: z.object({
    general: ProviderPreferenceMapSchema.optional(),
    sourcing: ProviderPreferenceMapSchema.optional(),
    merchandising: ProviderPreferenceMapSchema.optional(),
    supply: ProviderPreferenceMapSchema.optional(),
    channel_operations: ProviderPreferenceMapSchema.optional(),
    advertising: ProviderPreferenceMapSchema.optional(),
  }).strict(),
}).strict();

export const SetConversationPreferenceCommandSchema = z.object({
  context: ConversationPreferenceContextSchema,
  runtime: ProviderRuntimeSchema,
  model: ModelSchema,
  reasoningEffort: ReasoningEffortSchema,
}).strict();
~~~

Export the inferred types through agent-runtime/index.ts.

- [ ] **Step 3: Make conversation creation client-addressed**

Change CreateConversationCommandSchema to:

~~~typescript
export const CreateConversationCommandSchema = z.object({
  conversationId: ConversationIdSchema,
  runtime: ProviderRuntimeSchema,
  agentKey: AgentKeySchema.nullable(),
  title: ConversationTitleSchema,
}).strict();
~~~

Do not retain an optional-title compatibility path. The new UI deterministically
derives a bounded title from the normalized first message.

- [ ] **Step 4: Extend the Gateway control union**

Add exact command/event variants:

~~~typescript
{ kind: 'conversation.preferences.get'; commandId: CommandIdSchema }

{
  kind: 'conversation.preferences.set';
  commandId: CommandIdSchema;
  context: ConversationPreferenceContextSchema;
  runtime: ProviderRuntimeSchema;
  model: ModelSchema;
  reasoningEffort: ReasoningEffortSchema;
}

{
  kind: 'conversation.preferences.loaded';
  commandId: CommandIdSchema;
  preferences: ConversationPreferencesSchema;
}

{
  kind: 'conversation.preferences.updated';
  commandId: CommandIdSchema;
  preferences: ConversationPreferencesSchema;
}
~~~

Keep organizationId and userId out of the Gateway wire command. Nest uses them
only to authenticate and fence the broker request.

- [ ] **Step 5: Run the shared gates**

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/agent-runtime
rtk npm run build --workspace=packages/shared
rtk npm run type-check --workspace=packages/shared
~~~

Expected: all shared tests, build, and type-check pass.

- [ ] **Step 6: Commit the shared contract**

~~~bash
rtk git add packages/shared/src/agent-runtime
rtk git commit -m "feat(agent-os): define conversation preference contracts"
~~~

## Task 2: Make Gateway Conversation Ownership Race-Safe

Task 2 is one Gateway-owner checkpoint with three phases: descriptor/create
correctness, Provider-independent deletion, and the installation-user
preference store. The phases may commit separately, but they do not create
compatibility boundaries or independent implementation Tasks.

### Phase 2A: Serialize Descriptors and Make Create Idempotent

**Files:**

- Modify: apps/agent-gateway/src/conversation/conversation-descriptor.ts
- Modify: apps/agent-gateway/src/conversation/conversation-descriptor.store.ts
- Modify: apps/agent-gateway/src/conversation/conversation-descriptor.store.spec.ts
- Modify: apps/agent-gateway/src/conversation/conversation-gateway.ts
- Modify: apps/agent-gateway/src/conversation/conversation-gateway.spec.ts
- Modify: apps/agent-gateway/src/control/gateway-command-dispatcher.ts
- Modify: apps/agent-gateway/src/control/gateway-command-dispatcher.spec.ts

- [ ] **Step 1: Add failing owner-idempotency and concurrent-store tests**

Add Gateway tests that prove:

- the exact requested conversationId becomes the public descriptor ID;
- sequential and concurrent same-ID/same-input creation call provider.create
  exactly once and return the same Conversation;
- same ID with changed runtime, agentKey, or title throws
  gateway_conversation_create_conflict without another provider call;
- a new ConversationGateway over the same state root replays the same create;
- concurrent rename, turn-metadata update, and delete cannot restore a removed
  descriptor or lose the newer surviving mutation;
- a descriptor write failure performs a best-effort provider removal before
  returning failure; and
- the dispatcher maps create drift to invalid_state without leaking internal
  provider references.

Run:

~~~bash
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/conversation/conversation-descriptor.store.spec.ts src/conversation/conversation-gateway.spec.ts src/control/gateway-command-dispatcher.spec.ts
~~~

Expected: FAIL because IDs are generated in the Gateway, create is not
coalesced, and stale list-plus-replace writes can resurrect rows.

- [ ] **Step 2: Serialize every descriptor read-modify-write**

Give ConversationDescriptorStore one failure-resilient mutation tail:

~~~typescript
private mutationTail: Promise<void> = Promise.resolve();

private enqueueMutation<T>(work: () => Promise<T>): Promise<T> {
  const result = this.mutationTail.then(work, work);
  this.mutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
~~~

Public list and find wait for the current tail. create, update, and
removeIfPresent execute their private read/validate/write sequence inside the
queue. Remove the public whole-array replace operation so callers cannot perform
a stale read followed by an unguarded replacement.

Expose only these mutation semantics:

~~~typescript
create(descriptor: ConversationDescriptor): Promise<void>;
update(
  id: string,
  change: (current: ConversationDescriptor) => ConversationDescriptor,
): Promise<ConversationDescriptor>;
removeIfPresent(id: string): Promise<boolean>;
~~~

update must fail if the row disappeared; it must never reinsert it.

- [ ] **Step 3: Implement native create replay and drift conflict**

ConversationGateway.create accepts the strict shared command. Before calling a
provider:

1. read the descriptor by input.conversationId;
2. if present, compare runtime, agentKey, and title exactly;
3. replay its public summary on equality;
4. throw gateway_conversation_create_conflict on drift; and
5. coalesce concurrent missing-row creates in a process-local map keyed only by
   conversationId. Each entry stores the canonical JSON of runtime, agentKey,
   and title beside its one create promise. A matching call reuses that promise;
   a drifted call fails before another provider.create call.

The in-flight map is only a race coordinator. The descriptor remains the
restart-safe replay authority. Always clear a settled map entry.

Use input.conversationId directly in the descriptor. Remove randomId and
randomId test seams from ConversationGateway.

- [ ] **Step 4: Replace stale descriptor writes**

Use store.update for:

- rename metadata;
- updatedAt, lastModel, and lastReasoningEffort after a turn starts.

Use removeIfPresent after provider deletion. A turn metadata update racing a
delete may fail, but it must never restore the deleted descriptor.

- [ ] **Step 5: Add failed-create compensation**

If provider.create succeeds and descriptor.create fails, call provider.delete
with the newly created provider reference as best-effort cleanup. Never expose
that reference in the thrown error or logs. Preserve the primary bounded error
gateway_descriptor_create_failed whether cleanup succeeds or fails.

- [ ] **Step 6: Run the focused Gateway tests**

~~~bash
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/conversation src/control/gateway-command-dispatcher.spec.ts
rtk npm run build --workspace=apps/agent-gateway
~~~

Expected: all focused tests and the Gateway build pass.

- [ ] **Step 7: Commit owner idempotency and serialization**

~~~bash
rtk git add apps/agent-gateway/src/conversation apps/agent-gateway/src/control/gateway-command-dispatcher.ts apps/agent-gateway/src/control/gateway-command-dispatcher.spec.ts
rtk git commit -m "fix(agent-os): serialize provider conversation ownership"
~~~

### Phase 2B: Implement Provider-Independent History Deletion

**Files:**

- Modify: apps/agent-gateway/src/provider/provider-conversation.port.ts
- Modify: apps/agent-gateway/src/provider/codex-conversation.provider.ts
- Modify: apps/agent-gateway/src/provider/codex-conversation.provider.spec.ts
- Modify: apps/agent-gateway/src/provider/codex-app-server-session.gateway.spec.ts
- Rename: apps/agent-gateway/src/provider/claude-session-history.reader.ts
  to apps/agent-gateway/src/provider/claude-session.store.ts
- Rename: apps/agent-gateway/src/provider/claude-session-history.reader.spec.ts
  to apps/agent-gateway/src/provider/claude-session.store.spec.ts
- Modify: apps/agent-gateway/src/provider/claude-conversation.provider.ts
- Modify: apps/agent-gateway/src/provider/claude-conversation.provider.spec.ts
- Modify: apps/agent-gateway/src/turn/active-turn.registry.ts
- Modify: apps/agent-gateway/src/turn/active-turn.registry.spec.ts
- Modify: apps/agent-gateway/src/control/gateway-command-dispatcher.ts
- Modify: apps/agent-gateway/src/control/gateway-command-dispatcher.spec.ts
- Modify: apps/agent-gateway/src/conversation/conversation-gateway.ts
- Modify: apps/agent-gateway/src/conversation/conversation-gateway.spec.ts
- Modify: apps/agent-gateway/src/main.ts

- [ ] **Step 1: Add failing provider-removal contract tests**

Test these public behaviors before implementation:

- Codex delete calls thread/archive for the exact provider thread;
- if archive reports an error but thread/list proves the exact thread absent,
  Codex deletion succeeds idempotently;
- if the thread still exists after archive failure, deletion fails;
- Claude removes only the exact session transcript and the exact sibling
  session-owned directory below the canonical Claude project root;
- Claude leaves other session files, other project directories, and symlinks
  untouched;
- multiple exact transcript matches fail closed as ambiguous;
- a missing Claude session is idempotent success;
- delete while the exact conversation has a live turn is rejected before any
  provider removal;
- repeated delete after descriptor removal succeeds; and
- descriptor removal still happens only after provider success.

Run:

~~~bash
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/provider/codex-conversation.provider.spec.ts src/provider/claude-session.store.spec.ts src/provider/claude-conversation.provider.spec.ts src/turn/active-turn.registry.spec.ts src/control/gateway-command-dispatcher.spec.ts src/conversation/conversation-gateway.spec.ts
~~~

Expected: FAIL because Claude deletion is unsupported and live turns do not
fence deletion.

- [ ] **Step 2: Make Codex archive idempotent**

Keep Codex archive as the primary operation. If archive rejects, list top-level
provider conversations:

- exact providerConversationRef absent means the requested provider state is
  already removed and delete succeeds;
- exact reference still present means rethrow the bounded provider failure.

Do not expose app-server errors or thread IDs above the provider adapter.

- [ ] **Step 3: Replace the Claude history reader with a bounded session store**

ClaudeProviderSessionStore owns exists, read, and remove. remove accepts only
the validated opaque session ID, never a path.

Resolve loginRoot/.claude/projects through realpath, scan at most 2,000 entries
and five directory levels, skip symbolic links, and require every candidate to
remain beneath the canonical projects root.

For one exact session:

- remove the exact main file named sessionId.jsonl;
- if present, remove the exact real sibling directory named sessionId, which
  owns that session's subagent/tool sidecars;
- do not glob by prefix;
- fail before deletion if more than one main transcript matches; and
- return success when neither exact artifact exists.

The production adapter may use recursive removal only on the resolved exact
session-owned directory. Tests use temporary roots and prove neighboring
sessions survive.

- [ ] **Step 4: Fence deletion against active turns**

Add ActiveTurnRegistry.hasConversation(conversationId). In the
conversation.delete dispatcher branch, reject with ActiveTurnAlreadyLiveError
before calling ConversationGateway.delete when it returns true.

ConversationGateway.delete treats a missing descriptor as success. If a
descriptor exists, it calls the fixed provider adapter first and
removeIfPresent second.

- [ ] **Step 5: Wire the renamed Claude session store**

Update main.ts and ClaudeConversationProvider to use one
ClaudeProviderSessionStore instance for exists, history, and removal. Keep the
canonical login root inside the native process; no Nest/Web command gains a
path field.

- [ ] **Step 6: Run provider and Gateway verification**

~~~bash
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/provider src/turn src/conversation src/control/gateway-command-dispatcher.spec.ts
rtk npm run build --workspace=apps/agent-gateway
~~~

Expected: all provider deletion, traversal, symlink, live-turn, and replay
tests pass.

- [ ] **Step 7: Commit provider deletion**

~~~bash
rtk git add apps/agent-gateway/src/provider apps/agent-gateway/src/turn apps/agent-gateway/src/control/gateway-command-dispatcher.ts apps/agent-gateway/src/control/gateway-command-dispatcher.spec.ts apps/agent-gateway/src/conversation apps/agent-gateway/src/main.ts
rtk git commit -m "feat(agent-os): delete provider-native conversation history"
~~~

### Phase 2C: Add the Installation-User Preference Store and Control Commands

**Files:**

- Create: apps/agent-gateway/src/conversation/conversation-preference.store.ts
- Create: apps/agent-gateway/src/conversation/conversation-preference.store.spec.ts
- Modify: apps/agent-gateway/src/control/gateway-command-dispatcher.ts
- Modify: apps/agent-gateway/src/control/gateway-command-dispatcher.spec.ts
- Modify: apps/agent-gateway/src/control/host-gateway-control-protocol.spec.ts
- Modify: apps/agent-gateway/src/__tests__/gateway-nest-loopback.integration.spec.ts
- Modify: apps/agent-gateway/src/main.ts

- [ ] **Step 1: Add failing local-preference store tests**

Test:

- missing file returns { schemaVersion: 1, contexts: {} };
- set writes only one exact context/provider entry;
- concurrent writes for different entries both survive;
- concurrent writes for the same entry serialize in call order;
- invalid JSON, unknown fields, and unsupported schemaVersion fail closed;
- atomic rename failure leaves the prior document readable;
- file and directory permissions are 0600 and 0700 on macOS; and
- raw file text cannot contain credential, provider reference, transcript,
  execution binding, capability input, approval, or Operation fields.

Run:

~~~bash
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/conversation/conversation-preference.store.spec.ts
~~~

Expected: FAIL because the store does not exist.

- [ ] **Step 2: Implement one strict atomic file**

Create conversation-preferences.json beneath the existing stateRoot. Parse and
write only ConversationPreferencesSchema. Use an independent failure-resilient
mutation tail and atomic temporary-file replacement.

Expose:

~~~typescript
read(): Promise<ConversationPreferences>;
set(input: SetConversationPreferenceCommand): Promise<ConversationPreferences>;
~~~

Public read waits for the mutation tail captured when it starts. set performs
its read-modify-write inside the serialized queue using a private unqueued file
read; it must not call public read from inside its own queued mutation. There is
no organization key, user ID, runtime fallback, credential, or provider
conversation reference in this file.

- [ ] **Step 3: Dispatch preference commands in the native owner**

Inject the preference store into GatewayCommandDispatcher and handle:

- conversation.preferences.get by emitting conversation.preferences.loaded;
- conversation.preferences.set by storing the exact entry and emitting
  conversation.preferences.updated.

Both still receive command.ack after their result event, matching existing
conversation command ordering.

- [ ] **Step 4: Wire the store once in main**

Instantiate ConversationPreferenceStore with the same stateRoot and platform as
ConversationDescriptorStore. Do not add a listener, database adapter, config
path override, or organization-specific directory.

- [ ] **Step 5: Prove the control loop**

Extend the loopback integration test so one Nest-side command:

1. reads the empty document;
2. sets General/Codex model and effort;
3. reads the exact saved document; and
4. carries no authenticated owner data into the local file or Gateway event.

Run:

~~~bash
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/conversation/conversation-preference.store.spec.ts src/control src/__tests__/gateway-nest-loopback.integration.spec.ts
rtk npm run build --workspace=apps/agent-gateway
~~~

Expected: all focused tests and build pass.

- [ ] **Step 6: Commit preference ownership**

~~~bash
rtk git add apps/agent-gateway/src/conversation/conversation-preference.store.ts apps/agent-gateway/src/conversation/conversation-preference.store.spec.ts apps/agent-gateway/src/control apps/agent-gateway/src/__tests__/gateway-nest-loopback.integration.spec.ts apps/agent-gateway/src/main.ts
rtk git commit -m "feat(agent-os): store local conversation defaults"
~~~

## Task 3: Extend the Authenticated Nest Conversation Facade

**Files:**

- Modify: apps/server/src/agent-os/application/port/in/capability/conversation.port.ts
- Modify: apps/server/src/agent-os/application/port/out/gateway-conversation.port.ts
- Modify: apps/server/src/agent-os/application/service/conversation.service.ts
- Modify: apps/server/src/agent-os/application/service/conversation.service.spec.ts
- Modify: apps/server/src/agent-os/adapter/out/runtime/gateway/gateway-conversation.adapter.ts
- Modify: apps/server/src/agent-os/adapter/out/runtime/gateway/gateway-conversation.adapter.spec.ts
- Modify: apps/server/src/agent-os/adapter/out/runtime/gateway/gateway-command-response.broker.ts
- Modify: apps/server/src/agent-os/adapter/out/runtime/gateway/gateway-command-response.broker.spec.ts
- Modify: apps/server/src/agent-os/adapter/out/runtime/gateway/gateway-event-handler.service.ts
- Modify: apps/server/src/agent-os/adapter/out/runtime/gateway/gateway-event-handler.service.spec.ts
- Modify: apps/server/src/agent-os/adapter/in/http/interaction/conversation.controller.ts
- Modify: apps/server/src/agent-os/adapter/in/http/interaction/conversation.controller.spec.ts
- Modify: apps/server/src/agent-os/agent-os-interaction-http.module.ts
- Modify: apps/server/src/agent-os/agent-os-runtime-http.module.spec.ts

- [ ] **Step 1: Add failing facade and HTTP tests**

Test:

- POST /api/agent-os/conversations requires conversationId and title;
- same authenticated owner can replay the exact create;
- changed create input returns HTTP 409;
- create body still rejects organizationId, userId, provider reference,
  credential, execution binding, and transcript;
- GET /api/agent-os/conversation-preferences returns the strict document;
- PUT /api/agent-os/conversation-preferences accepts only context, runtime,
  model, and reasoningEffort;
- preference write requires that exact model/effort pair in current readiness;
- current authenticated user and organization fence every preference command,
  but neither enters the Gateway wire payload or local storage key;
- delete of a live Conversation returns HTTP 409;
- provider unavailability returns HTTP 503 with no raw provider error; and
- no Prisma provider or repository is added to the module.

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/conversation.service.spec.ts src/agent-os/adapter/out/runtime/gateway/gateway-conversation.adapter.spec.ts src/agent-os/adapter/out/runtime/gateway/gateway-command-response.broker.spec.ts src/agent-os/adapter/out/runtime/gateway/gateway-event-handler.service.spec.ts src/agent-os/adapter/in/http/interaction/conversation.controller.spec.ts src/agent-os/agent-os-runtime-http.module.spec.ts
~~~

Expected: FAIL because the facade has no reserved ID or preference methods.

- [ ] **Step 2: Extend the incoming and outgoing ports**

Add to both conversation ports:

~~~typescript
preferences(owner: ConversationOwner): Promise<ConversationPreferences>;

setPreference(
  input: ConversationOwner & SetConversationPreferenceCommand,
): Promise<ConversationPreferences>;
~~~

Add conversationId and required title to create. Keep owner coordinates
server-derived and separate from shared business commands.

- [ ] **Step 3: Correlate preference results through the existing broker**

Add resolvePreferenceLoaded and resolvePreferenceUpdated methods to
GatewayCommandResponseBroker and route both event variants in
GatewayEventHandlerService.

GatewayConversationAdapter dispatches preference commands with only commandId
and the preference input. The broker registration still receives
organizationId and initiatingUserId for request correlation.

- [ ] **Step 4: Enforce explicit supported selections**

ConversationService.setPreference calls the existing readiness matrix validator
for the requested runtime/model/reasoning pair before dispatch. A stored
selection that later becomes obsolete is still returned by preferences(); the
Web marks it for review. Do not rewrite or delete it silently.

Map bounded control errors:

| Internal condition | HTTP |
|---|---|
| create input drift | 409 |
| live-turn deletion | 409 |
| conversation absent | 404 |
| invalid model/effort/body | 400 |
| provider unavailable/control disconnect | 503 |

No response contains Gateway, provider-local reference, command ID, or raw
provider message.

- [ ] **Step 5: Add authenticated preference routes**

Use:

~~~text
GET /api/agent-os/conversation-preferences
PUT /api/agent-os/conversation-preferences
~~~

Derive scope with CurrentOrganization and CurrentUser exactly like existing
conversation routes. Keep history search/filter/bulk deletion client-side; do
not add a database search endpoint or a bulk-delete server endpoint.

- [ ] **Step 6: Run server focused tests and boot**

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/conversation.service.spec.ts src/agent-os/adapter/out/runtime/gateway src/agent-os/adapter/in/http/interaction/conversation.controller.spec.ts src/agent-os/adapter/in/http/interaction/conversation-copilotkit.controller.spec.ts src/agent-os/agent-os-runtime-http.module.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run dev:server
~~~

Expected: focused tests and build pass; the Nest application reaches a normal
ready boot without a new Prisma dependency. Stop the watch process after the
boot line is confirmed.

- [ ] **Step 7: Commit the authenticated facade**

~~~bash
rtk git add apps/server/src/agent-os
rtk git commit -m "feat(agent-os): expose conversation defaults securely"
~~~

## Sol(max) Batch Review A: Tasks 1-3

Review only the Tasks 1-3 batch diff and these architecture invariants:

- strict shared command/event contracts and no authority/provider leakage;
- Gateway descriptor serialization, create idempotency, exact provider
  deletion, preference-file ownership, and live-turn fencing; and
- Nest authentication/readiness/error mapping with no Prisma conversation or
  preference persistence.

Do not ask the reviewer to reread the complete implementation plan. Provide
the batch acceptance criteria, batch base/head SHAs, focused test evidence, and
the exact batch diff. Fix Critical/Important findings with TDD. Re-review only
the previous finding IDs against their fix diff before starting Task 4.

## Task 4: Build One Route-Stable Web Runtime and First-Send Coordinator

**Files:**

- Create: apps/web/src/components/agent-interaction/ConversationRuntimeHost.tsx
- Create: apps/web/src/components/agent-interaction/ConversationFlow.tsx
- Create: apps/web/src/components/agent-interaction/conversation-first-send.coordinator.ts
- Create: apps/web/src/components/agent-interaction/conversation-title.ts
- Create: apps/web/src/components/agent-interaction/useNewConversationDraft.ts
- Create: apps/web/src/components/agent-interaction/__tests__/ConversationRuntimeHost.spec.tsx
- Create: apps/web/src/components/agent-interaction/__tests__/conversation-first-send.coordinator.spec.ts
- Create: apps/web/src/components/agent-interaction/__tests__/useNewConversationDraft.spec.tsx
- Modify: apps/web/src/components/agent-interaction/conversation-api.ts
- Modify: apps/web/src/components/agent-interaction/conversation-api.spec.ts
- Modify: apps/web/src/components/agent-interaction/conversation-surface-state.ts
- Modify: apps/web/src/components/agent-interaction/conversation-surface-state.spec.ts
- Modify: apps/web/src/components/agent-interaction/ConversationProvider.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationProvider.spec.tsx
- Modify: apps/web/src/components/agent-interaction/AgentConversationSurface.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/AgentConversationSurface.spec.tsx
- Modify: apps/web/src/lib/query-keys.ts
- Modify: apps/web/src/lib/query-keys.spec.ts

- [ ] **Step 1: Add failing draft and runtime-lifetime tests**

Test:

- opening a draft reserves one crypto.randomUUID conversationId and performs no
  API or CopilotKit run;
- closing/reopening a different draft gets a different ID;
- retries of one draft reuse its exact ID;
- a deterministic title trims/collapses whitespace, is Unicode-safe, and is at
  most 48 characters including an ellipsis;
- create sends the exact ID/runtime/Agent/title;
- two concurrent first Sends share one create and one runAgent handoff;
- create-response failure clears only the in-flight attempt so retry can call
  create again with the same ID;
- while one first Send is in flight, the same reserved ID with changed runtime,
  Agent, title, message, model, or reasoning effort conflicts locally;
- opening a draft may bind useAgent to its reserved ID but performs no provider
  create, CopilotKit run, history request, or durable write;
- a presentation child unmount/remount does not recreate useAgent or add a
  second subscription;
- changing routes without changing active Conversation keeps active turn ID,
  live messages, tool projections, and interrupt control; and
- changing the selected Conversation disposes the old subscription before
  creating the next exact binding.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction/__tests__/ConversationRuntimeHost.spec.tsx src/components/agent-interaction/__tests__/conversation-first-send.coordinator.spec.ts src/components/agent-interaction/__tests__/useNewConversationDraft.spec.tsx src/components/agent-interaction/__tests__/AgentConversationSurface.spec.tsx src/components/agent-interaction/conversation-api.spec.ts src/components/agent-interaction/conversation-surface-state.spec.ts
~~~

Expected: FAIL because useAgent and live state are owned by the route-local
AgentConversationSurface.

- [ ] **Step 2: Define disposable draft state**

Use the exact draft shape:

~~~typescript
export interface NewConversationDraft {
  conversationId: string;
  agentKey: AgentConversationKey | null;
  provider: ConversationRuntime | null;
  model: string | null;
  reasoningEffort: string | null;
  message: string;
}
~~~

Zustand stores only selected context/conversation, pending draft, expanded
folders, and settings coordinates. It does not store server summaries,
provider history, credentials, grants, Task/Attempt state, or provider
references.

Replace the old OpenConversationInput/pendingOpen/consumePendingOpen handoff
with the actual NewConversationDraft value and one synchronous openConversation
action that installs that draft. Do not keep aliases, deprecated fields, or a
second consumed-intent path. Existing callers may keep the public action name;
Task 5 removes their automatic /agent-os navigation when the app-shell panel
becomes the presentation entry point.

Reserve conversationId with globalThis.crypto.randomUUID exactly once per new
draft. If secure random UUID generation is unavailable, fail draft creation
explicitly; do not add a Date/Math.random fallback.

- [ ] **Step 3: Implement deterministic title derivation**

conversationTitleFromMessage:

1. trim and collapse all whitespace runs to one space;
2. operate on Array.from Unicode code points;
3. return the normalized text when at most 48 code points;
4. otherwise return the first 47 code points plus one ellipsis; and
5. reject an empty normalized message before create.

No model call or provider title generation participates.

- [ ] **Step 4: Implement the first-send coordinator**

The route-stable host owns one coordinator instance. Key entries only by
conversationId. Each entry stores both the Gateway create canonical JSON
(runtime, agentKey, title) and the full first-send canonical JSON (those fields
plus message, model, and reasoningEffort).

For matching concurrent calls, return the same promise. Reject canonical drift
before create or runAgent. A failed create removes the in-flight entry and
preserves the draft. After create succeeds, write the summary to the Query
cache, select the same reserved ID as an existing Conversation, then set
handoffIssued synchronously before invoking runAgent on the already-mounted
binding. Allocate one turn ID, add the exact user message once, and pass the
explicit model and reasoningEffort once with that handoff. Retain the consumed
entry until that draft is disposed so a response loss or presentation remount
cannot reissue it. A handed-off turn is never
automatically invoked again; after terminal failure an explicit retry uses the
normal existing-conversation path and a new turn ID.

- [ ] **Step 5: Move useAgent and live projection into ConversationRuntimeHost**

ConversationProvider contains the CopilotKit transport only.
ConversationRuntimeHost:

- mounts one ActiveConversationRuntime child for the selected existing
  Conversation or the selected draft's reserved conversationId;
- treats draft binding as local setup only: it must not create a Provider
  conversation, fetch provider history, or run a turn;
- keeps that exact binding mounted when first Send promotes the reserved draft
  ID to an existing Conversation, so the coordinator can hand off without a
  render-effect race;
- owns useAgent, subscription, active turn, live messages, tool projections,
  terminal-history reconciliation, input, and interrupt;
- exposes a React context consumed by both AI chat panel and Agent OS presentations;
- leaves React Query as owner of summaries, provider history, readiness, and
  preferences; and
- never starts or resumes a turn from a route effect.

Keep the existing covered-live-message reconciliation algorithm and its
regression tests when extracting it.

Extract ConversationFlow in this task as the shared messages/cards/composer
presentation over the runtime context. Temporarily keep the current Agent OS
layout around it. AgentConversationSurface must no longer call useAgent before
the global AI chat panel is introduced in Task 5.

- [ ] **Step 6: Extend Web API and query keys**

Add strict API functions:

~~~typescript
createConversation({
  conversationId,
  runtime,
  agentKey,
  title,
}): Promise<ConversationSummary>;

getConversationPreferences(): Promise<ConversationPreferences>;

setConversationPreference(
  input: SetConversationPreferenceCommand,
): Promise<ConversationPreferences>;
~~~

Add queryKeys.conversations.preferences(). Do not introduce a query for
browser-only drafts or live stream events.

- [ ] **Step 7: Run focused Web state/runtime tests**

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction src/lib/query-keys.spec.ts
~~~

Expected: all current card/history reconciliation tests and new coordinator
tests pass with one runtime subscription.

- [ ] **Step 8: Commit the route-stable runtime**

~~~bash
rtk git add apps/web/src/components/agent-interaction apps/web/src/lib/query-keys.ts apps/web/src/lib/query-keys.spec.ts
rtk git commit -m "refactor(agent-os): keep one conversation runtime host"
~~~

### Terra(max) Task 4 Contract Check

Review only browser-reserved draft identity, create canonicalization,
first-send coalescing/drift rejection, one-handoff semantics, and preservation
of one runtime binding across presentation and route changes. Do not perform a
general UI quality review here. Fix findings with TDD and re-review only the
reported finding IDs.

## Task 5: Wire the Single Right Auxiliary Panel

**Files:**

- Create: apps/web/src/components/agent-interaction/ConversationPanel.tsx
- Create: apps/web/src/components/agent-interaction/__tests__/ConversationPanel.spec.tsx
- Create: apps/web/src/components/agent-interaction/conversation-context.catalog.ts
- Create: apps/web/src/components/layout/RightAuxiliaryPanel.tsx
- Create: apps/web/src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx
- Modify: apps/web/src/components/layout/AppLayout.tsx
- Modify: apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx
- Modify: apps/web/src/components/layout/Sidebar.tsx
- Modify: apps/web/src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts
- Modify: apps/web/src/store/useStore.ts
- Modify: apps/web/src/components/agent-interaction/conversation-surface-state.ts
- Modify: apps/web/src/components/agent-interaction/conversation-surface-state.spec.ts
- Rename: apps/web/src/components/panel/PanelSheet.tsx
  to apps/web/src/components/panel/NotificationPanelContent.tsx
- Rename: apps/web/src/components/panel/__tests__/PanelSheet.spec.tsx
  to apps/web/src/components/panel/__tests__/NotificationPanelContent.spec.tsx
- Modify: apps/web/src/components/panel/PanelAlertRow.tsx
- Modify: apps/web/src/components/panel/__tests__/PanelAlertRow.spec.tsx
- Modify: apps/web/src/components/panel/lib/panel-store.ts
- Modify: apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts
- Modify: apps/web/src/components/panel/hooks/__tests__/usePanelStream.spec.tsx
- Modify: apps/web/src/components/__tests__/GenerationCompletionWatcher.spec.tsx
- Modify: apps/web/src/app/(analytics)/dashboard/components/DashboardSidePanel.spec.tsx
- Modify: apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.tsx
- Modify: apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx
- Modify: apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationDetail.tsx
- Modify: apps/web/src/components/QuickActionFab.tsx
- Modify: apps/web/src/components/__tests__/QuickActionFab.spec.tsx
- Modify: apps/web/src/components/panel/AGENTS.md
- Modify: apps/web/src/store/AGENTS.md

- [ ] **Step 1: Add failing app-shell and single-surface tests**

Test:

- authenticated AppLayout mounts exactly one ConversationProvider and one
  ConversationRuntimeHost for normal routes and /agent-os;
- loading, anonymous, no-organization, error, and public surfaces mount neither;
- the existing bottom Sidebar AI 챗 button opens/closes the panel when expanded
  or collapsed;
- opening notifications closes chat and opening chat closes notifications;
- selecting the already active surface closes the panel;
- route navigation preserves right-surface state and selected Conversation;
- Agent OS suppresses an active ai_chat body without clearing its state, while
  an active notifications body remains available; returning to a normal route
  restores the same chat presentation and subscription;
- desktop uses one fixed 420 px non-modal panel, leaves the uncovered work
  surface interactive, and never reflows route content;
- below 768 px the same active surface uses a full-width focus-managed modal
  drawer;
- switching notification and AI chat bodies transfers focus to the new body,
  while closing with the close action or Escape restores focus to the launcher;
- no ResizeObserver, remaining-work-width calculation, route-specific minimum,
  or dock/overlay state exists;
- Quick Action FAB never moves and is hidden while either surface is open;
- replacing or closing chat does not interrupt its active turn;
- 전체 기록 navigates with the current conversation/context and does not mount
  another runtime subscription;
- the existing Sourcing decision-center entry opens its fixed draft in ai_chat
  under the label 소싱 Agent에게 묻기, without retaining AgentOS에서 묻기 or
  navigating to /agent-os; and
- Dashboard Agent OS regression fixture remains byte/semantic equivalent in
  label, chart, cards, and actions.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/layout/__tests__/AppLayout.auth.spec.tsx src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx src/components/agent-interaction/__tests__/ConversationPanel.spec.tsx src/components/agent-interaction/conversation-surface-state.spec.ts src/components/panel/__tests__/NotificationPanelContent.spec.tsx src/components/panel/__tests__/PanelAlertRow.spec.tsx src/components/panel/lib/__tests__/panel-store.spec.ts src/components/__tests__/QuickActionFab.spec.tsx 'src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardChartPanel.agent-os-cutover.regression-1.spec.ts'
~~~

Expected: FAIL because the provider is route-specific, Sidebar chat is not
wired, notifications still own an independent Dialog/open state, and the
decision-center entry still jumps to Agent OS.

- [ ] **Step 2: Make AppLayout the single authenticated runtime mount**

After the auth and organization gates, render:

~~~text
ConversationProvider
  ConversationRuntimeHost
    Agent OS presentation OR normal app shell
    RightAuxiliaryPanel(visibleRightSurface)
~~~

The pathname branch changes presentation only. It must not create separate
providers around /agent-os and normal routes. Agent OS suppresses the auxiliary
AI chat body because its workspace already presents the selected Conversation,
but it does not clear panel state or the selected Conversation. Returning to a
normal route restores the prior panel state without another subscription.

Derive presentation without mutating the stored coordinate:

~~~typescript
const visibleRightSurface = isAgentWorkspace && activeRightSurface === 'ai_chat'
  ? null
  : activeRightSurface;
~~~

This keeps notifications available on Agent OS and suppresses only the duplicate
chat body.

- [ ] **Step 3: Centralize right-surface UI state**

Move only the open surface coordinate into the global Zustand app store:

~~~typescript
type ActiveRightSurface = 'notifications' | 'ai_chat' | null;
~~~

Expose selectRightSurface(surface) so selecting the current value writes null
and selecting the other value replaces it in one state transition. Expose
closeRightSurface() for the shell close action.

Panel data, SSE state, hidden rows, and recovery remain in panel-store. Remove
isOpen, setOpen, PANEL_OPEN_LS_KEY, readOpenFromStorage, every related fixture,
and every caller. Do not read, clear, or migrate the obsolete browser key.

Rename PanelSheet to NotificationPanelContent, remove its Dialog imports,
Root/Portal/Overlay/Content, close button, and open-state selectors, and render
it only as the notification body inside RightAuxiliaryPanel. Recovery runs when
that content body mounts and when its connection state changes. Keep
usePanelStream mounted independently in AppLayout through a
NotificationDataMount that returns null. Remove the old PanelMount function and
its PanelSheet render rather than repurposing it as an invisible UI wrapper.

Remove PanelAlertRow's retired setPanelOpen dependency and its close-on-link
test. Notification navigation preserves activeRightSurface like every other
ordinary route navigation. Update the two scoped AGENTS.md files to reflect
that app-shell state ownership moved while panel data did not.

Sidebar remains a launcher: AppLayout passes notification/chat callbacks and
open state. Do not add chat to menu definitions or make it a route link.

Update the existing openConversation action so it installs the exact draft and
selects ai_chat. Remove the AppLayout and Sourcing decision-center /agent-os
pushes; both become callers of this single launcher. Rename the Sourcing action
from AgentOS에서 묻기 to 소싱 Agent에게 묻기. Do not keep a route-jump variant,
old product label, or compatibility alias.

- [ ] **Step 4: Build one responsive auxiliary panel shell**

RightAuxiliaryPanel renders the one active content body. At 768 px and above it
is a fixed 420 px non-modal surface attached to the right edge. It adds no
page-wide overlay, does not trap focus, leaves the uncovered work surface
interactive, and never changes content width or sidebar offsets. Below 768 px
the same component uses a full-width Radix modal drawer with focus trapping.

Use one matchMedia('(max-width: 767px)') result only to select Radix modality;
do not create a second shell. AppLayout captures the launcher element in a ref.
On open or cross-surface replacement, focus the new body's labelled heading;
on close or Escape, restore focus to the most recent launcher. Keep DOM refs
out of Zustand.

Do not add ResizeObserver, measured-content state, page-specific width rules,
CSS-grid dock columns, or separate dock and overlay components. The responsive
change affects only the panel shell; notification data and ConversationRuntimeHost
remain mounted independently.

- [ ] **Step 5: Build the AI chat panel content**

ConversationPanel provides:

- fixed General/Agent identity and existing title;
- new-conversation menu for General plus the exact five Agents;
- Settings;
- 전체 기록, preserving selected conversation/context while navigating to
  /agent-os;
- close; and
- the shared conversation flow/composer presentation.

It does not render Gateway/readiness management, provider-local terminology,
Dashboard Agent cards, or its own useAgent.

Use conversation-context.catalog.ts as the single ordered General/five-Agent
label source for this menu and the Task 6 folder tree. Do not import labels from
the retired AgentConversationSidebar.

~~~typescript
export const conversationContexts = [
  { key: null, label: '일반 AI 챗', placeholder: '무엇을 도와드릴까요?' },
  { key: 'sourcing', label: '소싱 Agent', placeholder: '소싱 Agent에게 무엇을 요청할까요?' },
  { key: 'merchandising', label: '상품 Agent', placeholder: '상품 Agent에게 무엇을 요청할까요?' },
  { key: 'supply', label: '공급 Agent', placeholder: '공급 Agent에게 무엇을 요청할까요?' },
  { key: 'channel_operations', label: '채널 운영 Agent', placeholder: '채널 운영 Agent에게 무엇을 요청할까요?' },
  { key: 'advertising', label: '광고 Agent', placeholder: '광고 Agent에게 무엇을 요청할까요?' },
] as const;
~~~

- [ ] **Step 6: Coordinate Quick Action and notifications**

The existing Quick Action conversation entry opens the same unsaved General
draft in the AI chat panel; it no longer navigates first to /agent-os.

QuickActionFab receives only whether an auxiliary surface is open. It never
moves and is hidden until the surface closes. Preserve all existing
product/detail/thumbnail actions unchanged. Opening notifications atomically
replaces AI chat; closing or replacing the chat presentation must not interrupt
the active turn owned by ConversationRuntimeHost.

- [ ] **Step 7: Verify the notification-shell cutover removed legacy code**

Run:

~~~bash
rtk rg -n 'PanelSheet|function PanelMount|kiditem\.panel\.open|readOpenFromStorage|setPanelOpen' apps/web/src/components/panel apps/web/src/components/layout apps/web/src/store
rtk rg -n '^\s*(isOpen|setOpen):' apps/web/src/components/panel/lib/panel-store.ts apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts
~~~

Expected: both commands return no matches. Remove stale imports, mocks, fixture
fields, and tests instead of exempting them.

- [ ] **Step 8: Run layout regressions and build**

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/layout src/components/agent-interaction src/components/panel src/components/__tests__/QuickActionFab.spec.tsx 'src/app/(analytics)/dashboard/components/DashboardChartPanel.agent-os-cutover.regression-1.spec.ts'
rtk npm run build --workspace=apps/web
~~~

Expected: tests and production Web build pass; Dashboard Agent OS UI remains
unchanged.

- [ ] **Step 9: Check instruction hygiene and commit**

~~~bash
rtk npm run check:agents-hygiene
rtk git add apps/web/src/components/agent-interaction apps/web/src/components/layout apps/web/src/components/panel apps/web/src/components/QuickActionFab.tsx apps/web/src/components/__tests__/QuickActionFab.spec.tsx apps/web/src/components/__tests__/GenerationCompletionWatcher.spec.tsx apps/web/src/store 'apps/web/src/app/(analytics)/dashboard/components/DashboardSidePanel.spec.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationDetail.tsx'
rtk git commit -m "feat(agent-os): add single global chat panel"
~~~

## Task 6: Build the Agent OS History, Settings, and Management Workspace

### Phase 6A: Replace the Flat Agent OS Conversation Workspace

**Files:**

- Modify: apps/web/src/components/agent-interaction/ConversationFlow.tsx
- Create: apps/web/src/components/agent-interaction/ConversationHeader.tsx
- Create: apps/web/src/components/agent-interaction/ConversationFolderTree.tsx
- Create: apps/web/src/components/agent-interaction/ConversationCombinedSelector.tsx
- Create: apps/web/src/components/agent-interaction/__tests__/ConversationFolderTree.spec.tsx
- Create: apps/web/src/components/agent-interaction/__tests__/ConversationCombinedSelector.spec.tsx
- Modify: apps/web/src/components/agent-interaction/AgentConversationSurface.tsx
- Delete: apps/web/src/components/agent-interaction/AgentConversationSidebar.tsx
- Modify: apps/web/src/components/agent-interaction/AgentConversationComposer.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/AgentConversationSurface.spec.tsx
- Modify: apps/web/src/app/agent-os/page.tsx

- [ ] **Step 1: Add failing workspace, tree, and composer tests**

Test:

- /agent-os first focusable action is 대시보드로 돌아가기 and navigates to
  /dashboard;
- tree order is General, sourcing, merchandising, supply,
  channel_operations, advertising with approved Korean labels;
- each folder independently expands, exposes aria-expanded, nests only its
  conversations, and sorts by updatedAt descending;
- selecting a conversation expands its folder and sets aria-current;
- native subagents/tool events never become tree rows;
- the primary 새 AI 대화 and each folder plus button open an unsaved draft and
  focus the composer without an API call;
- below 1024 px the tree is one modal drawer; above it the 288 px tree remains;
- General uses `무엇을 도와드릴까요?`, while Agent contexts use
  `<Agent 이름>에게 무엇을 요청할까요?`;
- provider/model/reasoning appear in one combined selector;
- provider is editable only before create; model/effort remain editable between
  terminal turns;
- Enter sends only outside IME composition, Shift+Enter inserts a newline, and
  Escape closes the selector; and
- unsupported attachment, microphone, voice, media, Gateway, and session
  controls do not render.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction/__tests__/AgentConversationSurface.spec.tsx src/components/agent-interaction/__tests__/ConversationFolderTree.spec.tsx src/components/agent-interaction/__tests__/ConversationCombinedSelector.spec.tsx
~~~

Expected: FAIL against the flat English sidebar and runtime-selection modal.

- [ ] **Step 2: Finish the shared conversation presentation**

Keep message history, live projection rendering, capability/tool/reference
cards, and composer composition in the ConversationFlow extracted in Task 4.
Finish its workspace header and compact-composer composition here. It consumes
ConversationRuntimeHost context and React Query data; it does not mount
useAgent.

AgentConversationSurface becomes only:

- full-height Agent OS shell;
- folder tree/drawer;
- Dashboard return header;
- selected draft/conversation presentation; and
- shared settings trigger.

Keep each resulting component below the existing 500-line surface.

- [ ] **Step 3: Replace the flat sidebar with the folder tree**

Folders are a pure projection of ConversationSummary.agentKey. Store expansion
as disposable UI state only. There is no folder API or persisted folder
descriptor.

Delete AgentConversationSidebar and its agentConversationDestinations export
after ConversationFolderTree is wired. Do not retain an adapter component or
re-export. Both ConversationPanel and ConversationFolderTree use the Task 5
conversation-context catalog.

Use stable product labels:

~~~text
일반 AI 챗
소싱 Agent
상품 Agent
공급 Agent
채널 운영 Agent
광고 Agent
~~~

- [ ] **Step 4: Remove the create modal**

Every new entry point creates only a browser draft. The initial compact
composer contains Provider/model/reasoning choices and message. First Send
calls the Task 4 coordinator, then fixes Provider and Agent context.

Creation failure keeps every draft field. A provider-unavailable error says
only that the selected engine cannot currently be used, keeps Retry, and lets a
draft choose the other available provider.

Delete CreateConversationDialog and its createOpen, initialDraft, pendingOpen,
consumePendingOpen, and runtime-modal branches from AgentConversationSurface.
Do not hide them behind a false condition or retain their tests.

- [ ] **Step 5: Build the compact composer and combined selector**

Use one rounded border-first container, growing textarea, combined selector,
and one circular Send/Interrupt position. Preserve visible focus, live-region
errors, reduced motion, and control wrapping below 640 px.

Do not render separate persistent Model and Reasoning select rows.

- [ ] **Step 6: Verify the Agent OS presentation cutover removed legacy code**

Run:

~~~bash
rtk rg -n 'AgentConversationSidebar|agentConversationDestinations|CreateConversationDialog|pendingOpen|consumePendingOpen' apps/web/src/components/agent-interaction
rtk rg -n 'router\.push\(.*?/agent-os|AgentOS에서 묻기|AgentOS 대화 열기' apps/web/src/components/layout/AppLayout.tsx apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationDetail.tsx'
~~~

Expected: both commands return no matches. The intentional 전체 기록
navigation lives only in ConversationPanel and is not part of this scan.

- [ ] **Step 7: Run focused Agent OS tests and Web build**

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction
rtk npm run build --workspace=apps/web
~~~

Expected: all folder, draft, composer, history reconciliation, and reference
card tests pass.

- [ ] **Step 8: Commit the Agent OS workspace**

~~~bash
rtk git add apps/web/src/app/agent-os apps/web/src/components/agent-interaction
rtk git commit -m "feat(agent-os): organize provider conversations by agent"
~~~

### Phase 6B: Add Settings and Complete History Management

**Files:**

- Create: apps/web/src/components/agent-interaction/ConversationSettingsDialog.tsx
- Create: apps/web/src/components/agent-interaction/ConversationDefaultsSettings.tsx
- Create: apps/web/src/components/agent-interaction/ConversationHistorySettings.tsx
- Create: apps/web/src/components/agent-interaction/conversation-preference-selection.ts
- Create: apps/web/src/components/agent-interaction/conversation-bulk-delete.ts
- Create: apps/web/src/components/agent-interaction/__tests__/ConversationSettingsDialog.spec.tsx
- Create: apps/web/src/components/agent-interaction/__tests__/conversation-preference-selection.spec.ts
- Create: apps/web/src/components/agent-interaction/__tests__/conversation-bulk-delete.spec.ts
- Modify: apps/web/src/components/agent-interaction/ConversationPanel.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationFolderTree.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationFlow.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationRuntimeHost.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationRuntimeHost.spec.tsx
- Modify: apps/web/src/components/agent-interaction/conversation-api.ts
- Modify: apps/web/src/components/agent-interaction/conversation-api.spec.ts

- [ ] **Step 1: Add failing preference precedence and history-action tests**

Test:

- Settings opens from the AI chat panel and Agent OS tree and returns focus to trigger;
- defaults are editable for all six contexts times two providers;
- new draft selection uses a supported matching preference;
- existing conversation selection prefers supported lastModel and
  lastReasoningEffort over the saved preference;
- unavailable/obsolete stored values remain visible as needing review and never
  silently change;
- missing/failed preference reads require explicit selection;
- search is case-insensitive, folder filtering is exact, and sorting is newest
  updatedAt first;
- rename failure preserves the prior title;
- individual deletion waits for provider success before cache removal;
- current live Conversation cannot be deleted;
- folder delete and delete all show exact scope/count confirmation;
- bulk deletion uses a maximum concurrency of three;
- partial failure reports exact success/failure counts and retains failed rows;
  and
- no archive, restore, retention, export, operator login, readiness management,
  Gateway, or Host Runner control appears.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction/__tests__/ConversationSettingsDialog.spec.tsx src/components/agent-interaction/__tests__/ConversationRuntimeHost.spec.tsx src/components/agent-interaction/__tests__/conversation-preference-selection.spec.ts src/components/agent-interaction/__tests__/conversation-bulk-delete.spec.ts
~~~

Expected: FAIL because settings and bulk history controls do not exist.

- [ ] **Step 2: Implement explicit preference precedence**

Create one pure selector:

~~~typescript
selectTurnPreference({
  conversation,
  draftContext,
  runtime,
  preferences,
  readiness,
}): {
  model: string | null;
  reasoningEffort: string | null;
  needsReview: boolean;
};
~~~

Validate model and effort as one pair against modelReasoningEfforts. Never
combine a model from one source with an effort from another or select the first
readiness option implicitly.

- [ ] **Step 3: Build the two-tab settings dialog**

대화 기본값 edits one context/provider pair and saves through the authenticated
preference endpoint.

채팅 기록 projects the bounded summary list for search/filter/rename/delete.
Mount one ConversationSettingsDialog below ConversationRuntimeHost. The AI chat
panel and Agent OS tree are triggers for that one app-shell-controlled instance; they
must not mount competing dialog copies.

- [ ] **Step 4: Implement bounded bulk deletion**

conversation-bulk-delete accepts the exact selected summaries and an individual
delete function. Run at most three provider removals concurrently, return:

~~~typescript
{
  succeededIds: string[];
  failed: Array<{ conversationId: string; message: string }>;
}
~~~

Apply successful cache removals after each successful owner result. Keep failed
summaries unchanged and retryable. Do not add a server bulk endpoint.

- [ ] **Step 5: Preserve live-turn and error semantics**

Disable the current live Conversation's delete action in the UI, while relying
on the Gateway live-turn fence as the authority. Use product-facing messages
only:

- selected engine unavailable;
- conversation could not be renamed/deleted;
- some conversations could not be deleted;
- defaults could not be loaded/saved.

Never display internal error codes or IDs.

- [ ] **Step 6: Run all Web interaction tests and build**

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction src/components/layout src/components/panel src/components/__tests__/QuickActionFab.spec.tsx
rtk npm run build --workspace=apps/web
~~~

Expected: full interaction tests and Web production build pass.

- [ ] **Step 7: Commit settings and history management**

~~~bash
rtk git add apps/web/src/components/agent-interaction
rtk git commit -m "feat(agent-os): manage chat defaults and history"
~~~

## Sol(max) Batch Review B: Tasks 4-6

Review only the Tasks 4-6 batch diff and these architecture invariants:

- one route-stable provider/runtime/subscription and race-safe first Send;
- one `notifications | ai_chat | null` right-surface owner with no page reflow;
- complete removal of legacy panel/sidebar/create-modal state and wrappers;
- Agent OS folder/history/settings presentations sharing the same runtime; and
- explicit provider/model/reasoning selection with no silent fallback.

Provide the batch acceptance criteria, batch base/head SHAs, focused tests, and
exact batch diff rather than the whole plan. Fix Critical/Important findings
with TDD. Re-review only the previous finding IDs against their fix diff before
starting Task 7.

## Task 7: Update Cross-Process Acceptance, Documentation, and Run Final QA

**Files:**

- Modify: scripts/smoke-interaction-os.mjs
- Modify: scripts/__tests__/smoke-interaction-os.test.mjs
- Modify: docs/ARCHITECTURE.md
- Modify: docs/TESTING.md
- Verify only: docs/superpowers/specs/2026-08-26-agent-os-chat-workspace-ux-design.md
- Verify only: apps/web/src/app/(analytics)/dashboard/components/DashboardChartPanel.agent-os-cutover.regression-1.spec.ts

- [ ] **Step 1: Update the smoke contract first**

Change the smoke create request to reserve one deterministic test
conversationId and include a deterministic bounded title. Assert:

- the exact ID is returned;
- a second same-input POST replays the same ID;
- a changed-title POST for that ID returns 409 in the integration fixture;
- preference read/set/read crosses the authenticated facade without entering
  PostgreSQL;
- provider history remains readable; and
- the existing five MCP tool and approval-pending sequence is unchanged.

The live smoke must delete/archive only the disposable conversation it creates.
Do not delete existing provider history.

Run:

~~~bash
rtk npm run test:scripts
~~~

Expected: smoke and script contract tests pass.

- [ ] **Step 2: Update durable architecture/testing descriptions**

In docs/ARCHITECTURE.md record:

- one authenticated route-stable ConversationProvider/RuntimeHost;
- global AI chat panel versus Agent OS history presentation;
- one RightAuxiliaryPanel with NotificationPanelContent/ConversationPanel and
  no retained PanelSheet shell or panel-open store;
- native serialized descriptor/preference ownership;
- provider-first deletion; and
- no PostgreSQL conversation/preferences model.

In docs/TESTING.md add the new create replay/drift, serialized local-state,
provider deletion, route-stable runtime, single-right-surface state machine,
desktop/mobile panel behavior, clean legacy-surface removal, Dashboard
regression, and browser QA gates.

Do not modify the user-owned design source or DESIGN.md.

- [ ] **Step 3: Run all deterministic package gates**

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/agent-runtime
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/agent-gateway vitest -- run
rtk npm run build --workspace=apps/agent-gateway
rtk npm exec --workspace=apps/server vitest -- run src/agent-os
rtk npm run build --workspace=apps/server
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction src/components/layout src/components/panel src/components/__tests__/QuickActionFab.spec.tsx 'src/app/(analytics)/dashboard/components/DashboardChartPanel.agent-os-cutover.regression-1.spec.ts'
rtk npm run build --workspace=apps/web
~~~

Expected: all commands pass. Report unrelated pre-existing failures separately;
do not hide or weaken their tests.

- [ ] **Step 4: Run architecture and release guards**

~~~bash
rtk npm run check:agents-hygiene
rtk npm run check:agent-os-contraction -- --enforce
rtk npm run check:agent-os-hexagonal
rtk npm run check:copilotkit-train
rtk npm run check:directory-architecture
rtk npm run check:pr-reconstruction -- --base develop
rtk npm run check:pr-release-contract -- --base develop
~~~

Expected: no new persistence, retired interaction application, direct provider
runtime, or directory ownership finding.

- [ ] **Step 5: Verify Nest boot and native macOS package**

~~~bash
rtk npm run dev:server
rtk npm run build --workspace=apps/agent-gateway
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/platform/macos src/__tests__/gateway-nest-loopback.integration.spec.ts
rtk npm pack --workspace=apps/agent-gateway --dry-run
~~~

Expected: Nest reaches ready boot; stop the watch process. Gateway macOS,
loopback, build, and pack checks pass. Claude live conversation remains an
environment limitation when no paid login is available, but its deterministic
session deletion/readiness contracts must pass.

- [ ] **Step 6: Run the mandatory Sol(max) integrated review**

Review the complete implementation against the approved 2026-08-26 design,
this plan, and the older KID-25 runtime/capability contracts. Give the reviewer
the exact `develop...HEAD` diff plus current deterministic gate evidence. The
review must cover at least:

- shared contract strictness and absence of authority/provider leakage;
- Gateway create idempotency, serialized local state, exact provider deletion,
  and live-turn fences;
- Nest authentication/error mapping and absence of conversation persistence;
- one route-stable Web runtime, first-send handoff correctness, and explicit
  model/reasoning selection;
- single right-surface ownership and complete legacy presentation removal;
- Agent OS folder/history/settings behavior without a second runtime; and
- test quality, race coverage, security boundaries, and maintainability.

Use `gpt-5.6-sol` with reasoning effort `max`. Fix every Critical and Important
finding with a failing regression test first, rerun the affected deterministic
gates, and return the fix diff to the same review boundary until no such finding
remains. Do not begin browser QA while integrated review findings are open.

- [ ] **Step 7: Run authenticated browser QA**

Use the isolated Agent OS QA environment and the current development account.
Do not print credentials, cookies, Gateway bearer, execution binding, provider
payloads, or transcripts.

Verify:

1. AI 챗 opens from the bottom Sidebar on Dashboard and at least two work routes.
2. One live Codex turn survives Dashboard to another route to Agent OS and back
   without duplicate network streams or messages.
3. Dashboard Agent OS label, organization chart, cards, and actions are
   unchanged.
4. General and all five Agent drafts open without a create request.
5. First Send creates one exact Conversation under double-click and retry.
6. Provider becomes fixed; model/reasoning can change on the next terminal turn.
7. Settings save/reload uses context/provider defaults and flags an invalid
   stored choice.
8. Search, rename, individual delete, folder delete, and delete all work on
   disposable QA Conversations.
9. Codex archive is executed for a disposable Codex thread. Claude destructive
   behavior is deterministic-test-backed only when live Claude login is absent.
10. Notification and AI chat content replace each other in one right auxiliary
    panel; selecting the active surface closes it.
11. On Agent OS, ai_chat presentation is suppressed without losing its turn;
    notifications remain present when selected, and returning restores chat.
12. 전체 기록 opens Agent OS at the exact current Conversation/context and
    returning does not create another subscription.
13. Cross-surface replacement moves focus into the new body; close and Escape
    restore focus to the latest launcher.
14. Desktop uses the fixed 420 px non-modal panel without reflow, while a
    viewport below 768 px uses the full-width modal drawer.
15. Quick Action FAB never moves and remains hidden while either auxiliary
    surface is open.
16. Browser console has no internal-error toast and network shows one
    CopilotKit conversation transport.

Capture failures as code defects or the explicit Claude environment limitation;
do not add operator readiness/login UI to make QA pass.

- [ ] **Step 8: Review the final diff against the approved design**

Run:

~~~bash
rtk git diff --check develop...HEAD
rtk git status --short
rtk git diff --stat develop...HEAD
~~~

Confirm:

- no Prisma file changed;
- no user-owned design document was overwritten;
- no Dashboard Agent OS semantic change entered the diff;
- no duplicate useAgent or ConversationProvider mount exists;
- no provider path/reference enters Web or Nest public DTOs;
- no silent model/reasoning fallback exists;
- no archive/retention/Task/Session compatibility layer was added;
- no PanelSheet, AgentConversationSidebar, CreateConversationDialog,
  pendingOpen/consumePendingOpen, panel isOpen/setOpen, obsolete panel local
  storage key, AgentOS에서 묻기 label, or automatic chat-to-Agent-OS route jump
  remains; and
- no compatibility wrapper, alias, dual right-surface state, or migration was
  added for the removed presentation paths.

- [ ] **Step 9: Commit documentation and acceptance updates**

~~~bash
rtk git add scripts/smoke-interaction-os.mjs scripts/__tests__/smoke-interaction-os.test.mjs docs/ARCHITECTURE.md docs/TESTING.md
rtk git commit -m "docs(agent-os): verify global conversation workspace"
~~~

## Final Acceptance Checklist

- [ ] Browser-reserved create ID is strict, replayable, and drift-conflicting at
  the native owner boundary.
- [ ] Concurrent descriptor mutations cannot lose or resurrect state.
- [ ] Codex archives and Claude removes only exact provider-owned session
  artifacts.
- [ ] Live-turn deletion fails before provider mutation; repeated absent delete
  succeeds.
- [ ] Preferences are strict, bounded, atomic, serialized, installation-user
  scoped, and absent from PostgreSQL.
- [ ] Nest derives user/organization scope for every API and exposes no provider
  coordinate.
- [ ] One authenticated ConversationProvider/RuntimeHost survives route changes.
- [ ] AI chat panel and Agent OS share one runtime, flow, composer, Query cache, and
  first-send coordinator.
- [ ] Notification and AI chat content are mutually exclusive bodies of one
  `notifications | ai_chat | null` right surface.
- [ ] Desktop uses one fixed 420 px non-modal panel; below 768 px the same panel
  becomes a full-width modal drawer without remaining-width calculation.
- [ ] Agent OS suppresses only duplicate ai_chat presentation; notification
  presentation and the preserved chat runtime follow the fixed route rule.
- [ ] Dashboard Agent OS UI and business actions are unchanged.
- [ ] General plus exactly five Agent folders organize top-level conversations;
  native subagents stay inside parent streams.
- [ ] Provider is immutable after create; model/reasoning remain explicit per
  turn with no silent fallback.
- [ ] Search, rename, individual delete, folder delete, and delete all satisfy
  retry/partial-failure behavior.
- [ ] Replaced panel/sidebar/modal state and components are deleted with their
  imports, fixtures, storage key, mocks, and tests; no compatibility layer
  remains.
- [ ] Shared, Gateway, server, Web, scanner, build, boot, macOS, smoke, and
  browser QA evidence is recorded.
- [ ] One Sol(max) integrated review passed before browser QA with no open
  Critical or Important finding.
- [ ] The only live limitation, when still applicable, is unavailable Claude
  subscription/login; deterministic Claude contracts still pass.
