# CopilotKit-Native Interaction OS Execution Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct KidItem AI interaction around CopilotKit Enterprise Intelligence, AG-UI, and a policy-owning AgentOS without retaining a parallel chat system.

**Architecture:** CopilotKit owns the user-visible thread, transcript, stream, reconnect, generative UI, and HITL surface. A separately deployed Interaction Gateway exposes CopilotKit Runtime v2 and forwards only authorized AG-UI runs to NestJS AgentOS; AgentOS owns identity binding, agent versions, authority, execution, promotion, tasks, approvals, and audit, while Operations owns durable run envelopes and engine dispatch. Foundation, Quick Ask, official work, and cutover are four sequential, independently verifiable checkpoints delivered through one Linear issue, one implementation branch, and one pull request.

**Tech Stack:** Node.js 22, TypeScript, Next.js App Router, React, NestJS, Prisma/PostgreSQL, CopilotKit Runtime/React Core 1.67.1 candidate train, AG-UI 0.0.57 candidate train, CopilotKit Enterprise Intelligence, Redis, Kubernetes/Helm, Docker Compose, Vitest/Jest, Playwright

## Global Constraints

- CopilotKit is the only user-visible conversation, transcript, streaming, reconnect, generative-UI, and HITL framework.
- AG-UI is the only conversational protocol between CopilotKit and AgentOS; provider- and CLI-specific streams never reach the browser.
- Enterprise Intelligence is the canonical conversation/event store; AgentOS stores references and control records, never message text.
- Quick Ask is read-only, creates no `AgentSession`, and has one active thread per organization, user, and selected agent; a four-hour idle boundary archives it on the next ask.
- Panel open, history load, replay, and reconnect use a read-only connection-authorization path and create no binding, execution, policy, model, or Operations work.
- A Quick Ask run follows prepare → optional Enterprise Intelligence archive → Nest authorization → AG-UI dispatch; failure to archive an expired predecessor stops the run before any control write or model call.
- Official work stays on the same CopilotKit thread by default and has exactly one active `AgentSession`; branching requires an explicit authority-boundary policy decision.
- Promotion is deterministic, stale-safe, idempotent, explicitly confirmed through HITL, and does not approve any downstream mutation.
- The existing purple `QuickActionFab` is the only global floating entry; desktop keeps the dashboard visible beside a right panel and narrow layouts use a full-screen surface.
- Operator is the default agent; only server-authorized agent versions are selectable.
- Shared browser context is limited to route, canonical resource references, allowlisted filters, visible row IDs, aggregate summaries, locale, and timezone.
- UI actions are registered, typed, server-minted, click-time authorized, and stale-safe; no dedicated answer-expansion action is rendered.
- Suggested replies are attached only to the latest eligible assistant response, contain at most three choices, and one click creates exactly one visible user turn while consuming its siblings.
- Frontend code accesses business data only through NestJS APIs and never imports Prisma, `pg`, Supabase, or another database client.
- Organization scope is derived from the current server session and `OrganizationMembership`; browser-supplied organization, authority, role, and permission claims are ignored.
- External content, model text, tool output, and runtime output are untrusted data until schema, scope, resource-version, and policy validation succeeds; none can supply policy instructions or proof of completion.
- Existing KidItem authentication remains the local opaque-session contract. Production Enterprise Intelligence administration uses the approved OIDC provider; introducing browser JWT/JWKS authentication is outside this reconstruction.
- Deterministic automation never creates AgentOS work. LLM judgment starts in AgentOS and may invoke Operations-owned deterministic capabilities.
- Missing model selection or a runtime that lacks required durability semantics is an explicit error; no silent model or runtime fallback is permitted.
- Operations owns the operation catalog, schedules, run envelope, dispatch, cancellation envelope, and terminal reconciliation; AgentOS owns goals, tasks, delegation, authority, and approvals.
- Prisma uses `String` plus DTO/Zod/domain validation instead of native PostgreSQL enums, and every mutation carries organization scope.
- The new task model is named `AgentSessionTask`; the retired legacy `AgentTask` name is not reintroduced.
- CopilotKit and AG-UI packages are exact-pinned as one compatibility train. Candidate versions are CopilotKit `1.67.1` and AG-UI `0.0.57`; Phase 0 must reject or approve the complete train before product code adopts it.
- `AgentFoundry-Labs/CopilotKit` is an upstream mirror and short patch queue, not a Git dependency or permanent product fork.
- Production Enterprise Intelligence starts self-hosted on a supported Kubernetes cluster with isolated PostgreSQL and Redis, TLS, encryption at rest, backups, restore tests, retention, residency policy, and observability.
- Legacy chat APIs, polling, transcript models, duplicate renderers, and the divergent Chatbot identity are removed only after scanners and compatibility gates prove the replacement path.
- Channels, Slack, Teams, mobile notifications, and OpenTag remain outside these four plans.

