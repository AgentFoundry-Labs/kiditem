# Sourcing AgentOS Capability And Runtime Design

> Partial supersession notice (2026-08-23): retain only Sourcing-owned business
> capability behavior. AgentRun, conversation, artifact, cost, playbook,
> authority, and provider-runtime contracts are replaced by the
> [KID-25 Agent OS Clean Contraction Design](2026-08-23-kid-25-agent-os-clean-contraction-design.md).

- Date: 2026-08-10
- Updated: 2026-08-11
- Status: Approved design
- Classification: sourcing-domain reconstruction with a bounded Agent OS runtime boundary
- Scope: the Sourcing Agent used from the existing `/sourcing-ai` dashboard and the future Operator-to-Sourcing delegation path
- UI compatibility: preserve the existing sourcing routes, layout, controls, and visible copy; do not modify `/agent-os` screens

## 1. Objective

Make every Claude or Codex-powered sourcing conversation execute as a durable
Agent OS run while keeping sourcing facts, deterministic collection, retrieval,
recommendation, validation, and review commands owned by the Sourcing domain.

The target is not a wrapper around the current assistant subprocess. The target
is one reusable capability, skill, and playbook boundary that serves both:

1. the Sourcing Agent opened directly from the sourcing dashboard; and
2. a future Agent OS Operator that delegates a sourcing task to the same agent.

The user talks to the **Sourcing Agent**. Agent OS supplies the conversation,
model runtime, capability policy, execution audit, cancellation, and cost/token
records. Sourcing supplies the business data and deterministic behavior.

## 2. Non-goals

- Redesigning the 14 sourcing screens or changing their visible text.
- Modifying the `/agent-os` UI.
- Making a single-server deployment available during server maintenance.
- Resuming a Claude or Codex process after a server restart.
- Automatically replaying an interrupted dashboard question.
- Moving deterministic collection, ranking, validation, or RAG indexing into an
  LLM-owned loop.
- Letting the Sourcing Agent create a procurement intent, purchase order,
  provider order, payment, or marketplace listing.
- Introducing source entitlement review, expiry, approval versions, or new
  collection lifecycle states.
- Adding a vector database, message broker, or separate Agent OS state machine.

## 3. Decisions And Rejected Alternatives

### 3.1 Selected: capability-first Agent OS

Sourcing exposes typed incoming capabilities. The dashboard may call a
deterministic capability directly, while the Sourcing Agent reaches the same
capability through Agent OS policy and the KidItem MCP tool surface. Agent OS
owns only the parts that require model judgment, explanation, tool selection,
or future approval coordination.

### 3.2 Rejected: wrap only the existing assistant CLI

Wrapping `SourcingAssistantCliGenerationAdapter` in an AgentRun would leave RAG,
prompt skills, tool policy, subprocess ownership, and capability audit split
between Sourcing and Agent OS. It would preserve the architectural defect under
a different call stack.

### 3.3 Rejected: execute every sourcing button as an AgentRun

Collection, persistence, scoring, and validation are deterministic operations.
Routing every button through an LLM run would add model availability, cost, and
retry behavior to work that does not need judgment. Those commands remain
direct HTTP/Operations flows and are also exposed as bounded capabilities for an
Agent to invoke when necessary.

### 3.4 Rejected: automatic restart resume

Agent state survives for audit and idempotency, not for uninterrupted service.
An interrupted model process is closed as failed. The user retries explicitly.
Zero-downtime maintenance requires a separate multi-replica deployment design
and is not approximated with more business statuses.

### 3.5 Selected: process-bound execution and synchronous domain commit

The local Claude/Codex CLI and its MCP child are subordinate to the server
process. A server shutdown or crash ends the execution; Agent OS records the
request and run as `failed/process_interrupted` and never attempts to recover
the model process, replay its prompt, or publish a delayed model result.

Required business writes complete inside the deterministic owner-domain
capability before that capability returns and before Agent OS can mark the run
successful. For URL sourcing the order is supplier extraction, output
validation, Sourcing-owned candidate upsert, candidate identity return, and
only then AgentRun finalization. A failed candidate write therefore cannot
produce a successful AgentRun.

