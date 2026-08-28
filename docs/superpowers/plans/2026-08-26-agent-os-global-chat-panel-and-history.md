# Agent OS Global Chat Panel and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Tasks 1–7 complete; Task 8 desktop resize and Task 9 domain acceptance in progress
**Revised:** 2026-08-28

**Goal:** Make one provider-native KidItem conversation available from every authenticated work screen, restore CopilotKit OSS as the interaction owner with its real SQLite event-history runner, and deliver the approved KidItem Agent OS/Dashboard chat design without adding PostgreSQL conversation state or a paid CopilotKit service.

**Architecture:** The authenticated Web app shell mounts exactly one CopilotKit provider, one route-stable presentation host, and one right auxiliary surface whose visible state is `notifications | ai_chat | null`. CopilotKit OSS SQLite-runner semantics, with only the characterization-proven narrow package fork, own completed AG-UI run events, reconnect replay, and in-process run serialization in one API-local file; Nest remains the authenticated active-turn authority and exact provider-stop bridge, while the native Agent Gateway owns provider model continuity and bounded conversation metadata. At 1536 pixels and above the AI chat surface uses its validated 320-640-pixel browser-local width as both panel width and work-surface margin; from 768 through 1535 pixels the same width overlays without narrowing Dashboard. Notifications remain 352 pixels, and Agent OS does not consume the auxiliary width. Dashboard and Agent OS share one 256/64-pixel collapsible sidebar shell and desktop preference while keeping different navigation bodies. Agent OS and the compact Dashboard panel share message, empty-state, composer, and business-evidence presentation primitives.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, TanStack Query, CopilotKit OSS 1.69.0 v2 hooks/runtime and SQLite-runner semantics, `better-sqlite3` 12.2.0, Radix UI, NestJS, Zod, native Codex app-server, Claude CLI provider-local JSONL state, Vitest, Testing Library. Use upstream `@copilotkit/sqlite-runner` 1.69.0 directly only if its characterization contract passes; otherwise use one provenance-preserving workspace fork of that package and nothing else in CopilotKit.

---

## Source of Truth and Fixed Scope

Implement this plan on top of the current KID-25 branch and the approved design:

- docs/superpowers/specs/2026-08-26-agent-os-chat-workspace-ux-design.md
- docs/superpowers/specs/2026-08-23-kid-25-agent-os-clean-contraction-design.md
- DESIGN.md

The 2026-08-26 design controls this UX extension. The clean-contraction design
remains the source for capability and approval contracts. The old 2026-08-23
implementation plan is archived history and is not an authority. The current
process-token, provider-Conversation, exact-terminal runtime, and API-owned
`CapabilityMutationDispatcher` contract in `docs/ARCHITECTURE.md` and the
scoped Agent OS/Gateway `AGENTS.md` files supersede older per-turn
execution-binding, Task/Attempt, and Invocation-worker text.

Execute the nine integrated Tasks below. Task 2 keeps its three tightly
coupled Gateway-owner phases together, and Task 6 keeps Agent OS history and
Settings/history management together. Preserve focused tests and commits inside
those phases; do not turn them back into separate Task-level review boundaries.
Task 7 is the original cross-process acceptance and browser-QA checkpoint.
Task 8 adds the approved desktop-only AI-chat resize contract without reopening
the interaction runtime, and Task 9 adds the two owner-domain acceptance slices
requested after the original QA pass.

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
| Provider model continuity | Provider-native Codex thread or Claude session |
| KidItem durable conversation metadata | Gateway-local bounded descriptor only |
| Interaction history | CopilotKit OSS SQLite runner's full canonical AG-UI event log for completed interactions; never PostgreSQL, provider raw payload, credential, token, or private reasoning |
| CopilotKit service boundary | Local OSS packages only; no CopilotKit Intelligence, cloud runtime, or paid hosted persistence |
| Conversation creation | Browser reserves one opaque ID; first Send creates |
| Create idempotency | Same ID plus same runtime/Agent/title replays; drift conflicts |
| Provider | Selectable in a draft, immutable after creation |
| Model and reasoning | Explicit every turn; saved defaults are preferences, never fallback policy |
| Sidebar sections | Agent: exact five code-owned Agent folders; Chat: General conversations only |
| Native subagents | Stay inside the parent provider conversation |
| Global access | One app-shell AI chat panel from every authenticated normal work surface |
| Dashboard Agent OS UI | Label, organization chart, cards, and current actions remain unchanged |
| Right surface | Exactly `notifications | ai_chat | null`; selecting one replaces the other |
| Panel mode | AI chat defaults to 352 px and stores one validated 320-640 px browser-local desktop preference; 1536+ pushes by the rendered width and 768-1535 overlays at that width. Notifications stay 352 px. Agent OS and the existing below-768 branch do not consume this preference. |
| Sidebar shell | Shared 256 px expanded / 64 px collapsed desktop shell and preference; different Dashboard and Agent OS bodies; component-local mobile drawer state |
| Conversation presentation | Opaque `#4c1d95` user bubble, structured assistant prose, shared contextual empty state, shared two-tier composer, compact user-language business-evidence rail |
| History deletion | Provider removal first, descriptor removal second, exact namespaced SQLite event history last; an absent-provider retry still finishes local cleanup |
| Preferences | One strict Host Runner installation-user file; no organization copies |
| Schema | No Prisma change and no new Task, Session, Attempt, folder, archive, or retention model; the runner's local SQLite schema is adapter-owned |
| Legacy cutover | Delete replaced UI shells, state, fixtures, exports, and route jumps; no wrappers, aliases, dual state, or migration |

## 2026-08-28 Current-Diff Integration Status

This revision is applied on top of the existing KID-25 diff. The commits below
are implementation evidence, not permission to reset or recreate those files:

| Area | Existing implementation | Remaining work in this revision |
|---|---|---|
| Tasks 1-3 contracts/Gateway/Nest | `2feca802`, `f2c14118`, `a2d07724`, `776471f1`, `c28c32db`, `a427ef87` | Preserve; rerun deterministic gates after the remaining changes |
| Task 4 route-stable baseline | `5aabc8e0`, `3d067503`, `cccc9f55` | Preserve the completed first-send/public-history cleanup, characterized OSS SQLite-runner boundary, and provider-history control-plane removal; the visual correction does not reopen this runtime work |
| Runtime Module Locality cleanup | Completed in current integrated diff | Provider Implementations/specs are local to their folders, SQLite history uses an outgoing Adapter lane, `ActiveTurnRegistry` is control-internal, and one deep native-provider-runtime Interface owns Codex/Claude login, startup, readiness, and idempotent close assembly |
| Task 5 global surface baseline | `c01babbf` | Preserve the single right-surface state and 1536 push threshold; Task 8 replaces only the AI-chat surface's fixed 352px width with the validated local desktop preference |
| Task 6 history/settings baseline | `66e15d0d`, `bb5d5693`, `fc0052ed` | Preserve the working conversation/history behavior; finish the shared sidebar shell, draft/composer parity, message hierarchy, and business-evidence presentation |
| Prior integration/QA | `bb19e66c`, `7aa31181`, later QA fixes | Evidence remains useful, but final Sol review and browser QA reopen after runtime and visual changes |

Current completion summary:

- [x] Tasks 1-3 implementation and Batch A review
- [x] Task 4 CopilotKit ownership revision and affected regression gates
- [x] Remaining Runtime Module Locality cleanup and moved-surface regression gates
- [x] Task 5 accepted 1536+/overlay visual correction and responsive regressions
- [x] Task 6 accepted shared-sidebar/message/composer visual correction and Batch B review (RESOLVED)
- [x] Task 7 Step 2 durable architecture/testing update and current deterministic/boot/package evidence
- [x] Task 7 mandatory Sol(max) integration review, business eval, and browser QA
- [ ] Task 8 resizable desktop AI-chat panel and focused browser QA
- [ ] Task 9 Sourcing vertical-slice and Sourcing-to-Products acceptance QA

The detailed unchecked steps below describe the current-target acceptance
recipe. They do not reopen the completed Tasks 1-3; this status summary is the
authoritative execution boundary for continuing on the existing diff.

Do not delete the existing implementation or replay completed Tasks 1-4. For
Tasks 5-6, write the revised failing tests against the current files and make
the smallest integrated change. Existing dirty Gateway/outbox, Sourcing owner,
and runtime fixes remain in place and are not part of the visual refactor unless
a revised regression test reaches them.

Keep `DESIGN.md`, the approved UX spec, `globals.css`, and semantic Tailwind
aliases aligned. This revision deliberately resolves the documented
`purple-600 #9333ea` versus implemented `--primary #7c3aed` drift in favor of
the semantic `--primary` contract. Do not introduce literal palette classes,
decorative gradients, or a second visual source while implementing it.

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

Nest derives `organizationId` from authenticated context and includes it only
on Gateway Conversation-facing commands. The Gateway persists it in
`ConversationDescriptor` and fences create/list/history/rename/delete/turn
start/input/interrupt by exact organization. `userId` never enters the Gateway
wire: a live Turn remains initiating-user scoped in Nest. Provider terminal,
watchdog, process-exit, and Gateway-registration lifecycle messages carry no
organization. Descriptor ownership is an access fence, never MCP business
authority; MCP callbacks still resolve org/user/turn/execution only from the
current Nest active-Turn record.

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
- every descriptor persists the server-derived organization while public
  summaries and provider calls expose no organization field;
- the same organization can share a Conversation across authenticated users,
  while another organization receives not-found for every Conversation-facing
  operation, including an active Conversation;
- a former descriptor catalog without organization ownership is discarded as
  a clean cutover and is never adopted by the first caller after API restart;
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

1. parse the server-derived organization and read the descriptor by
   input.conversationId;
2. if present with another organization, fail as conversation-not-found;
3. if present in the same organization, compare runtime, agentKey, and title
   exactly;
4. replay its public summary on equality;
5. throw gateway_conversation_create_conflict on same-organization drift; and
6. coalesce concurrent missing-row creates in a process-local map keyed only by
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
- Modify: apps/agent-gateway/src/provider/codex/codex-conversation.provider.ts
- Modify: apps/agent-gateway/src/provider/codex/codex-conversation.provider.spec.ts
- Modify: apps/agent-gateway/src/provider/codex/codex-app-server-session.gateway.spec.ts
- Rename: apps/agent-gateway/src/provider/claude-session-history.reader.ts
  to apps/agent-gateway/src/provider/claude/claude-session.store.ts
