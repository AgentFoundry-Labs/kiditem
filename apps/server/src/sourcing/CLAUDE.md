# apps/server/src/sourcing — Sourcing Owner Domain

Sourcing is the canonical owner root for sourcing, procurement, and supplier
capabilities. PR for Wave H1 Lane S folded the former top-level
`apps/server/src/suppliers/` and `apps/server/src/procurement/` modules into
this owner domain along the
[Backend Architecture Contract](../../../../docs/superpowers/plans/2026-04-29-backend-architecture-contract.md):
**Domain-first modular architecture with Application orchestration and
selective Hexagonal Ports**.

## Owner domain rule

`sourcing` is an owner domain. Suppliers and procurement are not standalone
owner domains; they are sourcing capabilities. `AppModule` imports only
`SourcingModule`. `supplier-payments` is a finance capability and stays out of
this module — do not pull it in here.

| Capability | Public route (frozen) |
|---|---|
| Sourcing extension ingest + scrape | `/api/sourcing/*` |
| Purchase orders state machine | `/api/purchase-orders/*` |
| Supplier CRUD | `/api/suppliers/*` |

Controller file names match the capability (`sourcing.controller.ts`,
`procurement.controller.ts`, `suppliers.controller.ts`). The `@Controller(...)`
route shape stays exactly as above.

## Topology

```
sourcing/
├── sourcing.module.ts                              ← single AppModule mount point + port↔adapter binding
├── adapter/
│   ├── in/http/                                    ← controllers + DTOs (HTTP DTO binding only)
│   │   ├── sourcing.controller.ts                  (@Controller('sourcing'))
│   │   ├── procurement.controller.ts               (@Controller('purchase-orders'))
│   │   ├── suppliers.controller.ts                 (@Controller('suppliers'))
│   │   └── dto/                                    ← every class-validator DTO
│   └── out/
│       └── agent/
│           └── sourcing-agent.gateway.adapter.ts   ← AgentRegistry delegation seam
├── application/
│   ├── port/
│   │   └── out/
│   │       └── sourcing-agent.gateway.port.ts      (SOURCING_AGENT_GATEWAY_PORT)
│   └── service/
│       ├── sourcing.service.ts                     (uses gateway port + Prisma)
│       ├── procurement.service.ts                  (uses domain policy + Prisma)
│       └── suppliers.service.ts                    (transitional flat CRUD + Prisma)
├── domain/
│   └── policy/
│       └── purchase-order-status.ts                (state machine: draft → pending → ordered → shipped → received)
└── __tests__/
    ├── sourcing-flow.spec.ts
    ├── procurement-flow.spec.ts
    └── (domain/policy/__tests__/purchase-order-status.spec.ts lives next to its source)
```

## DDD/hexagonal posture in this module

The Wave H1 Lane S fold introduced hexagonal boundaries only where behavior
justifies them. The rest stays transitional flat CRUD by design:

- **AgentRegistry delegation** (`/api/sourcing/scrape-url`) is mandatory port
  per the architecture contract. `SourcingService` depends on
  `SOURCING_AGENT_GATEWAY_PORT`; `SourcingAgentGatewayAdapter` is the only
  call site of `AgentRegistryService.runByType('sourcing', ...)`.
- **Purchase order state transitions** are extracted as a pure domain policy
  (`domain/policy/purchase-order-status.ts`). `ProcurementService` consults
  the policy; the state machine has no Nest, no Prisma, no IO.
- **Suppliers** is intentionally left as transitional flat CRUD. The
  architecture contract permits this for tiny CRUD surfaces that are not
  being reconstructed in the same PR.
- `MasterProduct` writes still live inline in `SourcingService.receiveExtensionData`
  because the create path is gated by `NotImplementedException` until Plan B3
  (MasterCodeService integration) wires the family code. Do not add new
  master-product writes here without that plan.

## Public contracts that must not regress

- `/api/sourcing/extension/product-data` accepts pushes from the 1688 / Alibaba
  browser extension. `MasterProduct` upsert keys on
  `{ sourceUrl, companyId }` (idempotency).
- `/api/sourcing/scrape-url` enqueues an Agent OS task via `runByType('sourcing', …)`.
  The adapter is the only seam; `SourcingService` does not import
  `AgentRegistryService` directly.
- `/api/sourcing/extension/products` returns paginated `MasterProduct`
  rows scoped to the caller's company and platform filter.
- `/api/purchase-orders` action body (`create | updateStatus | delete`)
  preserves the legacy single-endpoint POST shape. Status transitions follow
  `draft → pending → ordered → shipped → received` exactly; deletion is
  allowed only from `draft` or `pending`.
- `/api/suppliers` CRUD reads/writes are tenant-scoped via
  `findFirst({ id, companyId })` before any update/delete.

## 외부 consumer

`SourcingModule` does not export application services. Cross-domain consumers
(if any are introduced later) should depend on a future
`application/port/in/*` token that the module exports explicitly. Today no
other module imports sourcing/procurement/supplier services.

## 테스트 전략

| Tier | 위치 | 목적 |
|---|---|---|
| Domain policy unit | `domain/policy/__tests__/purchase-order-status.spec.ts` | Pure state machine — every legal/illegal transition + deletable subset |
| Application service unit | `__tests__/sourcing-flow.spec.ts`, `__tests__/procurement-flow.spec.ts` | Use-case orchestration. Prisma + agent gateway port faked. |

## 금지 패턴

- `AgentRegistryService` 를 `application/service/**` 에서 직접 inject — adapter
  를 우회한다. Use the gateway port.
- `findUnique({ where: { id } })` 으로 supplier/PO 조회 — IDOR. 항상
  `findFirst({ where: { id, companyId } })`.
- `supplier-payments` 의 import 또는 회로 추가 — finance owner domain 소관.
- `master_products` 의 새 write 경로 추가 (현재는 `NotImplementedException`
  guarded). 변경하려면 Plan B3 (MasterCodeService) 가 선행되어야 한다.
- `apps/server/src/{suppliers,procurement}` 폴더 부활 — capability 는
  sourcing 안의 `adapter/in/http/<capability>.controller.ts` +
  `application/service/<capability>.service.ts` 로만 존재한다.

## Verification gates (PR 별 필수)

```
git diff --check
npm exec --workspace=apps/server -- vitest run src/sourcing src/procurement src/suppliers
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```
