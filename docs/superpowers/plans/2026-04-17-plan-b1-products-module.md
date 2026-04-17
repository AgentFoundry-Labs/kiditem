# Plan B1 — Products Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Can also be executed via CLAUDE.md TeamCreate workflow (kiditem-implementer × 2-3 + kiditem-reviewer × 2 + kiditem-qa-verifier × 1). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Plan A 이후 공백 상태인 products NestJS module 을 3-layer (Master + Option + BundleComponent) 로 재구축 + `@kiditem/shared` 의 `product.ts` / `inventory.ts` Zod schema 재작성으로 Plan B2/B3 의 기반을 제공한다.

**Architecture:** flat module structure (`apps/server/src/products/` = controllers/ + services/ + dto/ + util/ + __tests__/). RESTful resource-per-layer API (`/api/products/masters`, `/api/products/options`, `/api/products/bundle-components`). Boot strategy C — `app.module.ts` 에 등록하되 `dev:server` 는 Plan B3 까지 부팅 불가. 검증은 integration tests (real-prisma.ts) + DI wiring spec (`Test.createTestingModule`).

**Tech Stack:** NestJS 11, Prisma v7 (multi-file, 3-layer schema from Plan A), class-validator, Zod (`@kiditem/shared`), Postgres 17 (`master_code_seq` + RLS + 3 CHECK constraints already applied via `prisma/3layer-setup.sql`), vitest (unit + integration tiers).

**Related:**
- Spec: [docs/superpowers/specs/2026-04-17-plan-b1-products-module-design.md](../specs/2026-04-17-plan-b1-products-module-design.md) (v2, user-approved)
- ADR: [0013-product-schema-3layer](../../../.claude/docs/decisions/0013-product-schema-3layer.md)
- Plan A: [2026-04-17-plan-a-schema-transition.md](2026-04-17-plan-a-schema-transition.md) (merged PR #25)
- Successor: Plan B2 (advertising/orders/inventory services) → Plan B3 (dashboard/finance/supply/AI/tests)

---

## Plan B1 완료 시점 상태

| 항목 | 상태 |
|---|---|
| `apps/server/src/products/` module | 신설 완료 — 3 controllers + 5 services + DTOs + utils + tests |
| `@kiditem/shared/src/schemas/product.ts` | 재작성 — Master/ProductOption/BundleComponent Zod |
| `@kiditem/shared/src/schemas/inventory.ts` | 재작성 — Inventory Zod (optionId 기반) |
| `@kiditem/shared/src/index.ts` + `src/schemas/index.ts` | 두 barrel 동기화 |
| `apps/server/src/app.module.ts` | `ProductsModule` 등록 |
| `npm run build --workspace=packages/shared` | PASS |
| Products-only tsc (`tsconfig.products.json`) | PASS |
| Unit tests (`master-code`, `bundle-stock`) | PASS |
| Integration tests (3 `.pg.integration.spec.ts` + DI spec) | PASS |
| RLS 4-test matrix | PASS |
| `npm run dev:server` | 여전히 부팅 실패 (expected — Plan B3 대상) |
| `apps/server` 전체 tsc | 여전히 실패 (expected — Plan B2/B3 대상) |

---

## File Structure

### Created files (apps/server)
- `apps/server/src/products/products.module.ts`
- `apps/server/src/products/CLAUDE.md`
- `apps/server/src/products/controllers/masters.controller.ts`
- `apps/server/src/products/controllers/options.controller.ts`
- `apps/server/src/products/controllers/bundle-components.controller.ts`
- `apps/server/src/products/services/masters.service.ts`
- `apps/server/src/products/services/options.service.ts`
- `apps/server/src/products/services/bundle-components.service.ts`
- `apps/server/src/products/services/master-code.service.ts`
- `apps/server/src/products/services/bundle-stock.service.ts`
- `apps/server/src/products/util/prisma-error.ts`
- `apps/server/src/products/util/cursor.ts` — cursor encode/decode helper
- `apps/server/src/products/dto/create-master.dto.ts`
- `apps/server/src/products/dto/update-master.dto.ts`
- `apps/server/src/products/dto/list-masters.query.ts`
- `apps/server/src/products/dto/create-option.dto.ts`
- `apps/server/src/products/dto/update-option.dto.ts`
- `apps/server/src/products/dto/list-options.query.ts`
- `apps/server/src/products/dto/create-bundle-component.dto.ts`
- `apps/server/src/products/dto/update-bundle-component.dto.ts`
- `apps/server/src/products/dto/list-bundle-components.query.ts`
- `apps/server/src/products/__tests__/master-code.service.spec.ts`
- `apps/server/src/products/__tests__/bundle-stock.service.spec.ts`
- `apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/rls.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/products.module.di.spec.ts`
- `apps/server/tsconfig.products.json` — products-only type-check

### Modified files (apps/server)
- `apps/server/src/app.module.ts` — import ProductsModule
- `apps/server/src/test-helpers/real-prisma.ts` — add `seedProductsFixture`, `withChatbotReadonly`

### Created / Modified files (packages/shared)
- `packages/shared/src/schemas/product.ts` — 완전 재작성
- `packages/shared/src/schemas/inventory.ts` — 완전 재작성
- `packages/shared/src/schemas/index.ts` — 재-export 갱신
- `packages/shared/src/index.ts` — 재-export 갱신
- `packages/shared/src/json.ts` (new) — `toSerializable` helper (Decimal/Date/Json → plain JSON)

---

## Task Parallelization Matrix

| Task | Dependencies | Parallel with |
|---|---|---|
| T1 — `@kiditem/shared` rewrite + toSerializable | — | T2 |
| T2 — Foundation (module skeleton + MasterCodeService + util) | — | T1 |
| T3 — Masters | T1, T2 | **T4** |
| T4 — Options | T1, T2 | **T3** |
| T5 — BundleComponents + BundleStockService | T1, T2 (T3 + T4 최신 상태가 이상적) | sequential after T3, T4 |
| T6 — DI spec + RLS tests + fixture helpers | T3, T4, T5 | — |
| T7 — app.module.ts + 최종 verification | T3, T4, T5, T6 | — |

**TeamCreate 실행 시**: T3 + T4 를 2 implementer 에 분배 (병렬). T5 는 T3+T4 merge 이후 dispatch. T1+T2 도 2 implementer 로 분배 가능.

---

## Prerequisites

- [ ] **Step 0-1: Verify branch + clean tree**

```bash
cd /Users/yhc125/workspace/kiditem
git status --short
git branch --show-current
```

Expected: branch = `feat/plan-b1-products-module`, working tree 최소 (pre-existing untracked docs 허용).

- [ ] **Step 0-2: Verify dev DB + test DB up and 3layer-setup applied**

```bash
docker ps | grep kiditem-postgres
docker exec kiditem-postgres psql -U kiditem kiditem -c "\\ds master_code_seq"
docker exec kiditem-postgres-test psql -U kiditem_test kiditem_test -c "\\ds master_code_seq"
```

Expected: 두 postgres 컨테이너 up, 각각 `master_code_seq` 존재. 없으면 `npm run db:3layer-setup` 또는 `npm run db:test:prepare` 재실행.

- [ ] **Step 0-3: Verify Prisma client fresh**

```bash
npx prisma generate
cd apps/server && npx tsc --noEmit --project tsconfig.json 2>&1 | wc -l
```

기대: 424 errors 근처 (Plan B1 시작 전 baseline). 이 숫자가 Plan B1 진행 중 줄어드는 방향이어야 함.

---

## Task 1: `@kiditem/shared` rewrite

**Files:**
- Modify: `packages/shared/src/schemas/product.ts`
- Modify: `packages/shared/src/schemas/inventory.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/json.ts`

### Step 1-1: Check current shared package build baseline

```bash
cd /Users/yhc125/workspace/kiditem
npm run build --workspace=packages/shared 2>&1 | tail -10
```

Expected: PASS (현재 기존 shape 으로 빌드 가능).

### Step 1-2: Create `packages/shared/src/json.ts` — serialization helper

```typescript
// packages/shared/src/json.ts
import { Prisma } from '@prisma/client';

/**
 * Convert Prisma row (may contain Decimal / Date / JsonValue) to plain JSON-serializable shape.
 * Use at controller response boundary before Zod parse.
 *
 * Rules:
 * - Decimal → number (via .toNumber())
 * - Date → ISO string
 * - JsonValue (Prisma scalar) → passed through (caller must cast if schema-typed)
 */
export function toSerializable<T>(row: T): unknown {
  if (row === null || row === undefined) return row;
  if (row instanceof Date) return row.toISOString();
  if (typeof (row as any).toNumber === 'function' && (row as any).constructor?.name === 'Decimal') {
    return (row as Prisma.Decimal).toNumber();
  }
  if (Array.isArray(row)) return row.map(toSerializable);
  if (typeof row === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = toSerializable(v);
    }
    return out;
  }
  return row;
}
```

### Step 1-3: Rewrite `packages/shared/src/schemas/product.ts`

Replace the file contents entirely:

```typescript
// packages/shared/src/schemas/product.ts
import { z } from 'zod';

// ===== Master (기획 상품 family) =====
export const MasterSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  code: z.string(),                              // "M-00000042"
  legacyCode: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  tags: z.array(z.string()),                     // Prisma Json → string[]
  optionCounter: z.number().int(),
  thumbnailUrl: z.string().url().nullable(),
  imageUrl: z.string().url().nullable(),
  images: z.array(z.string().url()),             // Prisma Json → string[]
  abcGrade: z.enum(['A', 'B', 'C']).nullable(),
  profitTag: z.string().nullable(),
  adTier: z.string().nullable(),
  adBudgetLimit: z.number().int().nullable(),
  healthScore: z.number().int().nullable(),
  healthUpdatedAt: z.string().datetime().nullable(),
  sourceUrl: z.string().url().nullable(),
  sourcePlatform: z.string().nullable(),
  costCny: z.number().nullable(),                // Decimal → number
  marginRate: z.number().nullable(),
  pipelineStep: z.string().nullable(),
  detailPageUrl: z.string().url().nullable(),
  thumbnailStrategy: z.enum(['standard', 'premium', 'custom']),
  supplierId: z.string().uuid().nullable(),
  isDeleted: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
  isTemporary: z.boolean(),
  temporaryReason: z.string().nullable(),
  memo: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Master = z.infer<typeof MasterSchema>;

// ===== ProductOption (물리 SKU) =====
export const ProductOptionSchema = z.object({
  id: z.string().uuid(),
  masterId: z.string().uuid(),
  companyId: z.string().uuid(),
  sku: z.string(),                               // "M-00000042-01"
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
export type ProductOption = z.infer<typeof ProductOptionSchema>;

// ===== BundleComponent =====
export const BundleComponentSchema = z.object({
  id: z.string().uuid(),
  bundleOptionId: z.string().uuid(),
  componentOptionId: z.string().uuid(),
  companyId: z.string().uuid(),
  qty: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BundleComponent = z.infer<typeof BundleComponentSchema>;

// ===== Relation-loaded variants =====
export const MasterWithOptionsSchema = MasterSchema.extend({
  options: z.array(ProductOptionSchema),
});
export type MasterWithOptions = z.infer<typeof MasterWithOptionsSchema>;

export const OptionWithComponentsSchema = ProductOptionSchema.extend({
  components: z.array(BundleComponentSchema),
});
export type OptionWithComponents = z.infer<typeof OptionWithComponentsSchema>;
```

### Step 1-4: Rewrite `packages/shared/src/schemas/inventory.ts`

```typescript
// packages/shared/src/schemas/inventory.ts
import { z } from 'zod';

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
  dailySalesAvg: z.number(),                     // Decimal → number
  warehouseLocation: z.string().nullable(),
  lastRestockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Inventory = z.infer<typeof InventorySchema>;

// Aggregated / enriched views (기존 InventoryItemSchema, InventorySummarySchema) 는
// Plan B2 inventory service rewrite 때 재정의. Plan B1 은 raw shape 만.
```

### Step 1-5: Update `packages/shared/src/schemas/index.ts`

Find the product and inventory export lines, replace:

```typescript
// OLD:
// export { TrafficDataSchema, ProductListItemSchema, ProductDetailSchema, PipelineCountsSchema } from './product.js';
// export type { TrafficData, ProductListItem, ProductDetail, PipelineCounts } from './product.js';
// export { InventoryItemSchema, InventorySummarySchema } from './inventory.js';
// export type { InventoryItem, InventorySummary } from './inventory.js';

// NEW:
export {
  MasterSchema, ProductOptionSchema, BundleComponentSchema,
  MasterWithOptionsSchema, OptionWithComponentsSchema,
} from './product.js';
export type {
  Master, ProductOption, BundleComponent,
  MasterWithOptions, OptionWithComponents,
} from './product.js';

export { InventorySchema } from './inventory.js';
export type { Inventory } from './inventory.js';
```

Leave all other exports (order, profit-loss, workflow, etc.) untouched.

### Step 1-6: Update `packages/shared/src/index.ts`

Same pattern — find the product + inventory re-exports and replace with the new symbol names. Add `toSerializable` export from `./json.js`.

```typescript
// Add near top-level exports:
export { toSerializable } from './json.js';

// Replace product re-exports:
export {
  MasterSchema, ProductOptionSchema, BundleComponentSchema,
  MasterWithOptionsSchema, OptionWithComponentsSchema,
} from './schemas/product.js';
export type {
  Master, ProductOption, BundleComponent,
  MasterWithOptions, OptionWithComponents,
} from './schemas/product.js';

// Replace inventory re-exports:
export { InventorySchema } from './schemas/inventory.js';
export type { Inventory } from './schemas/inventory.js';
```

Remove all references to `TrafficDataSchema`, `ProductListItemSchema`, `ProductDetailSchema`, `PipelineCountsSchema`, `InventoryItemSchema`, `InventorySummarySchema`, `MasterProductSchema`, `TrafficData`, `ProductListItem`, `ProductDetail`, `PipelineCounts`, `InventoryItem`, `InventorySummary`, `MasterProduct` from both index files.

### Step 1-7: Build shared package — verify PASS

```bash
cd /Users/yhc125/workspace/kiditem
npm run build --workspace=packages/shared 2>&1 | tail -10
```

Expected: `Successfully compiled` or tsc 0 errors. **@kiditem/shared 자체는 컴파일 되어야 함** — 내부 consistency check.

### Step 1-8: Confirm downstream breakage count within expected range

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: ~400-500 errors (Plan A baseline 424 + shared rewrite 효과로 약간 증가 또는 유사). Plan B2/B3 에서 감소 예정.

### Step 1-9: Commit Task 1

```bash
cd /Users/yhc125/workspace/kiditem
git add packages/shared/src/schemas/product.ts \
        packages/shared/src/schemas/inventory.ts \
        packages/shared/src/schemas/index.ts \
        packages/shared/src/index.ts \
        packages/shared/src/json.ts
git commit -m "feat(shared): rewrite product/inventory schemas for 3-layer (Plan B1 T1)"
```

---

## Task 2: Foundation (module skeleton + MasterCodeService + utilities)

**Files:**
- Create: `apps/server/src/products/products.module.ts`
- Create: `apps/server/src/products/CLAUDE.md`
- Create: `apps/server/src/products/util/prisma-error.ts`
- Create: `apps/server/src/products/util/cursor.ts`
- Create: `apps/server/src/products/services/master-code.service.ts`
- Create: `apps/server/src/products/__tests__/master-code.service.spec.ts`
- Create: `apps/server/tsconfig.products.json`

### Step 2-1: Create `apps/server/src/products/util/prisma-error.ts`

```typescript
// apps/server/src/products/util/prisma-error.ts
import { Prisma } from '@prisma/client';
import {
  BadRequestException, ConflictException, NotFoundException,
} from '@nestjs/common';

/**
 * Map Prisma known request errors to NestJS HTTP exceptions.
 * Call in service catch blocks: `catch (e) { mapPrismaError(e, 'master create') }`.
 */
export function mapPrismaError(e: unknown, context: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'unknown';
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

### Step 2-2: Create `apps/server/src/products/util/cursor.ts`

```typescript
// apps/server/src/products/util/cursor.ts
/**
 * Opaque cursor = base64url({ createdAt: ISO, id: UUID }).
 * Used for (createdAt DESC, id DESC) pagination tiebreaker.
 */
export interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (!parsed.createdAt || !parsed.id) throw new Error('invalid cursor shape');
    return parsed;
  } catch {
    throw new Error(`invalid cursor: ${cursor}`);
  }
}
```

### Step 2-3: Write failing unit test for MasterCodeService

Create `apps/server/src/products/__tests__/master-code.service.spec.ts`:

```typescript
import { MasterCodeService } from '../services/master-code.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('MasterCodeService', () => {
  function makePrismaMock(seqReturn: bigint) {
    return {
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: seqReturn }]),
    } as any;
  }

  it('formats sequence value 1 → "M-00000001"', async () => {
    const svc = new MasterCodeService(makePrismaMock(1n));
    expect(await svc.generate()).toBe('M-00000001');
  });

  it('formats sequence value 42 → "M-00000042"', async () => {
    const svc = new MasterCodeService(makePrismaMock(42n));
    expect(await svc.generate()).toBe('M-00000042');
  });

  it('formats sequence value 99999999 → "M-99999999"', async () => {
    const svc = new MasterCodeService(makePrismaMock(99999999n));
    expect(await svc.generate()).toBe('M-99999999');
  });

  it('throws InternalServerError when sequence exceeds 8-digit ceiling', async () => {
    const svc = new MasterCodeService(makePrismaMock(100000000n));
    await expect(svc.generate()).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
```

### Step 2-4: Run test to verify it fails

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/master-code.service.spec.ts
```

Expected: FAIL — `Cannot find module '../services/master-code.service'`.

### Step 2-5: Implement MasterCodeService

Create `apps/server/src/products/services/master-code.service.ts`:

```typescript
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MasterCodeService {
  static readonly MAX_VALUE = 99999999;

  constructor(private readonly prisma: PrismaService) {}

  async generate(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('master_code_seq') AS nextval
    `;
    const n = Number(rows[0].nextval);
    if (n > MasterCodeService.MAX_VALUE) {
      throw new InternalServerErrorException(
        `master_code_seq overflow: ${n} > ${MasterCodeService.MAX_VALUE}`,
      );
    }
    return `M-${String(n).padStart(8, '0')}`;
  }
}
```

### Step 2-6: Run test to verify it passes

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/master-code.service.spec.ts
```