- Rename: apps/agent-gateway/src/provider/claude-session-history.reader.spec.ts
  to apps/agent-gateway/src/provider/claude/claude-session.store.spec.ts
- Modify: apps/agent-gateway/src/provider/claude/claude-conversation.provider.ts
- Modify: apps/agent-gateway/src/provider/claude/claude-conversation.provider.spec.ts
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
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/provider/codex/codex-conversation.provider.spec.ts src/provider/claude/claude-session.store.spec.ts src/provider/claude/claude-conversation.provider.spec.ts src/turn/active-turn.registry.spec.ts src/control/gateway-command-dispatcher.spec.ts src/conversation/conversation-gateway.spec.ts
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
  but neither enters the preference wire payload or local storage key;
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

## Task 4: Adopt the CopilotKit OSS SQLite Event-History Runner

**Files:**

- Modify: apps/web/src/components/agent-interaction/ConversationRuntimeHost.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationFlow.tsx
- Modify: apps/web/src/components/agent-interaction/conversation-first-send.coordinator.ts
- Modify: apps/web/src/components/agent-interaction/conversation-title.ts
- Modify: apps/web/src/components/agent-interaction/useNewConversationDraft.ts
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationRuntimeHost.spec.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/conversation-first-send.coordinator.spec.ts
- Modify: apps/web/src/components/agent-interaction/__tests__/useNewConversationDraft.spec.tsx
- Modify: apps/web/src/components/agent-interaction/conversation-api.ts
- Modify: apps/web/src/components/agent-interaction/conversation-api.spec.ts
- Modify: apps/web/src/components/agent-interaction/conversation-surface-state.ts
- Modify: apps/web/src/components/agent-interaction/conversation-surface-state.spec.ts
- Modify: apps/web/src/components/agent-interaction/ConversationProvider.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationProvider.spec.tsx
- Modify: apps/web/src/components/agent-interaction/AgentConversationSurface.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/AgentConversationSurface.spec.tsx
- Delete: apps/web/src/components/agent-interaction/conversation-runtime-reconciliation.ts
- Delete: apps/web/src/components/agent-interaction/__tests__/conversation-runtime-reconciliation.spec.ts
- Modify: apps/web/src/lib/query-keys.ts
- Modify: apps/web/src/lib/query-keys.spec.ts
- Modify: apps/server/src/agent-os/application/port/in/capability/conversation.port.ts
- Modify: apps/server/src/agent-os/application/service/conversation.service.ts
- Modify: apps/server/src/agent-os/application/service/conversation.service.spec.ts
- Modify: apps/server/src/agent-os/adapter/in/http/interaction/conversation-copilotkit.controller.ts
- Modify: apps/server/src/agent-os/adapter/in/http/interaction/conversation-copilotkit.controller.spec.ts
- Modify: apps/server/src/agent-os/adapter/in/http/interaction/conversation.controller.ts
- Modify: apps/server/src/agent-os/adapter/in/http/interaction/conversation.controller.spec.ts
- Add: apps/server/src/agent-os/adapter/out/history/sqlite/copilotkit-sqlite-event-history.ts
- Add: apps/server/src/agent-os/application/port/out/history/conversation-event-history.port.ts
- Modify: apps/server/src/agent-os/agent-os-interaction-http.module.ts
- Modify: apps/server/package.json
- Modify: package-lock.json
- Add: packages/copilotkit-sqlite-runner/* as the narrow, attributed 1.69.0 fork required by the recorded upstream failures
- Modify/Delete: packages/shared/src/agent-runtime/provider-message.ts and exact exports/tests when orphaned
- Modify/Delete: apps/server/src/agent-os/adapter/out/runtime/gateway/*history* and exact command/event branches
- Modify/Delete: apps/agent-gateway/src/control/*, apps/agent-gateway/src/conversation/*, and apps/agent-gateway/src/provider/* history-only branches
- Modify: apps/server/Dockerfile
- Modify: deploy/office/compose.office.yml
- Modify: docs/runbooks/environment-variables.md

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
- changing routes without changing active Conversation keeps the same
  CopilotKit interaction, running state, live messages, tool projections, and
  stop control; and
- changing the selected Conversation disposes the old subscription before
  creating the next exact binding;
- stock runner `connect` replays valid ordered AG-UI events from a real SQLite
  file across runner/service reconstruction without copying them into
  PostgreSQL or a Web cache;
- the same public conversation ID in two organizations resolves to distinct
  internal runner thread keys and cannot replay across the owner fence;
- browser stream unsubscribe detaches only that subscriber and does not clear
  Nest active-turn authority or terminate the provider run;
- runner `isRunning` reads the exact organization/user/conversation active turn;
- runner `stop` interrupts that exact active turn, returns false when none is
  active, and does not clear the active turn on interrupt acknowledgement; and
- exact provider terminal clears running state while a stale terminal cannot
  clear a newer turn;
- API restart leaves no durable running lock; the new process accepts the next
  explicit user turn without resuming reasoning or creating a recovery workflow;
- exact Conversation deletion removes its namespaced SQLite events after the
  provider/descriptor delete; an absent or foreign descriptor cleans only the
  caller namespace and still returns `404`;
- an existing Conversation calls `connectAgent` once per selected runtime
  binding, while a draft, StrictMode remount, and presentation route change do
  not add another connect;
- the retired public history GET, Web API function, Query key, and custom
  reconciliation module are absent after runner `connect` owns history; and
- provider-history commands, events, mappers, and `ProviderMessage` contracts
  are absent once no production caller remains.

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/conversation.service.spec.ts src/agent-os/adapter/in/http/interaction/conversation-copilotkit.controller.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction/__tests__/ConversationRuntimeHost.spec.tsx src/components/agent-interaction/__tests__/conversation-first-send.coordinator.spec.ts src/components/agent-interaction/__tests__/useNewConversationDraft.spec.tsx src/components/agent-interaction/__tests__/AgentConversationSurface.spec.tsx src/components/agent-interaction/conversation-api.spec.ts src/components/agent-interaction/conversation-surface-state.spec.ts
~~~

Expected: the new server tests FAIL while the request-scoped custom runner has
no real event store, stream teardown clears authority, provider history remains
a second control plane, and existing Conversations do not connect exactly once.

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

- [ ] **Step 5: Restore CopilotKit interaction ownership behind the route-stable host**

Keep the already-completed removal of `StatelessConversationAgentRunner`.
First install the upstream open-source runner at the fixed CopilotKit 1.69.0
release train for characterization:

~~~json
{
  "@copilotkit/sqlite-runner": "1.69.0",
  "better-sqlite3": "12.2.0"
}
~~~

Before production wiring, run package-level characterization tests against the
unmodified upstream runner for all five contracts:

1. a `run` continues and records its exact terminal event when the original
   HTTP/SSE subscriber leaves;
2. process reconstruction cannot leave a stale durable running lock;
3. stop honors the optional exact `runId`, rejects a stale/mismatched run, and
   does not release the matching run on acknowledgement before the exact
   provider terminal;
4. the same public Conversation ID in two organization namespaces cannot
   collide; and
5. exact per-thread deletion removes only that Conversation's completed event
   chain.

Use upstream directly only if all five pass. If any contract fails, create one
narrow workspace fork of `@copilotkit/sqlite-runner` 1.69.0, retain its license
and upstream provenance, and change only the failing lifecycle/storage seams.
Do not fork CopilotKit runtime, AG-UI, React hooks, or Web integration; do not
copy the runner into an Agent OS service. The fork must keep upstream's event
compaction/replay semantics and public AgentRunner behavior, with its delta
covered by focused package tests.

Do not call CopilotKit Intelligence, a hosted CopilotKit API, or any paid
persistence service. Configure one Nest-owned runner over
`KIDITEM_COPILOTKIT_SQLITE_PATH`; use `:memory:` or a disposable temporary file
in tests, a resolved `.kiditem/agent-os/copilotkit-events.sqlite` default in
development, and require an explicit persistent path in production.

The runner owns the full canonical AG-UI event recording for completed
interactions, ordered replay, active connection bridging, and in-process
one-run-at-a-time serialization. SQLite must not become execution authority:
Nest's in-memory exact active-turn record remains the only authority for whether
a provider turn is running or may be stopped. Do not persist a running lock
across API restart. Provider-local Codex/Claude history remains model continuity
only; it is not separately projected into the Web interaction. Keep no parallel
`MESSAGES_SNAPSHOT` synthesis.

Wrap the singleton with a thin authenticated owner-scoped runner. It must map
the public `threadId` to a collision-free internal key derived from the
server-authenticated `organizationId` and conversation ID before every
SQLite-runner operation. The public event/input thread ID remains the original
conversation ID. Never derive business authority from the namespaced string or
from CopilotKit input.

Keep the two exact active-turn operations on the owner-facing Conversation port:

~~~typescript
interface ConversationPort {
  // existing methods stay unchanged
  isRunning(input: ConversationCoordinates): Promise<boolean>;
  stop(input: ConversationCoordinates): Promise<boolean>;
}
~~~

`ConversationService.isRunning` returns whether the exact organization-owned
Conversation slot currently holds a turn. The slot key is organization plus
Conversation, while its record retains the initiating user and exact turn/
execution coordinates. `stop` looks up that stored record and calls
`gateway.interrupt(storedCoordinates)`; it returns false without mutation when
no exact turn exists. It never deletes the turn on interrupt acknowledgement.
Existing exact-terminal handling remains the only clear operation, so a stale
terminal cannot clear a successor.

For `run` and `connect`, the thin wrapper delegates to the singleton SQLite
runner with the authenticated namespaced thread key. For `isRunning`, consult
the exact Nest `ConversationService` active-turn record. For `stop`, call only
the exact provider interrupt through `ConversationService`; do not invoke the
stock runner's early `stop` path because interrupt acknowledgement is not
terminal. The underlying provider terminal must complete the AG-UI run, which
then closes the SQLite run and clears the exact Nest active turn. A stale
terminal cannot clear a successor, and `ConversationService.start` must refuse
to overwrite an already active exact Conversation.

Remove controller observable-finalize calls that treat browser/SSE unsubscribe
as provider terminal. Runner execution continues independently of that
subscriber; disconnect only detaches the browser observer. Delete the obsolete
`ConversationPort.disconnect` path if it has no remaining true terminal use.

On one single-instance API boot there must be no stale SQLite lock capable of
blocking the next explicit turn. Prefer removing durable `run_state` authority
in the narrow fork and using only an in-process runner guard plus Nest active
turn; if direct upstream use remains viable, its startup handling must provide
the same externally tested result. API boot never restores or continues
provider reasoning. It does perform the single bounded
`CapabilityMutationDispatcher` bootstrap sweep of at most 100
pending/approved receipts. Do not add a provider retry loop, reasoning recovery
state machine, durable active-turn table, or automatic Continue.

The runner package owns a narrow exact-thread deletion seam: delete the exact
completed `agent_runs` chain and any runner-private coordination row for one
authenticated namespaced Conversation after Gateway provider-first/
descriptor-second deletion succeeds. Invoke this seam even when the provider/
descriptor is already absent so a retry can finish prior local cleanup. Do not
implement TTL, retention, transcript export, or a compatibility importer.

After SQLite `connect` is green, keep the completed deletion of the duplicate
public Web history path:

- remove `GET /api/agent-os/conversations/:conversationId/history` from
  ConversationController and its tests;
- remove `getConversationHistory` from conversation-api.ts and its tests;
- remove only `queryKeys.conversations.history`; and
- remove the corresponding Query call and custom history/live reconciliation
  from ConversationRuntimeHost.

Then remove `ConversationPort.history` and the exact Gateway/provider history
control plane, because the SQLite runner is now the sole UI event-history seam.
Delete orphaned `ProviderMessage` schemas, Claude JSONL-to-message projection,
Codex history conversion, commands/events, brokers, and tests rather than
retaining a compatibility layer. Do not remove provider session persistence
itself: Codex threads and Claude sessions still own model continuity.

ConversationProvider contains the CopilotKit transport and interaction owner.
ConversationRuntimeHost:

- mounts one ActiveConversationRuntime child for the selected existing
  Conversation or the selected draft's reserved conversationId;
- treats draft binding as local setup only: it must not create a Provider
  conversation, connect event history, or run a turn;
- keeps that exact binding mounted when first Send promotes the reserved draft
  ID to an existing Conversation, so the coordinator can hand off without a
  render-effect race;
- adapts the selected Conversation, draft promotion, explicit model/effort,
  messages, tool projections, and CopilotKit interaction into shared React
  presentation state;
- derives running/stop behavior from CopilotKit and does not own a second
  active-turn ref, interrupt marker, stale-settlement fence, or provider-history
  reconciliation state;
- exposes a React context consumed by both AI chat panel and Agent OS presentations;
- leaves React Query as owner of summaries, readiness, preferences, and
  business-resource queries; AG-UI event history enters through the stock
  SQLite runner's `connect`; and
- never starts or resumes a turn from a route effect.

For an existing selected Conversation, call `agent.connectAgent()` exactly
once for that mounted runtime binding. A draft performs no connect. React
StrictMode, presentation remounts, and ordinary route changes must not create a
second connect; selecting a different Conversation disposes the old binding and
connects the new one once.

Delete the covered-live-message reconciliation algorithm and custom Web
lifecycle tests after equivalent CopilotKit run/connect/stop contract tests are
green. Keep first-send coalescing as its separate deep module.

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
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/conversation.service.spec.ts src/agent-os/adapter/in/http/interaction/conversation-copilotkit.controller.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction src/lib/query-keys.spec.ts
~~~

Expected: real SQLite event replay, authenticated owner fencing, disconnect and
interrupt races, exact terminal behavior, existing-conversation connect, all
current card/message tests, and new coordinator tests pass with one CopilotKit
interaction and no provider/Web history reconciliation owner.

- [ ] **Step 8: Commit the route-stable runtime**

~~~bash
rtk git add apps/server/package.json package-lock.json apps/server/Dockerfile apps/server/src/agent-os apps/agent-gateway/src packages/shared/src/agent-runtime apps/web/src/components/agent-interaction apps/web/src/lib/query-keys.ts apps/web/src/lib/query-keys.spec.ts deploy/office/compose.office.yml docs/runbooks/environment-variables.md
rtk git commit -m "refactor(agent-os): adopt CopilotKit SQLite event runner"
~~~

### Terra(max) Task 4 Contract Check

Review only browser-reserved draft identity, create canonicalization,
first-send coalescing/drift rejection, one-handoff semantics, stock OSS SQLite
event replay, organization namespacing, browser disconnect versus provider
terminal, exact interrupt/terminal ownership, stale-start recovery, exact
event-history deletion, removal of both public and provider history duplicates,
and preservation of one CopilotKit interaction across presentation and route
changes. Do not perform a general UI quality review here. Fix findings with TDD
and re-review only the reported finding IDs.

## Task 5: Align the Single Right Auxiliary Panel with the Approved Dock

**Files:**

- Modify: apps/web/src/components/agent-interaction/ConversationPanel.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationPanel.spec.tsx
- Modify: apps/web/src/components/agent-interaction/conversation-context.catalog.ts
- Modify: apps/web/src/components/layout/RightAuxiliaryPanel.tsx
- Modify: apps/web/src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx
- Create: apps/web/src/components/layout/CollapsibleSidebarShell.tsx
- Create: apps/web/src/components/layout/__tests__/CollapsibleSidebarShell.spec.tsx
- Modify: apps/web/src/components/layout/AppLayout.tsx
- Modify: apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx
- Modify: apps/web/src/components/layout/Sidebar.tsx
- Modify: apps/web/src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts
- Modify: apps/web/src/components/layout/__tests__/Sidebar.right-surface.spec.tsx
- Modify: apps/web/src/store/useStore.ts
- Modify: apps/web/src/store/useStore.spec.ts
- Modify: apps/web/src/components/agent-interaction/conversation-surface-state.ts
- Modify: apps/web/src/components/agent-interaction/conversation-surface-state.spec.ts
- Modify: apps/web/src/components/panel/NotificationPanelContent.tsx
- Modify: apps/web/src/components/panel/__tests__/NotificationPanelContent.spec.tsx
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
- 1536 px and wider uses one 352 px non-modal dock and applies exactly one
  `2xl:mr-[352px]` work-surface offset while the right surface is visible;
- from 768 through 1535 px, including 1280 px, the same 352 px panel overlays the work surface
  without a second state owner;
- below 768 px the same active surface uses a full-width focus-managed modal
  drawer;
- switching notification and AI chat bodies transfers focus to the new body,
  while closing with the close action or Escape restores focus to the launcher;
- no ResizeObserver, measured remaining-width calculation, route-specific
  minimum, or persisted dock/overlay state exists;
- Quick Action FAB never moves and is hidden while either surface is open;
- replacing or closing chat does not interrupt its active turn;
- 전체 기록 navigates with the current conversation/context and does not mount
  another runtime subscription;
- the existing Sourcing decision-center entry opens its fixed draft in ai_chat
  under the label 소싱 Agent에게 묻기, without retaining AgentOS에서 묻기 or
  navigating to /agent-os; and
- Dashboard Agent OS regression fixture remains byte/semantic equivalent in
  label, chart, cards, and actions;
- the Dashboard sidebar uses the shared 256 px expanded / 64 px collapsed shell,
  exposes labelled 40-by-40 collapse and expand controls, and keeps AI chat and
  Dashboard navigation accessible in collapsed mode; and
- the desktop sidebar preference remains stable across Dashboard and Agent OS
  route changes, while mobile drawer state is independent.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/layout/__tests__/AppLayout.auth.spec.tsx src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx src/components/layout/__tests__/CollapsibleSidebarShell.spec.tsx src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts src/components/layout/__tests__/Sidebar.right-surface.spec.tsx src/store/useStore.spec.ts src/components/agent-interaction/__tests__/ConversationPanel.spec.tsx src/components/agent-interaction/conversation-surface-state.spec.ts src/components/panel/__tests__/NotificationPanelContent.spec.tsx src/components/panel/__tests__/PanelAlertRow.spec.tsx src/components/panel/lib/__tests__/panel-store.spec.ts src/components/__tests__/QuickActionFab.spec.tsx 'src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardChartPanel.agent-os-cutover.regression-1.spec.ts'
~~~

Expected: the revised assertions FAIL because the current implementation still
pushes Dashboard at 1280 pixels and the Dashboard/Agent OS shells use different
240/68 and 260/hidden geometry and controls.

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

Keep only the open surface coordinate in the global Zustand app store:

~~~typescript
type ActiveRightSurface = 'notifications' | 'ai_chat' | null;
~~~

Expose selectRightSurface(surface) so selecting the current value writes null
and selecting the other value replaces it in one state transition. Expose
closeRightSurface() for the shell close action.

Panel data, SSE state, hidden rows, and recovery remain in panel-store. Remove
isOpen, setOpen, PANEL_OPEN_LS_KEY, readOpenFromStorage, every related fixture,
and every caller. Do not read, clear, or migrate the obsolete browser key.

Preserve the completed PanelSheet-to-NotificationPanelContent cutover: it has no
Dialog shell or open-state selectors and renders only as the notification body
inside RightAuxiliaryPanel. Keep usePanelStream mounted independently in
AppLayout through NotificationDataMount. Do not recreate PanelMount,
PanelSheet, or an invisible compatibility UI wrapper while changing the dock.

Keep PanelAlertRow free of the retired setPanelOpen dependency. Notification
navigation preserves activeRightSurface like every other ordinary route
navigation. Change the scoped AGENTS.md files only if the approved responsive
ownership makes their current text false.

Sidebar remains a launcher: AppLayout passes notification/chat callbacks and
open state. Do not add chat to menu definitions or make it a route link.

Keep the existing openConversation action as the exact draft plus ai_chat
launcher. AppLayout and Sourcing decision-center remain callers of this one
path, with no automatic /agent-os push, old AgentOS에서 묻기 label, route-jump
variant, or compatibility alias.

- [ ] **Step 4: Build the shared collapsible sidebar shell**

Create `CollapsibleSidebarShell` as a presentation-only layout primitive. It
owns:

- desktop width `256px` while expanded and `64px` while collapsed;
- KidItem identity/home slot, sidebar-local collapse/expand controls, border,
  overflow, 100-150ms reduced-motion-aware width transition, and labelled
  tooltip/focus treatment;
- a 40-by-40 minimum desktop control target and 44-by-44 mobile/touch target;
  and
- slots for surface-specific body and footer content.

It does not import menu definitions, conversation state, runtime state,
React Query, or provider hooks. Keep the existing `useStore().sidebarOpen` as
the single desktop preference and use it from Dashboard and Agent OS. Mobile
drawer open/closed state stays component-local and does not overwrite that
preference. `lockCollapsed` may constrain the rendered state for an editor
route but must not create a second preference.

Refactor `Sidebar` to supply the Dashboard logo/home, product navigation, and
bottom utilities to this shell. Update `AppLayout` offsets to 256/64. Do not
change Dashboard menu composition, Agent OS organization chart, or business
actions.

- [ ] **Step 5: Build one responsive auxiliary panel shell**

RightAuxiliaryPanel renders the one active content body. Its non-mobile frame is
always a fixed 352-pixel surface:

~~~tsx
<section
  data-testid="right-auxiliary-panel"
  role="complementary"
  className="fixed inset-y-0 right-0 z-[90] flex w-[352px] max-w-full flex-col border-l bg-background shadow-sm"
>
  {children}
</section>
~~~

AppLayout wraps both the normal work surface and Agent OS presentation in one
width owner and applies the desktop offset through CSS only:

~~~tsx
const auxiliaryVisible = visibleRightSurface !== null;

<div
  data-testid="authenticated-work-surface"
  className={cn(
    'min-w-0 transition-[margin] duration-150 motion-reduce:transition-none',
    auxiliaryVisible && '2xl:mr-[352px]',
  )}
>
  {isAgentWorkspace ? children : content}
</div>
~~~

At 1536 pixels and wider this reduces the work-surface width, including
Dashboard, without covering it. From 768 through 1535 pixels, the margin utility is
inactive and the same fixed 352-pixel frame behaves as an overlay. Below 768
pixels, the existing mobile branch renders the same content in a full-width
Radix modal drawer with focus trapping.

Use one matchMedia('(max-width: 767px)') result only to select Radix modality;
do not create a dock/overlay state or a second content body. AppLayout captures
the launcher element in a ref.
On open or cross-surface replacement, focus the new body's labelled heading;
on close or Escape, restore focus to the most recent launcher. Keep DOM refs
out of Zustand.

Do not add ResizeObserver, measured-content state, page-specific width rules,
or separate dock and overlay components. The responsive change affects only
the shared authenticated work-surface wrapper and panel shell; notification
data and ConversationRuntimeHost remain mounted independently.

- [ ] **Step 6: Build the AI chat panel content**

ConversationPanel provides:

- fixed General/Agent identity and existing title;
- new-conversation menu for General plus the exact five Agents;
- Settings;
- 전체 기록, preserving selected conversation/context while navigating to
  /agent-os;
- close; and
- the shared conversation flow/composer presentation.

Use the approved compact hierarchy: context mark plus title on the left,
icon-only New/Settings/전체 기록/Close actions on the right, an independent
message scroll region, and the shared composer at the bottom. Keep all normal
Gateway, provider-local, transport, and execution labels absent. Empty panel
state uses the shared ConversationEmptyState added in Task 6; until that file is
introduced, retain the current functional placeholder rather than adding a
second interim empty-state component.

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

- [ ] **Step 7: Coordinate Quick Action and notifications**

The existing Quick Action conversation entry opens the same unsaved General
draft in the AI chat panel; it no longer navigates first to /agent-os.

QuickActionFab receives only whether an auxiliary surface is open. It never
moves and is hidden until the surface closes. Preserve all existing
product/detail/thumbnail actions unchanged. Opening notifications atomically
replaces AI chat; closing or replacing the chat presentation must not stop the
active CopilotKit interaction.

- [ ] **Step 8: Verify the notification-shell cutover removed legacy code**

Run:

~~~bash
rtk rg -n 'PanelSheet|function PanelMount|kiditem\.panel\.open|readOpenFromStorage|setPanelOpen' apps/web/src/components/panel apps/web/src/components/layout apps/web/src/store
rtk rg -n '^\s*(isOpen|setOpen):' apps/web/src/components/panel/lib/panel-store.ts apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts
~~~

Expected: both commands return no matches. Remove stale imports, mocks, fixture
fields, and tests instead of exempting them.

- [ ] **Step 9: Run layout regressions and build**

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/layout src/store/useStore.spec.ts src/components/agent-interaction src/components/panel src/components/__tests__/QuickActionFab.spec.tsx 'src/app/(analytics)/dashboard/components/DashboardChartPanel.agent-os-cutover.regression-1.spec.ts'
rtk npm run build --workspace=apps/web
~~~

Expected: tests and production Web build pass; Dashboard Agent OS UI remains
unchanged.

- [ ] **Step 10: Check instruction hygiene and commit**

~~~bash
rtk npm run check:agents-hygiene
rtk git add apps/web/src/components/agent-interaction apps/web/src/components/layout apps/web/src/components/panel apps/web/src/components/QuickActionFab.tsx apps/web/src/components/__tests__/QuickActionFab.spec.tsx apps/web/src/components/__tests__/GenerationCompletionWatcher.spec.tsx apps/web/src/store 'apps/web/src/app/(analytics)/dashboard/components/DashboardSidePanel.spec.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationDetail.tsx'
rtk git commit -m "refactor(agent-os): align the responsive chat dock"
~~~

## Task 6: Align the Agent OS History, Settings, and Conversation Workspace

### Phase 6A: Align the Full Agent OS Conversation Workspace

**Files:**

- Modify: apps/web/src/components/agent-interaction/ConversationFlow.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationHeader.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationFolderTree.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationCombinedSelector.tsx
- Create: apps/web/src/components/agent-interaction/ConversationEmptyState.tsx
- Create: apps/web/src/components/agent-interaction/ConversationCardFrame.tsx
- Create: apps/web/src/components/agent-interaction/ConversationResponseBody.tsx
- Create: apps/web/src/components/agent-interaction/ConversationEvidenceRail.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationFolderTree.spec.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationCombinedSelector.spec.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/AgentConversationComposer.spec.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationPanel.spec.tsx
- Create: apps/web/src/components/agent-interaction/__tests__/ConversationPresentation.spec.tsx
- Modify: apps/web/src/components/agent-interaction/AgentConversationSurface.tsx
- Verify absent: apps/web/src/components/agent-interaction/AgentConversationSidebar.tsx
- Modify: apps/web/src/components/agent-interaction/AgentConversationComposer.tsx
- Modify: apps/web/src/components/agent-interaction/AgentConversationMessage.tsx
- Modify: apps/web/src/components/agent-interaction/CapabilityInvocationCard.tsx
- Modify: apps/web/src/components/agent-interaction/OperationReferenceCard.tsx
- Modify: apps/web/src/components/agent-interaction/ResourceReferenceCard.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/AgentConversationSurface.spec.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/CapabilityInvocationCard.spec.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/ReferenceCards.spec.tsx
- Modify: apps/web/src/app/agent-os/page.tsx
- Modify: apps/web/src/app/globals.css
- Modify: apps/web/tailwind.config.ts
- Modify: DESIGN.md

- [ ] **Step 1: Add failing workspace, tree, and composer tests**

Test:

- /agent-os first focusable action is 대시보드로 돌아가기 and navigates to
  /dashboard;
- the sidebar has exactly `에이전트` and `채팅` sections; the Agent section
  orders sourcing, merchandising, supply, channel_operations, advertising with
  approved Korean labels, while Chat contains only General conversations;
- each conversation appears in exactly one section, never duplicated;
- each folder independently expands, exposes aria-expanded, nests only its
  conversations, and sorts by updatedAt descending;
- selecting a conversation expands its folder and sets aria-current;
- native subagents/tool events never become tree rows;
- the primary 새 AI 대화 and each folder plus button open an unsaved draft and
  focus the composer without an API call;
- below 1024 px the tree is one modal drawer; above it the shared shell is 256
  px expanded or 64 px collapsed;
- the expanded tree header shows KidItem, Dashboard return, and a labelled
  40-by-40 collapse control; the collapsed left rail keeps separate 40-by-40
  Dashboard and expand controls, never placing expand in ConversationHeader;
- collapsing on Dashboard then navigating to Agent OS, and the inverse route,
  preserves the same desktop preference without changing the mobile drawer;
  collapsing preserves the selected Conversation and active run presentation;
- the selected row uses the semantic purple surface, and rename/delete appear
  only after opening the row `•••` menu; unsupported share/pin/archive/project
  actions do not render as inert copies;
- visible `에이전트` and `채팅` section labels are at least 12 px, and `새 AI
  대화` is primary through position/label/focus without a saturated full-width
  purple slab;
- General uses `무엇을 도와드릴까요?`, while Agent contexts use
  `<Agent 이름>에게 무엇을 요청할까요?`;
- an empty draft shows the same centered context mark, operational description,
  and at most three suggestion chips in Agent OS and ConversationPanel, with no
  duplicate start button; selecting one only fills the draft message and
  performs no API, CopilotKit run, or capability call;
- user messages are right-aligned on a fully opaque deep-purple surface with
  white text while assistant messages remain on the opaque neutral canvas with
  one labelled identity header;
- assistant responses render safe paragraphs, bounded headings/lists, links,
  inline code, and code blocks rather than one undifferentiated text node;
- evidence, Approval, Operation, resource, and live tool projections form one
  compact user-language `업무 증거` rail inside the assistant group, with no
  generic `업무 처리 완료`, raw tool/capability name, hash, or internal ID;
- provider/model/reasoning appear in one combined selector;
- provider is editable only before create; model/effort remain editable between
  terminal turns;
- Enter sends only outside IME composition, Shift+Enter inserts a newline, and
  Escape closes the selector; and
- the shared composer gives the textarea its own full row and places the
  selector and Send/Interrupt below it at both widths; a
  valid saved default appears in both
  surfaces, a fresh missing selection is neutral, and only an unsupported saved
  pair shows a `추론 수준` review warning; and
- unsupported attachment, microphone, voice, media, Gateway, and session
  controls do not render; and
- production output uses semantic tokens and Lucide icons with no decorative
  gradients, emoji icons, or second font stack.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction/__tests__/AgentConversationSurface.spec.tsx src/components/agent-interaction/__tests__/ConversationFolderTree.spec.tsx src/components/agent-interaction/__tests__/ConversationCombinedSelector.spec.tsx src/components/agent-interaction/__tests__/AgentConversationComposer.spec.tsx src/components/agent-interaction/__tests__/ConversationPanel.spec.tsx src/components/agent-interaction/__tests__/ConversationPresentation.spec.tsx src/components/agent-interaction/__tests__/CapabilityInvocationCard.spec.tsx src/components/agent-interaction/__tests__/ReferenceCards.spec.tsx
~~~

Expected: the new presentation assertions FAIL against the separate 260-pixel
tree/local collapse state, header-located reopen control, one-row narrow
composer, duplicated draft states, flat assistant text, and ungrouped generic
result cards while existing conversation behavior tests stay green.

- [ ] **Step 2: Finish the shared conversation presentation**

Keep CopilotKit messages, live projection rendering, capability/tool/reference
cards, and composer composition in the ConversationFlow extracted in Task 4.
Finish its workspace header and compact-composer composition here. It consumes
ConversationRuntimeHost presentation context; it does not mount `useAgent`,
query provider history or SQLite events separately, or reconcile a second
transcript.

AgentConversationSurface becomes only:

- full-height Agent OS shell;
- folder tree/drawer;
- Dashboard return header;
- selected draft/conversation presentation; and
- shared settings trigger.

Add two presentation-only primitives:

~~~typescript
export interface ConversationEmptyStateProps {
  contextLabel: string;
  description: string;
  suggestions: readonly string[];
  compact?: boolean;
  onSuggestion?(message: string): void;
}

export interface ConversationCardFrameProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  tone?: 'neutral' | 'approval' | 'success' | 'warning';
  children: ReactNode;
  actions?: ReactNode;
}
~~~

`ConversationEmptyState` is shared by the full workspace and compact panel.
Suggestion clicks call only the existing draft update/open action with the
selected text. It does not render another Start button. `ConversationCardFrame`
owns border, spacing, heading, and tone classes only; capability admission,
approval mutation, Operation polling, and resource navigation stay in their
existing owner components.

- [ ] **Step 3: Replace the flat sidebar with the folder tree**

Folders are a pure projection of ConversationSummary.agentKey. Store expansion
as disposable UI state only. There is no folder API or persisted folder
descriptor.

Keep the already completed deletion of AgentConversationSidebar and its
agentConversationDestinations export. Both ConversationPanel and
ConversationFolderTree use the Task 5 conversation-context catalog.

Render `ConversationFolderTree` as the Agent OS body/footer slots of the shared
`CollapsibleSidebarShell` created in Task 5. Remove the route-local
`desktopFoldersOpen` state and the desktop collapse props from
`ConversationHeader`. The shared `useStore().sidebarOpen` preference controls
desktop 256/64 rendering; the local Radix state controls only the sub-1024
drawer. Keep Dashboard navigation available as a labelled icon in the collapsed
rail. Replace the always-visible row actions with one accessible local menu:

~~~tsx
<button
  type="button"
  aria-label={`${conversation.title} 메뉴`}
  aria-expanded={menuOpen}
  aria-haspopup="menu"
  onClick={() => setMenuOpen((open) => !open)}
>
  <MoreHorizontal aria-hidden="true" size={16} />
</button>
~~~

The menu contains Rename and Delete, closes on Escape/selection/outside focus,
and returns focus to its trigger. Do not add a menu store or dependency.

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

Use one opaque rounded border-first container, growing textarea, ChatGPT-style
combined model/reasoning menu, and one circular Send/Interrupt position. Center
it on the same 720-768 pixel message column, give only the composer a subtle
elevation, and remove the extra full-width footer-card impression. Use the
approved 2026-08-28 reference composition at both widths: a spacious multiline
input on the first row and a second toolbar row with the compact
model/reasoning selector and one dark circular Send/Interrupt control on the
right. The wide
Agent OS lane gains whitespace without switching back to the old single-row
layout. Do not expose fixed CLI execution policy as chat state, add
nonfunctional attachment or microphone controls, or reserve a fixed selector
width. Preserve visible focus, live-region errors, reduced motion, and IME
behavior.

Do not render separate persistent Model and Reasoning select rows. Draft mode
keeps Provider/model/effort editable in the composed control; existing
Conversation mode disables Provider and leaves model/effort editable between
terminal turns. Apply a valid saved context/provider default before rendering
either surface. Missing untouched selection uses neutral guidance; only an
unsupported stored pair uses the review warning, and every label says `추론
수준`, never `사고 수준`.

- [ ] **Step 6: Align messages and business cards inside the conversation flow**

Pass the current context label into `AgentConversationMessage`. Render user
messages on an opaque semantic deep-purple surface at the right with white text
and assistant messages on the opaque neutral page with a solid
semantic-purple/Lucide identity marker. Do not use CSS-variable opacity
modifiers for conversation surfaces, and do not render raw `tool` or `status`
role names as user-facing headings.

Use `ConversationResponseBody` for a safe presentation subset of assistant
Markdown: paragraphs, bounded headings, ordered/unordered lists, safe links,
inline code, and fenced code. Do not enable raw HTML. Preserve plain user text
as text, and never render private reasoning or raw provider payloads.

Keep this renderer local and dependency-free: tokenize fenced code blocks
first, then blank-line paragraph/list/heading blocks, and let React escape every
text token. Recognize only `http:`/`https:` link destinations and render them
with `rel="noreferrer"`; unknown markup remains text. Add parser cases to
`ConversationPresentation.spec.tsx` for raw HTML, unsafe links, malformed
fences, long unbroken text, Korean lists, and plain-text fallback.

Use `ConversationCardFrame` in CapabilityInvocationCard,
OperationReferenceCard, ResourceReferenceCard, and ToolStatusCards. Move the
Agent OS `approvalContent` slot into `ConversationFlow`'s centered message lane:

~~~tsx
<ConversationFlow supplementalContent={approvalContent} />
~~~

Group related cards in `ConversationEvidenceRail` labelled `업무 증거` and use
specific user-language summaries for read evidence, pending approval, created
Operation, and resulting resource. Do not show a generic `업무 처리 완료` title,
capability key, tool name, request hash, or internal identifier. The card frame
must not parse canonical input or own any query/mutation. Keep
the existing exact approval query and decision calls inside
CapabilityInvocationCard. Format only bounded user-relevant fields; never show
raw provider payloads, transport state, or internal correlation IDs.

Align `DESIGN.md`, `globals.css`, and `tailwind.config.ts` on semantic
`--primary #7c3aed`, `--conversation-user-bg #4c1d95`, and
`--evidence-surface #ecfdf5`. Replace literal purple palette use in the touched
conversation/sidebar components with semantic aliases. This is a documentation
and token correction, not a Dashboard-wide restyle.

- [ ] **Step 7: Verify the Agent OS presentation cutover removed legacy code**

Run:

~~~bash
rtk rg -n 'AgentConversationSidebar|agentConversationDestinations|CreateConversationDialog|pendingOpen|consumePendingOpen' apps/web/src/components/agent-interaction
rtk rg -n 'router\.push\(.*?/agent-os|AgentOS에서 묻기|AgentOS 대화 열기' apps/web/src/components/layout/AppLayout.tsx apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationDetail.tsx'
~~~

Expected: both commands return no matches. The intentional 전체 기록
navigation lives only in ConversationPanel and is not part of this scan.

- [ ] **Step 8: Run focused Agent OS tests and Web build**

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction
rtk npm run build --workspace=apps/web
~~~

Expected: all folder, draft, composer, authenticated history snapshot, live
message, and reference-card tests pass.

- [ ] **Step 9: Commit the Agent OS workspace**

~~~bash
rtk git add apps/web/src/app/agent-os apps/web/src/components/agent-interaction apps/web/src/app/globals.css apps/web/tailwind.config.ts DESIGN.md
rtk git commit -m "refactor(agent-os): restore the KidItem chat workspace design"
~~~

### Phase 6B: Align Settings and Preserve Complete History Management

**Files:**

- Modify: apps/web/src/components/agent-interaction/ConversationSettingsDialog.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationDefaultsSettings.tsx
- Modify: apps/web/src/components/agent-interaction/ConversationHistorySettings.tsx
- Modify: apps/web/src/components/agent-interaction/conversation-preference-selection.ts
- Modify: apps/web/src/components/agent-interaction/conversation-bulk-delete.ts
- Modify: apps/web/src/components/agent-interaction/__tests__/ConversationSettingsDialog.spec.tsx
- Modify: apps/web/src/components/agent-interaction/__tests__/conversation-preference-selection.spec.ts
- Modify: apps/web/src/components/agent-interaction/__tests__/conversation-bulk-delete.spec.ts
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
- Settings uses one centered dialog with a compact left navigation above the
  mobile breakpoint and one stacked navigation/content column below it;
- defaults are editable for all six contexts times two providers;
- new draft selection uses a supported matching preference;
- existing conversation selection prefers supported lastModel and
  lastReasoningEffort over the saved preference;
- unavailable/obsolete stored values remain visible as needing review and never
  silently change;
- missing/failed preference reads require explicit selection;
- search is case-insensitive, folder filtering is exact, and sorting is newest
  updatedAt first;
- each history row exposes rename/delete through `•••`; destructive controls are
  not permanently rendered beside every title;
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

Expected: existing preference and history behavior stays green, while the new
centered left-navigation and row-overflow assertions FAIL against the interim
horizontal tabs and permanently visible history actions.

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

Use one centered `max-w-[760px]` dialog and responsive two-column composition:

~~~tsx
<Dialog.Content className="fixed left-1/2 top-1/2 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-[760px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-background shadow-lg sm:grid-cols-[160px_minmax(0,1fr)]">
  <nav aria-label="대화 설정" className="border-b bg-muted/30 p-3 sm:border-b-0 sm:border-r">
    {/* 대화 기본값 / 채팅 기록 */}
  </nav>
  <section className="min-h-0 overflow-y-auto p-5 sm:p-6">
    {tab === 'defaults' ? defaultsContent : historyContent}
  </section>
