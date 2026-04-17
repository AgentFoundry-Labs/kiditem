# Plan B1 — Products Module Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. TeamCreate workflow 도 가능 (아래 Execution Handoff 참조) — 단 **T3/T4/T5 는 병렬 불가, sequential dispatch 만**. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Plan A 이후 공백 상태인 products NestJS module 을 3-layer (Master + Option + BundleComponent) 로 재구축 + `@kiditem/shared` 의 `product.ts` / `inventory.ts` Zod schema 재작성으로 Plan B2/B3 의 기반을 제공한다.

**Architecture:** flat module structure (`apps/server/src/products/` = controllers/ + services/ + dto/ + util/ + __tests__/). RESTful resource-per-layer API (`/api/products/masters`, `/api/products/options`, `/api/products/bundle-components`). **No per-controller `@UseGuards` / `@UsePipes`** — 프로젝트 관행은 전역 `CompanyScopeGuard` (via `APP_GUARD`, `app.module.ts:103`) + 전역 `ValidationPipe` (via `main.ts:58-61`). Controller 는 `@CurrentCompany()` 데코레이터만 사용 (`auth/CLAUDE.md` "Hard bans"). Boot strategy C — `app.module.ts` 에 등록하되 `dev:server` 는 Plan B3 까지 부팅 불가. 검증은 integration tests (real-prisma.ts) + DI wiring spec (`Test.createTestingModule`).

**Tech Stack:** NestJS 11, Prisma v7 (multi-file, 3-layer schema from Plan A), class-validator, Zod (`@kiditem/shared` — zod only, no `@prisma/client` 의존성), Postgres 17 (`master_code_seq` + RLS + 3 CHECK constraints already applied via `prisma/3layer-setup.sql`), vitest (unit + integration tiers — **globals 비활성, 명시적 import 필요**).