Expected: PASS 4/4.

### Step 2-7: Create `apps/server/src/products/products.module.ts` skeleton

```typescript
// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';

@Module({
  controllers: [],
  providers: [MasterCodeService],
  exports: [],
})
export class ProductsModule {}
```

(Controllers + other services 는 Task 3-5 에서 추가.)

### Step 2-8: Create `apps/server/src/products/CLAUDE.md`

Use this exact content:

```markdown
# products — Master/Option/Bundle Domain

## 3-layer 책임 분리 (ADR-0013)

- **MasterProduct** (family, 기획상품) — 운영/광고/전략 단위. `code = 'M-' + nextval('master_code_seq').padStart(8)`.
- **ProductOption** (물리 SKU, 바코드 단위) — 재고/매입/창고 단위. `sku = {master.code}-{optionCounter.padStart(2)}`.
- **BundleComponent** — 세트 구성 관계 (cross-master 허용, cross-company 금지, Plan B1 에선 nested bundle 금지).

## 핵심 규칙

- **code 생성**: `MasterCodeService.generate()` — `nextval('master_code_seq')`. race-free + gap-tolerant (rollback 시 gap 허용).
- **sku 생성**: `OptionsService.create` 의 `$transaction` 안에서 `masterProduct.updateMany + findUniqueOrThrow` 2-step. WHERE 에 `isDeleted:false` 포함 (TOCTOU).
- **availableStock materialize**: `BundleStockService.recompute` **만** write. `OptionsService.update` 는 payload 에서 명시적 strip.
- **BundleComponent.companyId**: auth companyId 아닌 `bundleOption.companyId` 에서 파생 (3-way invariant).
- **Bundle recompute**: component CRUD 시 inline `$transaction` + `SELECT ... FOR UPDATE` row-level lock. Option soft-delete 시에도 파생 recompute.
- **Soft-delete**: Master / Option 만. cascade 없음. restore 도 cascade 없음.
- **Hard delete**: BundleComponent 만.

## 외부 서비스 접근

- Export: `MastersService`, `OptionsService`, `BundleComponentsService`.
- **Non-export (내부 전용)**: `MasterCodeService`, `BundleStockService` — 외부 모듈 접근 금지.

## Transaction composition

모든 mutating method 는 optional `tx?: Prisma.TransactionClient` 마지막 파라미터. Plan B2 의 outer transaction (sourcing, supplier sync) 와 compose 가능.

## RLS

- `chatbot_readonly` — DB session `SET app.company_id = '<uuid>'` 필수. `prisma/3layer-setup.sql` 의 7 RLS policies 로 자동 필터.
- NestJS (`kiditem` 유저) — table owner → RLS 우회. App-level `where.companyId` 필터 필수.

## Plan 분할

- Plan B1 (현재) — Master + Option + Bundle.
- Plan B2 — advertising / orders / inventory service rewrite + `StockTransaction` hook 이 `BundleStockService.recompute` 호출.
- Plan B3 — dashboard / finance / supply / AI + full NestJS HTTP integration tests.
```

### Step 2-9: Create `apps/server/tsconfig.products.json`

```json
{
  "extends": "./tsconfig.json",
  "include": [
    "src/products/**/*.ts",
    "src/prisma/**/*.ts",
    "src/auth/**/*.ts"
  ],
  "exclude": [
    "src/products/__tests__/**",
    "**/*.spec.ts"
  ]
}
```

### Step 2-10: Verify products-only tsc compiles

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors (products module is minimal — skeleton + MasterCodeService + utils only).