</Dialog.Content>
~~~

The left navigation is only presentation over the existing local `tab` union;
do not add a settings route or global tab store. Reuse the same local accessible
row-menu pattern as ConversationFolderTree in chat history. Bulk-delete buttons
remain explicit at the bottom with exact scope/count confirmation.

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
rtk git commit -m "refactor(agent-os): align chat settings and history"
~~~

## Sol(max) Batch Review B: Tasks 4-6

Review only the Tasks 4-6 batch diff and these architecture invariants:

- one route-stable provider/runtime/subscription and race-safe first Send;
- one `notifications | ai_chat | null` right-surface owner with the exact
  352-pixel 1536+ push offset, 768-1535 overlay, and no measured/persisted
  dock-layout state;
- one 256/64 shared Dashboard/Agent OS sidebar shell and desktop preference,
  different navigation bodies, and component-local mobile drawer state;
- complete removal of legacy panel/sidebar/create-modal state and wrappers;
- Agent OS folder/history/settings presentations sharing the same runtime and
  approved KidItem message/card/composer primitives;
- exact Dashboard/Agent OS draft parity, usable narrow composer, structured
  assistant responses, user-language business-evidence rail, and canonical
  semantic tokens; and
- explicit provider/model/reasoning selection with no silent fallback.

Provide the batch acceptance criteria, batch base/head SHAs, focused tests, and
exact batch diff rather than the whole plan. Fix Critical/Important findings
with TDD. Re-review only the previous finding IDs against their fix diff before
starting Task 7.