**Related:**
- Spec: [docs/superpowers/specs/2026-04-17-plan-b1-products-module-design.md](../specs/2026-04-17-plan-b1-products-module-design.md) (v3, user-approved)
- ADR: [0013-product-schema-3layer](../../../.claude/docs/decisions/0013-product-schema-3layer.md)
- Plan A: [2026-04-17-plan-a-schema-transition.md](2026-04-17-plan-a-schema-transition.md) (merged PR #25)
- Successor: Plan B2 (advertising/orders/inventory) → Plan B3 (dashboard/finance/supply/AI/tests)

## Key conventions (read before dispatching)

Fresh subagent 가 따라야 할 프로젝트 관행:

| 영역 | 패턴 | Reference |
|---|---|---|
| Auth | 전역 `CompanyScopeGuard` (APP_GUARD, `app.module.ts:103`). **Controller 에 `@UseGuards` 금지** | `auth/CLAUDE.md` hard-bans table |
| Validation | 전역 `ValidationPipe({whitelist:true, transform:true})` (`main.ts:58-61`). **Controller 에 `@UsePipes` 금지** | `main.ts` |
| Current company | `@CurrentCompany()` decorator | `auth/decorators/current-company.decorator.ts` |
| Error mapping | `GlobalExceptionFilter` 이미 등록. Service 에서 NestJS Exception throw | `apps/server/CLAUDE.md` |
| vitest imports | `globals` 꺼져있음 — `import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'` 명시 필수 | `vitest.config.ts`, 기존 `alerts.service.spec.ts` 등 참조 |
| Integration tests | `.pg.integration.spec.ts` + `__tests__/` 위치 | `vitest.config.integration.ts:28-30` |
| Integration execution | `fileParallelism:false, isolate:false` + `resetDb()` in beforeEach = **serial 강제**. 병렬 dispatch 금지 | `vitest.config.integration.ts:34-37` |
| Prisma connect | `beforeAll` 에서 `await prisma.$connect()` 호출 | `panel-pr3.pg.integration.spec.ts` |
| `@kiditem/shared` deps | `zod` only — `@prisma/client` import 금지 | `packages/shared/package.json` |
| Controller sample | `orders/orders.controller.ts` — no `@UseGuards`, no `@UsePipes`, `@CurrentCompany()` 사용 | |

---

## Plan B1 완료 시점 상태

| 항목 | 상태 |
|---|---|
| `apps/server/src/products/` module | 신설 — 3 controllers + 5 services + DTOs + utils + tests |
| `@kiditem/shared/src/schemas/product.ts` | 재작성 — Master/ProductOption/BundleComponent Zod |
| `@kiditem/shared/src/schemas/inventory.ts` | 재작성 — Inventory Zod (optionId 기반) |
| `@kiditem/shared/src/index.ts` + `src/schemas/index.ts` | 두 barrel 동기화 |
| `apps/server/src/app.module.ts` | `ProductsModule` 등록 |
| `npm run build --workspace=packages/shared` | PASS |
| Products-only tsc (`tsconfig.products.json`) | PASS |
| Unit tests (master-code, bundle-stock, serialize, DI) | PASS |
| Integration tests (3 `.pg.integration.spec.ts` + RLS + pagination) | PASS |
| `npm run dev:server` | 여전히 부팅 실패 (expected — Plan B3 대상) |
| `apps/server` 전체 tsc | 여전히 실패 (expected — Plan B2/B3 대상) |

---

## File Structure

### Created (apps/server)
- `apps/server/src/products/products.module.ts`
- `apps/server/src/products/CLAUDE.md`
- `apps/server/src/products/controllers/{masters,options,bundle-components}.controller.ts`
- `apps/server/src/products/services/{masters,options,bundle-components,master-code,bundle-stock}.service.ts`
- `apps/server/src/products/util/prisma-error.ts`
- `apps/server/src/products/util/cursor.ts`
- `apps/server/src/products/util/serialize.ts` — `toSerializable()` 헬퍼 (server-side, duck-typed Decimal)
- `apps/server/src/products/dto/{create,update,list}-{master,option,bundle-component}.dto.ts` (및 list query variant)
- `apps/server/src/products/__tests__/master-code.service.spec.ts` (unit)
- `apps/server/src/products/__tests__/bundle-stock.service.spec.ts` (unit)
- `apps/server/src/products/__tests__/serialize.spec.ts` (unit)
- `apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/rls.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/pagination.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/products.module.di.spec.ts` (unit — `Test.createTestingModule`)
- `apps/server/tsconfig.products.json`

### Modified (apps/server)
- `apps/server/src/app.module.ts` — import ProductsModule
- `apps/server/src/test-helpers/real-prisma.ts` — add `withChatbotReadonly`

### Created / Modified (packages/shared)
- `packages/shared/src/schemas/product.ts` — 완전 재작성
- `packages/shared/src/schemas/inventory.ts` — 완전 재작성
- `packages/shared/src/schemas/index.ts` — 재-export 갱신
- `packages/shared/src/index.ts` — 재-export 갱신

**`packages/shared/src/json.ts` 는 만들지 않는다** (spec 의 이전 제안 철회). `toSerializable` 은 `apps/server/src/products/util/serialize.ts` 로 서버 쪽에 위치 — shared 패키지는 `@prisma/client` 에 의존하면 안 됨.

---

## Task Sequential Order (NOT parallel)

`vitest.config.integration.ts` 의 `fileParallelism:false, isolate:false` 가 통합 테스트를 serial 로 강제하고, 모든 integration spec 의 `resetDb()` 가 DB 전체를 TRUNCATE 한다. 병렬 dispatch 하면 서로 fixture 를 wipe. 또한 T3/T4/T5 모두 `products.module.ts` 를 수정하므로 merge conflict 발생. **Sequential 로만 실행.**

| Task | Prior state | Notes |
|---|---|---|
| T1 — `@kiditem/shared` rewrite | none | T2 와만 서로 독립적 순서 |
| T2 — Foundation (module skeleton + MasterCodeService + utils + serialize) | T1 권장 | T1 의 re-export 를 참조하지만 별개 파일 |
| T3 — Masters | T1 + T2 완료 | `products.module.ts` 에 추가 |
| T4 — Options + BundleStockService 초기 구현 | **T3 완료 후** | `products.module.ts` 에 추가 (T3 편집물 위에) |
| T5 — BundleComponents + BundleStockService unit test | **T4 완료 후** | `products.module.ts` 마지막 추가 |
| T6 — RLS + pagination + DI spec | T3-T5 완료 | `test-helpers/real-prisma.ts` 에 helper 추가 |
| T7 — `app.module.ts` 등록 + 최종 verification | T3-T6 완료 | — |

**TeamCreate 사용 시**: `kiditem-implementer × 1` 로 task 하나씩 claim. 병렬 spawn 금지. `kiditem-reviewer × 2` 는 병렬 OK.

---

## Prerequisites

- [ ] **Step 0-1: Verify branch**

```bash
cd /Users/yhc125/workspace/kiditem
git status --short
git branch --show-current
```

Expected: branch = `feat/plan-b1-products-module`.

- [ ] **Step 0-2: Bring dev + test DBs up with remediation**

```bash
cd /Users/yhc125/workspace/kiditem
# Ensure dev DB
docker ps | grep kiditem-postgres | grep -v test || docker compose up -d postgres
# Ensure test DB + 3layer-setup applied (idempotent script)
npm run db:test:up
npm run db:test:prepare
# Verify both DBs have master_code_seq (from 3layer-setup.sql)
docker exec kiditem-postgres psql -U kiditem kiditem -c "\\ds master_code_seq" | tail -3
docker exec kiditem-postgres-test psql -U kiditem_test kiditem_test -c "\\ds master_code_seq" | tail -3
```

Expected: 두 DB 모두 `master_code_seq` 1 row. 없으면 `npm run db:3layer-setup` (dev), `npm run db:test:prepare` (test) 재실행.

- [ ] **Step 0-3: Verify Prisma client fresh + baseline error count**

```bash
cd /Users/yhc125/workspace/kiditem
npx prisma generate
cd apps/server
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: ~420-470 errors (Plan B1 시작 baseline, Plan A 이후). 이 숫자가 Plan B1 진행 중 줄어들면 OK.

---

## Task 1: `@kiditem/shared` rewrite

**Prior state**: clean branch `feat/plan-b1-products-module`, `packages/shared` 가 기존 stale schema 로 build PASS 상태.

**Files:**
- Modify: `packages/shared/src/schemas/product.ts` (재작성)
- Modify: `packages/shared/src/schemas/inventory.ts` (재작성)
- Modify: `packages/shared/src/schemas/index.ts` (barrel 갱신)
- Modify: `packages/shared/src/index.ts` (barrel 갱신)

**Note**: `packages/shared/src/json.ts` 는 만들지 않음 — `toSerializable` 은 Task 2 의 `apps/server/src/products/util/serialize.ts` 로 위치.

### Step 1-1: Baseline build check

```bash
cd /Users/yhc125/workspace/kiditem
npm run build --workspace=packages/shared 2>&1 | tail -10
```

Expected: PASS (기존 shape).

### Step 1-2: Rewrite `packages/shared/src/schemas/product.ts`

Replace entire file contents:

```typescript
// packages/shared/src/schemas/product.ts
import { z } from 'zod';

// ===== Master (기획 상품 family) =====
export const MasterSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  code: z.string(),
  legacyCode: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  tags: z.array(z.string()),
  optionCounter: z.number().int(),
  thumbnailUrl: z.string().url().nullable(),
  imageUrl: z.string().url().nullable(),
  images: z.array(z.string().url()),
  abcGrade: z.enum(['A', 'B', 'C']).nullable(),
  profitTag: z.string().nullable(),
  adTier: z.string().nullable(),
  adBudgetLimit: z.number().int().nullable(),
  healthScore: z.number().int().nullable(),
  healthUpdatedAt: z.string().datetime().nullable(),
  sourceUrl: z.string().url().nullable(),
  sourcePlatform: z.string().nullable(),
  costCny: z.number().nullable(),
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

export const ProductOptionSchema = z.object({
  id: z.string().uuid(),
  masterId: z.string().uuid(),
  companyId: z.string().uuid(),
  sku: z.string(),
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

export const MasterWithOptionsSchema = MasterSchema.extend({
  options: z.array(ProductOptionSchema),
});
export type MasterWithOptions = z.infer<typeof MasterWithOptionsSchema>;

export const OptionWithComponentsSchema = ProductOptionSchema.extend({
  components: z.array(BundleComponentSchema),
});
export type OptionWithComponents = z.infer<typeof OptionWithComponentsSchema>;
```

### Step 1-3: Rewrite `packages/shared/src/schemas/inventory.ts`

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
  dailySalesAvg: z.number(),
  warehouseLocation: z.string().nullable(),
  lastRestockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Inventory = z.infer<typeof InventorySchema>;
```

### Step 1-4: Update `packages/shared/src/schemas/index.ts`

Read the file first to see other exports (order, profit-loss, workflow 등), **그들은 건드리지 않음**. 제거할 라인:
- `export { TrafficDataSchema, ProductListItemSchema, ProductDetailSchema, PipelineCountsSchema } from './product.js';`
- `export type { TrafficData, ProductListItem, ProductDetail, PipelineCounts } from './product.js';`
- `export { InventoryItemSchema, InventorySummarySchema } from './inventory.js';`
- `export type { InventoryItem, InventorySummary } from './inventory.js';`

추가할 라인:
```typescript
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

### Step 1-5: Update `packages/shared/src/index.ts`

Same pattern. `toSerializable` export 는 없음 (server 전용으로 옮김). 제거할 라인은 `src/schemas/index.ts` 와 동일 심볼들. 추가는 위와 동일.

### Step 1-6: Build shared

```bash
cd /Users/yhc125/workspace/kiditem
npm run build --workspace=packages/shared 2>&1 | tail -10
```

Expected: PASS. 실패 시 — 빠진 re-export 또는 누락된 type 확인.

### Step 1-7: Baseline downstream breakage

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: ~420-500 errors (Plan A baseline 근처, 약간 증가 수용). Plan B2/B3 에서 감소 예정.

### Step 1-8: Commit Task 1

```bash
cd /Users/yhc125/workspace/kiditem
git add packages/shared/src/schemas/product.ts \
        packages/shared/src/schemas/inventory.ts \
        packages/shared/src/schemas/index.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): rewrite product/inventory schemas for 3-layer (Plan B1 T1)"
```

---

## Task 2: Foundation — module skeleton + utils + MasterCodeService + serialize

**Prior state**: T1 commit landed. `@kiditem/shared` 는 새 심볼 (`MasterSchema` 등) export.

**Files:**
- Create: `apps/server/src/products/products.module.ts`
- Create: `apps/server/src/products/CLAUDE.md`
- Create: `apps/server/src/products/util/prisma-error.ts`
- Create: `apps/server/src/products/util/cursor.ts`
- Create: `apps/server/src/products/util/serialize.ts`
- Create: `apps/server/src/products/services/master-code.service.ts`
- Create: `apps/server/src/products/__tests__/master-code.service.spec.ts`
- Create: `apps/server/src/products/__tests__/serialize.spec.ts`
- Create: `apps/server/tsconfig.products.json`

### Step 2-1: Create `util/prisma-error.ts`

```typescript
// apps/server/src/products/util/prisma-error.ts
import { Prisma } from '@prisma/client';
import {
  BadRequestException, ConflictException, NotFoundException,
} from '@nestjs/common';

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

### Step 2-2: Create `util/cursor.ts`

```typescript
// apps/server/src/products/util/cursor.ts
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

### Step 2-3: Create `util/serialize.ts` (server-side, Prisma-aware)

```typescript
// apps/server/src/products/util/serialize.ts
import { Prisma } from '@prisma/client';

/**
 * Prisma row (with Decimal / Date / JsonValue) → plain JSON-serializable shape.
 * Use at controller response boundary before Zod parse.
 */
export function toSerializable(row: unknown): unknown {
  if (row === null || row === undefined) return row;
  if (row instanceof Date) return row.toISOString();
  if (Prisma.Decimal.isDecimal(row)) return (row as Prisma.Decimal).toNumber();
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

### Step 2-4: Write failing test `__tests__/serialize.spec.ts`

```typescript
// apps/server/src/products/__tests__/serialize.spec.ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { toSerializable } from '../util/serialize';

describe('toSerializable', () => {
  it('converts Date to ISO string', () => {
    const d = new Date('2026-04-17T10:00:00.000Z');
    expect(toSerializable(d)).toBe('2026-04-17T10:00:00.000Z');
  });

  it('converts Prisma.Decimal to number', () => {
    const d = new Prisma.Decimal('12.34');
    expect(toSerializable(d)).toBe(12.34);
  });

  it('recurses into arrays', () => {
    expect(toSerializable([new Date('2026-01-01'), 42])).toEqual([
      '2026-01-01T00:00:00.000Z', 42,
    ]);
  });

  it('recurses into plain objects', () => {
    const row = {
      id: 'abc',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      cost: new Prisma.Decimal('9.99'),
      nested: { flag: true },
    };
    expect(toSerializable(row)).toEqual({
      id: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      cost: 9.99,
      nested: { flag: true },
    });
  });

  it('passes through primitives untouched', () => {
    expect(toSerializable(42)).toBe(42);
    expect(toSerializable('hello')).toBe('hello');
    expect(toSerializable(null)).toBe(null);
    expect(toSerializable(true)).toBe(true);
  });
});
```

### Step 2-5: Run serialize test — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/serialize.spec.ts
```

Expected: PASS 5/5 (implementation already complete in Step 2-3).

### Step 2-6: Write failing test `__tests__/master-code.service.spec.ts`

```typescript
// apps/server/src/products/__tests__/master-code.service.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { MasterCodeService } from '../services/master-code.service';

function makePrismaMock(seqReturn: bigint) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ nextval: seqReturn }]),
  } as any;
}

