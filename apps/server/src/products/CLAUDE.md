# products — Master/Option/Bundle Domain

## 3-layer 책임 분리 (ADR-0013)

- **MasterProduct** (family, 기획상품) — 운영/광고/전략 단위. `code = 'M-' + nextval('master_code_seq').padStart(8)`.
- **ProductOption** (물리 SKU, 바코드 단위) — 재고/매입/창고 단위. `sku = {master.code}-{optionCounter.padStart(2)}`.
- **BundleComponent** — 세트 구성 관계 (cross-master 허용, cross-company 금지, Plan B1 에선 nested bundle 금지).

## 핵심 규칙

- **code 생성**: `MasterCodeService.generate()` — `nextval('master_code_seq')`. race-free + gap-tolerant.
- **sku 생성**: `OptionsService.create` 의 `$transaction` 안에서 `masterProduct.updateMany + findUniqueOrThrow` 2-step. WHERE 에 `isDeleted:false` 포함 (TOCTOU 차단).
- **availableStock materialize**: `BundleStockService.recompute` **만** write. `OptionsService.update` 는 payload 에서 명시적 strip.
- **BundleComponent.companyId**: auth companyId 아닌 `bundleOption.companyId` 에서 파생 (3-way invariant).
- **Bundle recompute**: component CRUD 시 inline `$transaction` + `SELECT ... FOR UPDATE` row-level lock. Option soft-delete 시에도 파생 recompute.
- **Soft-delete**: Master / Option 만. cascade 없음. Restore 도 cascade 없음.
- **Hard delete**: BundleComponent 만.

## Controller / Service 관행

- Controller 는 `@UseGuards` / `@UsePipes` **사용 금지**. 전역 `CompanyScopeGuard` (APP_GUARD) + 전역 `ValidationPipe` 에 의존.
- Controller 는 `@CurrentCompany()` 로 companyId 주입.
- Service 는 raw Prisma row 반환. Controller 가 `toSerializable()` + Zod parse.

## Transaction composition

모든 mutating method 는 optional `tx?: Prisma.TransactionClient` 마지막 파라미터. Plan B2 의 outer transaction (sourcing, supplier sync) 와 compose 가능.

## 외부 서비스 접근

- Export: `MastersService`, `OptionsService`, `BundleComponentsService`.
- **Non-export**: `MasterCodeService`, `BundleStockService`.

## RLS

- `chatbot_readonly` — session `SET app.company_id` 필수. 7 RLS policies (Plan A Task 11).
- NestJS (`kiditem`) — table owner → RLS 우회. App-level `where.companyId` 필수.
