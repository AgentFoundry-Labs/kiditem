# Agent OS

Agent OS owns agent blueprints, organization-scoped instances, durable run
requests, run execution, tool policy, approvals, cost ledger, and run
observability. It replaces the legacy `AgentDefinition + AgentTask +
AgentWakeupRequest + HeartbeatRun + AgentEvent` runtime.

## Boundary

- Agent OS is a platform owner domain, not a business-domain module.
- Business domains request work through `AgentRunnerPort` (`AGENT_RUNNER_PORT`).
- Workflows and automation must not call runtime adapters directly.
- Runtime execution belongs behind `application/port/out/*` contracts.
- Prisma access stays in outgoing repository adapters.
- Application services must not import concrete adapters, `PrismaService`,
  Nest HTTP decorators, provider SDKs, filesystem APIs, or workflow internals.

## Data Contracts

- Use `organizationId` on every organization-scoped read and mutation.
- `AgentRunRequest` is the durable inbox and retry/coalescing owner.
- `AgentRun` starts at `running`; queue state belongs to `AgentRunRequest`.
- `AgentRunEvent`, `AgentAuthorizationEvent`, and `AgentCostEvent` remain
  separate ledgers.
- Tool permission uses blueprint default policy plus instance override.
- Bulk runtime logs are external; database rows store structured events,
  excerpts, and log references only.
- Cost ledger inserts and `AgentRuntimeState.totalCostMicros` updates run in a
  single transaction.

## Status Machines

```text
AgentRunRequest:
  pending -> claimed -> succeeded
                     -> failed
                     -> cancelled
          -> coalesced
          -> requires_approval -> pending
          -> skipped

AgentRun:
  running -> succeeded
          -> failed
          -> cancelled
```

`AgentRun` MUST start at `running`. Never introduce a `queued` value for
`AgentRun.status`. Queue state belongs to `AgentRunRequest`.

## Verification

- Unit: policy resolution, coordinator decisions, catalog invariants.
- Integration: request claim concurrency (`FOR UPDATE SKIP LOCKED`),
  run-event sequencing, idempotency, cost-ledger aggregate transaction.
- Boot: `npm run dev:server`

## Hard Bans

- No native Postgres enums (use String + Zod validation).
- No `$queryRawUnsafe` / `$executeRawUnsafe`. Tagged Prisma SQL only.
- No silent model fallback (`model = model || default`).
- No frontend direct DB access.
- No `tenantId` naming. Use `Organization` / `organizationId`.