describe('MasterCodeService', () => {
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

### Step 2-7: Run test — FAIL

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/master-code.service.spec.ts
```

Expected: FAIL — `Cannot find module '../services/master-code.service'`.

### Step 2-8: Implement `services/master-code.service.ts`

```typescript
// apps/server/src/products/services/master-code.service.ts
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

### Step 2-9: Run test — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/master-code.service.spec.ts
```

Expected: PASS 4/4.

### Step 2-10: Create `products.module.ts` skeleton

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

### Step 2-11: Create `CLAUDE.md`

```markdown
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
```

### Step 2-12: Create `tsconfig.products.json`

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

### Step 2-13: Verify products-only tsc

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors.

### Step 2-14: Commit Task 2

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/products.module.ts \
        apps/server/src/products/CLAUDE.md \
        apps/server/src/products/util/ \
        apps/server/src/products/services/master-code.service.ts \
        apps/server/src/products/__tests__/master-code.service.spec.ts \
        apps/server/src/products/__tests__/serialize.spec.ts \
        apps/server/tsconfig.products.json
git commit -m "feat(products): module skeleton + MasterCodeService + serialize util (Plan B1 T2)"
```

---

## Task 3: Masters (controller + service + DTOs + integration tests)

**Prior state**: T1 + T2 commits landed. `products.module.ts` has `MasterCodeService` provider only. `@kiditem/shared` exports new symbols.

**Files:**
- Create: `apps/server/src/products/dto/create-master.dto.ts`
- Create: `apps/server/src/products/dto/update-master.dto.ts`
- Create: `apps/server/src/products/dto/list-masters.query.ts`
- Create: `apps/server/src/products/services/masters.service.ts`
- Create: `apps/server/src/products/controllers/masters.controller.ts`
- Create: `apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts`
- Modify: `apps/server/src/products/products.module.ts` (ADD MastersService + MastersController, do NOT replace)

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

### Step 3-4: Write failing integration spec

```typescript
// apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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
    await prisma.$connect();
    codeSvc = new MasterCodeService(prisma as any);
    svc = new MastersService(prisma as any, codeSvc);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => { await prisma.$disconnect(); });

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

  it('auto-updates healthUpdatedAt when healthScore changes via PATCH', async () => {
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

### Step 3-5: Run — FAIL

```bash
cd /Users/yhc125/workspace/kiditem
npm run db:test:prepare
cd apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/masters.service.pg.integration.spec.ts
```

Expected: FAIL — `Cannot find module '../services/masters.service'`.

### Step 3-6: Implement `services/masters.service.ts`

```typescript
// apps/server/src/products/services/masters.service.ts
import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { MasterProduct, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MasterCodeService } from './master-code.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { ListMastersQuery } from '../dto/list-masters.query';
import { mapPrismaError } from '../util/prisma-error';
import { decodeCursor, encodeCursor } from '../util/cursor';

const SYSTEM_FIELDS = [
  'id', 'code', 'companyId', 'optionCounter', 'isDeleted', 'deletedAt',
  'healthUpdatedAt', 'rawData', 'processedData', 'draftContent',
  'createdAt', 'updatedAt',
] as const;

@Injectable()
export class MastersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSvc: MasterCodeService,
  ) {}

  async create(
    companyId: string,
    dto: CreateMasterDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<MasterProduct> {
    const db = outerTx ?? this.prisma;
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
    const stripped = this.strip(dto);
    try {
      return await db.masterProduct.create({
        data: {
          ...stripped,
          companyId,
          code,
          healthUpdatedAt: dto.healthScore !== undefined ? new Date() : null,
        } as Prisma.MasterProductUncheckedCreateInput,
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
      ? encodeCursor({
          createdAt: items[items.length - 1].createdAt.toISOString(),
          id: items[items.length - 1].id,
        })
      : null;
    return { items, nextCursor };
  }

  async findById(
    companyId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<MasterProduct> {
    const row = await this.prisma.masterProduct.findFirst({
      where: {
        id, companyId,
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

  async update(
    companyId: string,
    id: string,
    dto: UpdateMasterDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<MasterProduct> {
    const db = outerTx ?? this.prisma;
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
    const data: Prisma.MasterProductUncheckedUpdateInput = { ...stripped };
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

  async softDelete(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = outerTx ?? this.prisma;
    const { count } = await db.masterProduct.updateMany({
      where: { id, companyId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('master not found');
  }

  async restore(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = outerTx ?? this.prisma;
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

  private strip(dto: Partial<CreateMasterDto> | Partial<UpdateMasterDto>) {
    const out: Record<string, unknown> = { ...dto };
    for (const f of SYSTEM_FIELDS) delete out[f as string];
    return out;
  }
}
```

### Step 3-7: Implement `controllers/masters.controller.ts` (NO `@UseGuards` / `@UsePipes`)

```typescript
// apps/server/src/products/controllers/masters.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  MasterSchema, MasterWithOptionsSchema,
  type Master, type MasterWithOptions,
} from '@kiditem/shared';
import { toSerializable } from '../util/serialize';
import { MastersService } from '../services/masters.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMasterDto } from '../dto/create-master.dto';
import { UpdateMasterDto } from '../dto/update-master.dto';
import { ListMastersQuery } from '../dto/list-masters.query';

@Controller('products/masters')
export class MastersController {
  constructor(
    private readonly svc: MastersService,
    private readonly prisma: PrismaService,
  ) {}

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
    const options = await this.prisma.productOption.findMany({
      where: { masterId: id, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
    return MasterWithOptionsSchema.parse(toSerializable({ ...row, options }));
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

### Step 3-8: Modify `products.module.ts` (ADD, do not replace)

Current state (after T2): `controllers: []`, `providers: [MasterCodeService]`.

Modify to:

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

### Step 3-9: Run integration test — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/masters.service.pg.integration.spec.ts
```

Expected: PASS 7/7.

### Step 3-10: Products-only tsc — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors.

### Step 3-11: Commit Task 3

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/dto/create-master.dto.ts \
        apps/server/src/products/dto/update-master.dto.ts \
        apps/server/src/products/dto/list-masters.query.ts \
        apps/server/src/products/services/masters.service.ts \
        apps/server/src/products/controllers/masters.controller.ts \
        apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts \
        apps/server/src/products/products.module.ts
git commit -m "feat(products): Masters CRUD + soft-delete/restore (Plan B1 T3)"
```

---

## Task 4: Options + BundleStockService (controller + service + DTOs + race test)

**Prior state**: T3 commit landed. `products.module.ts` has `MastersController`, `MastersService`, `MasterCodeService`. Integration suite already has `masters.service.pg.integration.spec.ts` passing.

**Files:**
- Create: `apps/server/src/products/dto/create-option.dto.ts`
- Create: `apps/server/src/products/dto/update-option.dto.ts`
- Create: `apps/server/src/products/dto/list-options.query.ts`
- Create: `apps/server/src/products/services/options.service.ts`
- Create: `apps/server/src/products/services/bundle-stock.service.ts`
- Create: `apps/server/src/products/controllers/options.controller.ts`
- Create: `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts`
- Modify: `apps/server/src/products/products.module.ts` (ADD, preserve T3 edits)

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

```typescript
// apps/server/src/products/__tests__/options.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MasterCodeService } from '../services/master-code.service';
import { MastersService } from '../services/masters.service';
import { BundleStockService } from '../services/bundle-stock.service';
import { OptionsService } from '../services/options.service';
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
    await prisma.$connect();
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
    await svc.create(TEST_COMPANY_ID, { masterId: m.id } as any);
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
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M6' } as any);
    const bundle = await svc.create(TEST_COMPANY_ID, {
      masterId: m.id, optionName: 'Bundle', isBundle: true,
    } as any);
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

  it('rejects re-parenting: PATCH with masterId of another master is ignored', async () => {
    const m1 = await mastersSvc.create(TEST_COMPANY_ID, { name: 'A' } as any);
    const m2 = await mastersSvc.create(TEST_COMPANY_ID, { name: 'B' } as any);
    const opt = await svc.create(TEST_COMPANY_ID, { masterId: m1.id, optionName: 'X' } as any);
    const updated = await svc.update(TEST_COMPANY_ID, opt.id, { masterId: m2.id } as any);
    expect(updated.masterId).toBe(m1.id); // NOT reassigned
  });

  it('triggers recompute on bundles when component option is soft-deleted', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M7' } as any);
    const bundle = await svc.create(TEST_COMPANY_ID, {
      masterId: m.id, optionName: 'B', isBundle: true,
    } as any);
    const comp = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'C' } as any);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 10 },
    });
    await prisma.bundleComponent.create({
      data: {
        bundleOptionId: bundle.id,
        componentOptionId: comp.id,
        companyId: TEST_COMPANY_ID,
        qty: 2,
      },
    });
    await bundleStockSvc.recompute(bundle.id);
    const before = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(before.availableStock).toBe(5);

    await svc.softDelete(TEST_COMPANY_ID, comp.id);
    const after = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(after.availableStock).toBe(0);
  });
});
```

### Step 4-5: Run — FAIL

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/options.service.pg.integration.spec.ts
```

Expected: FAIL — missing `options.service` and `bundle-stock.service`.

### Step 4-6: Implement `services/bundle-stock.service.ts` (final, not stub)

```typescript
// apps/server/src/products/services/bundle-stock.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BundleStockService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(
    bundleOptionId: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = outerTx ?? this.prisma;
    await db.$queryRaw`SELECT id FROM product_options WHERE id = ${bundleOptionId}::uuid FOR UPDATE`;
    const components = await db.bundleComponent.findMany({
      where: {
        bundleOptionId,
        componentOption: { isDeleted: false },
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
        const stock = c.componentOption.inventory?.currentStock ?? 0;
        return Math.floor(stock / c.qty);
      }),
    );
    await db.productOption.update({
      where: { id: bundleOptionId },
      data: { availableStock: capacity },
    });
    return capacity;
  }
}
```

### Step 4-7: Implement `services/options.service.ts`

```typescript
// apps/server/src/products/services/options.service.ts
import {
  ConflictException, Injectable, NotFoundException,
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
  'id', 'sku', 'companyId', 'masterId', 'availableStock',
  'isDeleted', 'deletedAt', 'createdAt', 'updatedAt',
] as const;

@Injectable()
export class OptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  async create(
    companyId: string,
    dto: CreateOptionDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<ProductOption> {
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
      const stripped = this.strip(dto);
      try {
        return await tx.productOption.create({
          data: {
            ...stripped,
            companyId,
            masterId: dto.masterId,
            sku,
            availableStock: null,
          } as Prisma.ProductOptionUncheckedCreateInput,
        });
      } catch (e) { mapPrismaError(e, 'option create'); }
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
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

  async findById(
    companyId: string, id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<ProductOption> {
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

  async update(
    companyId: string,
    id: string,
    dto: UpdateOptionDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<ProductOption> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const current = await tx.productOption.findFirst({
        where: { id, companyId, isDeleted: false },
      });
      if (!current) throw new NotFoundException('option not found');

      if (dto.isBundle !== undefined && dto.isBundle !== current.isBundle) {
        if (dto.isBundle === false) {
          const count = await tx.bundleComponent.count({
            where: { bundleOptionId: id },
          });
          if (count > 0) {
            throw new ConflictException('bundle has components; cannot set isBundle=false');
          }
        } else {
          const count = await tx.bundleComponent.count({
            where: { componentOptionId: id },
          });
          if (count > 0) {
            throw new ConflictException('option is used as component; cannot set isBundle=true');
          }
        }
      }

      const stripped = this.strip(dto);
      const data: Prisma.ProductOptionUncheckedUpdateInput = { ...stripped };
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
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  async softDelete(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.productOption.updateMany({
        where: { id, companyId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('option not found');
      const affected = await tx.bundleComponent.findMany({
        where: { componentOptionId: id },
        select: { bundleOptionId: true },
      });
      for (const row of affected) {
        await this.bundleStock.recompute(row.bundleOptionId, tx);
      }
    };
    await (outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 }));
  }

  async restore(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
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

  private strip(dto: Partial<CreateOptionDto> | Partial<UpdateOptionDto>) {
    const out: Record<string, unknown> = { ...dto };
    for (const f of SYSTEM_FIELDS) delete out[f as string];
    return out;
  }
}
```

### Step 4-8: Implement `controllers/options.controller.ts`

```typescript
// apps/server/src/products/controllers/options.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  BundleComponentSchema, OptionWithComponentsSchema, ProductOptionSchema,
  type BundleComponent, type OptionWithComponents, type ProductOption,
} from '@kiditem/shared';
import { toSerializable } from '../util/serialize';
import { OptionsService } from '../services/options.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOptionDto } from '../dto/create-option.dto';
import { UpdateOptionDto } from '../dto/update-option.dto';
import { ListOptionsQuery } from '../dto/list-options.query';

@Controller('products/options')
export class OptionsController {
  constructor(
    private readonly svc: OptionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateOptionDto,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.create(companyId, dto)));
  }

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListOptionsQuery,
  ) {
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
    const row = await this.svc.findById(companyId, id, {
      includeDeleted: includeDeleted === 'true',
    });
    const components = await this.prisma.bundleComponent.findMany({
      where: { bundleOptionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return OptionWithComponentsSchema.parse(toSerializable({ ...row, components }));
  }

  @Get('by-sku/:sku')
  async findBySku(
    @CurrentCompany() companyId: string,
    @Param('sku') sku: string,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.findBySku(companyId, sku)));
  }

  @Get('by-barcode/:barcode')
  async findByBarcode(
    @CurrentCompany() companyId: string,
    @Param('barcode') barcode: string,
  ): Promise<ProductOption> {
    return ProductOptionSchema.parse(toSerializable(await this.svc.findByBarcode(companyId, barcode)));
  }

  @Get(':id/components')
  async components(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<BundleComponent[]> {
    await this.svc.findById(companyId, id, {});
    const rows = await this.prisma.bundleComponent.findMany({
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
  async softDelete(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ) {
    await this.svc.softDelete(companyId, id);
    return { ok: true };
  }

  @Post(':id/restore')
  async restore(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ) {
    await this.svc.restore(companyId, id);
    return { ok: true };
  }
}
```

### Step 4-9: Modify `products.module.ts` (ADD to T3's state)

Current state after T3: `controllers:[MastersController]`, `providers:[MasterCodeService, MastersService]`, `exports:[MastersService]`.

Modify to:

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

### Step 4-10: Run integration — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/options.service.pg.integration.spec.ts
```

Expected: PASS 8/8.

### Step 4-11: Products-only tsc — PASS

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
git commit -m "feat(products): Options CRUD + race-free sku + BundleStockService (Plan B1 T4)"
```

---

## Task 5: BundleComponents + bundle-stock unit tests

**Prior state**: T4 commit landed. `products.module.ts` has `[MastersController, OptionsController]` + 4 services. `BundleStockService` is **already fully implemented** (T4 Step 4-6) — Task 5 only adds unit tests + BundleComponentsService + controller.

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
import { IsOptional, IsUUID } from 'class-validator';

export class ListBundleComponentsQuery {
  @IsOptional() @IsUUID()
  bundleOptionId?: string;

  @IsOptional() @IsUUID()
  componentOptionId?: string;
}
```

Service 가 runtime 에서 둘 중 하나 필수 검증.

### Step 5-2: Write bundle-stock unit tests

```typescript
// apps/server/src/products/__tests__/bundle-stock.service.spec.ts
import { describe, it, expect, vi } from 'vitest';
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
      { qty: 1, currentStock: 10 },
      { qty: 2, currentStock: 5 },
    ]);
    const svc = new BundleStockService(prisma);
    expect(await svc.recompute('b')).toBe(2);
  });

  it('treats missing inventory as stock=0 (capacity=0)', async () => {
    const prisma = makePrismaMock([
      { qty: 1, currentStock: 10 },
      { qty: 1, currentStock: null },
    ]);
    const svc = new BundleStockService(prisma);
    expect(await svc.recompute('b')).toBe(0);
  });

  it('excludes soft-deleted components via where filter', async () => {
    const prisma = makePrismaMock([{ qty: 1, currentStock: 5 }]);
    const svc = new BundleStockService(prisma);
    await svc.recompute('b');
    const arg = (prisma.bundleComponent.findMany as any).mock.calls[0][0];
    expect(arg.where.componentOption).toEqual({ isDeleted: false });
  });
});
```

### Step 5-3: Run bundle-stock unit tests — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/bundle-stock.service.spec.ts
```

Expected: PASS 4/4 (T4 이미 구현됨).

### Step 5-4: Write failing BundleComponents integration tests

```typescript
// apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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
    await prisma.$connect();
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

  async function setup(companyId: string) {
    const m = await mastersSvc.create(companyId, { name: 'M' } as any);
    const bundle = await optionsSvc.create(companyId, {
      masterId: m.id, optionName: 'Bundle', isBundle: true,
    } as any);
    const comp = await optionsSvc.create(companyId, {
      masterId: m.id, optionName: 'Comp',
    } as any);
    return { master: m, bundle, comp };
  }

  it('creates a bundle component and triggers recompute', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    expect(bc.companyId).toBe(TEST_COMPANY_ID);
    const updated = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(updated.availableStock).toBe(10);
  });

  it('rejects when bundleOption.isBundle=false', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M' } as any);
    const notBundle = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'X' } as any);
    const comp = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'Y' } as any);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: notBundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects nested bundle (component.isBundle=true)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M' } as any);
    const b1 = await optionsSvc.create(TEST_COMPANY_ID, {
      masterId: m.id, optionName: 'B1', isBundle: true,
    } as any);
    const b2 = await optionsSvc.create(TEST_COMPANY_ID, {
      masterId: m.id, optionName: 'B2', isBundle: true,
    } as any);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: b1.id, componentOptionId: b2.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects cross-company component', async () => {
    const { bundle } = await setup(TEST_COMPANY_ID);
    const other = await setup(OTHER_COMPANY_ID);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: bundle.id, componentOptionId: other.comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects self reference', async () => {
    const { bundle } = await setup(TEST_COMPANY_ID);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: bundle.id, componentOptionId: bundle.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects when bundleOption is soft-deleted', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await optionsSvc.softDelete(TEST_COMPANY_ID, bundle.id);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects when componentOption is soft-deleted', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await optionsSvc.softDelete(TEST_COMPANY_ID, comp.id);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('updates qty and re-recomputes', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    await svc.update(TEST_COMPANY_ID, bc.id, { qty: 5 });
    const bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfter.availableStock).toBe(4);
  });

  it('hard-deletes and re-recomputes', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    await svc.delete(TEST_COMPANY_ID, bc.id);
    const bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfter.availableStock).toBe(0);
  });

  it('concurrent recompute — final availableStock deterministic', async () => {
    const { bundle, comp: c1 } = await setup(TEST_COMPANY_ID);
    const m2 = await mastersSvc.create(TEST_COMPANY_ID, { name: 'N' } as any);
    const c2 = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m2.id, optionName: 'C2' } as any);
    await prisma.inventory.create({ data: { companyId: TEST_COMPANY_ID, optionId: c1.id, currentStock: 20 } });
    await prisma.inventory.create({ data: { companyId: TEST_COMPANY_ID, optionId: c2.id, currentStock: 30 } });
    await Promise.all([
      svc.create(TEST_COMPANY_ID, { bundleOptionId: bundle.id, componentOptionId: c1.id, qty: 2 }),
      svc.create(TEST_COMPANY_ID, { bundleOptionId: bundle.id, componentOptionId: c2.id, qty: 3 }),
    ]);
    const bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
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

  async create(
    companyId: string,
    dto: CreateBundleComponentDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<BundleComponent> {
    if (dto.bundleOptionId === dto.componentOptionId) {
      throw new ConflictException('self-reference');
    }
    const db = outerTx ?? this.prisma;
    const [bundleOpt, compOpt] = await Promise.all([
      db.productOption.findUnique({ where: { id: dto.bundleOptionId } }),
      db.productOption.findUnique({ where: { id: dto.componentOptionId } }),
    ]);
    if (!bundleOpt || bundleOpt.isDeleted) throw new NotFoundException('bundle option not found');
    if (!compOpt || compOpt.isDeleted) throw new NotFoundException('component option not found');
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
            companyId: bundleOpt.companyId,
          },
        });
      } catch (e) { mapPrismaError(e, 'bundle-component create'); }
      await this.bundleStock.recompute(dto.bundleOptionId, tx);
      return bc;
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  async list(
    companyId: string,
    q: ListBundleComponentsQuery,
  ): Promise<BundleComponent[]> {
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

  async update(
    companyId: string,
    id: string,
    dto: UpdateBundleComponentDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<BundleComponent> {
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
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  async delete(
    companyId: string,
    id: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const row = await tx.bundleComponent.findFirst({ where: { id, companyId } });
      if (!row) throw new NotFoundException('bundle-component not found');
      await tx.$queryRaw`SELECT id FROM product_options WHERE id = ${row.bundleOptionId}::uuid FOR UPDATE`;
      await tx.bundleComponent.delete({ where: { id } });
      await this.bundleStock.recompute(row.bundleOptionId, tx);
    };
    await (outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 }));
  }
}
```

### Step 5-7: Implement `controllers/bundle-components.controller.ts`

```typescript
// apps/server/src/products/controllers/bundle-components.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { BundleComponentSchema, type BundleComponent } from '@kiditem/shared';
import { toSerializable } from '../util/serialize';
import { BundleComponentsService } from '../services/bundle-components.service';
import { CreateBundleComponentDto } from '../dto/create-bundle-component.dto';
import { UpdateBundleComponentDto } from '../dto/update-bundle-component.dto';
import { ListBundleComponentsQuery } from '../dto/list-bundle-components.query';

@Controller('products/bundle-components')
export class BundleComponentsController {
  constructor(private readonly svc: BundleComponentsService) {}

  @Post()
  async create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateBundleComponentDto,
  ): Promise<BundleComponent> {
    return BundleComponentSchema.parse(toSerializable(await this.svc.create(companyId, dto)));
  }

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListBundleComponentsQuery,
  ): Promise<BundleComponent[]> {
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
  async delete(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ) {
    await this.svc.delete(companyId, id);
    return { ok: true };
  }
}
```

### Step 5-8: Modify `products.module.ts` (ADD to T4 state, final)

Current state after T4: `controllers:[MastersController, OptionsController]`, `providers:[MasterCodeService, MastersService, OptionsService, BundleStockService]`, `exports:[MastersService, OptionsService]`.

Modify to final state:

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

### Step 5-9: Run integration — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/bundle-components.service.pg.integration.spec.ts
```

Expected: PASS 10/10.

### Step 5-10: Products-only tsc — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors.

### Step 5-11: Commit Task 5

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/dto/create-bundle-component.dto.ts \
        apps/server/src/products/dto/update-bundle-component.dto.ts \
        apps/server/src/products/dto/list-bundle-components.query.ts \
        apps/server/src/products/services/bundle-components.service.ts \
        apps/server/src/products/controllers/bundle-components.controller.ts \
        apps/server/src/products/__tests__/bundle-stock.service.spec.ts \
        apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts \
        apps/server/src/products/products.module.ts
git commit -m "feat(products): BundleComponents + unit tests (Plan B1 T5)"
```

---

## Task 6: DI spec + RLS + pagination (3 commits for mid-task recovery)

**Prior state**: T3-T5 landed. products.module.ts final. All service integration tests PASS.

**Files:**
- Modify: `apps/server/src/test-helpers/real-prisma.ts` — add `withChatbotReadonly`
- Create: `apps/server/src/products/__tests__/products.module.di.spec.ts`
- Create: `apps/server/src/products/__tests__/rls.pg.integration.spec.ts`
- Create: `apps/server/src/products/__tests__/pagination.pg.integration.spec.ts`

### Step 6-1: Add `withChatbotReadonly` helper

Append to `apps/server/src/test-helpers/real-prisma.ts`:

```typescript
import { Client } from 'pg';

export async function withChatbotReadonly<T>(
  companyId: string | null,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  // Connection string derived from test DATABASE_URL to allow CI overrides.
  const testUrl = process.env.DATABASE_URL
    ?? 'postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test';
  const url = testUrl.replace(/^postgresql:\/\/[^:]+:[^@]+/, 'postgresql://chatbot_readonly:chatbot_readonly');
  const client = new Client({ connectionString: url });
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

### Step 6-2: Commit 6a (helper)

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/test-helpers/real-prisma.ts
git commit -m "test(helpers): withChatbotReadonly — RLS-scoped pg client (Plan B1 T6a)"
```

### Step 6-3: Create DI spec

```typescript
// apps/server/src/products/__tests__/products.module.di.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
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
      .overrideProvider(PrismaService)
      .useValue({} as any)
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

### Step 6-4: Run DI spec — PASS, then commit

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx vitest run src/products/__tests__/products.module.di.spec.ts
```

Expected: PASS 2/2.

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/__tests__/products.module.di.spec.ts
git commit -m "test(products): DI wiring spec (Plan B1 T6b)"
```

### Step 6-5: Create RLS + pagination specs

`apps/server/src/products/__tests__/rls.pg.integration.spec.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma, resetDb, seedBaseFixture, withChatbotReadonly,
  TEST_COMPANY_ID, OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('RLS — chatbot_readonly', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
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

  it('cross-tenant guess — attacker knows B\'s master UUID → 0 rows under A', async () => {
    const bRow = await prisma.masterProduct.findUniqueOrThrow({ where: { code: 'M-00000B01' } });
    const rows = await withChatbotReadonly(TEST_COMPANY_ID, async (c) => {
      const r = await c.query('SELECT id FROM master_products WHERE id = $1', [bRow.id]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('product_options filter set → only own rows', async () => {
    const rows = await withChatbotReadonly(TEST_COMPANY_ID, async (c) => {
      const r = await c.query('SELECT id, company_id FROM product_options');
      return r.rows;
    });
    expect(rows.every((r: any) => r.company_id === TEST_COMPANY_ID)).toBe(true);
  });
});
```

`apps/server/src/products/__tests__/pagination.pg.integration.spec.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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
    await prisma.$connect();
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

    const notReturned = ids.find(id => !page1.items.some(it => it.id === id))!;
    await svc.softDelete(TEST_COMPANY_ID, notReturned);

    const page2 = await svc.list(TEST_COMPANY_ID, {
      limit: 2, cursor: page1.nextCursor!,
    } as any);
    expect(page2.items.some(it => it.id === notReturned)).toBe(false);
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page2.items.length).toBeLessThanOrEqual(2);
  });
});
```

### Step 6-6: Run RLS + pagination — PASS, then commit

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/rls.pg.integration.spec.ts \
  src/products/__tests__/pagination.pg.integration.spec.ts
```

Expected: PASS (RLS 4 + pagination 1).

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/products/__tests__/rls.pg.integration.spec.ts \
        apps/server/src/products/__tests__/pagination.pg.integration.spec.ts
git commit -m "test(products): RLS 4-matrix + pagination stability (Plan B1 T6c)"
```

---

## Task 7: `app.module.ts` registration + final verification

**Prior state**: T3-T6 landed. products module fully implemented + tested.

**Files:**
- Modify: `apps/server/src/app.module.ts` (add ProductsModule import + register)

### Step 7-1: Read current `app.module.ts`

```bash
grep -n "import.*Module\|imports:\|BusinessRulesModule\|OrdersModule" /Users/yhc125/workspace/kiditem/apps/server/src/app.module.ts | head -30
```

### Step 7-2: Add ProductsModule

Edit `apps/server/src/app.module.ts`:

1. Add import: `import { ProductsModule } from './products/products.module';`
2. Add `ProductsModule` to `@Module({ imports: [...] })` array (alphabetical).

### Step 7-3: Products-only tsc — PASS

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit --project tsconfig.products.json
```

Expected: 0 errors.

### Step 7-4: Full-server tsc baseline

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: ~420-480 errors. Products module 추가 자체는 에러 0 기여 (Plan A baseline 근처 유지).

### Step 7-5: Run full Plan B1 test suite

```bash
cd /Users/yhc125/workspace/kiditem/apps/server
# Unit
npx vitest run \
  src/products/__tests__/master-code.service.spec.ts \
  src/products/__tests__/bundle-stock.service.spec.ts \
  src/products/__tests__/serialize.spec.ts \
  src/products/__tests__/products.module.di.spec.ts
# Integration
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts src/products/__tests__/
```

Expected total: unit 15 + integration ~32 = ~47 tests all green.

### Step 7-6: Index verification (EXPLAIN)

```bash
docker exec kiditem-postgres-test psql -U kiditem_test kiditem_test <<'SQL'
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

-- cleanup
TRUNCATE master_products CASCADE;
SQL
```

Expected: EXPLAIN 결과에 `Index Scan` 또는 `Bitmap Index Scan` 포함 (any index scan; 구체 index name 은 환경 의존). `Seq Scan` 면 composite index 추가 필요 (Plan A schema hotfix).

### Step 7-7: Commit Task 7

```bash
cd /Users/yhc125/workspace/kiditem
git add apps/server/src/app.module.ts
git commit -m "feat(app): register ProductsModule (Plan B1 T7)"
```

### Step 7-8: Push branch

```bash
cd /Users/yhc125/workspace/kiditem
git push -u origin feat/plan-b1-products-module
```

### Step 7-9: Open draft PR

```bash
gh pr create --draft --title "feat: Plan B1 — Products module (Master+Option+Bundle)" --body "$(cat <<'EOF'
## Summary

Plan B1. Spec v3 — 3 adversarial reviews 반영.

See:
- [spec](docs/superpowers/specs/2026-04-17-plan-b1-products-module-design.md)
- [plan](docs/superpowers/plans/2026-04-17-plan-b1-products-module.md)

**Scope**:
- `apps/server/src/products/` 신설 — 3 controllers + 5 services + DTOs + utils + tests
- `@kiditem/shared` product.ts + inventory.ts 재작성
- `toSerializable()` util (server-side, duck-typed Decimal)
- `ProductsModule` app.module.ts 등록

**Known state**:
- `npm run dev:server` — 여전히 부팅 실패 (Plan B2/B3 대상)
- Products module 자체: tsconfig.products.json PASS, 47 tests PASS, RLS 4-matrix + DI spec + pagination stability

**Does NOT belong**:
- advertising / orders / inventory service rewrite (Plan B2)
- Dashboard / finance / supply / AI (Plan B3)
- Frontend (Plan D)
- Bundle recompute hook on inventory change (Plan B2 StockTransaction task)

**Verification**:
- [x] `npm run build --workspace=packages/shared` — PASS
- [x] `tsc --project tsconfig.products.json` — 0 errors
- [x] Unit tests — 4 (master-code) + 4 (bundle-stock) + 5 (serialize) + 2 (DI) PASS
- [x] Integration tests — 7 (masters) + 8 (options) + 10 (bundle-components) + 4 (RLS) + 1 (pagination) PASS
- [x] EXPLAIN — index scan on 10k rows

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Rollback procedure

각 task 는 독립 commit. 실패 시 해당 commit 을 `git reset --hard HEAD~1` 으로 폐기.

**T6 는 3 commits (T6a/6b/6c)** — 부분 실패 시 실패 단계만 되돌림.

**Task 간 failure**:
- 테스트 실패 → 원인 분석 후 재시도 (plan 내용 준수 시 통과해야)
- 근본적 문제 → plan 자체 결함 → user 에게 escalate + plan 수정

**Post-push revert**:
- PR 머지 전 — branch force push 금지. 실수 시 follow-up commit 으로 수정.
- PR 머지 후 regression → `git revert <merge-commit>` → DB 는 Plan A 상태 유지 (이 plan 은 schema 건드리지 않음)

---

## What already exists (재사용)

- `PrismaService` / `PrismaModule` (global)
- `AuthModule` — 전역 `CompanyScopeGuard` via `APP_GUARD` + `@CurrentCompany()` decorator
- 전역 `ValidationPipe({whitelist:true, transform:true})` — `main.ts:58-61`
- `GlobalExceptionFilter`
- `test-helpers/real-prisma.ts` — `makeTestPrisma`, `resetDb`, `seedBaseFixture`, `TEST_COMPANY_ID`, `OTHER_COMPANY_ID`
- `vitest.config.integration.ts` — `.pg.integration.spec.ts` glob, serial 강제
- Postgres resources (Plan A Task 11): `master_code_seq`, `product_options_master_null_option` partial unique, 3 CHECK, 7 RLS policies

## Failure modes

| Scenario | 검증 | 복구 |
|---|---|---|
| `@kiditem/shared` 재작성 후 build 실패 | T1 Step 1-6 | 누락된 re-export / type 확인 (두 index.ts 모두) |
| products tsc 실패 | T2/3/4/5 Step tsc | import path + `Prisma.XxxUncheckedInput` 타입 확인 |
| race test 실패 (sku 충돌) | T4 Step 4-10 | `updateMany` 가 row-level lock 을 제대로 획득 확인 (Postgres READ COMMITTED 기본 ok) |
| Bundle recompute non-deterministic | T5 Step 5-9 | `SELECT ... FOR UPDATE` lock 문이 tx 안에서 실행 확인 |
| RLS 0 rows under session | T6 Step 6-6 | `chatbot_readonly` 유저 + `app.company_id` GUC 설정 확인 |
| EXPLAIN seq scan | T7 Step 7-6 | 별도 PR 로 composite index 추가 (Plan B1 scope 외) |
| `Test.createTestingModule` DI 실패 | T6 Step 6-4 | `providers` / `exports` 목록 + PrismaService override 확인 |

## NOT in scope (후속 plan)

- advertising / orders / inventory service rewrite — Plan B2
- dashboard / finance / supply / AI services — Plan B3
- Full NestJS HTTP integration tests — Plan B3
- Frontend pages — Plan D
- Wing 이관 + 새 init.sql.gz — Plan C
- Nested bundle 허용 + BFS cycle detection — Plan B3 이후
- DB-level CHECK for nested-bundle, BundleComponent 3-way invariant — Plan B3 hardening
- Event-driven recompute (EventEmitter2) — Plan B2 inventory hook 설계 시 재평가

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-plan-b1-products-module.md`.

**Execution options**:

**1. Subagent-Driven (recommended)** — Fresh subagent per task + two-stage review (spec + code quality). T1-T7 순차.

**2. TeamCreate (kiditem team workflow)** — 1 team, `kiditem-implementer × 1` (병렬 금지, 하나씩 claim), `kiditem-reviewer × 2` (spec + quality, 병렬 가능), `kiditem-qa-verifier × 1`. **T3/T4/T5 는 반드시 sequential dispatch** — 공유 test DB 의 `resetDb` TRUNCATE + `products.module.ts` 공동 편집 때문.

QA verifier 작업: `npm run test:integration -- src/products/` + unit suite + `tsc --project tsconfig.products.json` 실행 + 결과 리포트. `dev:server` 부팅은 Plan B3 까지 불가이므로 unused.

**3. Inline Execution** — 현 세션에서 순차 실행 (executing-plans skill). Context 부담 큼.

**어느 방식?**