### Step 2-11: Commit Task 2

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/products.module.ts \
        apps/server/src/products/CLAUDE.md \
        apps/server/src/products/util/ \
        apps/server/src/products/services/master-code.service.ts \
        apps/server/src/products/__tests__/master-code.service.spec.ts \
        apps/server/tsconfig.products.json
git commit -m "feat(products): module skeleton + MasterCodeService + utils (Plan B1 T2)"
```

---

## Task 3: Masters (controller + service + DTOs + integration tests)

**Files:**
- Create: `apps/server/src/products/dto/create-master.dto.ts`
- Create: `apps/server/src/products/dto/update-master.dto.ts`
- Create: `apps/server/src/products/dto/list-masters.query.ts`
- Create: `apps/server/src/products/services/masters.service.ts`
- Create: `apps/server/src/products/controllers/masters.controller.ts`
- Create: `apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Modify: `apps/server/src/test-helpers/real-prisma.ts` — add `seedProductsFixture`

### Step 3-1: Create `dto/create-master.dto.ts`

```typescript
// apps/server/src/products/dto/create-master.dto.ts
import {
  IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, IsUrl, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';

export class CreateMasterDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  name!: string;

  @IsOptional() @IsString() @MaxLength(100)
  legacyCode?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional() @IsString()
  profitTag?: string;

  @IsOptional() @IsString()
  adTier?: string;

  @IsOptional() @IsString()
  pipelineStep?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsUUID()
  supplierId?: string;

  @IsOptional() @IsUrl()
  sourceUrl?: string;

  @IsOptional() @IsUrl()
  thumbnailUrl?: string;

  @IsOptional() @IsUrl()
  imageUrl?: string;

  @IsOptional() @IsUrl()
  detailPageUrl?: string;

  @IsOptional() @IsString()
  sourcePlatform?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(99999999.99)
  costCny?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  marginRate?: number;

  @IsOptional() @IsArray() @IsUrl({}, { each: true })
  images?: string[];

  @IsOptional() @IsIn(['A', 'B', 'C'])
  abcGrade?: 'A' | 'B' | 'C';

  @IsOptional() @IsInt() @Min(0) @Max(100)
  healthScore?: number;

  @IsOptional() @IsInt() @Min(0)
  adBudgetLimit?: number;

  @IsOptional() @IsIn(['standard', 'premium', 'custom'])
  thumbnailStrategy?: 'standard' | 'premium' | 'custom';

  @IsOptional() @IsBoolean()
  isTemporary?: boolean;

  @ValidateIf(o => o.isTemporary === true)
  @IsString() @IsNotEmpty()
  temporaryReason?: string;

  @IsOptional() @IsString()
  memo?: string;
}
```

### Step 3-2: Create `dto/update-master.dto.ts`

```typescript
// apps/server/src/products/dto/update-master.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateMasterDto } from './create-master.dto';

export class UpdateMasterDto extends PartialType(CreateMasterDto) {}

/**
 * Service MUST strip the following before calling prisma.update:
 * id, code, companyId, optionCounter, isDeleted, deletedAt, healthUpdatedAt,
 * rawData, processedData, draftContent, createdAt, updatedAt.
 *
 * State transitions (soft-delete/restore) use dedicated endpoints:
 *   DELETE /:id   → softDelete()
 *   POST /:id/restore → restore()
 */
```

### Step 3-3: Create `dto/list-masters.query.ts`

```typescript
// apps/server/src/products/dto/list-masters.query.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMastersQuery {
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isDeleted?: boolean;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isTemporary?: boolean;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional() @IsIn(['A', 'B', 'C'])
  abcGrade?: 'A' | 'B' | 'C';

  @IsOptional() @IsString()
  pipelineStep?: string;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  includeDeleted?: boolean;
}
```

### Step 3-4: Extend `seedProductsFixture` in `test-helpers/real-prisma.ts`

Read the current file first, then append:

```typescript
// apps/server/src/test-helpers/real-prisma.ts (append)
export async function seedProductsFixture(
  prisma: PrismaClient,
  companyId: string,
  opts: { masterCode?: string } = {},
) {
  const code = opts.masterCode ?? `M-${String(Math.floor(Math.random() * 99999999)).padStart(8, '0')}`;
  const master = await prisma.masterProduct.create({
    data: {
      companyId,
      code,
      name: `Fixture Master ${code}`,
      optionCounter: 0,
    },
  });
  const singleOption = await prisma.productOption.create({
    data: {
      companyId,
      masterId: master.id,
      sku: `${code}-01`,
      optionName: null,
      isActive: true,
    },
  });
  const bundleOption = await prisma.productOption.create({
    data: {
      companyId,
      masterId: master.id,
      sku: `${code}-02`,
      optionName: 'Bundle',
      isBundle: true,
      availableStock: 0,
    },
  });
  await prisma.inventory.create({
    data: { companyId, optionId: singleOption.id, currentStock: 100 },
  });
  return { master, singleOption, bundleOption };
}
```

After `optionCounter: 0`, the master.optionCounter is stored as 0, but we manually created options with sku suffix `-01`/`-02` — callers that test the normal OptionsService.create race should bump counter themselves.

### Step 3-5: Write failing integration tests — `masters.service.pg.integration.spec.ts`

```typescript
// apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts
import { PrismaClient } from '@prisma/client';
import { MasterCodeService } from '../services/master-code.service';
import { MastersService } from '../services/masters.service';
import {
  makeTestPrisma, resetDb, seedBaseFixture,
  TEST_COMPANY_ID, OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('MastersService integration', () => {
  let prisma: PrismaClient;
  let codeSvc: MasterCodeService;
  let svc: MastersService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    codeSvc = new MasterCodeService(prisma as any);
    svc = new MastersService(prisma as any, codeSvc);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a master with auto-generated code', async () => {
    const m = await svc.create(TEST_COMPANY_ID, { name: 'Apple juice bundle' } as any);
    expect(m.code).toMatch(/^M-\d{8}$/);
    expect(m.companyId).toBe(TEST_COMPANY_ID);
    expect(m.name).toBe('Apple juice bundle');
    expect(m.optionCounter).toBe(0);
  });

  it('lists only own-company masters (cross-tenant isolation)', async () => {
    await svc.create(TEST_COMPANY_ID, { name: 'A' } as any);
    await svc.create(OTHER_COMPANY_ID, { name: 'B' } as any);
    const { items } = await svc.list(TEST_COMPANY_ID, {});
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('A');
  });

  it('returns 404 for cross-tenant by-code lookup', async () => {
    const other = await svc.create(OTHER_COMPANY_ID, { name: 'X' } as any);
    await expect(svc.findByCode(TEST_COMPANY_ID, other.code)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('soft-deletes and restores', async () => {
    const m = await svc.create(TEST_COMPANY_ID, { name: 'Y' } as any);
    await svc.softDelete(TEST_COMPANY_ID, m.id);
    const after = await svc.findById(TEST_COMPANY_ID, m.id, { includeDeleted: true });
    expect(after.isDeleted).toBe(true);
    expect(after.deletedAt).not.toBeNull();

    await svc.restore(TEST_COMPANY_ID, m.id);
    const restored = await svc.findById(TEST_COMPANY_ID, m.id, {});
    expect(restored.isDeleted).toBe(false);
    expect(restored.deletedAt).toBeNull();
  });

  it('auto-updates healthUpdatedAt when healthScore changes', async () => {
    const m = await svc.create(TEST_COMPANY_ID, { name: 'Z' } as any);
    const before = m.healthUpdatedAt;
    const updated = await svc.update(TEST_COMPANY_ID, m.id, { healthScore: 85 } as any);
    expect(updated.healthScore).toBe(85);
    expect(updated.healthUpdatedAt).not.toBe(before);
  });

  it('rejects supplierId from another company (cross-tenant)', async () => {
    const otherSupplier = await prisma.supplier.create({
      data: { companyId: OTHER_COMPANY_ID, name: 'Other co supplier' },
    });
    await expect(
      svc.create(TEST_COMPANY_ID, { name: 'W', supplierId: otherSupplier.id } as any),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects restore when duplicate legacyCode is taken', async () => {
    const m1 = await svc.create(TEST_COMPANY_ID, { name: 'L1', legacyCode: 'LC-1' } as any);
    await svc.softDelete(TEST_COMPANY_ID, m1.id);
    await svc.create(TEST_COMPANY_ID, { name: 'L2', legacyCode: 'LC-1' } as any);
    await expect(svc.restore(TEST_COMPANY_ID, m1.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});
```

### Step 3-6: Run test — verify FAIL

```bash
cd /Users/yhc125/workspace/kiditem
npm run db:test:prepare
cd apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/masters.service.pg.integration.spec.ts
```

Expected: FAIL — `Cannot find module '../services/masters.service'`.

### Step 3-7: Implement `services/masters.service.ts`