## Task 7: Update Cross-Process Acceptance, Documentation, and Run Final QA

**Files:**

- Create: apps/agent-gateway/src/provider/native-provider-runtime.ts
- Create: apps/agent-gateway/src/provider/native-provider-runtime.spec.ts
- Move: apps/agent-gateway/src/turn/active-turn.registry.ts
  to apps/agent-gateway/src/control/internal/active-turn.registry.ts
- Move: apps/agent-gateway/src/turn/active-turn.registry.spec.ts
  to apps/agent-gateway/src/control/internal/active-turn.registry.spec.ts
- Modify: apps/agent-gateway/src/control/gateway-command-dispatcher.ts
- Modify: apps/agent-gateway/src/control/gateway-command-dispatcher.spec.ts
- Modify: apps/agent-gateway/src/main.ts
- Modify: apps/agent-gateway/src/main.spec.ts
- Modify: apps/server/Dockerfile
- Modify: deploy/office/compose.office.yml
- Modify: docs/runbooks/environment-variables.md
- Modify: scripts/smoke-interaction-os.mjs
- Modify: scripts/__tests__/smoke-interaction-os.test.mjs
- Modify: docs/ARCHITECTURE.md
- Modify: docs/TESTING.md
- Verify only: docs/superpowers/specs/2026-08-26-agent-os-chat-workspace-ux-design.md
- Verify only: apps/web/src/app/(analytics)/dashboard/components/DashboardChartPanel.agent-os-cutover.regression-1.spec.ts

