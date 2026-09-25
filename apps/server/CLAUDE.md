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
- Controllers do not use `as any`. Missing resources throw a
  `KiditemNotFoundError`, not HTTP-200 failure objects.
- Apply the root single-resource organization fence to every read and mutation.
- Errors are KidItem codes ([ADR-0023](../../docs/adr/0023-errors-are-kiditem-codes.md)):
  throw a `KiditemError` subclass from `@kiditem/shared/errors` at the point
  where the business flow cannot continue (domain or adapter); controllers do
  not catch. Do not swallow errors with `try/catch`; wrap mall, Prisma and
  Gateway failures as `KiditemExternalError(code, { cause })` and rethrow.
  Responses carry no stack, raw text or variable names (log those with
  `Logger`). A new code exists only once it is registered with its Korean
  sentence in `ERROR_DEFINITIONS` (`npm run check:error-codes`).
- Pass diagnostic identifiers of a fence or expiry (`attemptId`, `mallKey`)
  through the `KiditemError` `details` or `cause`, not the sentence.

## Module Boundaries

- Flat controller/service modules remain valid for cohesive CRUD. Introduce a
  port when it protects provider IO, cross-domain mutation,
  transaction/locking semantics, or a stable shared capability. Line count
  alone is not a reason to add a port or adapter.
- Prefer one deep owner interface over multiple one-to-one forwarding layers.
- Use NestJS providers, dependency injection, logging, and lifecycle hooks in
  backend services, including application and domain code when needed. Keep
  calculations and predicates as ordinary functions when they need no service.
  Use the existing adapters for database/provider/runtime IO and keep contracts
  shared with web or extensions framework-neutral. Add a port or wrapper for a
  concrete business or IO boundary, not solely to hide NestJS.
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
- Owner persistence adapters implement fact queries behind public capabilities;
  a dedicated reader per ledger is optional (ADR-0021). Existing `read/` helpers
  remain internal pure transaction functions. Preserve organization, completed
  generation, coverage, and required lock evidence at the query boundary.
  Signal a missing, conflicting, or unselectable fact with
  `common/errors/fact-errors`; an integrity failure stays a plain `Error`.
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