```typescript
// apps/server/src/products/services/masters.service.ts
import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma, MasterProduct } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MasterCodeService } from './master-code.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { ListMastersQuery } from '../dto/list-masters.query';
import { mapPrismaError } from '../util/prisma-error';
import { decodeCursor, encodeCursor } from '../util/cursor';

const SYSTEM_FIELDS: readonly (keyof CreateMasterDto | string)[] = [
  'id', 'code', 'companyId', 'optionCounter', 'isDeleted', 'deletedAt',
  'healthUpdatedAt', 'rawData', 'processedData', 'draftContent',
  'createdAt', 'updatedAt',
];

@Injectable()
export class MastersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSvc: MasterCodeService,
  ) {}

  async create(companyId: string, dto: CreateMasterDto, tx?: Prisma.TransactionClient): Promise<MasterProduct> {
    const db = tx ?? this.prisma;
    if (dto.supplierId) {
      const supplier = await db.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { companyId: true },
      });
      if (!supplier) throw new NotFoundException('supplier not found');
      if (supplier.companyId !== companyId) {
        throw new ForbiddenException('supplier belongs to another company');
      }
    }
    const code = await this.codeSvc.generate();
    try {
      return await db.masterProduct.create({
        data: {
          ...this.strip(dto),
          companyId,
          code,
          healthUpdatedAt: dto.healthScore !== undefined ? new Date() : null,
        },
      });
    } catch (e) { mapPrismaError(e, 'master create'); }
  }

  async list(companyId: string, q: ListMastersQuery) {
    const limit = q.limit ?? 50;
    const where: Prisma.MasterProductWhereInput = {
      companyId,
      ...(q.includeDeleted ? {} : { isDeleted: false }),
      ...(q.isDeleted !== undefined ? { isDeleted: q.isDeleted } : {}),
      ...(q.isTemporary !== undefined ? { isTemporary: q.isTemporary } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.brand ? { brand: q.brand } : {}),
      ...(q.abcGrade ? { abcGrade: q.abcGrade } : {}),
      ...(q.pipelineStep ? { pipelineStep: q.pipelineStep } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { legacyCode: { contains: q.search } },
              { code: { contains: q.search } },
            ],
          }
        : {}),
      ...(q.cursor
        ? (() => {
            const c = decodeCursor(q.cursor!);
            return {
              OR: [
                { createdAt: { lt: new Date(c.createdAt) } },
                { createdAt: new Date(c.createdAt), id: { lt: c.id } },
              ],
            };
          })()
        : {}),
    };
    const rows = await this.prisma.masterProduct.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit
      ? encodeCursor({ createdAt: items[items.length - 1].createdAt.toISOString(), id: items[items.length - 1].id })
      : null;
    return { items, nextCursor };
  }

  async findById(companyId: string, id: string, opts: { includeDeleted?: boolean }): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: {
        id,
        companyId,
        ...(opts.includeDeleted ? {} : { isDeleted: false }),
      },
    });
    if (!row) throw new NotFoundException('master not found');
    return row;
  }

  async findByCode(companyId: string, code: string): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findUnique({ where: { code } });
    if (!row || row.companyId !== companyId) {
      throw new NotFoundException('master not found');
    }
    return row;
  }

  async findByLegacy(companyId: string, legacyCode: string): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findUnique({
      where: { companyId_legacyCode: { companyId, legacyCode } },
    });
    if (!row) throw new NotFoundException('master not found');
    return row;
  }

  async update(companyId: string, id: string, dto: UpdateMasterDto, tx?: Prisma.TransactionClient): Promise<MasterProduct> {
    const db = tx ?? this.prisma;
    if (dto.supplierId !== undefined && dto.supplierId !== null) {
      const supplier = await db.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { companyId: true },
      });
      if (!supplier || supplier.companyId !== companyId) {
        throw new ForbiddenException('supplier not in same company');
      }
    }
    const stripped = this.strip(dto);
    const data: Prisma.MasterProductUpdateInput = { ...stripped };
    if (dto.healthScore !== undefined) data.healthUpdatedAt = new Date();
    if (dto.isTemporary === false) data.temporaryReason = null;
    try {
      const { count } = await db.masterProduct.updateMany({
        where: { id, companyId, isDeleted: false },
        data,
      });
      if (count === 0) throw new NotFoundException('master not found or deleted');
      return await db.masterProduct.findUniqueOrThrow({ where: { id } });
    } catch (e) { mapPrismaError(e, 'master update'); }
  }

  async softDelete(companyId: string, id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const { count } = await db.masterProduct.updateMany({
      where: { id, companyId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('master not found');
  }

  async restore(companyId: string, id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const row = await db.masterProduct.findFirst({
      where: { id, companyId, isDeleted: true },
    });
    if (!row) throw new NotFoundException('master not found or not deleted');
    try {
      await db.masterProduct.update({
        where: { id },
        data: { isDeleted: false, deletedAt: null },
      });
    } catch (e) { mapPrismaError(e, 'master restore'); }
  }

  private strip(dto: Partial<CreateMasterDto> | Partial<UpdateMasterDto>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...dto };
    for (const f of SYSTEM_FIELDS) delete out[f as string];
    return out;
  }
}
```

### Step 3-8: Register MastersService in products.module.ts

Modify:

```typescript
// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';
import { MastersService } from './services/masters.service';
import { MastersController } from './controllers/masters.controller';

@Module({
  controllers: [MastersController],
  providers: [MasterCodeService, MastersService],
  exports: [MastersService],
})
export class ProductsModule {}
```

### Step 3-9: Implement `controllers/masters.controller.ts`

```typescript
// apps/server/src/products/controllers/masters.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { toSerializable } from '@kiditem/shared';
import {
  MasterSchema, MasterWithOptionsSchema, type Master, type MasterWithOptions,
} from '@kiditem/shared';
import { MastersService } from '../services/masters.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { ListMastersQuery } from '../dto/list-masters.query';

@Controller('products/masters')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class MastersController {
  constructor(private readonly svc: MastersService) {}

  @Post()
  async create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateMasterDto,
  ): Promise<Master> {
    const row = await this.svc.create(companyId, dto);
    return MasterSchema.parse(toSerializable(row));
  }

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListMastersQuery,
  ): Promise<{ items: Master[]; nextCursor: string | null }> {
    const { items, nextCursor } = await this.svc.list(companyId, q);
    return {
      items: items.map(r => MasterSchema.parse(toSerializable(r))),
      nextCursor,
    };
  }

  @Get(':id')
  async findById(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<MasterWithOptions> {
    const row = await this.svc.findById(companyId, id, {
      includeDeleted: includeDeleted === 'true',
    });
    // relation-load options separately for detail endpoint
    const options = await this.svc['prisma'].productOption.findMany({
      where: { masterId: id, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
    return MasterWithOptionsSchema.parse(
      toSerializable({ ...row, options }),
    );
  }

  @Get('by-code/:code')
  async findByCode(
    @CurrentCompany() companyId: string,
    @Param('code') code: string,
  ): Promise<Master> {
    return MasterSchema.parse(toSerializable(await this.svc.findByCode(companyId, code)));
  }

  @Get('by-legacy/:legacyCode')
  async findByLegacy(
    @CurrentCompany() companyId: string,
    @Param('legacyCode') legacyCode: string,
  ): Promise<Master> {
    return MasterSchema.parse(toSerializable(await this.svc.findByLegacy(companyId, legacyCode)));
  }

  @Patch(':id')
  async update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMasterDto,
  ): Promise<Master> {
    const row = await this.svc.update(companyId, id, dto);
    return MasterSchema.parse(toSerializable(row));
  }

  @Delete(':id')
  async softDelete(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.svc.softDelete(companyId, id);
    return { ok: true };
  }

  @Post(':id/restore')
  async restore(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.svc.restore(companyId, id);
    return { ok: true };
  }
}
```

### Step 3-10: Run integration tests — verify PASS

```bash
cd /Users/yhc125/workspace/kiditem
npm run db:test:prepare
cd apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/masters.service.pg.integration.spec.ts
```

Expected: PASS 7/7.

### Step 3-11: Products-only tsc PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors.

### Step 3-12: Commit Task 3

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/dto/create-master.dto.ts \
        apps/server/src/products/dto/update-master.dto.ts \
        apps/server/src/products/dto/list-masters.query.ts \
        apps/server/src/products/services/masters.service.ts \
        apps/server/src/products/controllers/masters.controller.ts \
        apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts \
        apps/server/src/products/products.module.ts \
        apps/server/src/test-helpers/real-prisma.ts
git commit -m "feat(products): Masters CRUD + soft-delete/restore (Plan B1 T3)"
```

---

## Task 4: Options (controller + service + DTOs + integration tests + race test)

**Files:**
- Create: `apps/server/src/products/dto/create-option.dto.ts`
- Create: `apps/server/src/products/dto/update-option.dto.ts`
- Create: `apps/server/src/products/dto/list-options.query.ts`
- Create: `apps/server/src/products/services/options.service.ts`
- Create: `apps/server/src/products/controllers/options.controller.ts`
- Create: `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`

### Step 4-1: Create `dto/create-option.dto.ts`

```typescript
// apps/server/src/products/dto/create-option.dto.ts
import {
  IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';

export class CreateOptionDto {
  @IsUUID()
  masterId!: string;

  @IsOptional() @IsString() @MaxLength(200)
  optionName?: string;

  @IsOptional() @Matches(/^\d{13}$/, { message: 'barcode must be 13 digits (EAN13)' })
  barcode?: string;

  @IsOptional() @IsString() @MaxLength(100)
  legacyCode?: string;

  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @IsOptional() @IsInt() @Min(0)
  costPrice?: number;

  @IsOptional() @IsInt() @Min(0)
  sellPrice?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  commissionRate?: number;

  @IsOptional() @IsInt() @Min(0)
  shippingCost?: number;

  @IsOptional() @IsInt() @Min(0)
  otherCost?: number;

  @IsOptional() @IsBoolean()
  isBundle?: boolean;

  @IsOptional() @IsBoolean()
  isTemporary?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ValidateIf(o => o.isTemporary === true)
  @IsString() @IsNotEmpty()
  temporaryReason?: string;
}
```

### Step 4-2: Create `dto/update-option.dto.ts`

```typescript
// apps/server/src/products/dto/update-option.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateOptionDto } from './create-option.dto';

export class UpdateOptionDto extends PartialType(CreateOptionDto) {}
```

### Step 4-3: Create `dto/list-options.query.ts`

```typescript
// apps/server/src/products/dto/list-options.query.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListOptionsQuery {
  @IsOptional() @IsUUID()
  masterId?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isBundle?: boolean;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isDeleted?: boolean;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isTemporary?: boolean;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  includeDeleted?: boolean;
}
```

### Step 4-4: Write failing integration tests

Create `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { MasterCodeService } from '../services/master-code.service';
import { MastersService } from '../services/masters.service';
import { OptionsService } from '../services/options.service';
// BundleStockService is needed as dep by OptionsService for soft-delete recompute cascade
import { BundleStockService } from '../services/bundle-stock.service';
import {
  makeTestPrisma, resetDb, seedBaseFixture, TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('OptionsService integration', () => {
  let prisma: PrismaClient;
  let mastersSvc: MastersService;
  let bundleStockSvc: BundleStockService;
  let svc: OptionsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    const codeSvc = new MasterCodeService(prisma as any);
    mastersSvc = new MastersService(prisma as any, codeSvc);
    bundleStockSvc = new BundleStockService(prisma as any);
    svc = new OptionsService(prisma as any, bundleStockSvc);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates an option with auto-generated sku', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M1' } as any);
    const opt = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'Red' } as any);
    expect(opt.sku).toBe(`${m.code}-01`);
    expect(opt.availableStock).toBeNull();
    expect(opt.isBundle).toBe(false);
  });

  it('increments counter for subsequent options', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M2' } as any);
    const o1 = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'A' } as any);
    const o2 = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'B' } as any);
    expect(o1.sku).toBe(`${m.code}-01`);
    expect(o2.sku).toBe(`${m.code}-02`);
  });

  it('fails option creation on soft-deleted master (TOCTOU guarded)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M3' } as any);
    await mastersSvc.softDelete(TEST_COMPANY_ID, m.id);
    await expect(
      svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'X' } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('enforces partial-unique index for null optionName (single-option)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M4' } as any);
    await svc.create(TEST_COMPANY_ID, { masterId: m.id } as any); // optionName: null
    await expect(
      svc.create(TEST_COMPANY_ID, { masterId: m.id } as any),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('race: 10 concurrent creates → 10 distinct sku with no collisions (gaps allowed)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M5' } as any);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }).map((_, i) =>
        svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: `Opt-${i}` } as any),
      ),
    );
    const fulfilled = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);
    expect(fulfilled.length).toBe(10);
    const skus = new Set(fulfilled.map(o => o.sku));
    expect(skus.size).toBe(10);
  });

  it('prevents isBundle flip true → false when BundleComponent rows exist', async () => {
    // setup: master + 2 options + make o1 bundle with o2 as component
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M6' } as any);
    const bundle = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'Bundle', isBundle: true } as any);
    const comp = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'Comp' } as any);
    await prisma.bundleComponent.create({
      data: {
        bundleOptionId: bundle.id,
        componentOptionId: comp.id,
        companyId: TEST_COMPANY_ID,
        qty: 1,
      },
    });
    await expect(
      svc.update(TEST_COMPANY_ID, bundle.id, { isBundle: false } as any),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('triggers recompute on bundles when component option is soft-deleted', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M7' } as any);
    const bundle = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'B', isBundle: true } as any);
    const comp = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'C' } as any);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 10 },
    });
    await prisma.bundleComponent.create({
      data: { bundleOptionId: bundle.id, componentOptionId: comp.id, companyId: TEST_COMPANY_ID, qty: 2 },
    });
    await bundleStockSvc.recompute(bundle.id);
    const before = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(before.availableStock).toBe(5);  // floor(10/2)

    await svc.softDelete(TEST_COMPANY_ID, comp.id);
    const after = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(after.availableStock).toBe(0);  // soft-deleted component excluded
  });
});
```

### Step 4-5: Run test — FAIL

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/options.service.pg.integration.spec.ts
```