- [x] **Step 0: Finish Runtime Module Locality cleanup without changing behavior**

Write a failing architecture regression first. It must prove that:

- `main.ts` imports one `provider/native-provider-runtime` Module and does not
  import concrete Codex/Claude process, session, config, launcher, parser, or
  conversation Implementations;
- the native-provider-runtime Interface exposes only the provider map,
  readiness projection, and one idempotent close operation while its
  Implementation owns exact package-train verification, boolean-only login
  probes, provider startup, readiness construction, and complete provider-tree
  shutdown;
- Codex and Claude remain the two concrete Adapters for the existing
  `ProviderConversationPort` seam, with their Implementation and adjacent specs
  retained under `provider/codex/` and `provider/claude/`;
- `ActiveTurnRegistry` and its adjacent spec live under `control/internal/`,
  because command dispatch is their only production caller; and
- no command/event schema, lifecycle ordering, provider behavior, retry,
  persistence, credential handling, or public Interface changes as part of the
  move.

Then make the minimum structural change. Preserve `NativeGatewayControlSession`,
`GatewayCommandDispatcher`, and `GatewayEventOutbox` as deep Modules; do not
split their state transitions into new pass-through files. Move the existing
runtime-package, login, and readiness tests from `main.spec.ts` next to the new
native-provider-runtime Implementation, leaving `main.spec.ts` responsible only
for entrypoint composition. Update every import and moved spec, then run:

~~~bash
rtk npm exec --workspace=apps/agent-gateway vitest -- run src/provider/native-provider-runtime.spec.ts src/control/internal src/control/gateway-command-dispatcher.spec.ts src/main.spec.ts
rtk npm run build --workspace=apps/agent-gateway
~~~

Expected: the architecture regression fails before the moves and passes after
them; all existing Gateway lifecycle tests remain green. Do not mark the
Runtime Module Locality cleanup complete until `docs/ARCHITECTURE.md` and its
directory map describe the final paths and deep native-provider-runtime
Interface.

- [x] **Step 1: Update the smoke contract first**

Change the smoke create request to reserve one deterministic test
conversationId and include a deterministic bounded title. Assert:

- the exact ID is returned;
- a second same-input POST replays the same ID;
- a changed-title POST for that ID returns 409 in the integration fixture;
- preference read/set/read crosses the authenticated facade without entering
  PostgreSQL;
- authenticated `agent/connect` reaches the exact fresh local SQLite
  Conversation namespace without leaking unrelated history; and
- the smoke never accepts a caller-injected MCP token or calls the internal MCP
  endpoint outside a real provider turn.

The live facade smoke does not create a provider turn merely to seed history:
the normal provider seam cannot guarantee that such a turn will not invoke a
business tool. Completed-event replay is instead proven by the real HTTP
`agent/run -> agent/connect` controller regression together with the SQLite
Adapter and runner tests. The live smoke verifies the production connect seam
against an empty disposable namespace and rejects an empty-array pseudo-history
response.

The live smoke must delete/archive only the disposable conversation it creates.
Do not delete existing provider sessions or unrelated SQLite event history.

Process-token MCP admission, the exact five tools, and approval-pending behavior
remain covered by the Gateway loopback/MCP tests and authenticated Terra(max)
provider-turn browser QA.

Run:

~~~bash
rtk npm run test:scripts
~~~

Expected: smoke and script contract tests pass.

- [x] **Step 2: Update durable architecture/testing descriptions**

In docs/ARCHITECTURE.md record:

- one deep native-provider-runtime Module owning Codex/Claude login, startup,
  readiness, and close assembly behind the unchanged provider-conversation
  seam;
- `ActiveTurnRegistry` as internal control Implementation rather than a
  top-level Gateway Module;
- one authenticated route-stable ConversationProvider/RuntimeHost;
- global AI chat panel versus Agent OS history presentation;
- one RightAuxiliaryPanel with NotificationPanelContent/ConversationPanel and
  no retained PanelSheet shell or panel-open store;
- one shared 256/64-pixel authenticated sidebar shell with different Dashboard
  and Agent OS bodies and one desktop preference;
- native serialized descriptor/preference ownership;
- provider-first deletion; and
- CopilotKit OSS SQLite completed-event history, Nest-only active-turn
  authority, and any narrowly documented upstream sqlite-runner fork delta; and
- no PostgreSQL conversation/preferences model.

Give the Office API one API-only persistent volume mounted at
`/var/lib/kiditem/agent-os` and set
`KIDITEM_COPILOTKIT_SQLITE_PATH=/var/lib/kiditem/agent-os/copilotkit-events.sqlite`.
The worker does not mount or open this file. Ensure the production image
contains a Node 22-compatible `better-sqlite3` native binary despite the
runtime-stage `npm ci --ignore-scripts`, and add a build-time load/open smoke
for the selected runner package plus `better-sqlite3(':memory:')`.

Record only top-level UI ownership: CopilotKit interaction, route-stable Web
presentation, one validated browser-local 320-640-pixel AI-chat width that
pushes only at 1536+, a fixed 352-pixel notification surface, and the shared
Dashboard/Agent OS sidebar shell. Do not copy pixel-level message styling into
ARCHITECTURE.md.

In docs/TESTING.md add the new create replay/drift, serialized local-state,
provider deletion, route-stable runtime, single-right-surface state machine,
desktop push/tablet overlay/mobile drawer behavior, approved Agent OS visual
regressions, shared sidebar-shell behavior, narrow-composer/draft parity,
business-evidence presentation, clean legacy-surface removal, Dashboard
regression, and browser QA gates.

Keep the Task 6 `DESIGN.md` semantic-token correction; do not copy the full UX
spec into architecture/testing documents.

Current integrated evidence (2026-08-28, final):

- Tasks 4-6 Batch B review: **RESOLVED**.
- Shared agent-runtime contracts: 23 tests passed and package build passed.
- CopilotKit SQLite runner: 9 tests passed.
- Agent Gateway: 154 tests passed, 10 skipped, and package build passed.
- Server Agent OS: 176 tests passed; four upstream sqlite-runner
  characterization failures remain expected; package build passed.
- Web: all 379 files and 1,917 tests passed; production build generated all 49
  pages.
- Scripts: 144 Vitest tests passed; TAP reported 214 passed and one skipped.
- Architecture guards passed; Nest listened on port 4100; macOS checks reported
  seven passed and four skipped; direct package-directory `npm pack` passed.
- The mandatory Sol(max) integration review found four Important issues. TDD
  fixes covered Gateway-fatal Codex framing, immutable approval-policy replay,
  receipt-only mutation persistence/MCP exposure, and history-action focus.
  The same reviewer rechecked only those findings and marked all four
  `RESOLVED`.
- The post-composer Sol(max) review found two further Important issues: a stale
  CopilotKit stop could interrupt a successor turn, and global assistant text
  rewriting could alter legitimate technical discussion. Both were reproduced
  with failing tests, fixed at their narrow boundaries, and rechecked with no
  remaining Critical or Important finding.
- Codex/Terra(max) business evaluation: read 3/3, approval-gated providerless
  mutation 3/3, deterministic commit/result-loss/restart replay 9/9, and live
  two-turn/restart continuity met the 2/3 threshold; the failed trial became a
  regression and its rerun passed. Organization intrusion, approval bypass,
  fabricated canonical input, and duplicate writes were absent in every trial.
