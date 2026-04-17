# Plan B1 Design — Products Module (Master + Option + Bundle)

- Date: 2026-04-17
- Status: Draft v2 (critic + architect + plan-eng-review 반영)
- Related ADR: [ADR-0013 — Product schema 3-layer redesign](../../../.claude/docs/decisions/0013-product-schema-3layer.md)
- Related Plan A: [2026-04-17-plan-a-schema-transition.md](../plans/2026-04-17-plan-a-schema-transition.md) (merged PR #25)
- Successor Plans: Plan B2 (advertising/orders/inventory services) → Plan B3 (dashboard/finance/supply/AI/tests)

## 1. Context

Plan A 가 Prisma 스키마를 3-레이어 (MasterProduct family / ProductOption SKU / ChannelListing / ChannelListingOption / BundleComponent / Inventory) 로 교체했고 기존 `products/`, `bundle-products/`, `product-memos/`, `option-masters/` NestJS module 은 삭제됐다. `apps/server/` 에 424 개 TypeScript 컴파일 에러, `npm run dev:server` 부팅 불가 상태.

Plan B1 은 **products 도메인의 foundational layer (Master + Option + Bundle)** 만 재구축하여 Plan B2 / B3 의 순차 진행 기반을 제공한다.

### Scope decisions

| 항목 | 결정 |
|---|---|
| Layer coverage | **β**: Master + Option + BundleComponent (ChannelListing 은 Plan B2) |
| Boot strategy | **C**: `app.module.ts` 에 정상 등록, `dev:server` 부팅은 Plan B3 까지 불가. 검증은 (a) vitest integration tests (real-prisma) + (b) NestJS `Test.createTestingModule` 로 DI wiring verification |
| Naming | **v2 suffix 없음** — `apps/server/src/products/`, `/api/products/*` (ADR-0013 non-coexistence) |
| API shape | **RESTful resource-per-layer** + `/api/products/` prefix |
| Module 구조 | **Approach 1** — `orders/`, `advertising/` 관행 일치 |
| `@kiditem/shared` | **(i) 최소** — `product.ts` + `inventory.ts` 재작성 (+ `src/index.ts`, `src/schemas/index.ts` 두 재-export 파일 동기화) |

### Out of scope

| 항목 | Plan |
|---|---|
| ChannelListing / ChannelListingOption CRUD + vendorItemId 매처 | B2 |
| Inventory / StockTransaction / PickingItem / ReturnTransfer service rewrite | B2 |
| Ad / AdSnapshot / AdAction / TrafficStats service rewrite | B2 |
| Order / Shipment / UnshippedItem / Review / CSRecord service rewrite | B2 |
| MasterSupplierProduct / SupplierProduct / PurchaseOrderItem service | B2 |
| Dashboard / ProfitLoss / GradeHistory / ProcessingCost rewrite | B3 |
| AI — Thumbnail* / ContentGeneration service | B3 |
| ~30 direct-import files (server ~7, web ~23) compile error 해결 | B2/B3 자연스럽게 |
| Frontend pages | Plan D |
| Wing 이관, init.sql.gz 재생성 | Plan C |

## 2. Architecture

### 2.1 File structure

```
apps/server/src/products/
├── CLAUDE.md
├── products.module.ts
├── controllers/
│   ├── masters.controller.ts
│   ├── options.controller.ts
│   └── bundle-components.controller.ts
├── services/
│   ├── masters.service.ts
│   ├── options.service.ts
│   ├── bundle-components.service.ts
│   ├── master-code.service.ts
│   └── bundle-stock.service.ts
├── util/
│   └── prisma-error.ts                  # mapPrismaError() — P2002/P2003/P2025 → HTTP exception
├── dto/
│   ├── create-master.dto.ts
│   ├── update-master.dto.ts
│   ├── list-masters.query.ts
│   ├── create-option.dto.ts
│   ├── update-option.dto.ts
│   ├── list-options.query.ts
│   ├── create-bundle-component.dto.ts
│   ├── update-bundle-component.dto.ts
│   └── list-bundle-components.query.ts
└── __tests__/
    ├── master-code.service.spec.ts              # unit
    ├── bundle-stock.service.spec.ts             # unit
    ├── masters.service.pg.integration.spec.ts
    ├── options.service.pg.integration.spec.ts
    ├── bundle-components.service.pg.integration.spec.ts
    └── products.module.di.spec.ts               # Test.createTestingModule DI wiring
```

**테스트 파일 네이밍 주의**: `apps/server/vitest.config.integration.ts` 의 include glob 은 `'src/**/*.pg.integration.spec.ts'` + `'src/**/__tests__/*.pg.integration.spec.ts'`. 반드시 `.pg.integration.spec.ts` suffix + `__tests__/` 위치.

### 2.2 Module registration

`products.module.ts`:
```typescript
@Module({
  controllers: [MastersController, OptionsController, BundleComponentsController],
  providers: [
    MastersService, OptionsService, BundleComponentsService,
    MasterCodeService, BundleStockService,
  ],
  exports: [MastersService, OptionsService, BundleComponentsService],
})
export class ProductsModule {}
```

**`imports` 배열 없음** — `PrismaModule` + `AuthModule` 은 이미 `@Global()` 이므로 재 import 금지. `categories/`, `orders/` 관행 일치.

`app.module.ts` 에 `ProductsModule` 추가. 알파벳 순 위치 유지.

### 2.3 Data flow 시퀀스

#### (A) Master 생성

```
Client → MastersController.create(companyId, dto)
       → MastersService.create(companyId, dto)
         → MasterCodeService.generate() → SELECT nextval('master_code_seq') → "M-00000042"
         → prisma.masterProduct.create({ data: { companyId, code, ...dto } })
       → Serialize via MasterSchema (Zod)
       → Response
```

#### (B) Option 생성 — race-free sku (※ P0 #1 fix)

```
OptionsService.create(companyId, dto, outerTx?):
  tx = outerTx ?? prisma.$transaction(...)
  1. { count } = tx.masterProduct.updateMany({
       where: { id: dto.masterId, companyId, isDeleted: false },
       data: { optionCounter: { increment: 1 } },
     })
  2. if (count === 0) throw NotFoundException('master not found or deleted')
  3. master = tx.masterProduct.findUniqueOrThrow({
       where: { id: dto.masterId },
       select: { code: true, optionCounter: true },
     })
  4. sku = `${master.code}-${String(master.optionCounter).padStart(2, '0')}`
  5. tx.productOption.create({ data: { ...dto, companyId, sku, availableStock: null } })
```

**Rationale** — `MasterProduct` 에 `@@unique([id, companyId])` 없으므로 `update({where:{id, companyId}})` 불가. `updateMany` + `count` check 로 cross-tenant 차단 + soft-delete TOCTOU 방지 (WHERE `isDeleted:false`). `updateMany` 는 Postgres row-level lock 획득 → 같은 master 의 옵션 생성이 concurrent 이어도 직렬화.

#### (C) BundleComponent 생성 — 모든 mutation 은 단일 $transaction

```
BundleComponentsService.create(companyId, dto, outerTx?):
  1. Validate (both options must exist + isBundle rules + cross-company)
     bundleOption  = findUniqueOrThrow(dto.bundleOptionId)
     componentOption = findUniqueOrThrow(dto.componentOptionId)
     - !bundleOption.isBundle          → 400 "option is not a bundle"
     - componentOption.isBundle        → 400 "nested bundle not supported in Plan B1"
     - bundleOption.companyId !== companyId
                                        → 403 "cross-company not allowed"
     - componentOption.companyId !== bundleOption.companyId
                                        → 403 "cross-company not allowed"
     - bundleOptionId === componentOptionId
                                        → 409 "self reference"
  2. tx = outerTx ?? prisma.$transaction(...)
     2a. tx.productOption.findUniqueOrThrow({
            where: { id: bundleOptionId }, select: { id: true }
         })
         — row 확보 후 SELECT ... FOR UPDATE 로 lock (Prisma: `{ lock: 'update' }`
           미지원 → `$queryRaw` 로 SELECT ... FOR UPDATE 실행)
     2b. tx.bundleComponent.create({
            data: { bundleOptionId, componentOptionId, qty,
                    companyId: bundleOption.companyId }    // NOTE: FROM bundleOption, NOT auth
         })                                                // 3-way invariant 보장
     2c. bundleStockService.recompute(bundleOptionId, tx)
```

**3-way invariant** — `BundleComponent.companyId = bundleOption.companyId` (auth 의 companyId 대신). 서비스 계층 강제. DB CHECK 는 Plan B3 hardening.

#### (D) Option soft-delete 시 bundle recompute 파생

```
OptionsService.softDelete(companyId, id, outerTx?):
  tx = outerTx ?? prisma.$transaction(...)
  1. Option row update → isDeleted=true, deletedAt=now
  2. affectedBundleIds = tx.bundleComponent.findMany({
        where: { componentOptionId: id },
        select: { bundleOptionId: true }
     }).map(r => r.bundleOptionId)
  3. for each bundleId: bundleStockService.recompute(bundleId, tx)
```

Bundle option 의 component 로 쓰이는 option 이 soft-delete 되면 해당 bundle 의 `availableStock` 재계산 (capacity → 0, soft-deleted component 는 capacity 0 취급).

## 3. API endpoints

모든 endpoint 는 `AuthGuard` + `@CurrentCompany()` decorator 사용 (ADR-0006).

### 3.1 Canonical Controller skeleton

```typescript
@Controller('products/masters')
@UseGuards(AuthGuard('jwt'))                       // existing auth pattern
export class MastersController {
  constructor(private readonly service: MastersService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateMasterDto,
  ): Promise<Master> {                             // Zod-inferred type
    const row = await this.service.create(companyId, dto);
    return MasterSchema.parse(toSerializable(row)); // Decimal/Date serialization via shared helper
  }

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListMastersQuery,
  ): Promise<{ items: Master[]; nextCursor: string | null }> { ... }

  @Get(':id')
  async getById(...): Promise<MasterWithOptions> { ... }     // relation-loaded

  @Patch(':id')
  async update(...): Promise<Master> { ... }

  @Delete(':id')
  async softDelete(...): Promise<{ ok: true }> { ... }

  @Post(':id/restore')
  async restore(...): Promise<{ ok: true }> { ... }

  @Get('by-code/:code')
  async findByCode(...): Promise<Master> { ... }             // cross-tenant check

  @Get('by-legacy/:legacyCode')
  async findByLegacy(...): Promise<Master> { ... }
}
```

**Services 는 raw Prisma row 반환** → **Controllers 가 Zod 로 serialize**. `toSerializable()` 은 `packages/shared/src/json.ts` 에 공유 헬퍼 (Decimal → number, Date → ISO string, JSON 필드 cast).

**List endpoints 는 bare schema 반환** — relation 포함 없음. `GET /:id` detail 만 `*WithOptions` / `*WithComponents`.

### 3.2 Masters (`/api/products/masters`)

| Method | Path | Return shape |
|---|---|---|
| POST | `/` | `Master` |
| GET | `/` | `{ items: Master[], nextCursor }` |
| GET | `/:id` | `MasterWithOptions` |
| PATCH | `/:id` | `Master` |
| DELETE | `/:id` | `{ ok: true }` |
| POST | `/:id/restore` | `{ ok: true }` |
| GET | `/by-code/:code` | `Master` (404 if different company) |
| GET | `/by-legacy/:legacyCode` | `Master` |

**Filter query** (`ListMastersQuery`):
`isDeleted?`, `isTemporary?`, `category?`, `brand?`, `abcGrade?`, `pipelineStep?`, `search?` (name+legacyCode+code LIKE), `limit?`, `cursor?`

### 3.3 Options (`/api/products/options`)

| Method | Path | Return shape |
|---|---|---|
| POST | `/` | `ProductOption` |
| GET | `/` | `{ items: ProductOption[], nextCursor }` |
| GET | `/:id` | `OptionWithComponents` |
| PATCH | `/:id` | `ProductOption` |
| DELETE | `/:id` | `{ ok: true }` |
| POST | `/:id/restore` | `{ ok: true }` |
| GET | `/by-sku/:sku` | `ProductOption` (global unique, **service 가 companyId check** → 404 on mismatch) |
| GET | `/by-barcode/:barcode` | `ProductOption` |
| GET | `/:id/components` | `BundleComponent[]` |

### 3.4 BundleComponents (`/api/products/bundle-components`)

| Method | Path | Return shape |
|---|---|---|
| POST | `/` | `BundleComponent` |
| GET | `/` | `BundleComponent[]` (filter: `bundleOptionId` 또는 `componentOptionId`) |
| PATCH | `/:id` | `BundleComponent` (qty only) |
| DELETE | `/:id` | `{ ok: true }` (hard delete) |

## 4. DTOs & Validation

**Convention**: 입력 DTO 는 class-validator (ADR-0002), 응답 shape 은 Zod (`@kiditem/shared`).

### 4.1 Create/Update rules

#### CreateMasterDto
```typescript
@IsString() @IsNotEmpty() @MaxLength(300)  name;
@IsOptional() @IsString() @MaxLength(100)  legacyCode?;
@IsOptional() @IsString()  description?;                                    // default ""
@IsOptional() @IsString()  category?, brand?, profitTag?, adTier?, pipelineStep?;
@IsOptional() @IsArray() @IsString({each:true})  tags?;
@IsOptional() @IsUUID()  supplierId?;
@IsOptional() @IsUrl()  sourceUrl?, thumbnailUrl?, imageUrl?, detailPageUrl?;
@IsOptional() @IsString()  sourcePlatform?;
@IsOptional() @IsNumber() @Min(0) @Max(99999999.99)  costCny?;
@IsOptional() @IsNumber() @Min(0) @Max(1)  marginRate?;
@IsOptional() @IsArray() @IsUrl({}, {each:true})  images?;
@IsOptional() @IsIn(['A','B','C'])  abcGrade?;
@IsOptional() @IsInt() @Min(0) @Max(100)  healthScore?;
@IsOptional() @IsInt() @Min(0)  adBudgetLimit?;
@IsOptional() @IsIn(['standard','premium','custom'])  thumbnailStrategy?;    // default 'standard'
@IsOptional() @IsBoolean()  isTemporary?;                                    // default false
@ValidateIf(o => o.isTemporary === true) @IsString() @IsNotEmpty()  temporaryReason?;
@IsOptional() @IsString()  memo?;
```

**CreateMasterDto 제외 필드** (시스템 관리 — PATCH 으로도 변경 금지):
`id`, `code`, `companyId`, `optionCounter`, `isDeleted`, `deletedAt`, `healthUpdatedAt`, `rawData`, `processedData`, `draftContent`, `createdAt`, `updatedAt`.

**`healthScore` ↔ `healthUpdatedAt` coupling**: service 가 `healthScore` 변경 시 `healthUpdatedAt = now()` 자동 설정.

**`isTemporary: true → false` 전환**: `temporaryReason` 를 `null` 로 reset (inconsistent state 방지).

**`supplierId` FK cross-tenant validation**: `supplierId` 가 제공되면 service 가 `supplier.companyId === companyId` 검증. Mismatch 시 403.

#### UpdateMasterDto
- `PartialType(CreateMasterDto)` + service 가 제외 필드 (위 목록 + `isDeleted`, `deletedAt`) 를 payload 에서 strip.
- 상태 전환은 `DELETE /:id` + `POST /:id/restore` 로 **only**. PATCH 은 소프트 삭제 플래그 건드리지 않음.

#### CreateOptionDto
```typescript
@IsUUID()  masterId;
@IsOptional() @IsString() @MaxLength(200)  optionName?;                      // null 허용
@IsOptional() @Matches(/^\d{13}$/)  barcode?;                                // EAN13
@IsOptional() @IsString() @MaxLength(100)  legacyCode?;
@IsOptional() @IsInt() @Min(0)  sortOrder?;                                  // default 0
@IsOptional() @IsInt() @Min(0)  costPrice?, sellPrice?, shippingCost?;
@IsOptional() @IsNumber() @Min(0) @Max(1)  commissionRate?;
@IsOptional() @IsInt() @Min(0)  otherCost?;
@IsOptional() @IsBoolean()  isBundle?;                                       // default false
@IsOptional() @IsBoolean()  isTemporary?, isActive?;
@ValidateIf(o => o.isTemporary === true) @IsString() @IsNotEmpty()  temporaryReason?;
```

**CreateOptionDto 제외 필드**: `id`, `sku`, `companyId`, `availableStock`, `isDeleted`, `deletedAt`, `createdAt`, `updatedAt`.

**Service 추가 검증**:
- `masterId` master 가 `companyId` 소유 + `isDeleted=false` → updateMany 의 WHERE 에 포함 (§2.3 B)
- `availableStock` 은 service 만 set (DTO 도 미노출, UpdateOption 에서도 strip 강제)

#### UpdateOptionDto
- `PartialType(CreateOptionDto)` + service 가 제외 필드 strip
- **`isBundle` flip rules**:
  - `isBundle: false → true` 시 `BundleComponent` 가 `componentOptionId=this.id` 로 존재하면 → 409 "option used as component"
  - `isBundle: true → false` 시 `BundleComponent` 가 `bundleOptionId=this.id` 로 존재하면 → 409 "bundle has components"

#### CreateBundleComponentDto
```typescript
@IsUUID()  bundleOptionId;
@IsUUID()  componentOptionId;
@IsInt() @Min(1)  qty;
```

#### UpdateBundleComponentDto
```typescript
@IsInt() @Min(1)  qty;                                                        // qty only
```

### 4.2 List query DTOs

공통:
```typescript
@IsOptional() @IsInt() @Min(1) @Max(200)  limit?;                            // default 50
@IsOptional() @IsString()  cursor?;                                          // opaque, implementation-defined
@IsOptional() @IsBoolean()  includeDeleted?;                                 // default false
```

**Sort order (고정)**:
- Masters / Options: `(createdAt DESC, id DESC)` — id 는 timestamp 동일 ms 충돌 tiebreaker
- BundleComponents: `(createdAt ASC, id ASC)` — 생성 순서 유지

**Cursor 의미**: `{ createdAt: ISO, id: UUID }` 의 base64url 인코딩 문자열. Service 가 decode 후 `where: { OR: [{ createdAt: { lt: ... } }, { createdAt: ..., id: { lt: ... } }] }` 로 조회.

**Cross-tenant 차단**: 모든 query 가 `where.companyId = auth.companyId` 을 first-level 로 포함.

## 5. Core business logic

### 5.1 MasterCodeService

```typescript
@Injectable()
export class MasterCodeService {
  static readonly MAX_VALUE = 99999999;  // 8-digit ceiling

  constructor(private readonly prisma: PrismaService) {}

  async generate(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('master_code_seq') AS nextval
    `;
    const n = Number(rows[0].nextval);
    if (n > MasterCodeService.MAX_VALUE) {
      throw new InternalServerErrorException(
        `master_code_seq overflow: ${n} > ${MasterCodeService.MAX_VALUE}`
      );
    }
    return `M-${String(n).padStart(8, '0')}`;
  }
}
```

- Postgres sequence 직접 호출 — race-free + gap-tolerant (transaction rollback 시 gap 허용; uniqueness 만 보장).
- Overflow guard — 8-digit 포맷이 정적이므로 9999 9999 넘으면 InternalServerError 발생. Plan B3 이후 포맷 확장 시 완화.

### 5.2 Option sku 생성 — see §2.3 (B)

재현:
```typescript
async create(companyId: string, dto: CreateOptionDto, outerTx?: Prisma.TransactionClient) {
  const exec = async (tx: Prisma.TransactionClient) => {
    const { count } = await tx.masterProduct.updateMany({
      where: { id: dto.masterId, companyId, isDeleted: false },
      data: { optionCounter: { increment: 1 } },
    });
    if (count === 0) throw new NotFoundException('master not found or deleted');

    const master = await tx.masterProduct.findUniqueOrThrow({
      where: { id: dto.masterId },
      select: { code: true, optionCounter: true },
    });
    const sku = `${master.code}-${String(master.optionCounter).padStart(2, '0')}`;

    return tx.productOption.create({
      data: { ...dto, companyId, sku, availableStock: null },
    });
  };
  return outerTx ? exec(outerTx) : this.prisma.$transaction(exec);
}
```

**Gap 정책**: `optionCounter` increment 후 option insert 가 실패 (예: partial unique violation) 해도 counter 는 rollback **되지 않을 수도 있다** (트랜잭션 범위에 따라). Plan B1 은 **sku gap 허용** 을 명시적 계약으로 선언. integration test 가 `insertion failure → gap` 을 asserting.

**Counter 시작값**: `0` (schema default). 첫 increment → `1` → sku suffix `-01`. Reset 없음.

**Counter overflow** (100+): `String(100).padStart(2, '0') = "100"` → sku `M-00000042-100`. Still unique, lexicographic ordering 만 깨짐. 실무 master 당 옵션 30 미만이 일반적.

### 5.3 BundleStockService

```typescript
@Injectable()
export class BundleStockService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(bundleOptionId: string, outerTx?: Prisma.TransactionClient): Promise<number> {
    const db = outerTx ?? this.prisma;