Expected: FAIL — missing `options.service` and `bundle-stock.service`.

### Step 4-6: Implement `services/options.service.ts`

```typescript
// apps/server/src/products/services/options.service.ts
import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductOption } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BundleStockService } from './bundle-stock.service';
import { CreateOptionDto } from '../dto/create-option.dto';
import { UpdateOptionDto } from '../dto/update-option.dto';
import { ListOptionsQuery } from '../dto/list-options.query';
import { mapPrismaError } from '../util/prisma-error';
import { decodeCursor, encodeCursor } from '../util/cursor';

const SYSTEM_FIELDS = [
  'id', 'sku', 'companyId', 'availableStock',
  'isDeleted', 'deletedAt', 'createdAt', 'updatedAt',
] as const;

@Injectable()
export class OptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  async create(companyId: string, dto: CreateOptionDto, outerTx?: Prisma.TransactionClient): Promise<ProductOption> {
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
      try {
        return await tx.productOption.create({
          data: {
            ...this.strip(dto),
            companyId,
            masterId: dto.masterId,
            sku,
            availableStock: null,
          },
        });
      } catch (e) { mapPrismaError(e, 'option create'); }
    };
    return outerTx ? exec(outerTx) : this.prisma.$transaction(exec);
  }

  async list(companyId: string, q: ListOptionsQuery) {
    const limit = q.limit ?? 50;
    const where: Prisma.ProductOptionWhereInput = {
      companyId,
      ...(q.includeDeleted ? {} : { isDeleted: false }),
      ...(q.masterId ? { masterId: q.masterId } : {}),
      ...(q.isBundle !== undefined ? { isBundle: q.isBundle } : {}),
      ...(q.isDeleted !== undefined ? { isDeleted: q.isDeleted } : {}),
      ...(q.isTemporary !== undefined ? { isTemporary: q.isTemporary } : {}),
      ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
      ...(q.search
        ? {
            OR: [
              { sku: { contains: q.search, mode: 'insensitive' } },
              { barcode: { contains: q.search } },
              { optionName: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q.cursor
        ? (() => {
            const c = decodeCursor(q.cursor!);
            return {
              OR: [
                { createdAt: { lt: new Date(c.createdAt) } },
                { createdAt: new Date(c.createdAt), id: { lt: c.id } },
              ],
            };
          })()
        : {}),
    };
    const rows = await this.prisma.productOption.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit
      ? encodeCursor({
          createdAt: items[items.length - 1].createdAt.toISOString(),
          id: items[items.length - 1].id,
        })
      : null;
    return { items, nextCursor };
  }

  async findById(companyId: string, id: string, opts: { includeDeleted?: boolean }): Promise<ProductOption> {
    const row = await this.prisma.productOption.findFirst({
      where: { id, companyId, ...(opts.includeDeleted ? {} : { isDeleted: false }) },
    });
    if (!row) throw new NotFoundException('option not found');
    return row;
  }

  async findBySku(companyId: string, sku: string): Promise<ProductOption> {
    const row = await this.prisma.productOption.findUnique({ where: { sku } });
    if (!row || row.companyId !== companyId) {
      throw new NotFoundException('option not found');
    }
    return row;
  }

  async findByBarcode(companyId: string, barcode: string): Promise<ProductOption> {
    const row = await this.prisma.productOption.findUnique({
      where: { companyId_barcode: { companyId, barcode } },
    });
    if (!row) throw new NotFoundException('option not found');
    return row;
  }

  async update(companyId: string, id: string, dto: UpdateOptionDto, outerTx?: Prisma.TransactionClient): Promise<ProductOption> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const current = await tx.productOption.findFirst({
        where: { id, companyId, isDeleted: false },
      });
      if (!current) throw new NotFoundException('option not found');

      // isBundle flip rules
      if (dto.isBundle !== undefined && dto.isBundle !== current.isBundle) {
        if (dto.isBundle === false) {
          const countAsBundle = await tx.bundleComponent.count({
            where: { bundleOptionId: id },
          });
          if (countAsBundle > 0) {
            throw new ConflictException('bundle has components; cannot set isBundle=false');
          }
        } else {
          const countAsComponent = await tx.bundleComponent.count({
            where: { componentOptionId: id },
          });
          if (countAsComponent > 0) {
            throw new ConflictException('option is used as component; cannot set isBundle=true');
          }
        }
      }

      const stripped = this.strip(dto);
      const data: Prisma.ProductOptionUpdateInput = { ...stripped };
      if (dto.isTemporary === false) data.temporaryReason = null;
      try {
        const { count } = await tx.productOption.updateMany({
          where: { id, companyId, isDeleted: false },
          data,
        });
        if (count === 0) throw new NotFoundException('option not found');
        return await tx.productOption.findUniqueOrThrow({ where: { id } });
      } catch (e) { mapPrismaError(e, 'option update'); }
    };
    return outerTx ? exec(outerTx) : this.prisma.$transaction(exec);
  }

  async softDelete(companyId: string, id: string, outerTx?: Prisma.TransactionClient): Promise<void> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.productOption.updateMany({
        where: { id, companyId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('option not found');
      // Cascade: recompute any bundle that uses this option as a component
      const affected = await tx.bundleComponent.findMany({
        where: { componentOptionId: id },
        select: { bundleOptionId: true },
      });
      for (const row of affected) {
        await this.bundleStock.recompute(row.bundleOptionId, tx);
      }
    };
    await (outerTx ? exec(outerTx) : this.prisma.$transaction(exec));
  }

  async restore(companyId: string, id: string, outerTx?: Prisma.TransactionClient): Promise<void> {
    const db = outerTx ?? this.prisma;
    const row = await db.productOption.findFirst({
      where: { id, companyId, isDeleted: true },
    });
    if (!row) throw new NotFoundException('option not found or not deleted');
    try {
      await db.productOption.update({
        where: { id },
        data: { isDeleted: false, deletedAt: null },
      });
    } catch (e) { mapPrismaError(e, 'option restore'); }
  }

  private strip(dto: Partial<CreateOptionDto> | Partial<UpdateOptionDto>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...dto };
    for (const f of SYSTEM_FIELDS) delete out[f as string];
    return out;
  }
}
```

### Step 4-7: Stub `services/bundle-stock.service.ts` (minimal for tests)

Task 5 implements full logic. For now a stub that satisfies OptionsService tests:

```typescript
// apps/server/src/products/services/bundle-stock.service.ts — TASK 4 STUB (replaced in Task 5)
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BundleStockService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(bundleOptionId: string, outerTx?: Prisma.TransactionClient): Promise<number> {
    const db = outerTx ?? this.prisma;
    await db.$queryRaw`SELECT id FROM product_options WHERE id = ${bundleOptionId}::uuid FOR UPDATE`;
    const components = await db.bundleComponent.findMany({
      where: { bundleOptionId, componentOption: { isDeleted: false } },
      include: { componentOption: { include: { inventory: true } } },
    });
    if (components.length === 0) {
      await db.productOption.update({ where: { id: bundleOptionId }, data: { availableStock: 0 } });
      return 0;
    }
    const capacity = Math.min(...components.map(c => {
      const stock = c.componentOption.inventory?.currentStock ?? 0;
      return Math.floor(stock / c.qty);
    }));
    await db.productOption.update({ where: { id: bundleOptionId }, data: { availableStock: capacity } });
    return capacity;
  }
}
```

(Task 5 will re-use this exact implementation + add unit test.)

### Step 4-8: Implement `controllers/options.controller.ts`

```typescript
// apps/server/src/products/controllers/options.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  ProductOptionSchema, OptionWithComponentsSchema, BundleComponentSchema,
  type ProductOption, type OptionWithComponents, type BundleComponent,
  toSerializable,
} from '@kiditem/shared';
import { OptionsService } from '../services/options.service';
import { CreateOptionDto } from '../dto/create-option.dto';
import { UpdateOptionDto } from '../dto/update-option.dto';
import { ListOptionsQuery } from '../dto/list-options.query';

@Controller('products/options')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class OptionsController {
  constructor(private readonly svc: OptionsService) {}

  @Post()
  async create(@CurrentCompany() companyId: string, @Body() dto: CreateOptionDto): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.create(companyId, dto)));
  }

  @Get()
  async list(@CurrentCompany() companyId: string, @Query() q: ListOptionsQuery) {
    const { items, nextCursor } = await this.svc.list(companyId, q);
    return {
      items: items.map(r => ProductOptionSchema.parse(toSerializable(r))),
      nextCursor,
    };
  }

  @Get(':id')
  async findById(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<OptionWithComponents> {
    const row = await this.svc.findById(companyId, id, { includeDeleted: includeDeleted === 'true' });
    const components = await this.svc['prisma'].bundleComponent.findMany({
      where: { bundleOptionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return OptionWithComponentsSchema.parse(toSerializable({ ...row, components }));
  }

  @Get('by-sku/:sku')
  async findBySku(@CurrentCompany() companyId: string, @Param('sku') sku: string): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.findBySku(companyId, sku)));
  }

  @Get('by-barcode/:barcode')
  async findByBarcode(@CurrentCompany() companyId: string, @Param('barcode') barcode: string): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.findByBarcode(companyId, barcode)));
  }

  @Get(':id/components')
  async components(@CurrentCompany() companyId: string, @Param('id') id: string): Promise<BundleComponent[]> {
    await this.svc.findById(companyId, id, {});  // enforce company scope
    const rows = await this.svc['prisma'].bundleComponent.findMany({
      where: { bundleOptionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(r => BundleComponentSchema.parse(toSerializable(r)));
  }

  @Patch(':id')
  async update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOptionDto,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.update(companyId, id, dto)));
  }

  @Delete(':id')
  async softDelete(@CurrentCompany() companyId: string, @Param('id') id: string) {
    await this.svc.softDelete(companyId, id);
    return { ok: true };
  }

  @Post(':id/restore')
  async restore(@CurrentCompany() companyId: string, @Param('id') id: string) {
    await this.svc.restore(companyId, id);
    return { ok: true };
  }
}
```