- Authenticated browser QA covered Dashboard and work-route launch, Agent OS
  history/settings, route round-trips, responsive panel/sidebar behavior, and
  the shared composer. The final visual recheck confirmed the fixed CLI access
  policy is not rendered, Dashboard → Agent OS → Dashboard preserves the open
  chat surface, and 256/64 sidebar collapse does not disturb the panel.
- Claude live conversation remains non-blocking because no paid login is
  available; its deterministic contracts pass.

- [x] **Step 3: Run all deterministic package gates**

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/agent-runtime
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=packages/copilotkit-sqlite-runner vitest -- run
rtk npm exec --workspace=apps/agent-gateway vitest -- run
rtk npm run build --workspace=apps/agent-gateway
rtk npm exec --workspace=apps/server vitest -- run src/agent-os
rtk npm run build --workspace=apps/server
rtk npm exec --workspace=apps/web vitest -- run src/components/agent-interaction src/components/layout src/store/useStore.spec.ts src/components/panel src/components/__tests__/QuickActionFab.spec.tsx 'src/app/(analytics)/dashboard/components/DashboardChartPanel.agent-os-cutover.regression-1.spec.ts'
rtk npm run build --workspace=apps/web
~~~

Expected: all commands pass. Report unrelated pre-existing failures separately;
do not hide or weaken their tests.

- [x] **Step 4: Run architecture and release guards**

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

- [x] **Step 5: Verify Nest boot and native macOS package**

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

- [x] **Step 6: Run the mandatory Sol(max) integrated review**

Review the complete implementation against the approved 2026-08-26 design,
this plan, and the older KID-25 runtime/capability contracts. Give the reviewer
the exact `develop...HEAD` diff plus current deterministic gate evidence. The
review must cover at least:

- shared contract strictness and absence of authority/provider leakage;
- Gateway create idempotency, serialized local state, exact provider deletion,
  live-turn fences, native-provider-runtime depth, and control-state Locality;
- Nest authentication/error mapping and absence of conversation persistence;
- CopilotKit SQLite runner ownership of full completed AG-UI event
  run/connect/replay, Nest-only running/stop authority, subscriber/restart/
  exact-stop/organization/delete contracts, absence of duplicate Web lifecycle
  state, route-stable presentation, first-send handoff correctness, and
  explicit model/reasoning selection;
- any sqlite-runner fork remains an attributed package-level delta from 1.69.0
  and does not fork CopilotKit runtime, AG-UI, React, or Web integration;
- single right-surface ownership and complete legacy presentation removal;
- one validated 320-640-pixel browser-local AI-chat preference, exact rendered
  width at the 1536+ push/768-1535 overlay boundary, fixed 352-pixel
  notifications, and no duplicated dock/overlay state owner;
- shared 256/64 Dashboard/Agent OS sidebar-shell ownership, collapse-route
  continuity, persistent Dashboard return, and separate mobile drawer state;
- Agent OS folder/history/settings behavior and approved KidItem visual
  hierarchy without a second runtime;
- shared draft/preference behavior, narrow composer usability, user/assistant
  message separation, and safe assistant-response hierarchy;
- business-evidence cards remain presentational wrappers over existing
  owner/query behavior, use specific user-language outcomes, and expose no raw
  provider/internal identifiers; and
- test quality, race coverage, security boundaries, and maintainability.

Use `gpt-5.6-sol` with reasoning effort `max`. Fix every Critical and Important
finding with a failing regression test first, rerun the affected deterministic
gates, and return the fix diff to the same review boundary until no such finding
remains. Do not begin browser QA while integrated review findings are open.

The earlier zero-Critical/Important review predates the accepted 2026-08-28 Web
visual correction and remains historical evidence only. Run this review again
after Tasks 5-6 are updated. Keep the previously observed
`AiDirectJobWorkerService` Prisma `$queryRaw` isolated-database schema mismatch
separate unless new evidence ties it to Agent OS.

- [x] **Step 7: Run the Codex/Terra(max) Dashboard business eval**

Run the actual Dashboard AI chat against a freshly initialized isolated
browser-QA fixture. Use Codex with `gpt-5.6-terra` and `max`; do not silently
substitute another model or effort. Run each case three times:

1. a real-data read using the appropriate read capability, with no canonical
   write;
2. an approval-gated mutation, proving no write before approval and exactly one
   owner-domain result or Operation after approval; and
3. the same provider-local Conversation across two turns and an API/Gateway
   restart, with MCP still usable, exact retry producing no duplicate mutation,
   and no automatic reasoning before the next explicit user message.

Use `supply.submit_purchase_order` for case 2 with an isolated, disposable,
providerless purchase-order fixture. The approved canonical input must carry a
synthetic `externalOrderId`; no real provider call or external order is part of
this evaluation.

Before the live model trial for case 3, run a deterministic
`sourcing.scrapeUrlWorkflow` gate that commits the owner result, injects result
loss, restarts the API boundary, and proves that replaying the exact
`requestKey` and canonical input returns the committed result without another
candidate or `OperationRun`. The same key with changed canonical input must
return the owner idempotency conflict. An ambiguous owner outcome remains
pending, and only explicit same-request replay or the next bounded
API-bootstrap sweep may reach it. The live Codex trial then evaluates a normal
explicit new turn on top of that proven owner contract; it does not ask the
provider to recover an admitted mutation.

Judge the final business outcome and forbidden behavior rather than exact prose
or one fixed tool sequence. Organization intrusion, approval bypass, fabricated
canonical input, and duplicate writes must be absent in all three trials. Each
case must complete normally in at least two of three trials. Promote only an
observed failure to a regression test.

Evidence must contain only case/trial, model/effort, Conversation/Turn/Execution
correlation, capability key, canonical input hash, sanitized Approval/Operation/
resource references, and the final domain snapshot. Never store credentials,
cookies, bearers/tokens, provider raw payloads, private reasoning, or production
transcripts. Claude live QA remains non-blocking while a paid login is absent.

- [x] **Step 8: Run authenticated browser QA**

Use the isolated Agent OS QA environment and the current development account.
Do not print credentials, cookies, Gateway bearer, MCP transport token, provider
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
14. A 1536+ viewport pushes Dashboard by the current validated AI-chat width;
    1280 and every 768-1535 viewport use that width as an overlay without
    narrowing Dashboard. Notification remains 352 px, and Agent OS does not
    consume the AI-chat width preference.
15. Quick Action FAB never moves and remains hidden while either auxiliary
    surface is open.
16. Dashboard and Agent OS share 256/64 sidebar geometry, left-side labelled
    collapse/expand controls, focus/motion treatment, and the desktop preference
    while retaining their different bodies. Agent OS keeps Dashboard access in
    both states; its reopen control never appears in the conversation header.
17. Agent OS shows distinct Agent and Chat sections with readable labels, quiet
    New Chat hierarchy, row overflow actions, opaque deep-purple user messages,
    structured neutral assistant responses, a user-language `업무 증거` rail,
    and the centered two-section Settings dialog.
18. The same empty draft appears in Dashboard AI chat and Agent OS. Suggestions
    only fill the composer and cause no API/tool call. A valid saved default is
    selected in both surfaces; only a stored unsupported pair shows the `추론
    수준` warning.
19. At panel and workspace widths the composer keeps a usable full-width
    textarea row and a second selector/Send row; no word or placeholder
    collapses to a one-character column.
20. Normal success and idle UI shows no Gateway/provider-local/transport/
    execution label, raw tool/capability name, hash, internal ID, or generic
    `업무 처리 완료` result.
21. Keyboard traversal, 40/44-pixel targets, focus return, and reduced-motion
    behavior work in expanded/collapsed/sidebar-drawer/panel-drawer states.
22. Returning from Agent OS to Dashboard in the same browser state does not
    reset chat/sidebar state or introduce a new Dashboard-update-modal
    regression; do not redesign an unrelated pre-existing modal here.
23. Browser console has no internal-error toast and network shows one
    CopilotKit conversation transport.

Capture failures as code defects or the explicit Claude environment limitation;
do not add operator readiness/login UI to make QA pass.

- [x] **Step 9: Review the final diff against the approved design**

Run:

~~~bash
rtk git diff --check develop...HEAD
rtk git status --short
rtk git diff --stat develop...HEAD
~~~

Confirm:

- no Prisma file changed;
- the intentional `DESIGN.md` token correction matches `globals.css` and
  Tailwind semantic aliases, with no competing `#9333ea` primary contract;
- no Dashboard Agent OS semantic change entered the diff;
- the desktop work-surface offset equals the validated 320-640-pixel AI-chat
  width only at 1536+, 1280 uses the same width as an overlay, notifications
  remain 352 pixels, and there is no ResizeObserver or persisted dock mode;
- Dashboard and Agent OS use one 256/64 shell and desktop preference, keep
  separate body content, and do not persist mobile drawer state;
- no duplicate useAgent or ConversationProvider mount exists;
- no provider path/reference enters Web or Nest public DTOs;
- no silent model/reasoning fallback exists;
- no archive/retention/Task/Session compatibility layer was added;
- no PanelSheet, AgentConversationSidebar, CreateConversationDialog,
  pendingOpen/consumePendingOpen, panel isOpen/setOpen, obsolete panel local
  storage key, AgentOS에서 묻기 label, or automatic chat-to-Agent-OS route jump
  remains; and
- no compatibility wrapper, alias, dual right-surface state, or migration was
  added for the removed presentation paths;
- no decorative gradient, emoji icon, non-system font, or unsupported chat
  control entered the production UI; and
- folder and settings history rows use accessible overflow actions instead of
  permanent rename/delete button clutter; and
- the narrow composer, shared empty state, `추론 수준` terminology, structured
  assistant body, and `업무 증거` rail satisfy their focused regressions.

- [x] **Step 10: Commit documentation and acceptance updates**

~~~bash
rtk git add scripts/smoke-interaction-os.mjs scripts/__tests__/smoke-interaction-os.test.mjs docs/ARCHITECTURE.md docs/TESTING.md DESIGN.md docs/superpowers/specs/2026-08-26-agent-os-chat-workspace-ux-design.md docs/superpowers/plans/2026-08-26-agent-os-global-chat-panel-and-history.md
rtk git commit -m "docs(agent-os): verify global conversation workspace"
~~~

## Task 8: Add the Desktop AI-Chat Resize Boundary

This Task supersedes only the fixed-width AI-chat assertions in Tasks 5 and 7.
It does not reopen CopilotKit interaction ownership, Conversation runtime,
notification presentation, Agent OS layout, or the existing below-768 branch.