    // Row-level lock on the bundle ProductOption
    await db.$queryRaw`SELECT id FROM product_options WHERE id = ${bundleOptionId}::uuid FOR UPDATE`;

    // Active components only (exclude soft-deleted components)
    const components = await db.bundleComponent.findMany({
      where: {
        bundleOptionId,
        componentOption: { isDeleted: false },            // ADDED (critic M7 + architect P1)
      },
      include: { componentOption: { include: { inventory: true } } },
    });

    if (components.length === 0) {
      await db.productOption.update({
        where: { id: bundleOptionId },
        data: { availableStock: 0 },
      });
      return 0;
    }

    const capacity = Math.min(
      ...components.map(c => {
        // Component 는 isBundle=false (DTO 검증 강제). inventory 없으면 capacity=0.
        const stock = c.componentOption.inventory?.currentStock ?? 0;
        return Math.floor(stock / c.qty);
      })
    );

    await db.productOption.update({
      where: { id: bundleOptionId },
      data: { availableStock: capacity },
    });
    return capacity;
  }
}
```

**Invariants**:
- `availableStock` 은 **service boundary** 로 보호 — 오직 `BundleStockService.recompute` 만 쓰기. `OptionsService.update` 는 DTO 에서 필드 제거 + payload 에서 명시적 strip.
- **Non-bundle option 의 `availableStock = null`** (derived on-the-fly from inventory in Plan B2 — not materialized).
- **Bundle option 의 `availableStock`**: 실제 materialize 값. B1 merge 후 B2 hook 도입 전까지 inventory 변경 반영 안 됨 (§13 Risk).
- **Soft-deleted component** 는 capacity 0 취급 (exclude from min). 물리 component 가 없으면 bundle 판매 불가.
- **Row-level lock** (`SELECT ... FOR UPDATE`) → concurrent recompute 의 last-write-wins race 차단. BundleComponent CRUD 가 같은 tx 안에서 lock 획득 → recompute.

**Gap state (B1 merge ~ B2 merge)**: `availableStock` 은 component CRUD 로만 갱신. Inventory.currentStock 이 외부에서 바뀌면 bundle 값이 stale. B1 은 서버 부팅 불가 (Boot C) 상태라 production exposure 없음. B2 의 `StockTransaction` / `StockTransfer` / `PickingItem` 서비스에 **BundleRecompute hook** 추가가 필수. 이를 Plan B2 task 로 명시.

### 5.4 Bundle cycle detection — N/A in Plan B1

Nested bundle 금지 (§4.1 `componentOption.isBundle=false` 강제). 단일 edge cycle 은 `bundleOptionId !== componentOptionId` 로 차단. BFS 불필요.

### 5.5 Soft-delete / restore semantics

**Soft-delete 대상**: Master, Option only. BundleComponent 는 hard delete.

**On Master soft-delete**:
- Master row 만 update (isDeleted, deletedAt). **Cascade 하지 않음** — 하위 options 는 독립적으로 남음.
- 이후 `OptionsService.create({ masterId: <soft-deleted> })` 는 `updateMany` 의 `isDeleted:false` WHERE 로 차단 (§5.2).
- Soft-deleted master 의 기존 options 는 그대로 조회/수정 가능 (역시 soft-delete 단위).

**On Option soft-delete** (§2.3 D):
- Option row update + option 이 component 로 쓰이는 모든 bundle recompute.
- ChannelListingOption (FK `onDelete:SetNull`, Plan A) 는 **B1 에선 건드리지 않음**. Plan B2 에서 cascade 여부 결정.

**Restore**:
- `POST /:id/restore` — isDeleted=false, deletedAt=null.
- **Cascade 없음**. Soft-deleted Master 를 restore 해도 하위 soft-deleted options 는 수동 restore 필요.
- **Duplicate legacyCode on restore**: 같은 company 가 같은 legacyCode 로 새 master 를 이미 만들어 둔 경우, restore 시 `@@unique([companyId, legacyCode])` violation → 409 "legacy code already in use". 호출자가 새 master 를 삭제하거나 legacyCode 를 바꿔야 restore 가능.
- **Stale supplierId**: master restore 시 supplier 가 삭제됐으면 service 가 검증 후 400 (또는 `supplierId=null` 자동 설정 — TBD, B1 기본은 400 reject).

**DELETE / restore response**: `{ ok: true }` (convention).

## 6. Error handling

### 6.1 Error mapping table

| Error / Prisma code | HTTP | Exception |
|---|---|---|
| class-validator 실패 | 400 | `BadRequestException` (global pipe) |
| Resource not found / `P2025` | 404 | `NotFoundException` |
| Cross-tenant master/supplier FK | 403 | `ForbiddenException` |
| Cross-company bundle component | 403 | `ForbiddenException` |
| Option creation on soft-deleted master | 404 | `NotFoundException` (updateMany count=0) |
| Duplicate legacyCode / barcode / `P2002` | 409 | `ConflictException` |
| BundleComponent duplicate / `P2002` on `(bundleOptionId, componentOptionId)` | 409 | `ConflictException` |
| Bundle self-reference | 409 | `ConflictException` |
| Nested bundle (component.isBundle=true) | 400 | `BadRequestException` |
| isBundle flip with existing references | 409 | `ConflictException` |
| FK violation / `P2003` | 400 | `BadRequestException` (`"related resource not found"`) |
| MasterCodeService overflow | 500 | `InternalServerErrorException` |

### 6.2 `mapPrismaError` helper

`apps/server/src/products/util/prisma-error.ts`:

```typescript
export function mapPrismaError(e: unknown, context: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      const target = (e.meta?.target as string[])?.join(', ') ?? 'unknown';
      throw new ConflictException(`${context}: duplicate ${target}`);
    }
    if (e.code === 'P2003') {
      throw new BadRequestException(`${context}: related resource not found`);
    }
    if (e.code === 'P2025') {
      throw new NotFoundException(`${context}: record not found`);
    }
  }
  throw e;
}
```

Service 의 catch 블록에서 `catch (e) { mapPrismaError(e, 'master create') }` 패턴. `GlobalExceptionFilter` (기존 존재) 가 최종 JSON 변환.

## 7. Testing strategy

### 7.1 Unit tests (vitest, mock Prisma)

| 파일 | 검증 |
|---|---|
| `master-code.service.spec.ts` | `generate()` 포맷 (1 → `M-00000001`, 42 → `M-00000042`, 99999999 → `M-99999999`) + overflow (100000000 → throw InternalServerError) |
| `bundle-stock.service.spec.ts` | `recompute()` — 모든 component 충분 / 1개 부족 / 0개 (empty → availableStock=0) / component 에 inventory 없음 (currentStock=0) / soft-deleted component 제외 |

**Masters / Options / BundleComponents service unit test 는 생략** — 순수 CRUD 로직은 integration test 로 충분 (DB 동작이 core).

### 7.2 Integration tests (vitest + real-prisma)

**Helper**: `apps/server/src/test-helpers/real-prisma.ts` 의 `makeTestPrisma`, `resetDb`, `seedBaseFixture` 재사용. Service 는 직접 instantiate (AuthGuard / pipe / controller 우회).

#### `seedBaseFixture` 확장

```typescript
// real-prisma.ts 에 추가
export async function seedProductsFixture(prisma: PrismaClient, companyId: string) {
  const master = await prisma.masterProduct.create({
    data: {
      companyId,
      code: 'M-00000001',
      name: 'Fixture Master',
      optionCounter: 0,
    },
  });
  const singleOption = await prisma.productOption.create({
    data: {
      companyId,
      masterId: master.id,
      sku: 'M-00000001-01',
      optionName: null,
      isActive: true,
    },
  });
  const bundleOption = await prisma.productOption.create({
    data: {
      companyId,
      masterId: master.id,
      sku: 'M-00000001-02',
      optionName: 'Bundle',
      isBundle: true,
      availableStock: 0,
    },
  });
  // Inventory for singleOption
  await prisma.inventory.create({
    data: { companyId, optionId: singleOption.id, currentStock: 100 },
  });
  return { master, singleOption, bundleOption };
}
```

#### Integration test 목록

| 파일 | 검증 |
|---|---|
| `masters.service.pg.integration.spec.ts` | CRUD + soft-delete + restore + code 자동 생성 + cross-tenant 차단 (A 의 master 를 B 가 조회 불가) + supplierId cross-tenant 검증 + healthScore 설정 시 healthUpdatedAt 자동 update + duplicate legacyCode restore → 409 |
| `options.service.pg.integration.spec.ts` | CRUD + sku 자동 생성 + **race test** (병렬 10 건, 충돌 없음, gap 허용 검증) + Master soft-delete 후 Option 생성 → 404 + PartialUniqueIndex (single-option null 충돌) + isBundle flip rules + Option soft-delete 시 참조 bundle recompute 파생 |
| `bundle-components.service.pg.integration.spec.ts` | CRUD + cross-company 차단 + nested bundle 차단 + self-ref 차단 + recompute after create/update/delete + concurrent recompute (Promise.all 로 2 component 동시 추가, 최종 availableStock 이 deterministic) + soft-deleted component 제외 verification |

### 7.3 DI wiring verification

`products.module.di.spec.ts` (vitest, not pg.integration — 순수 NestJS DI):

```typescript
describe('ProductsModule DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProductsModule],
    })
      .overrideProvider(PrismaService).useValue(mockPrisma())
      .overrideGuard(AuthGuard('jwt')).useValue({ canActivate: () => true })
      .compile();
    await moduleRef.init();
  });

  it('resolves all controllers + services without missing providers', () => {
    expect(moduleRef.get(MastersController)).toBeDefined();
    expect(moduleRef.get(OptionsController)).toBeDefined();
    expect(moduleRef.get(BundleComponentsController)).toBeDefined();
    expect(moduleRef.get(MastersService)).toBeDefined();
    expect(moduleRef.get(OptionsService)).toBeDefined();
    expect(moduleRef.get(BundleComponentsService)).toBeDefined();
    expect(moduleRef.get(MasterCodeService)).toBeDefined();
    expect(moduleRef.get(BundleStockService)).toBeDefined();
  });

  it('exports the three CRUD services (not internal MasterCode/BundleStock)', () => {
    // 검증: import 하는 가상 module 이 3개 서비스만 볼 수 있음
  });
});
```

이 테스트가 NestJS `Test.createTestingModule` 로 DI wiring 검증 — missing provider / wrong binding 을 서버 부팅 없이 catch. `dev:server` 부팅이 Plan B3 까지 불가한 상황의 최소 안전망.

### 7.4 RLS verification tests

**4 개 테스트 matrix** — `chatbot_readonly` 사용자용 별도 pg session 필요.

`real-prisma.ts` 에 helper 추가:
```typescript
export async function withChatbotReadonly<T>(
  companyId: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({
    connectionString: 'postgresql://chatbot_readonly:chatbot_readonly@localhost:5434/kiditem_test',
  });
  await client.connect();
  try {
    await client.query(`SET app.company_id = '${companyId}'`);
    return await fn(client);
  } finally {
    await client.end();
  }
}
```

Tests:
1. **master_products — filter set**: `SET app.company_id = companyA` → 자기 쿼리는 자기 rows 만.
2. **master_products — filter NOT set**: 0 rows.
3. **Cross-tenant guess attempt**: attacker 가 B 의 master UUID 를 직접 SELECT WHERE id = 'uuid-of-B' → `app.company_id = companyA` 하에선 0 rows.
4. **product_options + bundle_components 동일 패턴** (parameterized 로 묶어서 2 tests 로 요약 가능).

### 7.5 List endpoint pagination stability

1 integration test — paginate list, 중간에 한 item soft-delete, 다음 cursor 가 정확한 다음 페이지를 반환하는지 (createdAt DESC + id DESC tiebreaker).

### 7.6 Controller-level HTTP test

Plan B1 **범위 밖** (controller 테스트는 §7.3 DI 검증 + §7.2 service 직접 호출로 대체). Full HTTP controller + pipe + guard 검증은 **Plan B3** 에 명시적 task 로 포함 (dev:server 가 부팅 가능해진 직후).

## 8. `@kiditem/shared` rewrite

### 8.1 `packages/shared/src/schemas/product.ts` (완전 재작성)

**삭제**:
- `TrafficDataSchema`, `TrafficData`
- `ProductListItemSchema`, `ProductListItem`
- `ProductDetailSchema`, `ProductDetail`
- `PipelineCountsSchema`, `PipelineCounts`
- 기타 기존 Product / Master (old SKU) 관련 export 전부

**신설** — Master / ProductOption / BundleComponent Zod schemas + relation-loaded variants:

```typescript
// Master (family)
export const MasterSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  code: z.string(),                             // "M-00000042"
  legacyCode: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  tags: z.array(z.string()),                    // Prisma Json → string[] at response boundary
  optionCounter: z.number().int(),
  thumbnailUrl: z.string().url().nullable(),
  imageUrl: z.string().url().nullable(),
  images: z.array(z.string().url()),            // Prisma Json → string[] at response boundary
  abcGrade: z.enum(['A','B','C']).nullable(),
  profitTag: z.string().nullable(),
  adTier: z.string().nullable(),
  adBudgetLimit: z.number().int().nullable(),
  healthScore: z.number().int().nullable(),
  healthUpdatedAt: z.string().datetime().nullable(),
  sourceUrl: z.string().url().nullable(),
  sourcePlatform: z.string().nullable(),
  costCny: z.number().nullable(),               // Decimal → number
  marginRate: z.number().nullable(),
  pipelineStep: z.string().nullable(),
  detailPageUrl: z.string().url().nullable(),
  thumbnailStrategy: z.enum(['standard','premium','custom']),
  supplierId: z.string().uuid().nullable(),
  isDeleted: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
  isTemporary: z.boolean(),
  temporaryReason: z.string().nullable(),
  memo: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ProductOption (SKU)