### Step 4-9: Register OptionsService + BundleStockService + OptionsController in products.module.ts

```typescript
// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';
import { MastersService } from './services/masters.service';
import { OptionsService } from './services/options.service';
import { BundleStockService } from './services/bundle-stock.service';
import { MastersController } from './controllers/masters.controller';
import { OptionsController } from './controllers/options.controller';

@Module({
  controllers: [MastersController, OptionsController],
  providers: [MasterCodeService, MastersService, OptionsService, BundleStockService],
  exports: [MastersService, OptionsService],
})
export class ProductsModule {}
```

### Step 4-10: Run integration tests — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/options.service.pg.integration.spec.ts
```

Expected: PASS 7/7.

### Step 4-11: Products-only tsc PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors.

### Step 4-12: Commit Task 4

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/dto/create-option.dto.ts \
        apps/server/src/products/dto/update-option.dto.ts \
        apps/server/src/products/dto/list-options.query.ts \
        apps/server/src/products/services/options.service.ts \
        apps/server/src/products/services/bundle-stock.service.ts \
        apps/server/src/products/controllers/options.controller.ts \
        apps/server/src/products/__tests__/options.service.pg.integration.spec.ts \
        apps/server/src/products/products.module.ts
git commit -m "feat(products): Options CRUD + race-free sku generation (Plan B1 T4)"
```

---

## Task 5: BundleComponents + BundleStockService (finalize + unit tests)

**Files:**
- Create: `apps/server/src/products/dto/create-bundle-component.dto.ts`
- Create: `apps/server/src/products/dto/update-bundle-component.dto.ts`
- Create: `apps/server/src/products/dto/list-bundle-components.query.ts`
- Create: `apps/server/src/products/services/bundle-components.service.ts`
- Create: `apps/server/src/products/controllers/bundle-components.controller.ts`
- Create: `apps/server/src/products/__tests__/bundle-stock.service.spec.ts`
- Create: `apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`

### Step 5-1: Create bundle-component DTOs

`dto/create-bundle-component.dto.ts`:

```typescript
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateBundleComponentDto {
  @IsUUID()
  bundleOptionId!: string;

  @IsUUID()
  componentOptionId!: string;

  @IsInt() @Min(1)
  qty!: number;
}
```

`dto/update-bundle-component.dto.ts`:

```typescript
import { IsInt, Min } from 'class-validator';

export class UpdateBundleComponentDto {
  @IsInt() @Min(1)
  qty!: number;
}
```

`dto/list-bundle-components.query.ts`:

```typescript
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class ListBundleComponentsQuery {
  @IsOptional() @IsUUID()
  bundleOptionId?: string;

  @IsOptional() @IsUUID()
  componentOptionId?: string;

  @ValidateIf(o => !o.bundleOptionId && !o.componentOptionId)
  missingFilter?: never;  // forces 400 if neither supplied — see service validation
}
```

Service validates at runtime that at least one of the two UUIDs is present.

### Step 5-2: Write BundleStockService unit tests

`__tests__/bundle-stock.service.spec.ts`:

```typescript
import { BundleStockService } from '../services/bundle-stock.service';

function makePrismaMock(components: Array<{ qty: number; currentStock: number | null }>) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    bundleComponent: {
      findMany: vi.fn().mockResolvedValue(
        components.map((c, i) => ({
          id: `c${i}`,
          qty: c.qty,
          componentOption: {
            isDeleted: false,
            inventory: c.currentStock !== null ? { currentStock: c.currentStock } : null,
          },
        })),
      ),
    },
    productOption: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('BundleStockService', () => {
  it('sets availableStock=0 when no components', async () => {
    const prisma = makePrismaMock([]);
    const svc = new BundleStockService(prisma);
    const result = await svc.recompute('bundle-1');
    expect(result).toBe(0);
    expect(prisma.productOption.update).toHaveBeenCalledWith({
      where: { id: 'bundle-1' },
      data: { availableStock: 0 },
    });
  });

  it('computes min(floor(stock/qty)) across components', async () => {
    const prisma = makePrismaMock([
      { qty: 1, currentStock: 10 }, // 10 bundles
      { qty: 2, currentStock: 5 },  // 2 bundles (floor(5/2))
    ]);
    const svc = new BundleStockService(prisma);
    expect(await svc.recompute('b')).toBe(2);
  });

  it('treats missing inventory as stock=0 (capacity=0)', async () => {
    const prisma = makePrismaMock([
      { qty: 1, currentStock: 10 },
      { qty: 1, currentStock: null },  // no inventory row
    ]);
    const svc = new BundleStockService(prisma);
    expect(await svc.recompute('b')).toBe(0);
  });

  it('excludes soft-deleted components via where filter', async () => {
    // This test verifies that the where clause passed to findMany includes `componentOption.isDeleted: false`
    const prisma = makePrismaMock([{ qty: 1, currentStock: 5 }]);
    const svc = new BundleStockService(prisma);
    await svc.recompute('b');
    const arg = (prisma.bundleComponent.findMany as any).mock.calls[0][0];
    expect(arg.where.componentOption).toEqual({ isDeleted: false });
  });
});
```

### Step 5-3: Run unit tests

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/bundle-stock.service.spec.ts
```

Expected: PASS 4/4 (Task 4's stub already satisfies these — confirms the stub was correct).

### Step 5-4: Write failing integration tests

`__tests__/bundle-components.service.pg.integration.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { MasterCodeService } from '../services/master-code.service';
import { MastersService } from '../services/masters.service';
import { OptionsService } from '../services/options.service';
import { BundleStockService } from '../services/bundle-stock.service';
import { BundleComponentsService } from '../services/bundle-components.service';
import {
  makeTestPrisma, resetDb, seedBaseFixture,
  TEST_COMPANY_ID, OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('BundleComponentsService integration', () => {
  let prisma: PrismaClient;
  let mastersSvc: MastersService;
  let optionsSvc: OptionsService;
  let bundleStockSvc: BundleStockService;
  let svc: BundleComponentsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    const codeSvc = new MasterCodeService(prisma as any);
    mastersSvc = new MastersService(prisma as any, codeSvc);
    bundleStockSvc = new BundleStockService(prisma as any);
    optionsSvc = new OptionsService(prisma as any, bundleStockSvc);
    svc = new BundleComponentsService(prisma as any, bundleStockSvc);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  async function setupMasterAndOptions(companyId: string) {
    const m = await mastersSvc.create(companyId, { name: 'M' } as any);
    const bundle = await optionsSvc.create(companyId, { masterId: m.id, optionName: 'Bundle', isBundle: true } as any);
    const comp = await optionsSvc.create(companyId, { masterId: m.id, optionName: 'Comp' } as any);
    return { master: m, bundle, comp };
  }

  it('creates a bundle component and triggers recompute', async () => {
    const { bundle, comp } = await setupMasterAndOptions(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    expect(bc.companyId).toBe(TEST_COMPANY_ID);
    const updated = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(updated.availableStock).toBe(10); // floor(20/2)
  });

  it('rejects when bundleOption.isBundle=false', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M' } as any);
    const notBundle = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'X' } as any);
    const comp = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'Y' } as any);
    await expect(
      svc.create(TEST_COMPANY_ID, { bundleOptionId: notBundle.id, componentOptionId: comp.id, qty: 1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects nested bundle (component.isBundle=true)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M' } as any);
    const b1 = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'B1', isBundle: true } as any);
    const b2 = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'B2', isBundle: true } as any);
    await expect(
      svc.create(TEST_COMPANY_ID, { bundleOptionId: b1.id, componentOptionId: b2.id, qty: 1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects cross-company component', async () => {
    const { bundle } = await setupMasterAndOptions(TEST_COMPANY_ID);
    const other = await setupMasterAndOptions(OTHER_COMPANY_ID);
    await expect(
      svc.create(TEST_COMPANY_ID, { bundleOptionId: bundle.id, componentOptionId: other.comp.id, qty: 1 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects self reference', async () => {
    const { bundle } = await setupMasterAndOptions(TEST_COMPANY_ID);
    await expect(
      svc.create(TEST_COMPANY_ID, { bundleOptionId: bundle.id, componentOptionId: bundle.id, qty: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('updates qty and re-recomputes', async () => {
    const { bundle, comp } = await setupMasterAndOptions(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    let bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfter.availableStock).toBe(10);
    await svc.update(TEST_COMPANY_ID, bc.id, { qty: 5 });
    bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfter.availableStock).toBe(4); // floor(20/5)
  });

  it('hard-deletes and re-recomputes', async () => {
    const { bundle, comp } = await setupMasterAndOptions(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    await svc.delete(TEST_COMPANY_ID, bc.id);
    const bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfter.availableStock).toBe(0); // no components left
  });

  it('concurrent recompute — final availableStock deterministic', async () => {
    const { bundle, comp: c1 } = await setupMasterAndOptions(TEST_COMPANY_ID);
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'N' } as any);
    const c2 = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'C2' } as any);
    await prisma.inventory.create({ data: { companyId: TEST_COMPANY_ID, optionId: c1.id, currentStock: 20 } });
    await prisma.inventory.create({ data: { companyId: TEST_COMPANY_ID, optionId: c2.id, currentStock: 30 } });
    await Promise.all([
      svc.create(TEST_COMPANY_ID, { bundleOptionId: bundle.id, componentOptionId: c1.id, qty: 2 }),
      svc.create(TEST_COMPANY_ID, { bundleOptionId: bundle.id, componentOptionId: c2.id, qty: 3 }),
    ]);
    const bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    // min(floor(20/2), floor(30/3)) = min(10, 10) = 10 — deterministic regardless of order
    expect(bundleAfter.availableStock).toBe(10);
  });
});
```

### Step 5-5: Run — FAIL

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/bundle-components.service.pg.integration.spec.ts
```

Expected: FAIL — missing `bundle-components.service`.

### Step 5-6: Implement `services/bundle-components.service.ts`

```typescript
// apps/server/src/products/services/bundle-components.service.ts
import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { BundleComponent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BundleStockService } from './bundle-stock.service';
import { CreateBundleComponentDto } from '../dto/create-bundle-component.dto';
import { UpdateBundleComponentDto } from '../dto/update-bundle-component.dto';
import { ListBundleComponentsQuery } from '../dto/list-bundle-components.query';
import { mapPrismaError } from '../util/prisma-error';

@Injectable()
export class BundleComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  async create(companyId: string, dto: CreateBundleComponentDto, outerTx?: Prisma.TransactionClient): Promise<BundleComponent> {
    if (dto.bundleOptionId === dto.componentOptionId) {
      throw new ConflictException('self-reference');
    }
    const db = outerTx ?? this.prisma;
    const [bundleOpt, compOpt] = await Promise.all([
      db.productOption.findUnique({ where: { id: dto.bundleOptionId } }),
      db.productOption.findUnique({ where: { id: dto.componentOptionId } }),
    ]);
    if (!bundleOpt) throw new NotFoundException('bundle option not found');
    if (!compOpt) throw new NotFoundException('component option not found');
    if (!bundleOpt.isBundle) throw new BadRequestException('option is not a bundle');
    if (compOpt.isBundle) throw new BadRequestException('nested bundle not supported in Plan B1');
    if (bundleOpt.companyId !== companyId) throw new ForbiddenException('cross-company not allowed');
    if (compOpt.companyId !== bundleOpt.companyId) throw new ForbiddenException('cross-company not allowed');

    const exec = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM product_options WHERE id = ${dto.bundleOptionId}::uuid FOR UPDATE`;
      let bc: BundleComponent;
      try {
        bc = await tx.bundleComponent.create({
          data: {
            bundleOptionId: dto.bundleOptionId,
            componentOptionId: dto.componentOptionId,
            qty: dto.qty,
            companyId: bundleOpt.companyId,  // 3-way invariant: from bundleOption, not auth
          },
        });
      } catch (e) { mapPrismaError(e, 'bundle-component create'); }
      await this.bundleStock.recompute(dto.bundleOptionId, tx);
      return bc;
    };
    return outerTx ? exec(outerTx) : this.prisma.$transaction(exec);
  }

  async list(companyId: string, q: ListBundleComponentsQuery): Promise<BundleComponent[]> {
    if (!q.bundleOptionId && !q.componentOptionId) {
      throw new BadRequestException('bundleOptionId or componentOptionId is required');
    }
    return this.prisma.bundleComponent.findMany({
      where: {
        companyId,
        ...(q.bundleOptionId ? { bundleOptionId: q.bundleOptionId } : {}),
        ...(q.componentOptionId ? { componentOptionId: q.componentOptionId } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async update(companyId: string, id: string, dto: UpdateBundleComponentDto, outerTx?: Prisma.TransactionClient): Promise<BundleComponent> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const row = await tx.bundleComponent.findFirst({ where: { id, companyId } });
      if (!row) throw new NotFoundException('bundle-component not found');
      await tx.$queryRaw`SELECT id FROM product_options WHERE id = ${row.bundleOptionId}::uuid FOR UPDATE`;
      const updated = await tx.bundleComponent.update({
        where: { id },
        data: { qty: dto.qty },
      });
      await this.bundleStock.recompute(row.bundleOptionId, tx);
      return updated;
    };
    return outerTx ? exec(outerTx) : this.prisma.$transaction(exec);
  }

  async delete(companyId: string, id: string, outerTx?: Prisma.TransactionClient): Promise<void> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const row = await tx.bundleComponent.findFirst({ where: { id, companyId } });
      if (!row) throw new NotFoundException('bundle-component not found');
      await tx.$queryRaw`SELECT id FROM product_options WHERE id = ${row.bundleOptionId}::uuid FOR UPDATE`;
      await tx.bundleComponent.delete({ where: { id } });
      await this.bundleStock.recompute(row.bundleOptionId, tx);
    };
    await (outerTx ? exec(outerTx) : this.prisma.$transaction(exec));
  }
}
```

### Step 5-7: Implement `controllers/bundle-components.controller.ts`

```typescript
// apps/server/src/products/controllers/bundle-components.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  BundleComponentSchema, type BundleComponent, toSerializable,
} from '@kiditem/shared';
import { BundleComponentsService } from '../services/bundle-components.service';
import { CreateBundleComponentDto } from '../dto/create-bundle-component.dto';
import { UpdateBundleComponentDto } from '../dto/update-bundle-component.dto';
import { ListBundleComponentsQuery } from '../dto/list-bundle-components.query';