**Files:**

- Create: apps/web/src/components/layout/useDesktopAiChatWidth.ts
- Create: apps/web/src/components/layout/__tests__/useDesktopAiChatWidth.spec.tsx
- Modify: apps/web/src/components/layout/RightAuxiliaryPanel.tsx
- Modify: apps/web/src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx
- Modify: apps/web/src/components/layout/AppLayout.tsx
- Modify: apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx
- Verify only: apps/web/src/store/useStore.ts
- Verify only: apps/web/src/components/agent-interaction/AgentConversationSurface.tsx

- [ ] **Step 1: Lock the width preference contract with failing tests**

Create a focused hook rather than expanding the global Zustand store. Its
contract is:

~~~typescript
const STORAGE_KEY = 'kiditem.ai-chat.desktop-width';
const DEFAULT_WIDTH = 352;
const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
~~~

Test that a missing value uses 352; a stored integer inside 320-640 restores;
malformed, fractional, or out-of-range values fail closed to 352; pointer
preview changes rendered width without writing local storage; commit stores
one validated integer; and a temporary viewport clamp never overwrites the
saved preferred width. Run the new hook spec and confirm RED before creating
the Implementation.

- [ ] **Step 2: Implement the browser-local width owner**

`useDesktopAiChatWidth` owns preferred width, optional drag preview, and current
viewport measurement. Read local storage only after mount. Resize events may
recompute the rendered viewport clamp but may not persist a different
preference. Expose only `width`, `previewWidth`, `commitWidth`, and
`cancelPreview`; do not add ResizeObserver, Zustand fields, server DTOs,
cookies, or a second panel-mode state.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/layout/__tests__/useDesktopAiChatWidth.spec.tsx
~~~

Expected: all preference tests pass.

- [ ] **Step 3: Add failing panel and work-surface regressions**

Update the existing focused tests first. Prove that:

- an AI-chat body renders at the supplied width and exposes one left-edge
  separator labelled `AI 챗 패널 너비 조절`;
- pointer movement previews live and pointer release commits the exact final
  width;
- ArrowLeft widens and ArrowRight narrows by 16 pixels within 320-640;
- notifications remain exactly 352 pixels and expose no resize separator;
- a 1536+ authenticated work surface uses the same CSS width variable as the
  visible AI panel, while a notification surface uses 352;
- 768-1535 keeps overlay behavior without applying a work-surface margin;
- `/agent-os` consumes neither the auxiliary panel nor its width; and
- the existing below-768 presentation branch is unchanged.

Run the two specs and confirm that the new assertions fail before modifying the
panel or AppLayout.

- [ ] **Step 4: Implement the narrow resize seam**

Pass the focused width controller from AppLayout to RightAuxiliaryPanel. Render
the separator only for non-mobile AI chat. Use pointer capture, calculate width
from the left boundary (`startWidth + startX - clientX`), preview during move,
commit on pointer-up, cancel on pointer-cancel, and expose separator
`aria-valuemin`, `aria-valuemax`, and `aria-valuenow`. Keep the visible divider
quiet until hover/focus and the pointer hit area at least 12 pixels.

Set one `--right-auxiliary-width` custom property on the authenticated work
surface. At 1536+ use it for the margin; at 768-1535 the panel uses the same
rendered width as an overlay. The notification branch always supplies 352.
Agent OS continues to suppress only the duplicate AI-chat presentation.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/components/layout/__tests__/useDesktopAiChatWidth.spec.tsx src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx src/components/layout/__tests__/AppLayout.auth.spec.tsx
rtk npm exec --workspace=apps/web vitest -- run src/components/layout src/components/agent-interaction src/components/panel src/store/useStore.spec.ts
rtk npm run build --workspace=apps/web
~~~

Expected: focused tests, surrounding Web regressions, and production build pass.

- [ ] **Step 5: Verify the actual desktop interaction**

In the authenticated QA browser, verify a 1600-pixel Dashboard pushes by the
live width, drag/reload restores the committed preference, a 1280-pixel
Dashboard overlays at the same saved width, the notification body stays 352,
and Agent OS remains a full workspace with no resize seam. Verify pointer and
keyboard operation and inspect console/network errors. Mobile is not an
acceptance target for this Task; only confirm the existing branch was not
modified.

## Task 9: Run the Two Owner-Domain Acceptance Slices

Use the already isolated browser-QA database and actual Dashboard AI chat with
Codex `gpt-5.6-terra` at `max`. Reset only disposable QA fixture state between
trials. Never record credentials, cookies, tokens, raw provider/browser
payloads, private reasoning, or full transcripts. Evidence contains sanitized
Conversation/Turn/Execution correlations, capability key, canonical input
hash, Approval/Operation/resource references, and final domain snapshots.

- [ ] **Step 1: Run the Sourcing vertical slice**

From a Sourcing Agent Conversation, retrieve recommendation/evidence data and
prove no canonical write. Use an actually reachable allowlisted supplier URL
for `sourcing.duplicateCheck` and `sourcing.scrapeProductUrl`. The scrape must
return the bounded normalized owner schema and must not create a candidate.

In the same live provider turn, request `sourcing.ingestCandidate` with the
exact server-returned snapshot/hash and owner idempotency key. Prove candidate
absence before approval, then approve and prove exactly one candidate. Replay
the same key/input and prove the same resource is returned; change the
snapshot/hash under that key and prove rejection with no second write. Confirm
the resulting candidate appears in the actual Sourcing UI.

- [ ] **Step 2: Run Sourcing-to-Products delegation**

Continue from an existing QA candidate. Ask the Sourcing Agent to prepare a
listing-generation request that delegates the canonical mutation to
`products.create_listing_generation_package`. Prove the Products owner
capability—not a Sourcing DB shortcut—owns the call. Before approval there is
no new `OperationRun`; after approval there is exactly one owner Operation.
Replay the same owner key/input and prove candidate and Operation counts remain
one. Confirm both the Conversation result and the actual product pipeline UI
reflect the accepted request.

- [ ] **Step 3: Promote only observed failures and publish evidence**

Run each slice against a clean disposable fixture. If an invariant fails, add
one failing regression at the narrow owner/UI boundary, make the minimum fix,
and rerun only that finding plus its surrounding deterministic gate before
repeating the live slice. Record the commands, pass/fail outcome, and sanitized
final snapshots in the local QA report and update this plan's checkboxes only
after actual evidence exists. Claude live QA remains non-blocking.

## Final Acceptance Checklist

- [x] Browser-reserved create ID is strict, replayable, and drift-conflicting at
  the native owner boundary.
- [x] Concurrent descriptor mutations cannot lose or resurrect state.
- [x] Codex archives and Claude removes only exact provider-owned session
  artifacts.
- [x] Live-turn deletion fails before provider mutation; an absent or foreign
  delete cleans only the caller namespace and remains `404`.
- [x] Preferences are strict, bounded, atomic, serialized, installation-user
  scoped, and absent from PostgreSQL.
- [x] Nest derives user/organization scope for every API and exposes no provider
  coordinate.
- [x] One authenticated CopilotKit interaction survives route changes through
  the route-stable ConversationProvider/RuntimeHost presentation adapter.
- [x] CopilotKit SQLite semantics own full completed-event run/connect/replay;
  Nest alone owns active-turn running/stop authority, and the fake runner plus
  duplicate Web/provider reconciliation lifecycles are absent.
- [x] Upstream sqlite-runner characterization covers subscriber departure,
  restart stale lock, exact stop, organization namespace, and exact deletion;
  any required fork is limited to that package with provenance and delta tests.
- [x] AI chat panel and Agent OS share one runtime, flow, composer, Query cache, and
  first-send coordinator.
- [x] Notification and AI chat content are mutually exclusive bodies of one
  `notifications | ai_chat | null` right surface.
- [ ] AI chat defaults to 352 px, accepts and restores one validated 320-640 px
  desktop-local width, pushes by that width at 1536+, and overlays at that width
  from 768-1535. Notifications remain 352 px; Agent OS and the existing
  below-768 branch do not consume the preference.
- [x] Agent OS suppresses only duplicate ai_chat presentation; notification
  presentation and the preserved chat runtime follow the fixed route rule.
- [x] Dashboard Agent OS UI and business actions are unchanged.
- [x] Dashboard and Agent OS use one 256 px expanded / 64 px collapsed sidebar
  shell and desktop preference with different bodies, an always-available Agent
  OS Dashboard return, sidebar-local controls, and independent mobile drawers.
- [x] Agent OS uses the approved quiet header, centered message column, usable
  narrow/full composer variants, shared contextual empty state, structured
  assistant prose, user-language business-evidence rail, and centered
  Settings/history dialog with canonical KidItem semantic tokens.
- [x] Agent and Chat are the only sidebar sections; Agent contains the exact
  five folders, Chat contains General conversations only, and native subagents
  stay inside parent streams.
- [x] Provider is immutable after create; model/reasoning remain explicit per
  turn with no silent fallback.
- [x] Valid saved model/`추론 수준` defaults apply in Dashboard and Agent OS;
  only an unsupported stored pair shows a review warning and `사고 수준` is
  absent from user-facing copy.
- [x] Search, rename, individual delete, folder delete, and delete all satisfy
  retry/partial-failure behavior.
- [x] Replaced panel/sidebar/modal state and components are deleted with their
  imports, fixtures, storage key, mocks, and tests; no compatibility layer
  remains.
- [x] Shared, Gateway, server, Web, scanner, build, boot, macOS, smoke, and
  browser QA evidence is recorded.
- [x] Codex/Terra(max) Dashboard business eval passed all three cases at 3 trials
  each, with every forbidden behavior absent and at least 2/3 normal completion
  per case.
- [ ] The Sourcing read/scrape/approved-ingest slice proves exact snapshot
  admission, same-key replay, drift rejection, one candidate, and Sourcing UI
  projection.
- [ ] The Sourcing-to-Products slice proves Products owner delegation,
  approval-before-write, one OperationRun, replay without duplication, and
  product-pipeline projection.
- [x] One Sol(max) integrated review passed before browser QA with no open
  Critical or Important finding.
- [x] The only live limitation, when still applicable, is unavailable Claude
  subscription/login; deterministic Claude contracts still pass.
