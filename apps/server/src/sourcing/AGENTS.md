# apps/server/src/sourcing — Sourcing Owner Domain

Sourcing is the canonical owner root for sourcing, procurement, and supplier
capabilities. PR for Wave H1 Lane S folded the former top-level
`apps/server/src/suppliers/` and `apps/server/src/procurement/` modules into
this owner domain along the backend architecture contract in
`apps/server/AGENTS.md`: **Domain-first modular architecture with Application
orchestration and selective Hexagonal Ports**.

## Owner domain rule

`sourcing` is an owner domain. Suppliers and procurement are not standalone
owner domains; they are sourcing capabilities. `AppModule` imports only
`SourcingModule`. `supplier-payments` is a finance capability and stays out of
this module — do not pull it in here.

| Capability | Public route (frozen) |
|---|---|
| Sourcing extension ingest + scrape | `/api/sourcing/extension/*`, `/api/sourcing/scrape-url` |
| Sourcing product detail / detail-page generate | `GET /api/sourcing/:id`, `POST /api/sourcing/:id/generate` |
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
│       ├── agent/
│       │   └── sourcing-agent.gateway.adapter.ts   ← AgentRegistry delegation seam
│       └── products/
│           └── products-catalog.adapter.ts         ← MastersService cross-domain seam
├── application/
│   ├── port/
│   │   └── out/
│   │       ├── sourcing-agent.gateway.port.ts      (SOURCING_AGENT_GATEWAY_PORT)
│   │       └── products-catalog.port.ts            (SOURCING_PRODUCTS_CATALOG_PORT)
│   └── service/
│       ├── sourcing.service.ts                     (uses gateway port + products catalog port + Prisma)
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

- **AgentRegistry delegation** (`/api/sourcing/scrape-url`,
  `/api/sourcing/:id/generate`) is mandatory port per the architecture
  contract. `SourcingService` depends on `SOURCING_AGENT_GATEWAY_PORT`;
  `SourcingAgentGatewayAdapter` is the only call site of
  `AgentRegistryService.runByType('sourcing'|'content', ...)` for sourcing.
- **Cross-domain MasterProduct create** (extension ingest creating new family)
  flows through `SOURCING_PRODUCTS_CATALOG_PORT`. `SourcingService` does not
  import `MastersService` directly; the port adapter
  (`adapter/out/products/products-catalog.adapter.ts`) is the only call site
  of products' `MastersService.create` from sourcing. `MastersService.create`
  internally invokes `MasterCodeService` to issue the `M-00000001` family
  code in transaction, so the historical "Plan B3 prerequisite" for
  MasterCodeService integration is satisfied through this seam.
- **Purchase order state transitions** are extracted as a pure domain policy
  (`domain/policy/purchase-order-status.ts`). `ProcurementService` consults
  the policy; the state machine has no Nest, no Prisma, no IO.
- **Suppliers** is intentionally left as transitional flat CRUD. The
  architecture contract permits this for tiny CRUD surfaces that are not
  being reconstructed in the same PR.
- **MasterProduct update path** (existing master matched by
  `{ sourceUrl, organizationId }`) lives inline in
  `SourcingService.receiveExtensionData` and writes via Prisma. Updates do
  not require code issuance and stay inside sourcing's transaction
  boundary.

## Public contracts that must not regress

- `/api/sourcing/extension/product-data` accepts pushes from the 1688 / Alibaba
  browser extension. `MasterProduct` upsert keys on
  `{ sourceUrl, organizationId }` (idempotency).
- `/api/sourcing/scrape-url` enqueues an Agent OS task via `runByType('sourcing', …)`.
  The adapter is the only seam; `SourcingService` does not import
  `AgentRegistryService` directly.
- `/api/sourcing/extension/products` returns paginated `MasterProduct`
  rows scoped to the caller's organization and platform filter.
- `GET /api/sourcing/:id` returns a single sourcing-scope `MasterProduct`
  (with images) gated by `pipelineStep IS NOT NULL` and
  `findFirst({ id, organizationId })`. 404 on miss; never expose
  cross-organization rows.
- `POST /api/sourcing/:id/generate` enqueues a detail-page generation Agent
  OS task via `runByType('content', …)` with body shape
  `{ mode: 'draft'|'image'|'full', templateId, seed_hook_text?,
  seed_hook_title_sub?, seed_hero_image? }`. `templateId` defaults to
  `bold-vertical`. Distinct from `/api/ai/detail-page/generate` (sync inline
  Gemini for kids-playful / simple-vertical templates).
- `/api/purchase-orders` action body (`create | updateStatus | delete`)
  preserves the legacy single-endpoint POST shape. Status transitions follow
  `draft → pending → ordered → shipped → received` exactly; deletion is
  allowed only from `draft` or `pending`.
- `/api/suppliers` CRUD reads/writes are tenant-scoped via
  `findFirst({ id, organizationId })` before any update/delete.

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
  `findFirst({ where: { id, organizationId } })`.
- `supplier-payments` 의 import 또는 회로 추가 — finance owner domain 소관.
- `application/service/**` 에서 `MastersService` (또는 다른 owner domain 의
  service) 를 직접 import — cross-domain 침범. 새 master 생성은
  `SOURCING_PRODUCTS_CATALOG_PORT` 를 통해서만, 그 외 cross-domain dependency
  도 동일하게 새 port 를 도입한다.
- `master_products` 에 직접 raw INSERT (`prisma.masterProduct.create`) 추가 —
  code 발급은 `MastersService` 만 책임진다. update 만 inline 허용.
- `apps/server/src/{suppliers,procurement}` 폴더 부활 — capability 는
  sourcing 안의 `adapter/in/http/<capability>.controller.ts` +
  `application/service/<capability>.service.ts` 로만 존재한다.

## Verification gates (PR 별 필수)

```
git diff --check
npm exec --workspace=apps/server -- vitest run src/sourcing
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```