The global `agent.run.finalized` event is observability and alert plumbing. It
must not create, update, or delete canonical Sourcing rows. No outbox, durable
event replay, or additional delivery lifecycle is introduced for local CLI
execution. If a domain write committed immediately before interruption, the
capability's stable idempotency key and source identity make an explicit user
retry converge on that existing result.

## 4. Current-State Findings

The existing repository already contains useful foundations:

- AgentRunRequest, AgentRun, events, conversations, messages, tool invocations,
  artifacts, approvals, and cost records;
- an organization-scoped KidItem MCP stdio server;
- an AgentCapabilityRegistry and policy-aware AgentToolRouter;
- a Sourcing capability manifest and runtime handler;
- normalized Sourcing recommendation, validation, interest, and RAG inputs.

The current integration is incomplete or misleading in these exact ways:

1. The dashboard assistant directly spawns Claude/Codex from a Sourcing-owned
   adapter, bypassing Agent OS model identity, run audit, tool policy, tokens,
   and conversation ownership.
2. The Sourcing agent definition points at
   `agent-config/prompts/agents/sourcing.md`, but that prompt file does not
   exist and the deterministic handler never consumes it.
3. `sourcing.magic_scraper` is a development workflow marked for default
   preload even though it is not an operating-agent instruction.
4. The market discovery playbook lists several stages, but their handlers each
   call the complete `SourcingMarketDiscoveryService.discover()` calculation.
   The graph therefore repeats work instead of passing immutable artifacts.
5. `sourcing_market_opportunity_to_order_draft_v1` places sourcing discovery
   and an Order Agent handoff in one playbook, even though the current safe
   sourcing terminal is a review batch.
6. AgentRun cancellation closes durable rows but does not own termination of a
   running Claude/Codex and MCP child process.
7. All AgentRunRequests default to three attempts, which is inappropriate for a
   synchronous read-only dashboard question.
8. Required Sourcing candidate creation currently occurs in
   `SourcingScrapeFinalizedBridge` after AgentRun finalization. Because this is
   an in-memory event listener, the run can be durable success while the
   canonical candidate is absent. That writer must move into the synchronous,
   idempotent Sourcing scrape workflow.

## 5. Ownership Architecture

```text
Sourcing dashboard
  -> Agent OS AgentInteractionPort
  -> AgentConversation / user message / AgentRunRequest
  -> Sourcing Agent runtime
       -> code-owned prompt + runtime skills
       -> Claude CLI or Codex CLI
       -> scoped KidItem Agent OS MCP session
       -> AgentToolRouter
       -> Sourcing incoming capabilities
  -> structured answer + verified citations + artifacts
  -> AgentRun / events / tool invocations / assistant message
  -> existing dashboard response presenter
```

Ownership remains explicit:

- **Agent OS** owns model selection, CLI provider execution, prompt/skill
  resolution, MCP session context, run lifecycle, capability policy,
  cancellation, token/cost audit, conversations, and messages.
- **Sourcing** owns source facts, normalized RAG corpus, collection orchestration,
  recommendation runs, validation episodes, interests, selections, review
  batches, evidence semantics, scoring, and citations.
- **Operations** owns deterministic operation envelopes, progress, cancellation,
  leases, and late-result fencing.
- **Supply/Order** continue to own procurement and purchase execution. The
  Sourcing Agent has no direct purchase capability.

This keeps existing top-level ownership intact, so this design does not require
an edit to `docs/ARCHITECTURE.md`.

## 6. Conversation Boundary

The sourcing dashboard calls the Sourcing Agent directly. It does not ask the
Operator to classify a request whose domain is already known.

The Agent OS incoming boundary is a generic interaction port:

```typescript
export interface AgentInteractionInput {
  organizationId: string;
  userId: string;
  agentType: 'sourcing';
  surface: 'sourcing_dashboard';
  conversationId?: string | null;
  content: string;
  sourceResourceType: 'sourcing_workspace';
  sourceResourceId: string;
  payload?: Record<string, unknown>;
  executionMode: 'inline';
  maxAttempts: 1;
}

export interface AgentInteractionResult {
  conversationId: string;
  requestId: string;
  runId: string | null;
  status: 'succeeded' | 'failed' | 'cancelled';
  output: Record<string, unknown> | null;
  errorCode: string | null;
}
```

The port performs conversation creation/reuse, user-message insertion, request
creation, inline execution, terminal output loading, and assistant-message
insertion. Sourcing never imports the Agent OS repository.

