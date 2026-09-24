Before working in this directory, always read this document first rather than relying on memory.

# apps/server — NestJS Backend

`apps/server/` owns HTTP entrypoints, organization-scoped application
services, Prisma adapters, provider adapters, and backend capability ports. The
backend owner map lives in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md); the nearest domain guide
owns its identity and mutation rules.

## HTTP Contracts

- The global prefix is `/api`; do not add `/v1`.
- Global DTO validation uses whitelist and transform.
- Controllers receive organization scope from
  `@CurrentOrganization()`; DTOs do not accept it.
- Controllers do not use `as any`. Missing resources throw
  `NotFoundException`, not HTTP-200 failure objects.
- Apply the root single-resource organization fence to every read and mutation.

## Module Boundaries

- Flat controller/service modules remain valid for cohesive CRUD. Introduce a
  port when it protects provider IO, cross-domain mutation,
  transaction/locking semantics, or a stable shared capability. Line count
  alone is not a reason to add a port or adapter.
- Prefer one deep owner interface over multiple one-to-one forwarding layers.
- Domain code is pure: no NestJS, Prisma, HTTP/provider SDK, workflow runtime,
  filesystem, or panel/event infrastructure.
- Organization scope is decided once, at the entrypoint. A domain function
  that reads and writes no rows does not take `organizationId`; when the id is
  data (a storage key, a label), mark the parameter
  `// organization-scope: data — <reason>`. Verify with
  `npm run check:domain-organization-scope`.
- Key an advisory lock by organization when the guarded state is per
  organization. A lock that is global by design carries
  `queryraw-tenancy-exempt: global lock — <reason>` within eight lines of the
  lock call; verify with `npm run check:idor`.
- Incoming adapters live under `adapter/in/{web,agent,workflow,cli}` (existing `http` adapters move when their owner is refactored).
  Incoming ports describe capabilities, not caller types.
- Application services depend on the narrowest
  `application/port/out/<lane>` contract: repository, transaction, provider,
  storage, runtime, event, sink, workflow, or a named external owner. Products
  uses the `persistence` lane for database contracts.
- Application code does not import concrete `adapter/out/**`
  implementations or another owner's service. Prisma belongs in outgoing
  persistence adapters or a documented legacy CRUD exception.
- `read/` ledger readers are pure functions of the caller's transaction with no
  adapter, application, NestJS, or lock use. Signal a missing, conflicting, or
  unselectable fact with `common/errors/fact-errors`; an integrity failure
  stays a plain `Error`.
- `<owner>/transaction/` (not the `application/port/out/transaction/` lane)
  exports plain lock and fence functions that run in the caller's transaction.
  A reader takes the lock evidence and only verifies it.
- The owner publishes a cross-domain capability. Consumers use that incoming
  interface or a narrow anti-corruption port; shared behavior does not move to
  `common` merely for reuse.
- Source owner services own the transaction for attempt terminality, staged
  fact visibility, the current complete snapshot, coverage status, and any
  owner-side failure alert that must commit with the source result. Consumers
  read only the owner's complete snapshot.
- Extension ingress is an untrusted transport boundary. It accepts only a
  server-issued attempt identity and organization-scoped payload; chunks and
  terminal submissions are idempotent, while stale or post-terminal writes
  are rejected. Source completion does not trigger downstream calculations.
- Capability manifests under `domain/capability/` describe resource, tool,
  workflow, and sink surfaces; they do not execute work or bypass incoming
  ports.
- Lane-local barrels are allowed. Broad application or port barrels are not.

## Special Surfaces

- Feature-gate owns only feature endpoint/config behavior.
- `/api/categories` remains a Products compatibility route; do not add new
  compatibility routes without a named replacement owner.

## Verification

Run a focused domain suite first when one exists:

    npm exec --workspace=apps/server vitest -- run src/<domain-or-path>

Then inherit the root backend boot gate. Organization-sensitive or raw-SQL
changes also run `npm run check:idor` and `npm run check:tenant-scope`.
Use integration tests for row locks, transaction invariants, sink/reconcile
paths, and IDOR-sensitive behavior.