export const ProductOptionSchema = z.object({
  id: z.string().uuid(),
  masterId: z.string().uuid(),
  companyId: z.string().uuid(),
  sku: z.string(),                              // "M-00000042-01"
  barcode: z.string().nullable(),
  legacyCode: z.string().nullable(),
  optionName: z.string().nullable(),
  sortOrder: z.number().int(),
  costPrice: z.number().int().nullable(),
  sellPrice: z.number().int().nullable(),
  commissionRate: z.number().nullable(),
  shippingCost: z.number().int().nullable(),
  otherCost: z.number().int().nullable(),
  isBundle: z.boolean(),
  availableStock: z.number().int().nullable(),
  isDeleted: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
  isTemporary: z.boolean(),
  temporaryReason: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// BundleComponent
export const BundleComponentSchema = z.object({
  id: z.string().uuid(),
  bundleOptionId: z.string().uuid(),
  componentOptionId: z.string().uuid(),
  companyId: z.string().uuid(),
  qty: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Relation-loaded
export const MasterWithOptionsSchema = MasterSchema.extend({
  options: z.array(ProductOptionSchema),
});
export const OptionWithComponentsSchema = ProductOptionSchema.extend({
  components: z.array(BundleComponentSchema),
});

export type Master = z.infer<typeof MasterSchema>;
export type ProductOption = z.infer<typeof ProductOptionSchema>;
export type BundleComponent = z.infer<typeof BundleComponentSchema>;
export type MasterWithOptions = z.infer<typeof MasterWithOptionsSchema>;
export type OptionWithComponents = z.infer<typeof OptionWithComponentsSchema>;
```

**Prisma `Json` 필드 cast 규칙**: controller serialization 헬퍼 `toSerializable()` 이 `tags`, `images` 를 `as string[]`, `rawData`/`processedData`/`draftContent` 는 응답에서 drop (`MasterSchema` 에 없음).

### 8.2 `packages/shared/src/schemas/inventory.ts` (재작성)

**삭제**: `InventoryItemSchema`, `InventoryItem`, `InventorySummarySchema`, `InventorySummary`.

**신설**:

```typescript
export const InventorySchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  companyId: z.string().uuid(),
  currentStock: z.number().int(),
  reservedStock: z.number().int(),
  safetyStock: z.number().int(),
  reorderPoint: z.number().int(),
  reorderQuantity: z.number().int(),
  leadTimeDays: z.number().int().nullable(),
  dailySalesAvg: z.number(),
  warehouseLocation: z.string().nullable(),
  lastRestockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Inventory = z.infer<typeof InventorySchema>;

// Aggregated / enriched views (InventoryItemSchema, InventorySummarySchema) 는
// Plan B2 inventory service rewrite 때 재정의. Plan B1 은 raw shape 만.
```

### 8.3 Re-export 파일 동기화 (P0 — critic C2)

**두 파일 모두** 삭제 심볼 export 라인 제거 + 새 심볼 추가:

- `packages/shared/src/index.ts` — 최상위 barrel
- `packages/shared/src/schemas/index.ts` — 중간 barrel

두 파일 중 하나만 업데이트하면 `@kiditem/shared` 와 `@kiditem/shared/schemas` export 가 divergent 되어 downstream build break.

**Breaking surface reality check**: 실측 ~30 direct-import sites (server ~7 files, web ~23 files). "86 files" 은 추정치 — §13 에서 수정. Plan B1 merge 시 downstream (server advertising/orders/action-task 등 + web 전체) 여전히 compile error. B2/B3 에서 해소. **Frontend 는 Plan D 까지 unusable — 의도된 상태.**

## 9. `app.module.ts` 변경

```typescript
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    // alphabetical insert 위치에 추가
    ProductsModule,
  ],
})
export class AppModule {}
```

## 10. `CLAUDE.md` (`apps/server/src/products/CLAUDE.md`)

Domain 규칙 1-page 요약:
- 3-layer 책임 분리: Master / Option / BundleComponent
- MasterProduct.code: Postgres sequence — 앱에서 `nextval` 호출 (`MasterCodeService`)
- Option.sku: `{master.code}-{optionCounter}` — trans 내 atomic increment + `updateMany` count check (§5.2)
- Bundle: cross-master 허용, cross-company 금지, nested bundle 금지, `companyId = bundleOption.companyId`
- `availableStock` materialize: **`BundleStockService.recompute` 만 write**. 외부 service 가 optional 필드로 착각해 update 하지 말 것.
- Bundle recompute: component CRUD 시 inline $transaction + `SELECT ... FOR UPDATE` lock. B2 `StockTransaction` service 도 같은 계약 따를 것.
- Soft-delete: cascade 없음. Option soft-delete 시 영향받는 bundle recompute 파생.
- RLS: chatbot_readonly 는 company_id 자동 필터. NestJS 는 kiditem 유저 — app-level 필터 (`where.companyId`) 필수.
- 외부 service 는 `exports: [MastersService, OptionsService, BundleComponentsService]` 만 사용. `MasterCodeService` / `BundleStockService` 접근 금지.
- 모든 mutating method 는 `tx?: Prisma.TransactionClient` 마지막 파라미터 — outer transaction composition 지원.

## 11. Success criteria

Plan B1 merge 시점에 다음 성립:

- [ ] `npx prisma validate` — PASS
- [ ] `npm run build --workspace=packages/shared` — PASS (product.ts + inventory.ts + 두 index.ts 재작성 후)
- [ ] `cd apps/server && npx tsc --noEmit --project tsconfig.products.json` — PASS (products module 전용 tsconfig, Plan B1 안에서 생성)
- [ ] Unit tests — PASS (`master-code`, `bundle-stock`)
- [ ] Integration tests — PASS (3 `.pg.integration.spec.ts` + `.di.spec.ts`)
- [ ] RLS 4 tests — PASS
- [ ] Index 활용 검증 — 10k 시드 후 EXPLAIN 으로 list 쿼리 모두 index scan (seq scan 없음). fail 시 Plan A schema hotfix (추가 index) 필요
- [ ] `apps/server` 전체 tsc 는 **여전히 실패** (expected, Plan B2/B3 전)
- [ ] `npm run dev:server` 는 **여전히 부팅 실패** (expected)

## 12. Not tested in Plan B1 (명시적 gap)

Plan B1 merge 후에도 검증되지 않는 항목 — Plan B3 의 "서버 최초 부팅" 시점에 catch:

| 항목 | 대체 수단 (B1) | 최종 검증 |
|---|---|---|
| Full NestJS app bootstrap DI resolution (across all modules) | `Test.createTestingModule({ imports:[ProductsModule] })` | Plan B3 첫 `dev:server` |
| `AuthGuard` real JWT 검증 path | Guard mock with `canActivate: () => true` | Plan B3 HTTP integration |
| Global `ValidationPipe` | DTO unit instantiation in integration spec | Plan B3 HTTP integration |
| `GlobalExceptionFilter` real mapping | Service 직접 throw + assert exception type | Plan B3 HTTP integration |
| Controller-level HTTP request/response | (skip) | Plan B3 |
| Bundle recompute on inventory change | (skip — B1 은 inline hook only) | Plan B2 `StockTransaction` hook task |

## 13. Parallelization strategy (초안 — plan.md 에서 확정)

`TeamCreate` + `kiditem-implementer × 2-3` 병렬:

| Task | Dependencies | Parallelizable |
|---|---|---|
| T1: `@kiditem/shared` rewrite (product.ts, inventory.ts, index.ts, schemas/index.ts) | none | — |
| T2: `products.module.ts` + CLAUDE.md + `util/prisma-error.ts` + `MasterCodeService` | none | T1 과 병렬 가능 |
| T3: `MastersController/Service` + DTO + tests | T1, T2 | **T4, T5 와 병렬** |
| T4: `OptionsController/Service` + DTO + tests | T1, T2 | **T3, T5 와 병렬** |
| T5: `BundleComponentsController/Service` + DTO + `BundleStockService` + tests | T1, T2 (T3, T4 도 있으면 이상적) | T3, T4 완료 후가 안전 |
| T6: DI spec + RLS 4 tests + index verification script | T3-T5 | 최종 검증 |
| T7: `app.module.ts` 등록 + 최종 success criteria verification | T3-T6 | — |

**Integration test fixture 충돌 회피**: 각 implementer 가 unique `companyId` (uuid) 를 자체 생성하도록 fixture helper 에 `companyId` 인자 받기. 동일 master code `M-00000001` 재사용 대신 sequence 에 따라 얻기.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `prisma.masterProduct.update({where:{id, companyId}})` 컴파일 실패 | §5.2 `updateMany + findUniqueOrThrow` 패턴으로 확정 (P0 #1 fix) |
| Outer-tx composition 실패 | 모든 mutating method 가 `tx?` 받음 (P0 #2 fix) |
| `availableStock` service-boundary 우회 쓰기 | DTO 제외 + service payload strip + CLAUDE.md 에 명시 |
| Soft-deleted component 이 bundle 재고에 참여 | `recompute` 의 `componentOption.isDeleted=false` filter + Option soft-delete hook (§5.5) |
| Concurrent bundle recompute race | `SELECT ... FOR UPDATE` row lock (§5.3) |
| Plan B2 이 `StockTransaction` recompute hook 을 빠뜨림 | Plan B2 에 명시적 task. CLAUDE.md 에 계약 명시 |
| @kiditem/shared ~30 direct-import files 깨짐 | 의도된 상태. Plan B2/B3 가 자연스럽게 수정. Plan B1 은 **증가시키지 않음** |
| NestJS DI 부팅 실패 | `Test.createTestingModule` DI spec 으로 B1 시점 catch (§7.3) |
| `master_code_seq` 8-digit overflow | `MasterCodeService` overflow guard → 500 (§5.1) |
| `optionCounter` gap on rollback | 의도된 계약. integration test 로 명시적 assertion |
| Master PATCH 로 soft-delete flag 우회 | PATCH payload 에서 `isDeleted`, `deletedAt` strip (§4.1) |
| `isBundle` flip 로 invariant 훼손 | UpdateOptionDto flip rules → 409 (§4.1) |
| Cursor pagination 순서 불일치 | `(createdAt DESC, id DESC)` 고정 + cursor encoding (§4.2) |
| `by-sku/:sku` 로 cross-tenant leak | service 가 `result.companyId === companyId` 체크 (§3.3) |
| RLS 검증 불충분 | 4 tests matrix — 2 tables × (filter set, not set) + cross-tenant guess (§7.4) |

## 15. Decisions log

- **layer β (Master+Option+Bundle)**: ChannelListing 은 vendorItemId 매처 복잡도로 Plan B2.
- **Boot C (등록 O, 부팅 X)**: 주석 처리 hack 회피. 최종 상태 commit + integration/DI test 로 검증.
- **v2 suffix 없음**: ADR-0013 non-coexistence.
- **URL `/api/products/` prefix**: dashboard split 패턴 일관.
- **RESTful resource-per-layer**: 에이전트 reasoning 명확성 (ADR-0013).
- **Approach 1 (flat module)**: `orders/`, `advertising/` 관행.
- **`@kiditem/shared` (i) 최소 scope**: 단계별 phase 진행.
- **Sequence 기반 code** + `nextval` 직접 호출: race-free + gap-tolerant.
- **Option sku counter**: `optionCounter {increment:1}` (soft-delete 무관).
- **Bundle availableStock materialize vs event-driven**: Plan B1 은 **in-line hook** (component CRUD 시 동기 recompute). Event-driven (EventEmitter2 기반 `StockChanged` → listener) 는 B2 `StockTransaction` 의 인벤토리 변경 hook 설계 때 재평가. 장점: 모든 변경지점을 listener 하나로 집중, 누락 방지. 단점: 결과적 일관성, race 감시 필요. B1 에선 simplicity 우선.
- **`availableStock` null vs 0**: null = non-bundle 또는 미계산 bundle (초기 상태), 0 = bundle 이지만 만들 수 있는 수량 0. 둘 구분 유지.
- **`BundleComponent.companyId` 원천**: `bundleOption.companyId` (auth 의 companyId 아님). 3-way invariant.
- **Controller 반환 타입**: service = raw Prisma row, controller = Zod-parsed shape. `toSerializable()` 헬퍼로 Decimal/Date/Json 변환.
- **Cursor pagination**: `{createdAt, id}` pair 의 base64url 인코딩. Tie-breaker 로 id DESC.
- **DB CHECK constraint for nested-bundle**: Plan B3 hardening (B1 은 service 레벨만).
- **Integration test file naming**: `.pg.integration.spec.ts` (vitest config glob 일치).