The web keeps `conversationId` only for the mounted assistant panel session.
Reload may start a new conversation. Old conversations remain server-side audit
records but are not automatically resumed.

The future `/agent-os` flow remains:

```text
Operator conversation -> Operator decision -> delegate to agentType=sourcing
```

Both entrypoints use the same Sourcing Agent definition, skills, capabilities,
and output schema.

## 7. Capability Model

Capabilities are business entrypoints, not aliases for UI functions. They
consume immutable IDs or typed inputs and return IDs that later steps can reuse.

| Capability | Kind | Effects | Contract |
|---|---|---|---|
| `sourcing.retrieveWorkspaceEvidence` | resource | read | Search normalized interest/recommendation/validation documents and return the corpus input hash, document IDs, source IDs, matched terms, and data gaps. |
| `sourcing.inspectRecommendationRun` | resource | read | Read one explicit recommendation run or the latest eligible run, including source coverage and validation summary. It never recalculates scores. |
| `sourcing.refreshCollection` | workflow | read, external_io, db_write, job_enqueue | Start or reuse the existing deterministic Operations collection/refresh flow and return its operation run ID and current status. |
| `sourcing.refreshValidation` | workflow | read, db_write | Validate one explicit recommendation run and return validation episode IDs and missing evidence. |
| `sourcing.scrapeUrlWorkflow` | workflow | read, browser, external_io, db_write, job_enqueue | Validate an allowed supplier URL, duplicate-check, scrape, ingest, and return the candidate/artifact identity. |
| `sourcing.createReviewBatch` | sink | read, db_write | Revalidate selected item keys and expected versions, then create only a SourcingReviewBatch and immutable items. |

Capability constraints:

- Every input receives `organizationId` and actor context from Agent OS, never
  from model arguments.
- Every mutating or external-I/O capability requires a stable idempotency key.
- Every required canonical write completes before the capability returns. An
  AgentRun cannot become successful while a required Sourcing write is still
  waiting on an in-memory event listener.
- `refreshCollection` uses the existing source allowlist, organization enabled
  switch, operation lease, and collection coordinator.
- `createReviewBatch` cannot create a SourcingDecisionBatch, procurement intent,
  purchase order, provider call, or listing.
- Citation-capable resources return stable document/source IDs. The model cannot
  invent or replace them.
- A capability adapter calls a Sourcing incoming port. It does not import a
  concrete application service from Agent OS.

The following current agent-visible discovery stages are retired or made
internal after their consumers move because they each repeat the complete
discovery calculation:

- `market.collect_keyword_category_rankings`
- `coupang.match_products`
- `coupang.collect_tracking_snapshot`
- `supplier1688.match_products`
- `sourcing.score_opportunities`
- `sourcing.create_recommendation_packet`

Underlying provider/read services remain available to deterministic Sourcing
workflows. Removing an Agent capability does not delete source facts.

`market.collect_shadow_signals` remains a separate deterministic/admin workflow
and is not preloaded into the Sourcing Agent. Listing-generation capabilities
belong to the Listing Agent rather than the Sourcing capability manifest.

## 8. Playbooks

### 8.1 `sourcing_workspace_question_v1`

Used by the existing dashboard assistant.

```text
user question
  -> retrieveWorkspaceEvidence
  -> optional inspectRecommendationRun
  -> evidence-grounded Claude/Codex answer
  -> verified citations
```

It performs no mutation unless the user explicitly asks for a supported
collection/validation operation and the tool policy allows it.

### 8.2 `sourcing_market_research_v2`

```text
read current evidence and recommendation
  -> identify explicit data gaps
  -> optionally call refreshCollection
  -> return operationRunId when collection is still running
  -> on a later user request, inspect the latest completed run
  -> explain evidence and await selection
```

It does not poll a long-running operation inside an AgentRun and does not create
an automatic follow-up AgentRun when the operation finishes.

### 8.3 `manual_product_intake_from_url_v2`

```text
validate URL
  -> scrapeUrlWorkflow
  -> return candidate and evidence artifacts
  -> await explicit user action
```

It does not automatically start listing generation.

### 8.4 `sourcing_review_handoff_v1`

```text
load selected item keys and expected versions
  -> verify freshness and validation state
  -> createReviewBatch
  -> return reviewBatchId
```