## Work Tracking And Delivery Shape

- Linear [KID-25](https://linear.app/kiditem/issue/KID-25/copilotkit-%EA%B8%B0%EB%B0%98-interaction-os%EB%A1%9C-ai-chatagentos-%EB%8C%80%ED%99%94-%EC%9E%AC%EA%B5%AC%EC%B6%95) is the sole work item and decision record.
- Use one implementation branch, `codex/kid-25-copilotkit-interaction-os`, and one pull request targeting `develop`.
- The four linked plans are ordered verification checkpoints inside that pull request, not pull-request boundaries. Preserve their focused commits and gates so reviewers can inspect each slice independently.
- Do not create another issue, branch, or pull request merely because a checkpoint is large. If a release or safety constraint makes one pull request impossible, stop first and record the evidence and proposed boundary on KID-25 for explicit approval.
- This is the declared platform-boundary exception covering AgentOS, Operations, shared contracts, backend, web, schema, and deployment. Exclude unrelated cleanup and unrelated business-domain rewrites.

---

## Source Design

Implementation must satisfy [the approved Interaction OS design](../specs/2026-08-13-ai-chat-interactive-response-design.md). If an implementation discovery changes a product decision, stop that subplan and amend the design plus this index before coding around it.

## Upstream Sources And Version Evidence

- CopilotKit v2 provider and runtime: <https://docs.copilotkit.ai/reference/v2>
- CopilotKit Threads: <https://docs.copilotkit.ai/reference/v2/hooks/useThreads>
- CopilotKit self-hosted Enterprise Intelligence: <https://docs.copilotkit.ai/strands/premium/self-hosting>
- AG-UI protocol: <https://docs.ag-ui.com/introduction>
- AG-UI interrupts: <https://docs.ag-ui.com/concepts/interrupts>
- Canonical source: <https://github.com/CopilotKit/CopilotKit>
- KidItem mirror/patch queue: <https://github.com/AgentFoundry-Labs/CopilotKit>

On 2026-08-13, the fork default branch `main` was at `7fd4c5ee782a9fd4fe7e662c304920bd453d2490`; upstream `main` was at `6de1b96da2919f1ad2d7eee6506a609e7ec58428`. GitHub reported the fork was zero commits ahead and two commits behind. Implementers must re-run the comparison before touching the fork; the recorded result establishes policy, not a permanent base SHA.

## Repository And Fork Policy

KidItem installs only exact registry artifacts. It must never use a dependency such as `github:AgentFoundry-Labs/CopilotKit#main`.

The fork uses this branch policy:

| Branch | Purpose | Allowed changes |
|---|---|---|
| `main` | Clean mirror of `CopilotKit/CopilotKit:main` | Upstream commits only |
| `kiditem/patch/issue-1234` | Example release-blocking patch branch based on an exact upstream tag | One narrowly scoped fix plus upstream issue/PR reference; replace `1234` with the real upstream issue number |
| `kiditem/canary/copilotkit-1.67.1-agui-0.0.57` | Candidate compatibility execution | Workflow/config changes needed only to run the named candidate matrix |

If a patch is required, publish internally namespaced packages with immutable versions such as `1.67.1-kiditem.1`, attach the upstream base SHA, patch SHA, license snapshot, and SBOM, and pin the full train to that one suffix. Remove the patch when an upstream release contains the fix. A KidItem production release must not combine upstream and patched CopilotKit packages.

Every weekly mirror review executes:

```bash
gh api repos/AgentFoundry-Labs/CopilotKit/compare/CopilotKit:main...main \
  --jq '{status, ahead_by, behind_by}'
git ls-remote https://github.com/CopilotKit/CopilotKit.git refs/tags/v1.67.1
```

Expected before a candidate train is approved: the fork reports `ahead_by: 0`; any `behind_by` value is either fast-forwarded or recorded as a deliberate canary freeze. A non-zero `ahead_by` on `main` blocks approval.

## Resolved Platform Decisions

### Identity split

- The KidItem browser sends only its existing same-origin opaque session cookie.
- NestJS resolves `AuthUser`, organization membership, effective permissions, and allowed agent versions.
- The Interaction Gateway calls Nest for discovery, read-only connection authorization, and the two-phase run preparation/authorization path; it does not decode or mint a browser JWT.
- Gateway-to-Nest calls use the user cookie plus a deployment-scoped service credential over the private network; Nest validates both.
- Enterprise Intelligence administration and service access use the production OIDC provider required by the supported distribution.
- The Enterprise Intelligence principal key is a non-reversible, stable HMAC of `organizationId:userId`; raw IDs are not exposed as a cross-tenant lookup key.

### Data ownership

| Record | Owner | Stored content |
|---|---|---|
| CopilotKit Thread/event history | Enterprise Intelligence | Messages, stream events, thread title/archive state |
| `AgentInteractionThreadBinding` | AgentOS | External thread ID, organization, principal, agent version, class, lifecycle |
| `AgentContextEpoch` | AgentOS | Promotion boundary and validated handoff reference, never transcript text |
| `AgentSessionPromotion` | AgentOS | Proposal facts, expiry, state, idempotency |
| `AgentSession` / `AgentSessionTask` | AgentOS | Goal, authority, assignment, status, durable references |
| `AgentExecution` / attempt | AgentOS | AG-UI/runtime correlation, policy/model/runtime resolution, audit state |
| Operation/run/checkpoint envelope | Operations | Schedule, engine dispatch, retry, checkpoint, cancellation, terminal state |
| Business facts and mutations | Domain modules | Organization-scoped source of truth |

### Gateway deployment

`apps/interaction-gateway` is a separately built Node service and is added to the Office release bundle so existing same-origin ingress can route `/api/copilotkit` to it. Enterprise Intelligence runs in its own Kubernetes platform plane with isolated PostgreSQL/Redis. The gateway has no Prisma dependency, performs no business query, and reaches AgentOS only through private Nest endpoints.

### Context trust boundary

Promotion stays in-place on the same CopilotKit thread, but it opens a new `AgentContextEpoch`. The official runtime receives a server-validated handoff containing canonical resource references and the user-confirmed goal; it does not treat pre-promotion model text or browser state as official authority or trusted execution context.

### Runtime durability

Each runtime advertises a capability matrix. An official task declares required semantics (`detached`, `reconnect`, `interrupt`, `cancel`, and `inspect`). Runtime selection fails closed when the chosen adapter cannot provide all required semantics; it never drops to a less durable adapter.

## Cross-Plan Contract

All four plans use these identifiers unchanged:

```typescript
type InteractionClass = 'quick_ask' | 'official_task';
type ThreadLifecycle = 'active' | 'archived' | 'deleted' | 'legal_hold';
type PromotionStatus =
  | 'pending'
  | 'accepted'
  | 'session_created'
  | 'rejected'
  | 'expired';

interface AgentCorrelation {
  copilotThreadId: string;
  aguiRunId: string;
  executionId: string;
  sessionId: string | null;
  taskId: string | null;
  operationsRunId: string | null;
}
```

Database IDs remain opaque strings in HTTP/AG-UI contracts. `copilotThreadId` and `aguiRunId` are external strings and must not be parsed as KidItem UUIDs.

## Plan Map And Required Order

### 1. [Interaction Platform Foundation](./2026-08-13-interaction-platform-foundation.md)

Produces a proven, exact-pinned platform train, the dedicated Interaction Gateway, Enterprise Intelligence deployment contract, identity bridge, thread binding/control schema, and a read-only AG-UI echo/probe. It exits only when a thread survives browser and gateway restart without any legacy KidItem transcript write.

### 2. [Quick Ask Vertical Slice](./2026-08-13-quick-ask-vertical-slice.md)

Consumes Plan 1 and produces the Operator Quick Ask experience, global right panel, dedicated workspace reuse, read-only domain capabilities, typed renderers, suggested replies, verified navigation, four-hour thread rotation, and audit without `AgentSession` creation.

### 3. [Official Session And Durable Runtime](./2026-08-13-agentos-official-session-runtime.md)

Consumes Plans 1 and 2 and produces deterministic promotion, context epochs, `AgentSession`, `AgentSessionTask`, Operations-backed durable execution, runtime adapters, approval/progress/artifact cards, reconnect, cancellation, and terminal reconciliation.

### 4. [Production Cutover And Legacy Deletion](./2026-08-13-interaction-os-cutover.md)

Consumes all earlier plans and produces production-grade Enterprise Intelligence operations, Office release integration, retention/deletion/legal-hold controls, contract scanners, compatibility canaries, guarded data migration, and deletion of every legacy conversation path.

Do not execute Plans 2–4 in parallel with Plan 1. After Plan 1, Quick Ask UI work may run beside official-session schema design only if each worker treats this index as the interface authority and no shared files are edited concurrently. Cutover begins only after both product slices pass their acceptance gates.

## Release-Train Gate

Before the first schema or deployment change, run:

```bash
git branch --show-current
git merge-base --is-ancestor develop HEAD
git show origin/main:VERSION
git show origin/develop:VERSION
```

Expected for this dated plan: a regular `codex/*` work branch whose intended base is `develop`, `origin/main` reports `0.1.29`, and `origin/develop` reports the open `0.1.30` train. Re-fetch and stop for plan refresh if either remote value has changed before execution; do not silently move the migration paths to another train. If no train is open, create and merge the repository's release-start PR before refreshing this plan and implementing schema or Office deployment changes.

Every schema slice follows expand → backfill/verification → contract in separate release-safe commits. Destructive model/column removal belongs only to Plan 4 after one production release has run the replacement path.

## Cross-Plan Verification Matrix

| Invariant | Plan 1 | Plan 2 | Plan 3 | Plan 4 |
|---|---:|---:|---:|---:|
| Exact CopilotKit/AG-UI train and upstream evidence | ✓ | canary | canary | scheduled canary |
| No browser-trusted organization/authority | ✓ | ✓ | ✓ | scanner |
| No AgentOS transcript storage | schema gate | Quick Ask gate | official gate | legacy deletion |
| Quick Ask never creates `AgentSession` | foundation contract | full test | regression | scanner |
| Panel/history/reconnect create no execution work | connection contract | browser/full test | official regression | production smoke |
| Expired Enterprise thread archives before replacement authorization | gateway order test | rotation test | regression | production smoke |
| Same thread renders in panel/workspace | probe | full test | official test | production smoke |
| Promotion is explicit/idempotent/stale-safe | contract only | proposal rendering | full transaction | production smoke |
| Browser/gateway/worker restart recovery | thread probe | Quick Ask | official execution | load/DR |
| No dedicated answer expansion | component contract | UI test | regression | scanner |
| Runtime fallback forbidden | contract | N/A | full matrix | canary |
| Legacy conversation path absent | guarded coexistence | guarded coexistence | guarded coexistence | deletion |

## Universal Commands

Run focused tests from each task first. Before each plan is accepted, run its listed gates plus all applicable repository gates:

```bash
npm run build --workspace=packages/shared
npm run build --workspace=apps/interaction-gateway
npm run build --workspace=apps/web
npm run dev:server
npm run check:idor
npm run check:tenant-scope
```

Expected: builds and scanners exit 0; `dev:server` reaches the normal Nest application-ready log with no missing provider, route collision, or model-fallback warning, then is stopped manually.

Schema plans additionally run:

```bash
npm run db:push
npx prisma generate
npm run build --workspace=packages/shared
```

Expected: schema application, Prisma generation, and shared build exit 0 against the designated development database.

Before PR handoff, run the reconstruction and release-contract guards named by `docs/runbooks/ai-collaboration.md` against `develop`, read the live PR body back, and stop on unrelated diffs or an unexpected commit count.

## Global Stop Conditions

Stop the implementation train rather than adding a compatibility layer when any of these occurs:

- the supported Enterprise Intelligence distribution cannot use a self-hosted URL with the exact React/runtime train;
- the public supported API cannot reconnect or publish official task events after gateway restart;
- thread ownership cannot be bound to the Nest-derived organization/user principal;
- HITL resume can duplicate a capability invocation or accept a stale proposal;
- the selected runtime cannot persist and inspect a handle after worker restart;
- a product requirement would require storing a second user-visible transcript in KidItem;
- the fork would need a long-lived product divergence instead of a bounded upstreamable patch;
- production rollout would require a permanent dual write to legacy and Enterprise Intelligence stores.

Record the failed proof as an ADR with captured version numbers and support response. Resume only after the design and plan are amended with a supported path.

## Completion Definition

- [ ] Plan 1 acceptance evidence is attached to the single KID-25 PR and the platform stop conditions are cleared.
- [ ] Plan 2 demonstrates Quick Ask create/resume/archive/reconnect and proves zero `AgentSession` rows.
- [ ] Plan 3 demonstrates explicit promotion and official work surviving browser, gateway, and worker restarts.
- [ ] Plan 4 demonstrates backup/restore, retention/deletion, upgrade canary, production ingress, and absence of legacy paths.
- [ ] `docs/ARCHITECTURE.md`, deployment/environment/runbooks, AGENTS ownership, SBOM, license snapshot, and version matrix match the shipped topology.
- [ ] The final codebase contains one conversation system: CopilotKit + Enterprise Intelligence + AG-UI.