@Controller('products/bundle-components')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class BundleComponentsController {
  constructor(private readonly svc: BundleComponentsService) {}

  @Post()
  async create(@CurrentCompany() companyId: string, @Body() dto: CreateBundleComponentDto): Promise<BundleComponent> {
    return BundleComponentSchema.parse(toSerializable(await this.svc.create(companyId, dto)));
  }

  @Get()
  async list(@CurrentCompany() companyId: string, @Query() q: ListBundleComponentsQuery): Promise<BundleComponent[]> {
    const rows = await this.svc.list(companyId, q);
    return rows.map(r => BundleComponentSchema.parse(toSerializable(r)));
  }

  @Patch(':id')
  async update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBundleComponentDto,
  ): Promise<BundleComponent> {
    return BundleComponentSchema.parse(toSerializable(await this.svc.update(companyId, id, dto)));
  }

  @Delete(':id')
  async delete(@CurrentCompany() companyId: string, @Param('id') id: string) {
    await this.svc.delete(companyId, id);
    return { ok: true };
  }
}
```

### Step 5-8: Register in products.module.ts (final state)

```typescript
// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';
import { MastersService } from './services/masters.service';
import { OptionsService } from './services/options.service';
import { BundleStockService } from './services/bundle-stock.service';
import { BundleComponentsService } from './services/bundle-components.service';
import { MastersController } from './controllers/masters.controller';
import { OptionsController } from './controllers/options.controller';
import { BundleComponentsController } from './controllers/bundle-components.controller';

@Module({
  controllers: [MastersController, OptionsController, BundleComponentsController],
  providers: [
    MasterCodeService, MastersService, OptionsService,
    BundleStockService, BundleComponentsService,
  ],
  exports: [MastersService, OptionsService, BundleComponentsService],
})
export class ProductsModule {}
```

### Step 5-9: Run integration tests — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/bundle-components.service.pg.integration.spec.ts
```

Expected: PASS 8/8.

### Step 5-10: Run full products test suite — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/master-code.service.spec.ts src/products/__tests__/bundle-stock.service.spec.ts
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts src/products/__tests__/
```

Expected: unit 2 files (8 tests) PASS + integration 3 files (22 tests) PASS.

### Step 5-11: Products-only tsc PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors.

### Step 5-12: Commit Task 5

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/dto/create-bundle-component.dto.ts \
        apps/server/src/products/dto/update-bundle-component.dto.ts \
        apps/server/src/products/dto/list-bundle-components.query.ts \
        apps/server/src/products/services/bundle-components.service.ts \
        apps/server/src/products/services/bundle-stock.service.ts \
        apps/server/src/products/controllers/bundle-components.controller.ts \
        apps/server/src/products/__tests__/bundle-stock.service.spec.ts \
        apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts \
        apps/server/src/products/products.module.ts
git commit -m "feat(products): BundleComponents + BundleStockService + recompute (Plan B1 T5)"
```

---

## Task 6: DI spec + RLS tests + pagination stability + helpers

**Files:**
- Create: `apps/server/src/products/__tests__/products.module.di.spec.ts`
- Create: `apps/server/src/products/__tests__/rls.pg.integration.spec.ts`
- Create: `apps/server/src/products/__tests__/pagination.pg.integration.spec.ts`
- Modify: `apps/server/src/test-helpers/real-prisma.ts` — add `withChatbotReadonly`

### Step 6-1: Add `withChatbotReadonly` helper

Append to `apps/server/src/test-helpers/real-prisma.ts`:

```typescript
import { Client } from 'pg';

export async function withChatbotReadonly<T>(
  companyId: string | null,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: 'postgresql://chatbot_readonly:chatbot_readonly@localhost:5434/kiditem_test',
  });
  await client.connect();
  try {
    if (companyId !== null) {
      await client.query(`SET app.company_id = '${companyId}'`);
    }
    return await fn(client);
  } finally {
    await client.end();
  }
}
```