The sourcing workflow ends here. A future Order Agent workflow begins only from
an explicit user-approved handoff. The existing
`sourcing_market_opportunity_to_order_draft_v1` playbook is deprecated after
callers move to these separated contracts.

## 9. Runtime Skills And Prompt Assets

The Sourcing Agent uses code-owned, versioned runtime skills:

1. `sourcing.evidence-grounded-analysis`
   - cite only returned document IDs;
   - distinguish facts, estimates, and missing evidence;
   - never invent price, demand, margin, compliance, supplier, or quality data;
   - never reinterpret heuristic baseline actions as canonical decisions.
2. `sourcing.collection-planning`
   - inspect current coverage before starting collection;
   - call one bounded deterministic workflow rather than recreating its steps;
   - reuse operation and recommendation IDs;
   - report browser-session/readiness gaps explicitly.
3. `sourcing.safe-review-handoff`
   - require explicit selected item keys and current versions;
   - end at a review batch;
   - never invoke purchase, registration, or provider execution.

The files live beneath `agent-config/skills/sourcing/<skill>/SKILL.md`, use
`mode='runtime_playbook'`, and are listed in the Sourcing agent definition.

`sourcing.magic_scraper` remains a `development_workflow`. It is visible in the
catalog for extractor engineering but is removed from runtime default preload.

The base prompt lives at `agent-config/prompts/agents/sourcing.md`. Startup and
seed verification fail explicitly when a configured prompt, runtime skill, or
output schema file is absent.

Before each run Agent OS resolves and records:

- prompt path and content hash;
- runtime skill key, version, and content hash;
- allowed capability keys;
- structured output schema version;
- selected provider, model, and installed CLI version.

These values are stored in a `run.runtime_resolved` event. No new business-state
table is required.

## 10. Claude And Codex Runtime

The existing Sourcing-owned CLI adapter is replaced by an Agent OS-owned,
provider-neutral local CLI runtime.

Supported adapter types are explicit:

- `claude_cli`
- `codex_cli`

The Sourcing Agent definition uses `runtimeKind='agent'` and requires
`AGENT_SOURCING_MODEL` or an explicit instance override. The old
`SOURCING_ASSISTANT_RUNTIME` and `SOURCING_ASSISTANT_MODEL` selection path is
removed after the dashboard uses Agent OS.

Both CLI providers receive the same resolved prompt, skills, capability policy,
and versioned final-output schema. Provider adapters only translate that common
contract to CLI arguments and parse provider telemetry.

Security rules:

- run in an OS temporary working directory;
- use ephemeral/no-session-persistence mode;
- ignore user/project rules and configuration where supported;
- disable shell, filesystem, web, browser, Chrome, computer-use, plugin, and
  image-generation surfaces;
- load only a scoped KidItem Agent OS MCP configuration;
- use an output JSON schema;
- cap timeout, output bytes, and provider budget where supported;
- pass only provider authentication to the CLI process;
- keep DB/server credentials inside the MCP server process;
- classify and redact stderr instead of returning it to the web.

Claude uses `--bare`, `--tools ""`, `--strict-mcp-config`, an explicit MCP
config, `--json-schema`, explicit model, and no session persistence.

Codex uses `exec --ephemeral --ignore-user-config --ignore-rules`, disables all
local execution surfaces, configures only the KidItem MCP server, supplies an
explicit output schema and model, and uses `approval_policy="never"`.

The MCP execution seam is an `AgentMcpSessionPort`. Its initial implementation
starts the existing stdio MCP server once per AgentRun and reuses it for all
tool calls in that run. A future loopback transport may replace it only after
measurement; the Agent runtime and capability contracts do not change.

## 11. RAG And Citation Contract

RAG is not moved into Agent OS storage or model logic.

- Sourcing builds the corpus from normalized interests, immutable recommendation
  runs, and validation episodes.
- `SourcingWorkspaceSnapshot` remains an internal input-hash/TTL cache for the
  rebuildable index.
- `sourcing.retrieveWorkspaceEvidence` invokes the deterministic retrieval port
  through AgentToolRouter, so the invocation is audited by Agent OS.
- Retrieval returns a corpus `inputHash`, document IDs, source scope/date, source
  row/run IDs, matched terms, and bounded text.
