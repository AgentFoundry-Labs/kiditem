# apps/server — NestJS Backend

`apps/server/` is the NestJS API on port 4000. It owns HTTP entrypoints,
organization-scoped application services, Prisma adapters, provider adapters,
and cross-domain backend ports.

## Folder Map

```text
src/{owner-domain}/
├── {owner-domain}.module.ts
├── adapter/in/{http,agent,workflow,cli}/
├── adapter/out/{lane}/
├── application/{port,service}/
├── domain/
└── mapper/
```

Flat modules are valid until a real provider, runtime, cross-domain, raw-SQL,
transaction, storage, shared-use-case, or pure-policy seam exists.

## Owner Domain Map

[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) is the complete owner map.
Critical splits: Products owns `MasterProduct` metadata/ABC and direct option
recipes; Inventory owns physical `SellpiaInventorySku.currentStock`; Channels
owns listing/option identity and its derived product summary. Do not recreate a
variant, recipe, or stock ledger.

## Global HTTP Rules

- Global prefix is `/api`; do not add `/v1`.
- DTO validation uses the global `ValidationPipe({ whitelist: true, transform:
  true })`.
- Controllers pass `organizationId` from `@CurrentOrganization()`; body/query
  DTOs must not accept `organizationId`.
- Controllers do not use `as any`.
- Not found means `NotFoundException`; do not encode failures as `{ ok: false }`
  with HTTP 200.
- Single-resource GET/PATCH/DELETE uses `{ id, organizationId }` scope.
  `findUnique({ where: { id } })` is an IDOR bug.

## Boundary Rules

- Domain code is pure: no NestJS, Prisma, HTTP/provider SDKs, workflow runtime,
  AgentRegistry, filesystem, or panel/event infrastructure.
- Domain capability manifests live under `domain/capability/` and use the
  shared vocabulary in `src/common/capability-manifest.ts` to describe the
  owner-exposed `resource`, `tool`, `workflow`, and `sink` surface. Manifests do
  not execute work or bypass owner incoming ports.
- Reconstructed application services depend on `application/port/out/*`
  contracts for DB, cross-domain, provider, Agent OS, workflow, filesystem,
  event, raw-SQL, transaction, and row-lock boundaries.
- Do not import concrete `adapter/out/**` implementations or another owner
  domain service from `application/service/**`.
- Prisma belongs in outgoing repository/query adapters or documented legacy
  CRUD services.

## Port Directory Rules

- Incoming capability interfaces live under `application/port/in/`; caller
  types belong under `adapter/in/*`, never `port/in/http|agent|workflow`.
- Outgoing ports use the narrowest adapter-family lane:
  `repository|transaction|provider|storage|runtime|event|sink|workflow|cross-domain`.
  Do not leave files directly under `port/out/` without a documented checker
  exception.
- Owners publish incoming interfaces; consumers use them or a narrow local
  anti-corruption port. Do not move cross-domain contracts into `common`.
- Local lane barrels are allowed; broad `application`/`port` barrels are not.

## Special Surfaces

- Panel is owned by automation:
  `src/automation/adapter/in/http/panel.controller.ts`,
  `src/automation/adapter/out/panel-event/`, and
  `src/automation/mapper/panel-event/`.
- Action board is owned by automation. `/api/action-tasks/*` lives in
  `automation/adapter/in/http/action-task.controller.ts`.
- `src/feature-gate/` owns feature flag endpoint/config behavior only.

## Verification

Scoped server guides inherit this section unless they document a different
gate. For backend domain changes, run the narrow suite first when it exists:

```bash
npm exec --workspace=apps/server vitest -- run src/<domain-or-path>
```

Then run the backend gates:

```bash
npm run build --workspace=apps/server
npm run dev:server
```

Use `npm run check:idor` and `npm run check:tenant-scope` for
organization-owned services/controllers or raw SQL. Integration tests are
required for row locks, transaction invariants, Agent OS sink/reconcile paths,
and IDOR-sensitive behavior.
