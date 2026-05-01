# products — Master/Option/Bundle Domain

## 3-layer 책임 분리

- **MasterProduct** (family, 기획상품) — 운영/광고/전략 단위. `code = MasterCodeCounter('master_product')` 기반 `M-00000001` 형식.
- **ProductOption** (물리 SKU, 바코드 단위) — 재고/매입/창고 단위. `sku = {master.code}-{optionCounter.padStart(2)}`.
- **BundleComponent** — 세트 구성 관계 (cross-master 허용, cross-organization 금지, Plan B1 에선 nested bundle 금지).

## Topology (Phase 3B contract-aligned)

`apps/server/AGENTS.md` Backend Architecture Contract 의 target shape 으로
수렴된 상태. transitional `services/`, `persistence`, `read-models`,
`mappers` labels 는 더 이상 사용하지 않는다.

```
products/
├── products.module.ts
├── categories/                            ← products-owned compatibility capability (`/api/categories`)
│   ├── categories.module.ts
│   ├── categories.controller.ts
│   ├── categories.service.ts
│   └── dto/
├── adapter/
│   ├── in/http/                          ← controllers (HTTP DTO binding only)
│   └── out/prisma/                       ← Prisma persistence + raw SQL + queries
│       ├── master-code.service.ts        (Prisma MasterCodeCounter upsert)
│       ├── master-product.query.ts       (MASTER_WITH_IMAGES, find/list)
│       ├── product-option.query.ts       (cursor-paginated tenant reads)
│       ├── product-option.persistence.ts (counter+sku, applyOptionPatch, soft-delete)
│       ├── bundle-component.query.ts     (forward/reverse listing)
│       ├── bundle-component.persistence.ts (CRUD scoped writes; re-exports lock)
│       └── bundle-stock.persistence.ts   (canonical SELECT ... FOR UPDATE row lock)
├── application/service/                  ← orchestration only (transaction owners)
│   ├── masters.service.ts
│   ├── options.service.ts
│   ├── bundle-components.service.ts
│   ├── bundle-stock.service.ts           (sole `availableStock` writer)
│   └── product-catalog.service.ts
├── domain/                               ← pure rules / pure services (no Prisma, no Nest)
│   ├── policy/                           ← throws-on-violation rules
│   │   ├── bundle-component-rules.ts     (3-way invariant, nested-bundle ban)
│   │   ├── product-option-mutation-rules.ts (system fields, isBundle flip, temp reason)
│   │   └── public-image-url.ts           (SSRF guard)
│   └── service/                          ← pure computations
│       ├── bundle-stock-capacity.ts      (min(floor(stock/qty)))
│       ├── master-image-normalizer.ts    (write-side normalize + primary index)
│       ├── product-image-normalizer.ts   (read-path lenience)
│       └── product-option-sku.ts         (`{masterCode}-NN` formatter)
├── mapper/                               ← Prisma row ↔ shared contract
│   ├── master-product.mapper.ts
│   └── product-catalog.mapper.ts
├── dto/                                  ← class-validator HTTP DTOs (unchanged)
└── util/                                 ← module-internal helpers (cursor, serialize, prisma-error)
```

`__tests__/` 는 source 와 sibling 위치를 유지한다. Top-level `products/__tests__/` 는 multi-module integration / DI 테스트, `application/service/__tests__/` 는 service-internal 단위 테스트.

`categories/` 는 products/catalog owner domain 하위 compatibility capability 다. public route 는 기존과 같이 `@Controller('categories')` → `/api/categories` 를 유지한다. 이 capability 는 현재 flat legacy CRUD 형태를 유지하며, 제품 카탈로그 재구성 계획 없이 route path / DTO shape / response shape / tenant behavior 를 바꾸지 않는다.

## 핵심 규칙

- **code 생성**: `MasterCodeService.generate(tx)` — `MasterCodeCounter` upsert increment. `adapter/out/prisma/master-code.service.ts` 에 위치하며 raw SQL/standalone sequence 를 사용하지 않는다.
- **sku 생성**: `OptionsService.create` 의 `$transaction` 안에서 `incrementMasterOptionCounter` (`masterProduct.updateMany + findFirst` 2-step). WHERE 에 `isDeleted:false` 포함 (TOCTOU 차단). 모든 raw write 는 `adapter/out/prisma/product-option.persistence.ts` 가 보유.
- **availableStock materialize**: `BundleStockService.recompute` **만** write. `OptionsService.update` 는 payload 에서 명시적 strip (`stripProductOptionSystemFields` in `domain/policy/product-option-mutation-rules.ts`).
- **BundleComponent.organizationId**: auth organizationId 아닌 `bundleOption.organizationId` 에서 파생 (3-way invariant — `domain/policy/bundle-component-rules.ts`).
- **Bundle recompute**: component CRUD 시 inline `$transaction` + `SELECT ... FOR UPDATE` row-level lock. row-lock SQL 의 canonical owner 는 `adapter/out/prisma/bundle-stock.persistence.ts`. Option soft-delete 시에도 파생 recompute.
- **Soft-delete**: Master / Option 만. cascade 없음. Restore 도 cascade 없음.
- **Hard delete**: BundleComponent 만.

## Controller / Service 관행

- Controller (`adapter/in/http/`) 는 `@UseGuards` / `@UsePipes` **사용 금지**. 전역 `OrganizationScopeGuard` (APP_GUARD) + 전역 `ValidationPipe` 에 의존.
- Controller 는 `@CurrentOrganization()` 로 organizationId 주입.
- Categories compatibility controller 도 `@CurrentOrganization()` 로 받은 organizationId 만 service 에 전달한다. DTO 에 `organizationId` 를 추가하거나 client-provided organizationId 를 신뢰하지 않는다.
- Application service (`application/service/`) 는 raw Prisma row 반환. Controller 가 `toSerializable()` + Zod parse.
- Domain 코드 (`domain/policy`, `domain/service`) 는 Prisma / Nest 의존 금지. 위반 시 reconstruction contract 위반.

## Transaction composition

모든 mutating application service 는 optional `tx?: Prisma.TransactionClient` 마지막 파라미터. Plan B2 의 outer transaction (sourcing, supplier sync) 와 compose 가능. Persistence helper 는 caller 의 `tx` 만 받고, 자체 `$transaction` 을 열지 않는다.

## 외부 서비스 접근

- Export: `MastersService`, `OptionsService`, `BundleComponentsService`, `ProductCatalogService` (`application/service/`에서 import).
- **Non-export**: `MasterCodeService` (`adapter/out/prisma/`). 외부 모듈은 직접 호출 금지.
- **Export (restricted)**: `BundleStockService` — InventoryService 가 `recomputeForComponent` 호출 전용 (single-writer invariant). 다른 모듈은 직접 호출 금지.

## Organization Scope

- Products 는 DB RLS 에 의존하지 않는다. App-level `where.organizationId` 가 IDOR 방어의 source of truth 다.
- Chatbot/agent 는 products 테이블에 직접 DB 접속하지 않는다. 필요한 데이터는 products application service/query adapter 를 거친 organization-scoped context 로 제공한다.