- The model output cites document IDs, not display indexes.
- The runtime validates every cited ID against documents returned during the
  same AgentRun and maps it to the existing dashboard citation shape.
- Unknown citation IDs are dropped and recorded as a verifier failure. If no
  verified citation supports a factual answer, the result degrades to the
  deterministic retrieval response.
- Browser `visibleContext` remains wire-compatible but is not authoritative
  evidence. It may provide selected row IDs; free-form browser text cannot
  introduce facts or instructions into the model context.

## 12. State, Restart, Retry, And Cancellation

No new execution statuses are added.

```text
AgentRunRequest: pending -> claimed -> succeeded | failed | cancelled
AgentRun: running -> succeeded | failed | cancelled
```

Business context such as `operation_started` or `awaiting_user_selection` is a
typed output/artifact, not an AgentRun status.

Dashboard interaction rules:

- one inline request per question;
- `maxAttempts=1`;
- no automatic requeue after a model/capability failure;
- no provider session resume;
- no checkpoint or automatic replay after restart;
- a user retry creates a new request;
- mutating/external capabilities still use their own idempotency keys.

On graceful shutdown Agent OS cancels the active CLI/MCP process tree and closes
the request and run with status `failed` and error code
`process_interrupted`. On startup a bounded reconciliation makes the same
terminal transition for stale dashboard-assistant `claimed` requests and
`running` runs; it never puts them back in `pending`.

Request and run terminal transitions use one repository transaction. Startup
reconciliation treats either side being nonterminal as an interrupted local
execution and monotonically closes only the remaining nonterminal rows; it
never overwrites `cancelled`, `succeeded`, `failed`, or `requires_approval`
request intent. Pre-run failures update only a still-`claimed` request.

There is no restart delivery phase for a local model result. Canonical
Sourcing writes happen in the capability call before run success. Finalized
events may close alerts or add audit detail, but listener failure cannot change
the terminal run result and cannot leave required Sourcing data uncommitted.

The general Agent OS queue and retry support remain for future delegated or
approval workflows. They are not used to simulate uninterrupted dashboard
chat. Operations leases/fencing remain because they prevent concurrent workers
and late reports from corrupting data, not because they make server maintenance
available.

## 13. Error Semantics

| Condition | Durable result | Dashboard result |
|---|---|---|
| No matching evidence | successful run with data gaps | retrieval-only answer with zero or bounded citations |
| Model not configured | request fails with `model_required` before model execution | deterministic retrieval-only response |
| CLI missing or unauthenticated | failed AgentRun with classified provider code | deterministic retrieval-only response |
| CLI timeout/output limit | child processes terminated; failed AgentRun | deterministic retrieval-only response |
| Noncritical capability failure | failed ToolInvocation and explicit gap | grounded partial answer when other evidence suffices |
| Required capability failure | failed ToolInvocation and AgentRun | retrieval-only or current API error according to available evidence |
| Invalid/unknown citation | verifier event; citation removed | only verified citations shown |
| User cancellation | request/run cancelled and process tree terminated | existing cancellation/error behavior |
| Server restart | request/run status `failed`, error code `process_interrupted` | user retries explicitly |

Raw CLI errors, paths, auth state, prompts, environment values, and provider
stderr never cross the HTTP boundary.

## 14. Performance And Capacity

- The Agent OS worker already executes one request at a time per process. Inline
  dashboard calls use a bounded Agent runtime capacity gate rather than a global
  Sourcing `running` boolean.
- Capacity wait has a bounded deadline. Exhaustion is a classified failure, not
  a false successful `busy` answer.
- One MCP session is reused for all capability calls in one AgentRun.
- Retrieval uses bounded top-K documents and existing input-hash/TTL caching.
- The model never reruns the full market discovery calculation for each logical
  stage.
- Long collection is returned as an Operations run ID; a CLI process does not
  poll for minutes.
- Provider token usage is parsed from structured CLI output. Unknown monetary
  cost is recorded as unavailable rather than zero.
- Existing endpoint throttling remains, while process capacity and AgentRun
  idempotency provide server-side protection.

## 15. Safe Handoff Policy

The Sourcing Agent may explain and collect evidence, refresh recommendation and
validation state, and create a review batch only through its policy-allowed
capabilities.