(If `pg` is not already a direct dep of apps/server, ensure it is — it's typically pulled in transitively via Prisma.)

### Step 6-2: Write DI spec — failing (it already works after T5 but this is the first time we verify)

Create `apps/server/src/products/__tests__/products.module.di.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { ProductsModule } from '../products.module';
import { MastersController } from '../controllers/masters.controller';
import { OptionsController } from '../controllers/options.controller';
import { BundleComponentsController } from '../controllers/bundle-components.controller';
import { MastersService } from '../services/masters.service';
import { OptionsService } from '../services/options.service';
import { BundleComponentsService } from '../services/bundle-components.service';
import { MasterCodeService } from '../services/master-code.service';
import { BundleStockService } from '../services/bundle-stock.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ProductsModule DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProductsModule],
    })
      .overrideProvider(PrismaService).useValue({} as any)
      .overrideGuard(AuthGuard('jwt')).useValue({ canActivate: () => true })
      .compile();
    await moduleRef.init();
  });

  afterAll(async () => { await moduleRef.close(); });

  it('resolves all three controllers', () => {
    expect(moduleRef.get(MastersController)).toBeDefined();
    expect(moduleRef.get(OptionsController)).toBeDefined();
    expect(moduleRef.get(BundleComponentsController)).toBeDefined();
  });

  it('resolves all five services', () => {
    expect(moduleRef.get(MastersService)).toBeDefined();
    expect(moduleRef.get(OptionsService)).toBeDefined();
    expect(moduleRef.get(BundleComponentsService)).toBeDefined();
    expect(moduleRef.get(MasterCodeService)).toBeDefined();
    expect(moduleRef.get(BundleStockService)).toBeDefined();
  });
});
```

### Step 6-3: Run DI spec — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/products.module.di.spec.ts
```

Expected: PASS 2/2.

### Step 6-4: Write RLS integration tests

Create `apps/server/src/products/__tests__/rls.pg.integration.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma, resetDb, seedBaseFixture, withChatbotReadonly,
  TEST_COMPANY_ID, OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('RLS — chatbot_readonly', () => {
  let prisma: PrismaClient;

  beforeAll(async () => { prisma = makeTestPrisma(); });
  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    // Seed masters into both companies
    await prisma.masterProduct.create({
      data: { companyId: TEST_COMPANY_ID, code: 'M-00000A01', name: 'A' },
    });
    await prisma.masterProduct.create({
      data: { companyId: OTHER_COMPANY_ID, code: 'M-00000B01', name: 'B' },
    });
  });

  it('master_products — filter set → only own company rows', async () => {
    const rows = await withChatbotReadonly(TEST_COMPANY_ID, async (c) => {
      const r = await c.query('SELECT id, company_id FROM master_products');
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].company_id).toBe(TEST_COMPANY_ID);
  });

  it('master_products — no session variable → 0 rows', async () => {
    const rows = await withChatbotReadonly(null, async (c) => {
      const r = await c.query('SELECT id FROM master_products');
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('product_options — filter set → only own company rows', async () => {
    const rows = await withChatbotReadonly(TEST_COMPANY_ID, async (c) => {
      const r = await c.query('SELECT id, company_id FROM product_options');
      return r.rows;
    });
    expect(rows.every((r: any) => r.company_id === TEST_COMPANY_ID)).toBe(true);
  });

  it('cross-tenant guess — attacker knows B\'s master UUID → 0 rows under A\'s session', async () => {
    const bRow = await prisma.masterProduct.findUniqueOrThrow({ where: { code: 'M-00000B01' } });
    const rows = await withChatbotReadonly(TEST_COMPANY_ID, async (c) => {
      const r = await c.query('SELECT id FROM master_products WHERE id = $1', [bRow.id]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });
});
```

### Step 6-5: Write pagination stability test

Create `apps/server/src/products/__tests__/pagination.pg.integration.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { MasterCodeService } from '../services/master-code.service';
import { MastersService } from '../services/masters.service';
import {
  makeTestPrisma, resetDb, seedBaseFixture, TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('Pagination stability', () => {
  let prisma: PrismaClient;
  let svc: MastersService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    const codeSvc = new MasterCodeService(prisma as any);
    svc = new MastersService(prisma as any, codeSvc);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('cursor stability — paginate with mid-iteration soft-delete', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const m = await svc.create(TEST_COMPANY_ID, { name: `M${i}` } as any);
      ids.push(m.id);
    }
    const page1 = await svc.list(TEST_COMPANY_ID, { limit: 2 } as any);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    // mid-iteration soft-delete of item NOT yet returned
    const notReturned = ids.find(id => !page1.items.some(it => it.id === id))!;
    await svc.softDelete(TEST_COMPANY_ID, notReturned);

    const page2 = await svc.list(TEST_COMPANY_ID, { limit: 2, cursor: page1.nextCursor! } as any);
    // page2 should not contain the soft-deleted item, cursor still works
    expect(page2.items.some(it => it.id === notReturned)).toBe(false);
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page2.items.length).toBeLessThanOrEqual(2);
  });
});
```

### Step 6-6: Run all T6 tests — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/products.module.di.spec.ts
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/rls.pg.integration.spec.ts \
  src/products/__tests__/pagination.pg.integration.spec.ts
```

Expected: PASS (DI 2 + RLS 4 + pagination 1).

### Step 6-7: Commit Task 6

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/__tests__/products.module.di.spec.ts \
        apps/server/src/products/__tests__/rls.pg.integration.spec.ts \
        apps/server/src/products/__tests__/pagination.pg.integration.spec.ts \
        apps/server/src/test-helpers/real-prisma.ts
git commit -m "test(products): DI wiring + RLS 4-matrix + pagination stability (Plan B1 T6)"
```

---

## Task 7: `app.module.ts` registration + 최종 verification

**Files:**
- Modify: `apps/server/src/app.module.ts`

### Step 7-1: Read current `app.module.ts` + find insertion point

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
grep -n "import.*Module" src/app.module.ts | head -20
```

### Step 7-2: Add ProductsModule import

Edit `apps/server/src/app.module.ts`:

```typescript
import { ProductsModule } from './products/products.module';

// ...

@Module({
  imports: [
    // ... alphabetical insertion
    ProductsModule,
    // ...
  ],
})
export class AppModule {}
```

### Step 7-3: Confirm products-only tsc still PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors.

### Step 7-4: Confirm full-server tsc still fails at ~similar count (expected)

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: ~400-450 errors. Should NOT be higher than Plan B1 baseline (T1 Step 1-8). Products module adds 0 errors.

### Step 7-5: Run full Plan B1 test suite

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
# Unit
npx vitest run src/products/__tests__/master-code.service.spec.ts \
                src/products/__tests__/bundle-stock.service.spec.ts \
                src/products/__tests__/products.module.di.spec.ts
# Integration
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts src/products/__tests__/
```

Expected: all green.

### Step 7-6: Index verification (EXPLAIN check)

```bash
docker exec kiditem-postgres-test psql -U kiditem_test kiditem_test <<'SQL'
-- Seed 10k masters to check index usage
INSERT INTO master_products (id, company_id, code, name, option_counter, created_at, updated_at)
SELECT gen_random_uuid(), 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
       'M-' || LPAD(generate_series::text, 8, '0'),
       'Seeded Master ' || generate_series, 0, NOW(), NOW()
FROM generate_series(1, 10000)
ON CONFLICT DO NOTHING;

EXPLAIN (COSTS OFF)
SELECT * FROM master_products
WHERE company_id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' AND is_deleted = false
ORDER BY created_at DESC, id DESC LIMIT 51;
SQL
```

Expected: `Index Scan` or `Bitmap Heap Scan` using `master_products_companyId_isDeleted_idx` or composite. 만약 `Seq Scan` 나타나면 Plan A schema hotfix 필요 (composite index 추가).

### Step 7-7: Commit Task 7

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/app.module.ts
git commit -m "feat(app): register ProductsModule (Plan B1 T7)"
```

### Step 7-8: Push branch + PR

```bash
cd /Users/yhc125/workspace/kiditem
git push -u origin feat/plan-b1-products-module
```

### Step 7-9: Open draft PR

```bash
gh pr create --draft --title "feat: Plan B1 — Products module (Master+Option+Bundle)" --body "$(cat <<'EOF'
## Summary

Plan B1 of the products-module rebuild. See
[docs/superpowers/specs/2026-04-17-plan-b1-products-module-design.md](docs/superpowers/specs/2026-04-17-plan-b1-products-module-design.md)
and
[docs/superpowers/plans/2026-04-17-plan-b1-products-module.md](docs/superpowers/plans/2026-04-17-plan-b1-products-module.md)
for context.

**Scope**:
- `apps/server/src/products/` 신설 — 3 controllers + 5 services + DTOs + utils + tests
- `@kiditem/shared` product.ts + inventory.ts 재작성 (Master/ProductOption/BundleComponent Zod)
- `toSerializable()` helper 추가 — Prisma row → Zod-parseable plain JSON
- `ProductsModule` 을 `app.module.ts` 에 등록

**Known state after merge**:
- `npm run dev:server` — **여전히 부팅 실패** (expected, Plan B2/B3 전)
- `apps/server` tsc — ~400 에러 (Plan B1 baseline 과 유사; 감소 시작)
- Products module 자체: tsconfig.products.json 으로 PASS, 30+ tests PASS
- `@kiditem/shared` build — PASS

**Does NOT belong in this PR**:
- advertising / orders / inventory service rewrite (Plan B2)
- Dashboard / finance / supply / AI (Plan B3)
- Frontend (Plan D)
- Inventory change → bundle recompute hook (Plan B2의 StockTransaction hook)

**Verification done**:
- [x] `npm run build --workspace=packages/shared` — PASS
- [x] `npx tsc --noEmit --project apps/server/tsconfig.products.json` — PASS (0 errors)
- [x] Unit tests — master-code (4), bundle-stock (4), DI wiring (2) PASS
- [x] Integration tests — masters (7), options (7), bundle-components (8), RLS (4), pagination (1) PASS
- [x] EXPLAIN list queries — index scan (no seq scan on 10k rows)

## Test plan

- [ ] Reviewer: spec + plan 먼저 검토
- [ ] `products/CLAUDE.md` 가 domain 규칙 명확히 담았는지
- [ ] `OptionsService.create` 의 updateMany + findUniqueOrThrow 패턴 검증
- [ ] `BundleStockService.recompute` row-level lock + isDeleted 필터 검증
- [ ] After merge: Plan B2 착수

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned.

---

## Rollback procedure

### Task 1 (@kiditem/shared) 실패 시
- `git reset --hard HEAD~1` → 기존 product.ts 복구
- 또는 critical failure 시 Plan B1 포기하고 Plan B 의 scope 재설계

### Task 2-5 중 테스트 실패 시
- 해당 task 의 commit `git reset --hard HEAD~1` 으로 되돌림
- 원인 분석 후 재시도 (plan 내용 따라가면 compile/test 통과해야)

### Task 7 merge 후 regression 발견
- Plan B1 전체 revert: `git revert <merge-commit>`
- DB schema 는 Plan A 스냅샷 그대로 (이 plan 은 schema 건드리지 않음)

---

## What already exists (재사용)

- `PrismaService` / `PrismaModule` (global) — schema 는 Plan A 가 확정
- `AuthModule` / `@CurrentCompany()` decorator — `/auth/decorators/current-company.decorator.ts`
- `AuthGuard('jwt')` — `@nestjs/passport`
- `GlobalExceptionFilter` — 글로벌 에러 변환
- `test-helpers/real-prisma.ts` — `makeTestPrisma`, `resetDb`, `seedBaseFixture`, `TEST_COMPANY_ID`, `OTHER_COMPANY_ID`
- `vitest.config.integration.ts` — `.pg.integration.spec.ts` 글로브 자동 pickup
- Postgres 부산: `master_code_seq`, `product_options_master_null_option` partial unique, 3 CHECK constraints, 7 RLS policies — 모두 Plan A Task 11 에서 적용됨

## Failure modes

| Scenario | 검증 | 복구 |
|---|---|---|
| `@kiditem/shared` 재작성 후 자체 build 실패 | T1 Step 1-7 | 삭제한 심볼 중 재-export 누락 확인; two-barrel 동기화 재점검 |
| products tsc 실패 | T2/3/4/5 Step tsc | Plan 내 method signature 타입 수정; DTO import 확인 |
| race test 실패 (sku 충돌) | T4 Step 4-10 | `updateMany` 가 row-level lock 을 제대로 획득하는지 확인; Postgres isolation level 확인 (READ COMMITTED 기본은 충분) |
| Bundle recompute concurrent 결과 non-deterministic | T5 Step 5-9 | `SELECT ... FOR UPDATE` lock 문이 tx 안에서 실행되는지 확인 |
| RLS 테스트에서 row 노출 | T6 Step 6-6 | `chatbot_readonly` 유저가 테스트 DB 에 존재 + `app.company_id` GUC 세션 변수 설정 확인 |
| EXPLAIN seq scan | T7 Step 7-6 | Plan A schema hotfix: 필요한 composite index 추가 PR (Plan B1 외 별도 작업) |

## NOT in scope (후속 plan)

- advertising / orders / inventory service (productId → listingId/optionId rewrite) — Plan B2
- dashboard / finance / supply / AI services — Plan B3
- Full NestJS HTTP integration tests (supertest + app.init) — Plan B3
- Frontend pages — Plan D
- Wing 이관 + 새 init.sql.gz — Plan C
- MCP tool layer (Master/Option 검색용) — 장기 로드맵
- Nested bundle 허용 + BFS cycle detection — Plan B3 검토
- DB CHECK constraint for nested-bundle — Plan B3 hardening
- `BundleComponent` cross-company DB CHECK — Plan B3 hardening
- Event-driven recompute (EventEmitter2 기반) — Plan B2 인벤토리 hook 설계 시 재평가

---

## Execution Handoff

Plan B1 complete and saved to `docs/superpowers/plans/2026-04-17-plan-b1-products-module.md`.

**Execution options**:

**1. Subagent-Driven (recommended for single-actor workflow)** — Task 1-7 각각 fresh subagent dispatch. Task 간 spec compliance review + code quality review. 현 세션 context 보호.

**2. TeamCreate (recommended for parallel T3+T4)** — CLAUDE.md 의 TeamCreate workflow. 1 team, `kiditem-implementer × 3` (T3/T4/T5 분배), `kiditem-reviewer × 2` (MODE: spec + MODE: quality), `kiditem-qa-verifier × 1`. Team 내 직접 DM 으로 review loop.

**3. Inline Execution** — 현 세션에서 순차 실행 (writing-plans skill 기본). Context 부담 큼.

**어느 방식?**