The direct dashboard assistant profile initially exposes read, collection,
validation, and URL-intake capabilities. The existing Final CTA continues to
call the review command directly, preserving its current UI and explicit user
action.

The `createReviewBatch` capability exists for the future Operator flow and is
not exposed to the current dashboard assistant profile. A later flow may expose
it only after an explicit user-approved selection is represented in the
request. It remains terminal for Sourcing. Order Agent playbooks begin
separately and never inherit implicit approval from a sourcing conversation.

## 16. Verification Strategy

Add only regression and public-contract tests needed for the new boundary:

1. Capability adapters consume prior run/artifact IDs and do not repeat the
   complete discovery calculation.
2. Prompt, output schema, and configured runtime skill files exist; development
   skills are not runtime-preloaded.
3. Claude and Codex commands disable built-in tools, configure only KidItem MCP,
   use explicit models, and enforce structured output.
4. MCP context fixes organization, user, request, run, instance, and agent type;
   model arguments cannot override them.
5. AgentInteraction creates or reuses the conversation, stores both messages,
   runs inline once, and preserves organization scope.
6. Dashboard requests use `maxAttempts=1`; interrupted requests are failed and
   never startup-requeued.
7. Cancellation terminates CLI and MCP processes and a late result cannot
   restore success.
8. Citation verification accepts only document IDs returned in the same run.
9. Model/CLI failure persists the Agent OS error before the dashboard receives
   the retrieval-only fallback.
10. Collection returns/reuses one operation run without holding the CLI open.
11. Review-batch capability creates no decision, procurement intent, purchase
    order, provider call, or listing.
12. The existing assistant HTTP response fields and visible UI copy remain
    compatible.

Manual verification uses the authenticated sourcing dashboard and executes one
grounded question with Claude and one with Codex. `/agent-os` UI verification is
not required because that screen is unchanged.

## 17. Cutover

The change is implemented in the existing PR #470 after the normalized Sourcing
cutover. It does not need a new sourcing-data backfill.

Cutover order:

1. Add and validate code-owned prompt, runtime skills, and output schema.
2. Add the generic AgentInteraction and Agent OS local CLI/MCP runtime boundary.
3. Register the new Sourcing capabilities and replace the repeated discovery
   playbook with artifact/run-based workflows. Move URL scrape validation and
   candidate upsert into the synchronous Sourcing-owned capability path and
   remove `SourcingScrapeFinalizedBridge` as a canonical-data writer.
4. Route the dashboard assistant through AgentInteraction and keep the existing
   HTTP presenter/fallback shape.
5. Remove the Sourcing-owned direct CLI adapter and old assistant runtime/model
   environment selection.
6. Deprecate repeated discovery capabilities and the combined sourcing-to-order
   playbook after the final consumer scan is empty.
7. Verify Claude and Codex from the signed-in sourcing dashboard.

No `/agent-os` screen, visible sourcing copy, Office database, procurement
execution path, or `docs/ARCHITECTURE.md` change is part of this cutover.

## 18. Acceptance Criteria

- Every dashboard Claude/Codex answer has an AgentRun and explicit model.
- The dashboard talks directly to `agentType='sourcing'`; the Operator is not
  inserted into the known-domain path.
- Claude and Codex use the same prompt, runtime skills, capability policy,
  structured output, and citation verifier.
- RAG indexing/retrieval stays deterministic and Sourcing-owned while Agent OS
  audits agent-triggered retrieval as a capability invocation.
- No active capability stage repeats the complete discovery calculation.
- The Sourcing Agent cannot access shell/filesystem/web/browser tools or any
  non-allowlisted KidItem capability.
- The Sourcing Agent cannot create a procurement intent, purchase order,
  provider order, payment, or listing.
- Dashboard questions are not automatically resumed or replayed after restart.
- Restart reconciliation fails stale inline runs instead of requeueing them.
- Server shutdown never resumes or replays a local CLI execution; request and
  run converge on `failed/process_interrupted` unless already terminal.
- Required Sourcing writes finish before AgentRun success. Finalized events are
  non-authoritative and no canonical Sourcing writer depends on them.
- Existing sourcing routes, visible copy, direct deterministic buttons, and
  assistant response presentation remain compatible.
- Claude and Codex each pass one real local dashboard smoke test.
