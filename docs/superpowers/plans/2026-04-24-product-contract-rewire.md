# Product Contract Rewire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the **read path** of spec v2. Ship `/api/products/catalog` for lists/details/counts. Swap the product-domain frontend to display data via the new 3-layer contract. Retain root `/api/products` only as a **GET-only** deprecated alias for pre-existing cross-domain read callers. Unwire frontend product action buttons from the backend (UI stays, no fetch fires) — canonical writes ship with the agent/workflow redesign. `AddProductModal` strips fields that the new schema does not accept (flat SKU/price/stock), to keep the form compile-clean; the replacement option-creation UX is a follow-up. Code that compiles today but calls a route that will now 404 at runtime (e.g. `workflows/actions/catalog.ts` action templates, `action-task.service.ts` write hooks) is left untouched — accepted runtime breakage, cleaned up by the agent/workflow redesign.

**Principle:** basic CRUD via canonical routes stays. Legacy behavior that the new schema does not accept is removed surgically: the minimum cut needed to keep the build green and the read-path UX working. UI surfaces stay unless they reference shapes that no longer exist.

**Architecture:** `@kiditem/shared` defines schema-aligned product entities plus catalog read models. The NestJS products module owns read-model mapping, master image normalization/upload, and a READ-ONLY legacy alias controller. Product-domain web screens fetch from `/api/products/catalog`; adjacent domains remain on the GET alias until their own plans migrate. Product-domain action buttons remain rendered on the detail page but no longer hit the backend; their confirmation modals stay; clicks surface a "기능 준비 중" toast.

**Tech Stack:** Prisma 7, NestJS 11, class-validator, S3-compatible `StorageService`, Zod schemas in `@kiditem/shared`, Next.js 16, React Query, `apiClient.getParsed`.

---

## Scope Notes

- No Prisma schema change is part of this plan.
- Do not add `MasterProduct.totalStock`.
- Do not add `@nestjs/swagger`; this repo does not use Swagger. Legacy deprecation is expressed through JSDoc plus `Deprecation` and `Sunset` headers.
- Treat product route `:id` values as master ids.
- `pipelineStep: 'discontinued'` is the canonical discontinued state per spec §5.4, §11; the existing frontend already recognizes this value in `apps/web/src/lib/utils.ts`. Writing that value is OUT of scope here (no UI action ships in this slice).
- Legacy alias is **GET only** in this slice: `GET` list / `GET :id` detail / `GET pipeline-stats` / `GET :id/original-image-base64` / `GET calculate-grades` returning current counts with no grade write. PATCH/PUT are deferred (see §Deferred Work). `workflows/actions/catalog.ts` PUT callers and `action-task.service.ts` write callers will 404 at runtime until their own redesign lands. This is accepted breakage.
- Frontend `useProductActions` hook's 4 actions (adjust_price / stop_ads / discontinue / change_grade): UI buttons **stay rendered**, confirmation modals **stay usable**. The hook's `product.*` branch strips the legacy `PATCH /api/products/:id` call and surfaces a "기능 준비 중" toast instead. No new canonical write call is added in this slice. Their backend replacement lands with the agent/workflow redesign.
- Inventory detail sidebar keeps its call, swapping `?productId=` to `?masterId=` (server already supports this — `apps/server/src/inventory/dto/list-inventory-query.dto.ts:27-29`).

## File Structure

### Shared

- Modify `packages/shared/src/schemas/product.ts`
  - Add `MasterImageItemSchema`
  - Change `MasterSchema.images` to `MasterImageItem[] | null`
  - Add `MoneyRangeSchema`, `ProductCatalogListItemSchema`, `ProductCatalogDetailSchema`, `ProductCatalogCountsSchema`, `ProductCatalogListResponseSchema`
- Modify `packages/shared/src/index.ts`
  - Export new product schemas and types
- Modify `packages/shared/src/schemas/index.ts`
  - Export new product schemas and types
- Create `packages/shared/src/schemas/product.spec.ts`
  - Protect image shape, catalog ranges, and legacy string image rejection

### Server Products

- Create `apps/server/src/products/dto/master-image-item.dto.ts`
- Modify `apps/server/src/products/dto/create-master.dto.ts`
- Modify `apps/server/src/products/dto/update-master.dto.ts`
- Create `apps/server/src/products/dto/list-product-catalog.query.ts`
- Create `apps/server/src/products/services/product-image-normalizer.ts`
- Modify `apps/server/src/products/services/masters.service.ts`
- Create `apps/server/src/products/services/product-catalog.service.ts`
- Modify `apps/server/src/products/controllers/masters.controller.ts`
- Create `apps/server/src/products/controllers/product-catalog.controller.ts`
- Create `apps/server/src/products/controllers/products-legacy.controller.ts`
- Modify `apps/server/src/products/products.module.ts`
- Create tests under `apps/server/src/products/__tests__/`

### Web Product Domain

- Modify `apps/web/src/lib/query-keys.ts`
- Modify `apps/web/src/components/product/ProductSelector.tsx`
- Modify `apps/web/src/app/products/page.tsx`
- Modify files under `apps/web/src/app/products/components/`
- Modify `apps/web/src/app/products/[id]/page.tsx`
- Modify files under `apps/web/src/app/products/[id]/components/`
- Modify `apps/web/src/app/products/[id]/hooks/useProductActions.ts`
- Modify `apps/web/src/hooks/useProductImages.ts`
- Modify `apps/web/src/hooks/__tests__/useProductImages.test.ts`

---

## Task 0: Baseline And Instruction Check

**Files:**
- Read: `AGENTS.md`
- Read: `packages/shared/AGENTS.md`
- Read: `apps/server/AGENTS.md`
- Read: `apps/server/src/products/CLAUDE.md`
- Read: `apps/web/AGENTS.md`

- [ ] **Step 1: Re-read scoped instructions**

Run:

```bash
sed -n '1,220p' AGENTS.md
sed -n '1,220p' packages/shared/AGENTS.md
sed -n '1,260p' apps/server/AGENTS.md
sed -n '1,260p' apps/server/src/products/CLAUDE.md
sed -n '1,220p' apps/web/AGENTS.md
```

Expected: command output confirms same-domain product/shared/web changes are allowed and server changes require `npm run dev:server` boot verification.

- [ ] **Step 2: Record baseline breakage**

Run:

```bash
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

Expected:

- shared build passes before changes
- server build passes before changes
- web build fails on the product shared phantom imports, currently including `ProductImageItem`

- [ ] **Step 3: Capture old-contract references**

Run:

```bash
rg -n '\bProductListItem\b|\bProductDetail\b|\bProductImageItem\b|\bPipelineCounts\b' apps/web/src packages/shared/src
rg -n 'masterProduct\.costPrice|masterProduct\.sellPrice' apps/web/src
rg -n 'api/inventory\?productId=' apps/web/src apps/server/src
rg -n '/api/products(?!/(masters|options|bundle-components|catalog))' apps/web/src/app/products apps/web/src/components/product apps/server/src/products --pcre2
```

Expected: non-zero output before implementation. Save the output in the session notes for comparison after Task 7.

---

## Task 1: Shared Product Contract

**Files:**
- Modify: `packages/shared/src/schemas/product.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/src/schemas/product.spec.ts`

- [ ] **Step 1: Write shared schema regression tests**

Create `packages/shared/src/schemas/product.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  MasterImageItemSchema,
  MasterSchema,
  ProductCatalogDetailSchema,
  ProductCatalogListItemSchema,
} from './product.js';

const iso = '2026-04-24T00:00:00.000Z';

describe('product schemas', () => {
  it('accepts structured master image items', () => {
    expect(MasterImageItemSchema.parse({
      url: 'https://cdn.example.com/p.png',
      role: 'product',
      label: 'front',
      sortOrder: 0,
    })).toEqual({
      url: 'https://cdn.example.com/p.png',
      role: 'product',
      label: 'front',
      sortOrder: 0,
    });
  });

  it('rejects legacy string image arrays on shared write contract', () => {
    expect(() => MasterSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      code: 'M-00000001',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 0,
      thumbnailUrl: null,
      imageUrl: null,
      images: ['https://cdn.example.com/p.png'],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: null,
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      supplierId: null,
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: iso,
      updatedAt: iso,
    })).toThrow();
  });

  it('uses null ranges and zero counts for catalog rows without options', () => {
    const row = ProductCatalogListItemSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      code: 'M-00000001',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 0,
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: null,
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      supplierId: null,
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: iso,
      updatedAt: iso,
      optionCount: 0,
      representativeSku: null,
      priceRange: null,
      costRange: null,
      totalAvailableStock: 0,
    });
    expect(row.optionCount).toBe(0);
    expect(row.totalAvailableStock).toBe(0);
    expect(row.priceRange).toBeNull();
  });

  it('requires detail options to be an array', () => {
    const base = ProductCatalogListItemSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      code: 'M-00000001',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 0,
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: null,
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      supplierId: null,
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: iso,
      updatedAt: iso,
      optionCount: 0,
      representativeSku: null,
      priceRange: null,
      costRange: null,
      totalAvailableStock: 0,
    });
    expect(ProductCatalogDetailSchema.parse({ ...base, options: [] }).options).toEqual([]);
  });
});
```

- [ ] **Step 2: Run shared schema test and verify it fails**

Run:

```bash
npx vitest run packages/shared/src/schemas/product.spec.ts
```

Expected: FAIL because `MasterImageItemSchema` and catalog schemas do not exist yet.

- [ ] **Step 3: Replace product schema with schema-aligned contract**

Modify `packages/shared/src/schemas/product.ts` so the product section contains these additions and changed `images` field:

```typescript
import { z } from 'zod';
import { zIsoDate } from './common.js';

export const MasterImageItemSchema = z.object({
  url: z.string().url(),
  role: z.string(),
  label: z.string(),
  sortOrder: z.number().int().nonnegative(),
});
export type MasterImageItem = z.infer<typeof MasterImageItemSchema>;

/**
 * @deprecated Temporary alias for legacy call sites in apps/web/src/app/image-hub
 * and apps/web/src/app/thumbnail-editor. Remove once those domains migrate to
 * `MasterImageItem` through their own plans — tracked in TODOS.md "ProductImageItem
 * phantom import 정리". Keeps `npm run build --workspace=apps/web` green during
 * this product-contract slice.
 */
export const ProductImageItemSchema = MasterImageItemSchema;
export type ProductImageItem = MasterImageItem;

export const MoneyRangeSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
});
export type MoneyRange = z.infer<typeof MoneyRangeSchema>;

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
  images: z.array(MasterImageItemSchema).nullable(),
  abcGrade: z.enum(['A', 'B', 'C']).nullable(),
  profitTag: z.string().nullable(),
  adTier: z.string().nullable(),
  adBudgetLimit: z.number().int().nullable(),
  healthScore: z.number().int().nullable(),
  healthUpdatedAt: zIsoDate.nullable(),
  sourceUrl: z.string().url().nullable(),
  sourcePlatform: z.string().nullable(),
  costCny: z.number().nullable(),
  marginRate: z.number().nullable(),
  pipelineStep: z.string().nullable(),
  detailPageUrl: z.string().url().nullable(),
  thumbnailStrategy: z.enum(['standard', 'premium', 'custom']),
  supplierId: z.string().uuid().nullable(),
  isDeleted: z.boolean(),
  deletedAt: zIsoDate.nullable(),
  isTemporary: z.boolean(),
  temporaryReason: z.string().nullable(),
  memo: z.string().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type Master = z.infer<typeof MasterSchema>;
```

Keep the existing `ProductOptionSchema`, `BundleComponentSchema`, `MasterWithOptionsSchema`, and `OptionWithComponentsSchema`, then append:

```typescript
export const ProductCatalogListItemSchema = MasterSchema.extend({
  optionCount: z.number().int().nonnegative(),
  representativeSku: z.string().nullable(),
  priceRange: MoneyRangeSchema.nullable(),
  costRange: MoneyRangeSchema.nullable(),
  totalAvailableStock: z.number().int().nonnegative(),
});
export type ProductCatalogListItem = z.infer<typeof ProductCatalogListItemSchema>;

export const ProductCatalogDetailSchema = ProductCatalogListItemSchema.extend({
  options: z.array(ProductOptionSchema),
});
export type ProductCatalogDetail = z.infer<typeof ProductCatalogDetailSchema>;

export const ProductCatalogCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  gradeA: z.number().int().nonnegative(),
  gradeB: z.number().int().nonnegative(),
  gradeC: z.number().int().nonnegative(),
  adCount: z.number().int().nonnegative(),
  noAdCount: z.number().int().nonnegative(),
  draftCount: z.number().int().nonnegative(),
  processingCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  discontinuedCount: z.number().int().nonnegative(),
  temporaryCount: z.number().int().nonnegative(),
});
export type ProductCatalogCounts = z.infer<typeof ProductCatalogCountsSchema>;

export const ProductCatalogListResponseSchema = z.object({
  items: z.array(ProductCatalogListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type ProductCatalogListResponse = z.infer<typeof ProductCatalogListResponseSchema>;
```

- [ ] **Step 4: Export new shared product schemas**

Modify both `packages/shared/src/index.ts` and `packages/shared/src/schemas/index.ts` product export blocks:

```typescript
export {
  MasterImageItemSchema,
  ProductImageItemSchema, // @deprecated alias — see product.ts
  MoneyRangeSchema,
  MasterSchema,
  ProductOptionSchema,
  BundleComponentSchema,
  MasterWithOptionsSchema,
  OptionWithComponentsSchema,
  ProductCatalogListItemSchema,
  ProductCatalogDetailSchema,
  ProductCatalogCountsSchema,
  ProductCatalogListResponseSchema,
} from './schemas/product.js';
export type {
  MasterImageItem,
  ProductImageItem, // @deprecated alias — see product.ts
  MoneyRange,
  Master,
  ProductOption,
  BundleComponent,
  MasterWithOptions,
  OptionWithComponents,
  ProductCatalogListItem,
  ProductCatalogDetail,
  ProductCatalogCounts,
  ProductCatalogListResponse,
} from './schemas/product.js';
```

In `packages/shared/src/schemas/index.ts`, use `from './product.js'` instead of `from './schemas/product.js'`.

- [ ] **Step 5: Run shared schema test and build**

Run:

```bash
npx vitest run packages/shared/src/schemas/product.spec.ts
npm run build --workspace=packages/shared
```

Expected: PASS for the schema test and shared build.

- [ ] **Step 6: Stage shared contract but DO NOT commit yet**

```bash
git add packages/shared/src/schemas/product.ts packages/shared/src/index.ts packages/shared/src/schemas/index.ts packages/shared/src/schemas/product.spec.ts
```

`MasterSchema.images` now expects structured items, but server reads still return raw `Json`. Committing here would ship a runtime-broken state: `masters.controller.ts` parses raw master rows through `MasterSchema` and existing rows stored as string arrays would reject. Task 2 adds the read-time normalizer; the two must land as one atomic commit.

---

## Task 2: Master Image Normalization And Upload

**Files:**
- Create: `apps/server/src/products/dto/master-image-item.dto.ts`
- Modify: `apps/server/src/products/dto/create-master.dto.ts`
- Create: `apps/server/src/products/services/product-image-normalizer.ts`
- Modify: `apps/server/src/products/services/masters.service.ts`
- Modify: `apps/server/src/products/controllers/masters.controller.ts`
- Create: `apps/server/src/products/services/__tests__/product-image-normalizer.spec.ts`

- [ ] **Step 1: Write image normalizer tests**

Create `apps/server/src/products/services/__tests__/product-image-normalizer.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { normalizeMasterImages } from '../product-image-normalizer';

describe('normalizeMasterImages', () => {
  it('normalizes legacy string arrays', () => {
    expect(normalizeMasterImages(['https://cdn.example.com/a.png'])).toEqual([
      { url: 'https://cdn.example.com/a.png', role: '', label: '', sortOrder: 0 },
    ]);
  });

  it('keeps structured image items and normalizes missing optional text', () => {
    expect(normalizeMasterImages([{ url: 'https://cdn.example.com/a.png', role: 'product', sortOrder: 3 }])).toEqual([
      { url: 'https://cdn.example.com/a.png', role: 'product', label: '', sortOrder: 3 },
    ]);
  });

  it('drops invalid image records', () => {
    expect(normalizeMasterImages([null, { url: '' }, 3])).toEqual([]);
  });

  it('returns an empty array for nullish values', () => {
    expect(normalizeMasterImages(null)).toEqual([]);
    expect(normalizeMasterImages(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run image normalizer test and verify it fails**

Run:

```bash
npx vitest run apps/server/src/products/services/__tests__/product-image-normalizer.spec.ts
```

Expected: FAIL because `product-image-normalizer.ts` does not exist.

- [ ] **Step 3: Implement image normalizer**

Create `apps/server/src/products/services/product-image-normalizer.ts`:

```typescript
import type { MasterImageItem } from '@kiditem/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeMasterImages(raw: unknown): MasterImageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index): MasterImageItem[] => {
    if (typeof item === 'string' && item.length > 0) {
      return [{ url: item, role: '', label: '', sortOrder: index }];
    }
    if (!isRecord(item) || typeof item.url !== 'string' || item.url.length === 0) {
      return [];
    }
    return [{
      url: item.url,
      role: typeof item.role === 'string' ? item.role : '',
      label: typeof item.label === 'string' ? item.label : '',
      sortOrder: typeof item.sortOrder === 'number' && Number.isInteger(item.sortOrder)
        ? item.sortOrder
        : index,
    }];
  });
}

export function withNormalizedMasterImages<T extends { images: unknown }>(row: T): Omit<T, 'images'> & { images: MasterImageItem[] } {
  return { ...row, images: normalizeMasterImages(row.images) };
}
```

- [ ] **Step 4: Add DTO for structured images**

Create `apps/server/src/products/dto/master-image-item.dto.ts`:

```typescript
import { IsInt, IsNotEmpty, IsString, IsUrl, Min } from 'class-validator';

export class MasterImageItemDto {
  @IsUrl()
  url!: string;

  @IsString()
  role!: string;

  @IsString()
  label!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}
```

Modify `apps/server/src/products/dto/create-master.dto.ts` imports:

```typescript
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, IsUrl, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { MasterImageItemDto } from './master-image-item.dto';
```

Replace the `images` DTO field:

```typescript
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MasterImageItemDto)
  images?: MasterImageItemDto[];
```

- [ ] **Step 5: Add master image service methods**

Modify `apps/server/src/products/services/masters.service.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { StorageService } from '../../common/storage/storage.service';
import type { MulterFile } from '../../common/types';
import { normalizeMasterImages, withNormalizedMasterImages } from './product-image-normalizer';
```

Change the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeSvc: MasterCodeService,
    private readonly storage: StorageService,
  ) {}
```

Wrap master rows returned by `create`, `findById`, `findByCode`, `findByLegacy`, and `update` with `withNormalizedMasterImages(row)`.

Add methods:

```typescript
  async updateImages(
    companyId: string,
    id: string,
    images: unknown,
  ): Promise<MasterProduct> {
    const normalized = normalizeMasterImages(images);
    const { count } = await this.prisma.masterProduct.updateMany({
      where: { id, companyId, isDeleted: false },
      data: { images: normalized as Prisma.InputJsonValue },
    });
    if (count === 0) throw new NotFoundException('master not found or deleted');
    const row = await this.prisma.masterProduct.findUniqueOrThrow({ where: { id } });
    return withNormalizedMasterImages(row) as MasterProduct;
  }

  async uploadImage(
    companyId: string,
    id: string,
    file: MulterFile,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('file is required');
    await this.findById(companyId, id, {});
    const ext = file.mimetype === 'image/png'
      ? 'png'
      : file.mimetype === 'image/webp'
        ? 'webp'
        : 'jpg';
    const key = `product-images/${id}/${randomUUID()}.${ext}`;
    const url = await this.storage.save(key, file.buffer, file.mimetype);
    return { url };
  }

  async originalImageBase64(
    companyId: string,
    id: string,
  ): Promise<{ dataUrl: string }> {
    const row = await this.findById(companyId, id, {});
    const images = normalizeMasterImages((row as unknown as { images: unknown }).images);
    const url = row.imageUrl ?? row.thumbnailUrl ?? images[0]?.url ?? null;
    if (!url) throw new NotFoundException('image not found');
    const res = await fetch(url);
    if (!res.ok) throw new NotFoundException('image not found');
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { dataUrl: `data:${contentType};base64,${buffer.toString('base64')}` };
  }
```

- [ ] **Step 6: Add master image controller routes**

Modify `apps/server/src/products/controllers/masters.controller.ts` imports:

```typescript
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterFile } from '../../common/types';
```

Add routes before `@Get(':id')`:

```typescript
  @Post(':id/images/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
  ): Promise<{ url: string }> {
    return this.svc.uploadImage(companyId, id, file);
  }
```

The existing `@Patch(':id')` route updates images because `UpdateMasterDto` now accepts structured images. Do not add `/products/:id/images` in this controller.

- [ ] **Step 7: Run image tests and server build**

Run:

```bash
npx vitest run apps/server/src/products/services/__tests__/product-image-normalizer.spec.ts
npm run build --workspace=apps/server
```

Expected: PASS.

- [ ] **Step 8: Commit shared contract + image normalization atomically**

Shared contract tightening (Task 1) and server read-time normalization (Task 2) must land together to avoid a runtime-broken intermediate commit.

Run:

```bash
git add apps/server/src/products/dto/master-image-item.dto.ts apps/server/src/products/dto/create-master.dto.ts apps/server/src/products/services/product-image-normalizer.ts apps/server/src/products/services/__tests__/product-image-normalizer.spec.ts apps/server/src/products/services/masters.service.ts apps/server/src/products/controllers/masters.controller.ts
git commit -m "feat: tighten master image contract + server normalizer"
```

Expected: this single commit includes Task 1's staged shared files plus Task 2's server files. Verify with `git show --stat HEAD` that both sets are present.

---

## Task 3: Product Catalog Read Model

**Files:**
- Create: `apps/server/src/products/dto/list-product-catalog.query.ts`
- Create: `apps/server/src/products/services/product-catalog.service.ts`
- Create: `apps/server/src/products/controllers/product-catalog.controller.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Create: `apps/server/src/products/__tests__/product-catalog.service.spec.ts`

- [ ] **Step 1: Write catalog service unit tests**

Create `apps/server/src/products/__tests__/product-catalog.service.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { ProductCatalogService } from '../services/product-catalog.service';

function makeService(rows: any[]) {
  const prisma = {
    masterProduct: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      findFirst: vi.fn().mockResolvedValue(rows[0] ?? null),
    },
  };
  return { service: new ProductCatalogService(prisma as any), prisma };
}

describe('ProductCatalogService', () => {
  it('maps active options into ranges and total stock', async () => {
    const { service } = makeService([{
      id: 'm1',
      companyId: 'c1',
      code: 'M-1',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 2,
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      abcGrade: 'A',
      profitTag: null,
      adTier: 'core',
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: 'processed',
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      supplierId: null,
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: new Date('2026-04-24T00:00:00.000Z'),
      updatedAt: new Date('2026-04-24T00:00:00.000Z'),
      options: [
        { id: 'o1', masterId: 'm1', companyId: 'c1', sku: 'M-1-01', barcode: null, legacyCode: null, optionName: 'Red', sortOrder: 0, costPrice: 1000, sellPrice: 2000, commissionRate: null, shippingCost: null, otherCost: 0, isBundle: false, availableStock: null, isDeleted: false, deletedAt: null, isTemporary: false, temporaryReason: null, isActive: true, createdAt: new Date('2026-04-24T00:00:00.000Z'), updatedAt: new Date('2026-04-24T00:00:00.000Z'), inventory: { currentStock: 4 } },
        { id: 'o2', masterId: 'm1', companyId: 'c1', sku: 'M-1-02', barcode: null, legacyCode: null, optionName: 'Set', sortOrder: 1, costPrice: 3000, sellPrice: 5000, commissionRate: null, shippingCost: null, otherCost: 0, isBundle: true, availableStock: 2, isDeleted: false, deletedAt: null, isTemporary: false, temporaryReason: null, isActive: true, createdAt: new Date('2026-04-24T00:00:00.000Z'), updatedAt: new Date('2026-04-24T00:00:00.000Z'), inventory: null },
      ],
    }]);

    const result = await service.list('c1', { page: 1, limit: 20 });
    expect(result.items[0].representativeSku).toBe('M-1-01');
    expect(result.items[0].priceRange).toEqual({ min: 2000, max: 5000 });
    expect(result.items[0].costRange).toEqual({ min: 1000, max: 3000 });
    expect(result.items[0].totalAvailableStock).toBe(6);
  });
});
```

- [ ] **Step 2: Run catalog service test and verify it fails**

Run:

```bash
npx vitest run apps/server/src/products/__tests__/product-catalog.service.spec.ts
```

Expected: FAIL because `ProductCatalogService` does not exist.

- [ ] **Step 3: Add catalog query DTO**

Create `apps/server/src/products/dto/list-product-catalog.query.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListProductCatalogQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number = 20;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsIn(['A', 'B', 'C'])
  grade?: 'A' | 'B' | 'C';

  @IsOptional() @IsString()
  pipelineStep?: string;

  @IsOptional() @IsString()
  status?: string;
}
```

- [ ] **Step 4: Implement catalog service**

Create `apps/server/src/products/services/product-catalog.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  MoneyRange,
  ProductCatalogCounts,
  ProductCatalogDetail,
  ProductCatalogListItem,
  ProductCatalogListResponse,
} from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toSerializable } from '../util/serialize';
import { normalizeMasterImages } from './product-image-normalizer';
import { ListProductCatalogQuery } from '../dto/list-product-catalog.query';

type CatalogOptionRow = {
  id: string;
  masterId: string;
  companyId: string;
  sku: string;
  barcode: string | null;
  legacyCode: string | null;
  optionName: string | null;
  sortOrder: number;
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: Prisma.Decimal | number | null;
  shippingCost: number | null;
  otherCost: number | null;
  isBundle: boolean;
  availableStock: number | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  temporaryReason: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  inventory?: { currentStock: number } | null;
};

type CatalogMasterRow = {
  id: string;
  companyId: string;
  code: string;
  legacyCode: string | null;
  name: string;
  description: string;
  category: string | null;
  brand: string | null;
  tags: unknown;
  optionCounter: number;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  images: unknown;
  abcGrade: string | null;
  profitTag: string | null;
  adTier: string | null;
  adBudgetLimit: number | null;
  healthScore: number | null;
  healthUpdatedAt: Date | null;
  sourceUrl: string | null;
  sourcePlatform: string | null;
  costCny: Prisma.Decimal | number | null;
  marginRate: Prisma.Decimal | number | null;
  pipelineStep: string | null;
  detailPageUrl: string | null;
  thumbnailStrategy: string;
  supplierId: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  temporaryReason: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
  options: CatalogOptionRow[];
};

function range(values: Array<number | null | undefined>): MoneyRange | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function optionStock(option: CatalogOptionRow): number {
  if (option.isBundle) return option.availableStock ?? 0;
  return option.inventory?.currentStock ?? 0;
}

function activeOptions(row: CatalogMasterRow): CatalogOptionRow[] {
  return row.options
    .filter((o) => o.isActive && !o.isDeleted)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

@Injectable()
export class ProductCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, q: ListProductCatalogQuery): Promise<ProductCatalogListResponse> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where = this.where(companyId, q);
    const [rows, total] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: this.include(),
      }),
      this.prisma.masterProduct.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.mapListItem(r as unknown as CatalogMasterRow)),
      total,
      page,
      limit,
    } satisfies ProductCatalogListResponse;
  }

  async detail(companyId: string, id: string): Promise<ProductCatalogDetail> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { id, companyId, isDeleted: false },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('master not found');
    const typed = row as unknown as CatalogMasterRow;
    return {
      ...this.mapListItem(typed),
      options: activeOptions(typed).map((o) => toSerializable(o)),
    } as ProductCatalogDetail;
  }

  async counts(companyId: string, q: Pick<ListProductCatalogQuery, 'status' | 'pipelineStep'> = {}): Promise<ProductCatalogCounts> {
    const rows = await this.prisma.masterProduct.findMany({
      where: this.where(companyId, q),
      select: { abcGrade: true, adTier: true, pipelineStep: true, isTemporary: true },
    });
    return {
      total: rows.length,
      gradeA: rows.filter((r) => r.abcGrade === 'A').length,
      gradeB: rows.filter((r) => r.abcGrade === 'B').length,
      gradeC: rows.filter((r) => r.abcGrade === 'C').length,
      adCount: rows.filter((r) => !!r.adTier).length,
      noAdCount: rows.filter((r) => !r.adTier).length,
      draftCount: rows.filter((r) => r.pipelineStep === 'draft').length,
      processingCount: rows.filter((r) => r.pipelineStep === 'processing').length,
      processedCount: rows.filter((r) => r.pipelineStep === 'processed').length,
      discontinuedCount: rows.filter((r) => r.pipelineStep === 'discontinued').length,
      temporaryCount: rows.filter((r) => r.isTemporary).length,
    } satisfies ProductCatalogCounts;
  }

  private where(companyId: string, q: Pick<ListProductCatalogQuery, 'search' | 'grade' | 'pipelineStep' | 'status'>): Prisma.MasterProductWhereInput {
    const ands: Prisma.MasterProductWhereInput[] = [];
    if (q.search) {
      ands.push({
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { code: { contains: q.search } },
          { legacyCode: { contains: q.search } },
          { options: { some: { sku: { contains: q.search, mode: 'insensitive' }, isDeleted: false } } },
        ],
      });
    }
    const pipelineStep = q.pipelineStep ?? q.status;
    return {
      companyId,
      isDeleted: false,
      ...(q.grade ? { abcGrade: q.grade } : {}),
      ...(pipelineStep && pipelineStep !== 'all' ? { pipelineStep } : {}),
      ...(ands.length > 0 ? { AND: ands } : {}),
    };
  }

  private include() {
    return {
      options: {
        where: { isDeleted: false, isActive: true },
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        include: { inventory: { select: { currentStock: true } } },
      },
    };
  }

  private mapListItem(row: CatalogMasterRow): ProductCatalogListItem {
    const options = activeOptions(row);
    const serial = toSerializable(row) as Record<string, unknown>;
    delete serial.options;
    return {
      ...serial,
      tags: Array.isArray(row.tags) ? row.tags : [],
      images: normalizeMasterImages(row.images),
      optionCount: options.length,
      representativeSku: options[0]?.sku ?? null,
      priceRange: range(options.map((o) => o.sellPrice)),
      costRange: range(options.map((o) => o.costPrice)),
      totalAvailableStock: options.reduce((sum, option) => sum + optionStock(option), 0),
    } as ProductCatalogListItem;
  }
}
```

- [ ] **Step 5: Add catalog controller**

Create `apps/server/src/products/controllers/product-catalog.controller.ts`:

```typescript
import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  ProductCatalogCountsSchema,
  ProductCatalogDetailSchema,
  ProductCatalogListResponseSchema,
  type ProductCatalogCounts,
  type ProductCatalogDetail,
  type ProductCatalogListResponse,
} from '@kiditem/shared';
import { ProductCatalogService } from '../services/product-catalog.service';
import { ListProductCatalogQuery } from '../dto/list-product-catalog.query';

@Controller('products/catalog')
export class ProductCatalogController {
  constructor(private readonly catalog: ProductCatalogService) {}

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListProductCatalogQuery,
  ): Promise<ProductCatalogListResponse> {
    return ProductCatalogListResponseSchema.parse(await this.catalog.list(companyId, q));
  }

  @Get('counts')
  async counts(
    @CurrentCompany() companyId: string,
    @Query() q: ListProductCatalogQuery,
  ): Promise<ProductCatalogCounts> {
    return ProductCatalogCountsSchema.parse(await this.catalog.counts(companyId, q));
  }

  @Get(':id')
  async detail(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<ProductCatalogDetail> {
    return ProductCatalogDetailSchema.parse(await this.catalog.detail(companyId, id));
  }
}
```

- [ ] **Step 6: Register catalog service and controller before legacy alias**

Modify `apps/server/src/products/products.module.ts`:

```typescript
import { ProductCatalogService } from './services/product-catalog.service';
import { ProductCatalogController } from './controllers/product-catalog.controller';
```

Use this registration order:

```typescript
@Module({
  controllers: [
    MastersController,
    OptionsController,
    BundleComponentsController,
    ProductCatalogController,
  ],
  providers: [
    MasterCodeService,
    MastersService,
    OptionsService,
    BundleStockService,
    BundleComponentsService,
    ProductCatalogService,
  ],
  exports: [
    MastersService,
    OptionsService,
    BundleComponentsService,
    BundleStockService,
    ProductCatalogService,
  ],
})
export class ProductsModule {}
```

- [ ] **Step 7: Run catalog test and server build**

Run:

```bash
npx vitest run apps/server/src/products/__tests__/product-catalog.service.spec.ts
npm run build --workspace=apps/server
```

Expected: PASS.

- [ ] **Step 8: Commit catalog read model**

Run:

```bash
git add apps/server/src/products/dto/list-product-catalog.query.ts apps/server/src/products/services/product-catalog.service.ts apps/server/src/products/controllers/product-catalog.controller.ts apps/server/src/products/products.module.ts apps/server/src/products/__tests__/product-catalog.service.spec.ts
git commit -m "feat: add product catalog read model"
```

---

## Task 4: Deprecated Legacy Products Alias (GET-only)

This slice ships READ-ONLY alias endpoints. PATCH/PUT are deferred — frontend write buttons are disabled in Task 5+6 and `workflows/actions/catalog.ts` PUT callers are accepted-breakage per §Deferred Work.

**Files:**
- Create: `apps/server/src/products/controllers/products-legacy.controller.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Create: `apps/server/src/products/__tests__/products-legacy.controller.spec.ts`

- [ ] **Step 1: Write legacy controller tests**

Create `apps/server/src/products/__tests__/products-legacy.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { ProductsLegacyController } from '../controllers/products-legacy.controller';
import { ProductCatalogService } from '../services/product-catalog.service';
import { MastersService } from '../services/masters.service';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

// Minimal fakes — swap with your repo's test auth harness if one exists.
class CompanyContextStub { pipe() { return 'company-1'; } }

describe('ProductsLegacyController (GET-only alias)', () => {
  let app: any;
  const catalog = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    detail: vi.fn().mockResolvedValue({ id: 'm1', options: [] }),
    counts: vi.fn().mockResolvedValue({ total: 0, gradeA: 0, gradeB: 0, gradeC: 0, adCount: 0, noAdCount: 0, draftCount: 0, processingCount: 0, processedCount: 0, discontinuedCount: 0, temporaryCount: 0 }),
  };
  const masters = {
    originalImageBase64: vi.fn().mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,AAAA' }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [ProductsLegacyController],
      providers: [
        { provide: ProductCatalogService, useValue: catalog },
        { provide: MastersService, useValue: masters },
      ],
    })
      // If @CurrentCompany requires a guard/interceptor, set it here via overrideGuard
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });

  it('GET /products returns Deprecation + Sunset headers', async () => {
    const res = await request(app.getHttpServer()).get('/products');
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBeDefined();
    expect(catalog.list).toHaveBeenCalled();
  });

  it('GET /products/pipeline-stats delegates to counts', async () => {
    await request(app.getHttpServer()).get('/products/pipeline-stats');
    expect(catalog.counts).toHaveBeenCalled();
  });

  it('GET /products/calculate-grades returns counts with no write', async () => {
    const res = await request(app.getHttpServer()).get('/products/calculate-grades');
    expect(res.status).toBe(200);
    expect(catalog.counts).toHaveBeenCalled();
  });

  it('GET /products/:id requires a UUID (non-UUID → 400)', async () => {
    const res = await request(app.getHttpServer()).get('/products/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('GET /products/:id with UUID delegates to catalog.detail', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await request(app.getHttpServer()).get(`/products/${id}`);
    expect(res.status).toBe(200);
    expect(catalog.detail).toHaveBeenCalledWith('company-1', id);
  });

  it('does NOT register PATCH /products/:id in this slice', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await request(app.getHttpServer()).patch(`/products/${id}`).send({ abcGrade: 'A' });
    expect(res.status).toBe(404);
  });

  it('does NOT register PUT /products/:id in this slice', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await request(app.getHttpServer()).put(`/products/${id}`).send({ sellPrice: 1000 });
    expect(res.status).toBe(404);
  });
});
```

Note: this test uses `@nestjs/testing` + `supertest` because `@Header` is a NestJS HTTP-layer decorator that does not fire when the controller is instantiated directly. Adjust `CurrentCompany` wiring to match the repo's existing test harness (e.g. guard override). If the repo has no existing supertest setup for products tests, adapt to the closest existing pattern (see `apps/server/src/products/__tests__/masters.controller.*.spec.ts` if one exists) rather than inventing a new harness.

- [ ] **Step 2: Run legacy test and verify it fails**

Run:

```bash
npx vitest run apps/server/src/products/__tests__/products-legacy.controller.spec.ts
```

Expected: FAIL because `ProductsLegacyController` does not exist.

- [ ] **Step 3: Implement legacy alias controller (GET-only)**

Create `apps/server/src/products/controllers/products-legacy.controller.ts`:

```typescript
import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { ProductCatalogService } from '../services/product-catalog.service';
import { MastersService } from '../services/masters.service';
import { ListProductCatalogQuery } from '../dto/list-product-catalog.query';

const DEPRECATION_HEADER = 'true';
const SUNSET_HEADER = 'Mon, 15 Jun 2026 00:00:00 GMT';

/**
 * @deprecated Use /api/products/catalog for reads, /api/products/masters for master writes,
 * /api/products/options for option writes. This controller exists only for
 * pre-existing cross-domain read callers during the product-contract migration.
 * Write methods (PATCH/PUT) are intentionally NOT registered in this slice; write-path
 * rewiring ships with the agent/workflow redesign (see plan §Deferred Work).
 */
@Controller('products')
export class ProductsLegacyController {
  constructor(
    private readonly catalog: ProductCatalogService,
    private readonly masters: MastersService,
  ) {}

  @Get()
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListProductCatalogQuery,
  ) {
    return this.catalog.list(companyId, q);
  }

  @Get('pipeline-stats')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async pipelineStats(
    @CurrentCompany() companyId: string,
    @Query() q: ListProductCatalogQuery,
  ) {
    return this.catalog.counts(companyId, q);
  }

  @Get('calculate-grades')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async calculateGrades(
    @CurrentCompany() companyId: string,
  ) {
    return {
      ok: true,
      counts: await this.catalog.counts(companyId),
    };
  }

  @Get(':id/original-image-base64')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async originalImageBase64(
    @CurrentCompany() companyId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.masters.originalImageBase64(companyId, id);
  }

  @Get(':id')
  @Header('Deprecation', DEPRECATION_HEADER)
  @Header('Sunset', SUNSET_HEADER)
  async detail(
    @CurrentCompany() companyId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.catalog.detail(companyId, id);
  }
}
```

Notes:
- `calculate-grades` is GET (not POST) because this slice ships a read-only stub. The existing action-task caller was POSTing; after this slice, it will 404 on POST and succeed on GET. If the caller cannot be updated here (it lives in `apps/server/src/action-task/action-task.service.ts` which is out of scope), accept the POST→404 breakage and capture it in §Deferred Work.
- Registration order (Step 4) is what prevents `/api/products/catalog` from being caught by `:id`. `ParseUUIDPipe` is a defensive secondary filter, not the primary collision guard.

- [ ] **Step 4: Register legacy controller last**

Modify `apps/server/src/products/products.module.ts`:

```typescript
import { ProductsLegacyController } from './controllers/products-legacy.controller';
```

Controllers array:

```typescript
controllers: [
  MastersController,
  OptionsController,
  BundleComponentsController,
  ProductCatalogController,
  ProductsLegacyController, // last — must resolve AFTER sibling /products/* controllers
],
```

- [ ] **Step 5: Run legacy test and server build**

```bash
npx vitest run apps/server/src/products/__tests__/products-legacy.controller.spec.ts
npm run build --workspace=apps/server
```

Expected: PASS.

- [ ] **Step 6: Commit legacy alias**

```bash
git add apps/server/src/products/controllers/products-legacy.controller.ts apps/server/src/products/products.module.ts apps/server/src/products/__tests__/products-legacy.controller.spec.ts
git commit -m "feat: add GET-only deprecated products alias"
```

---

## Task 5: Product List, Selector, And Query Keys

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/components/product/ProductSelector.tsx`
- Modify: `apps/web/src/app/products/page.tsx`
- Modify: `apps/web/src/app/products/components/ProductFilterBar.tsx`
- Modify: `apps/web/src/app/products/components/ProductListItem.tsx`
- Modify: `apps/web/src/app/products/components/ProductListTable.tsx`
- Modify: `apps/web/src/app/products/components/AddProductModal.tsx`

- [ ] **Step 1: Add catalog query key sub-namespace**

Modify `apps/web/src/lib/query-keys.ts` inside `products`:

```typescript
  products: {
    all: ['products'] as const,
    list: (params: Record<string, string>) => [...queryKeys.products.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.products.all, 'detail', id] as const,
    pipelineStats: (status?: string) => [...queryKeys.products.all, 'pipelineStats', status] as const,
    inspection: (id: string) => [...queryKeys.products.all, 'inspection', id] as const,
    catalog: {
      all: ['products', 'catalog'] as const,
      list: (params: Record<string, string>) => [...queryKeys.products.catalog.all, 'list', params] as const,
      detail: (id: string) => [...queryKeys.products.catalog.all, 'detail', id] as const,
      counts: (status?: string) => [...queryKeys.products.catalog.all, 'counts', status] as const,
    },
  },
```

- [ ] **Step 2: Rewire ProductSelector to catalog route**

Modify `apps/web/src/components/product/ProductSelector.tsx`:

```typescript
import { ProductCatalogListResponseSchema, type ProductCatalogListItem } from '@kiditem/shared';
```

Replace the local `Product` interface:

```typescript
interface Product {
  id: string;
  name: string;
  imageUrl: string | null;
  sku: string | null;
}

function toSelectorProduct(item: ProductCatalogListItem): Product {
  return {
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl ?? item.thumbnailUrl,
    sku: item.representativeSku,
  };
}
```

Replace the search request:

```typescript
apiClient
  .getParsed(`/api/products/catalog?search=${encodeURIComponent(query)}&limit=10`, ProductCatalogListResponseSchema)
  .then((data) => setResults(data.items.map(toSelectorProduct)))
  .catch(() => setResults([]))
  .finally(() => setSearching(false));
```

- [ ] **Step 3: Rewire products page imports and queries**

Modify `apps/web/src/app/products/page.tsx` imports:

```typescript
import {
  ProductCatalogCountsSchema,
  ProductCatalogListResponseSchema,
  type ProductCatalogCounts,
  type ProductCatalogListItem as Product,
} from "@kiditem/shared";
```

Replace `DEFAULT_PIPELINE`:

```typescript
const DEFAULT_PIPELINE: ProductCatalogCounts = {
  total: 0,
  gradeA: 0,
  gradeB: 0,
  gradeC: 0,
  adCount: 0,
  noAdCount: 0,
  draftCount: 0,
  processingCount: 0,
  processedCount: 0,
  discontinuedCount: 0,
  temporaryCount: 0,
};
```

Replace products query:

```typescript
const { data: productsData, isLoading, error: productsError } = useQuery({
  queryKey: queryKeys.products.catalog.list(queryParams),
  queryFn: () => {
    const params = new URLSearchParams(queryParams);
    return apiClient.getParsed(`/api/products/catalog?${params}`, ProductCatalogListResponseSchema);
  },
});
```

Replace counts query:

```typescript
const { data: pipelineCounts = DEFAULT_PIPELINE } = useQuery({
  queryKey: queryKeys.products.catalog.counts(statusFilter !== "all" ? statusFilter : undefined),
  queryFn: () => {
    const statusParam = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    return apiClient.getParsed(`/api/products/catalog/counts${statusParam}`, ProductCatalogCountsSchema);
  },
});
```

Replace Excel download fetch:

```typescript
const data = await apiClient.getParsed(`/api/products/catalog?${params}`, ProductCatalogListResponseSchema);
```

In the Excel export mapping, use:

```typescript
SKU: p.representativeSku,
매입가: p.costRange ? `${p.costRange.min}-${p.costRange.max}` : '',
판매가: p.priceRange ? `${p.priceRange.min}-${p.priceRange.max}` : '',
재고: p.totalAvailableStock,
상태: p.pipelineStep ?? '',
```

Remove sales/traffic columns that are not provided by `ProductCatalogListItem`: `revenue`, `netProfit`, `profitRate`, `adRate`, `t14`, `t14prev`, `traffic`, and `gradeScore`.

- [ ] **Step 4: Rewire product list components**

Replace imports in these files:

```typescript
import type { ProductCatalogListItem as Product } from '@kiditem/shared';
```

Files:

- `apps/web/src/app/products/components/ProductFilterBar.tsx`
- `apps/web/src/app/products/components/ProductListItem.tsx`
- `apps/web/src/app/products/components/ProductListTable.tsx`

Field rewrites:

```typescript
p.sku -> p.representativeSku
p.costPrice -> p.costRange?.min
p.sellPrice -> p.priceRange?.min
p.currentStock -> p.totalAvailableStock
p.status -> p.pipelineStep
```

For display ranges use this helper in the component file that renders price text:

```typescript
function formatRange(range: { min: number; max: number } | null): string {
  if (!range) return '-';
  if (range.min === range.max) return `${formatKRW(range.min)}원`;
  return `${formatKRW(range.min)}-${formatKRW(range.max)}원`;
}
```

- [ ] **Step 5: Rewire AddProductModal to master creation**

Modify `apps/web/src/app/products/components/AddProductModal.tsx` mutation:

```typescript
mutationFn: () => apiClient.post('/api/products/masters', {
  name: form.name,
  description: form.description ?? '',
  category: form.category || undefined,
  brand: form.brand || undefined,
  sourceUrl: form.sourceUrl || undefined,
  imageUrl: form.imageUrl || undefined,
  thumbnailUrl: form.thumbnailUrl || undefined,
  pipelineStep: 'draft',
}),
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.products.catalog.all });
},
```

Remove form inputs and payload fields for SKU, cost price, sell price, commission rate, shipping cost, and stock from this modal.

- [ ] **Step 6: Run web build — diagnostic only, DO NOT commit**

```bash
npm run build --workspace=apps/web
```

Expected: the product-list phantom import errors disappear. Remaining errors come from product detail / image hooks paths and will be fixed in Task 6. Do NOT commit here — a commit at this point leaves the web build red for anyone checking out the commit. The staged list-path files will be committed together with Task 6 detail-path files at the end of Task 6.

Stage the list-path files so Task 6's final commit picks them up:

```bash
git add apps/web/src/lib/query-keys.ts apps/web/src/components/product/ProductSelector.tsx apps/web/src/app/products/page.tsx apps/web/src/app/products/components/ProductFilterBar.tsx apps/web/src/app/products/components/ProductListItem.tsx apps/web/src/app/products/components/ProductListTable.tsx apps/web/src/app/products/components/AddProductModal.tsx
```

---

## Task 6: Product Detail, Disabled Actions, And Images

**Files:**
- Modify: `apps/web/src/app/products/[id]/page.tsx`
- Modify: `apps/web/src/app/products/[id]/components/ProductInfoCards.tsx`
- Modify: `apps/web/src/app/products/[id]/components/ProductMetrics.tsx`
- Modify: `apps/web/src/app/products/[id]/components/ProductSidebar.tsx`
- Modify: `apps/web/src/app/products/[id]/components/HealthDiagnosis.tsx`
- Modify: `apps/web/src/app/products/[id]/hooks/useProductActions.ts`
- Modify: `apps/web/src/hooks/useProductImages.ts`
- Modify: `apps/web/src/hooks/__tests__/useProductImages.test.ts`

- [ ] **Step 1: Rewire product detail fetch**

Modify `apps/web/src/app/products/[id]/page.tsx` imports:

```typescript
import { ProductCatalogDetailSchema, type ProductCatalogDetail as Product } from "@kiditem/shared";
```

Replace main query:

```typescript
const { data: product, isLoading: loading, error: productError } = useQuery({
  queryKey: queryKeys.products.catalog.detail(productId),
  queryFn: () => apiClient.getParsed(`/api/products/catalog/${productId}`, ProductCatalogDetailSchema),
  enabled: !!productId,
});
const error = productError ? "데이터를 불러오지 못했습니다." : !loading && !product ? "상품을 찾을 수 없습니다." : null;
```

Replace the legacy `/api/inventory?productId=` call with the canonical `masterId` parameter (server already supports it per `apps/server/src/inventory/dto/list-inventory-query.dto.ts:27-29`). The `productId` route param is the master id:

```typescript
const { data: inventoryData } = useQuery({
  queryKey: queryKeys.inventory.byMaster(productId),
  queryFn: () => apiClient.get(`/api/inventory?masterId=${productId}`),
  enabled: !!productId,
});
const inventory = inventoryData ?? null;
```

Add `byMaster` to `queryKeys.inventory` in `apps/web/src/lib/query-keys.ts` if not already present. This is a one-line identity fix, not a feature change — the sidebar keeps showing inventory.

- [ ] **Step 2: Rewire product metrics to catalog ranges**

Modify `ProductMetrics.tsx` import:

```typescript
import type { ProductCatalogDetail as Product } from '@kiditem/shared';
```

Replace the margin calculation:

```typescript
const representativeOption = product.options[0] ?? null;
const sellPrice = representativeOption?.sellPrice ?? product.priceRange?.min ?? null;
const costPrice = representativeOption?.costPrice ?? product.costRange?.min ?? null;
const marginRate =
  sellPrice && sellPrice > 0 && costPrice && costPrice > 0
    ? (sellPrice - costPrice) / sellPrice
    : null;
const badge = getProductStatusBadge(product.pipelineStep ?? 'draft');
```

Replace metric values:

```typescript
value={sellPrice ? `${formatKRW(sellPrice)}원` : "-"}
value={costPrice ? `${formatKRW(costPrice)}원` : "-"}
value={representativeOption?.commissionRate != null ? formatPercent(Number(representativeOption.commissionRate) * 100) : "-"}
```

- [ ] **Step 3: Rewire product info cards**

Modify `ProductInfoCards.tsx` import:

```typescript
import type { ProductCatalogDetail as Product } from "@kiditem/shared";
```

Replace the master price block with option rows:

```typescript
{product.options.length > 0 && (
  <>
    <div className="border-t border-slate-100 my-2" />
    {product.options.map((option) => (
      <div key={option.id} className="rounded-lg border border-slate-100 p-2 space-y-1">
        <InfoRow label="옵션" value={option.optionName ?? option.sku} />
        <InfoRow label="SKU" value={option.sku} />
        <InfoRow label="매입가" value={option.costPrice ? `₩${formatKRW(option.costPrice)}` : "-"} />
        <InfoRow label="판매가" value={option.sellPrice ? `₩${formatKRW(option.sellPrice)}` : "-"} />
      </div>
    ))}
  </>
)}
```

Replace inventory display fallback:

```typescript
<InfoRow label="총 가용 재고" value={`${product.totalAvailableStock}개`} />
```

- [ ] **Step 4: Rewire ProductSidebar and HealthDiagnosis imports**

In `ProductSidebar.tsx` and `HealthDiagnosis.tsx`, replace:

```typescript
import type { ProductDetail as Product } from '@kiditem/shared';
```

with:

```typescript
import type { ProductCatalogDetail as Product } from '@kiditem/shared';
```

Field rewrites:

```typescript
product.status -> product.pipelineStep
product.sku -> product.representativeSku
product.sellPrice -> product.priceRange?.min
product.costPrice -> product.costRange?.min
product.commissionRate -> product.options[0]?.commissionRate
product.shippingCost -> product.options[0]?.shippingCost
```

- [ ] **Step 5: Stub out product action backend plumbing (UI stays)**

The 4 legacy actions (`product.adjust_price`, `product.stop_ads`, `product.discontinue`, `product.change_grade`) posted mixed master+option fields to `PATCH /api/products/:id`, which no longer exists. UI surfaces (buttons, modals, confirmation dialogs) stay as-is so the detail page layout does not visibly regress. Only the backend call is removed. Canonical write wiring ships with the agent/workflow redesign.

Modify `apps/web/src/app/products/[id]/hooks/useProductActions.ts`:

```typescript
import type { ProductCatalogDetail as Product } from "@kiditem/shared";
```

Inside `handleAction`, keep the `type.startsWith("product.")` branch but strip the `apiClient.patch(/api/products/...)` call and its error-path plumbing. Minimum acceptable behavior for each of the 4 action types:

```typescript
} else if (type.startsWith("product.") && actionParams.productId) {
  // UI stays; backend wiring deferred to agent/workflow redesign.
  toast.info(`${action.label}: 기능 준비 중`, { duration: 3000 });
  return;
```

Rules for this step:

- Do NOT call `PATCH /api/products/:id` (endpoint removed).
- Do NOT call `PATCH /api/products/masters/:id` or `/api/products/options/:optionId` (those belong to the write-path slice).
- Keep all action buttons rendered where they are. Keep grade-picker / price-adjust modals renderable — they just no longer submit anywhere.
- Do not invalidate `queryKeys.products.catalog.detail` since nothing changed server-side.
- Replace any `product.masterProduct.costPrice`/`sellPrice` reads that existed only for optimistic UI with option-level reads (consistent with Steps 2-4) so the file compiles.

Net effect: users can click through to the confirmation modal and hit "확인". Nothing persists; the toast acknowledges the click. When the write-path slice lands, only the backend call returns.

- [ ] **Step 6: Rewire useProductImages to master image routes**

Modify `apps/web/src/hooks/useProductImages.ts` import:

```typescript
import type { MasterImageItem } from '@kiditem/shared';
```

Type changes:

```typescript
const [images, setImages] = useState<MasterImageItem[]>([]);
```

Fetch:

```typescript
apiClient
  .get<{ images?: unknown }>(`/api/products/masters/${productId}`)
```

Upload:

```typescript
`/api/products/masters/${productId}/images/upload`
```

Save:

```typescript
await apiClient.patch(`/api/products/masters/${productId}`, { images: imgs });
```

Function signatures:

```typescript
async (imgs: MasterImageItem[]) => {
```

- [ ] **Step 7: Update useProductImages tests**

Modify `apps/web/src/hooks/__tests__/useProductImages.test.ts` expected calls:

```typescript
expect(mockGet).toHaveBeenCalledWith('/api/products/masters/prod-1');
expect(mockUpload).toHaveBeenCalledWith(
  '/api/products/masters/prod-1/images/upload',
  expect.any(FormData),
);
expect(mockPatch).toHaveBeenCalledWith('/api/products/masters/prod-1', {
  images: [{ url: 'https://cdn.example.com/a.png', role: 'product', label: '', sortOrder: 0 }],
});
```

- [ ] **Step 8: Run product image tests and web build**

Run:

```bash
npm run test --workspace=apps/web -- src/hooks/__tests__/useProductImages.test.ts
npm run build --workspace=apps/web
```

Expected: web build is GREEN at this point (no phantom import errors from in-scope files). Any remaining errors must be from out-of-scope files (`apps/web/src/app/image-hub`, `apps/web/src/app/thumbnail-editor`) — those are handled by their own domain plans and filtered out of Task 7's grep gate.

- [ ] **Step 9: Commit product list + detail rewire atomically**

This single commit captures Task 5 staged files (product list path) and Task 6 files (product detail path) together. Committing here keeps the web build green at every commit boundary.

```bash
# optionally include inventory query-key update if added in Step 1
git add apps/web/src/lib/query-keys.ts
git add 'apps/web/src/app/products/[id]/page.tsx' 'apps/web/src/app/products/[id]/components/ProductInfoCards.tsx' 'apps/web/src/app/products/[id]/components/ProductMetrics.tsx' 'apps/web/src/app/products/[id]/components/ProductSidebar.tsx' 'apps/web/src/app/products/[id]/components/HealthDiagnosis.tsx' 'apps/web/src/app/products/[id]/hooks/useProductActions.ts' apps/web/src/hooks/useProductImages.ts apps/web/src/hooks/__tests__/useProductImages.test.ts
git commit -m "feat: rewire product list + detail to catalog contract"
```

Verify with `git show --stat HEAD` that Task 5 staged files (products/page.tsx, ProductSelector, ProductFilterBar, ProductListItem, ProductListTable, AddProductModal, query-keys.ts) AND Task 6 files are in the single commit.

---

## Task 7: Verification Gates

**Files:**
- Verify: `docs/superpowers/specs/2026-04-24-product-contract-rewire-design.md`
- Verify: all changed shared/server/web files

- [ ] **Step 1: Run schema and build verification**

Run:

```bash
npx vitest run packages/shared/src/schemas/product.spec.ts
npx vitest run apps/server/src/products/services/__tests__/product-image-normalizer.spec.ts
npx vitest run apps/server/src/products/__tests__/product-catalog.service.spec.ts
npx vitest run apps/server/src/products/__tests__/products-legacy.controller.spec.ts
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

Expected: every command passes.

- [ ] **Step 2: Run product-contract grep gates (scoped to product-domain files only)**

The gates are intentionally scoped to files this slice owns. Out-of-scope phantom imports in other domains (e.g. `apps/web/src/app/image-hub`, `apps/web/src/app/thumbnail-editor`, ad-ops, stock-ops) are NOT this slice's responsibility and will be cleaned up by each domain's own plan.

```bash
# (a) no direct /api/products root calls inside scoped product-domain files
#     (the legacy alias controller is the only allowed server-side match)
rg -n '/api/products(?!/(masters|options|bundle-components|catalog))' \
  apps/web/src/app/products apps/web/src/components/product apps/server/src/products --pcre2 \
  | rg -v 'apps/server/src/products/controllers/products-legacy\.controller\.ts'

# (b) no phantom shared-type imports inside scoped product-domain files
rg -n '\bProductListItem\b|\bProductDetail\b|\bProductImageItem\b|\bPipelineCounts\b' \
  apps/web/src/app/products apps/web/src/components/product apps/web/src/hooks/useProductImages.ts packages/shared/src

# (c) no master-level price reads inside scoped product-domain files
rg -n 'masterProduct\.costPrice|masterProduct\.sellPrice' \
  apps/web/src/app/products apps/web/src/components/product

# (d) no legacy inventory productId identity mismatch on the detail page
rg -n 'api/inventory\?productId=' 'apps/web/src/app/products/[id]'

# (e) no legacy PATCH /api/products/:id writes from useProductActions
rg -n "apiClient\\.(patch|put)\\(['\\\"\\`]/api/products/" 'apps/web/src/app/products/[id]'
```

Expected: zero output from every command. Gate (a) filter — the only legitimate occurrence of `/api/products` (root) is the deprecated alias controller file; it is filtered out.

Known NOT-in-scope violations that are acceptable to skip here and track as follow-up:

```bash
# documentation only — do NOT fail the gate on these
rg -n '\bProductImageItem\b' apps/web/src/app/image-hub apps/web/src/app/thumbnail-editor || true
```

These 4 files (`image-hub/page.tsx`, `image-hub/components/ImageGrid.tsx`, `thumbnail-editor/components/EditorInputPanel.tsx`, `thumbnail-editor/components/HubInlinePicker.tsx`) already imported the phantom type before this slice; their migration is tracked under "Out-of-scope phantom import cleanup" in §Deferred Work.

- [ ] **Step 3: Run server boot verification**

Run:

```bash
npm run dev:server
```

Expected: Nest starts without DI errors. Stop the watch process after boot is confirmed.

- [ ] **Step 4: Inspect diff for accidental cross-domain rewrites**

Run:

```bash
git diff --stat
git diff --name-only
```

Expected: changed implementation files stay within:

- `packages/shared/src`
- `apps/server/src/products`
- `apps/web/src/app/products`
- `apps/web/src/components/product`
- `apps/web/src/hooks/useProductImages.ts`
- `apps/web/src/hooks/__tests__/useProductImages.test.ts`
- `apps/web/src/lib/query-keys.ts`

The spec file and this plan file may also be changed.

- [ ] **Step 5: Verify git state is clean (no follow-up commit needed)**

Task 1+2, Task 3, Task 4, and Task 5+6 each committed atomically within their own task. Task 7 is verification only and produces no code changes.

```bash
git status
git log --oneline $(git merge-base HEAD main)..HEAD
```

Expected:
- `git status` shows a clean working tree (any docs/plan tweaks made during verification should be committed separately with `docs:` prefix, not bundled).
- `git log` shows 4 product-contract commits: shared+normalizer, catalog read model, GET-only alias, list+detail rewire. No red-build intermediate commits.

If a docs tweak (spec §3.4 ParseUUIDPipe narrative, plan clarification) was made during this slice and is not yet committed:

```bash
git add docs/superpowers/specs/2026-04-24-product-contract-rewire-design.md docs/superpowers/plans/2026-04-24-product-contract-rewire.md TODOS.md
git commit -m "docs: product contract rewire spec v2.1 + plan updates"
```

Do NOT bundle docs into the implementation commits.

---

## Deferred Work

Everything below is intentionally OUT of this slice. Each item captures enough context that a future plan can pick it up without re-deriving scope.

### Agent / Workflow redesign dependencies

These files compile today but reference legacy `/api/products/*` URLs in action templates and will 404 at runtime after this slice lands. They are left untouched here because the agent/workflow layer is scheduled for its own redesign.

- `apps/server/src/workflows/actions/catalog.ts:27,37,47,62` — 4 action templates (`product.adjust_price` PUT `/api/products/:id` with sellPrice; `product.stop_ads`; `product.discontinue`; `product.change_grade`). Runtime breakage accepted.
- `apps/server/src/action-task/action-task.service.ts:411,419,435,453` — write-like calls to `/api/products/*`. Reads via `/api/products` keep working through the GET alias; writes (if any) will 404.
- Frontend: `useProductActions` 4 action branches have their fetch removed in Task 6 Step 5; UI buttons + confirmation modals stay rendered and surface a "기능 준비 중" toast until the redesign wires them to canonical writes.

Next plan: design the canonical action surface (multi-option picker + spec §6.1 write-path matrix) and migrate these callers.

### Cross-domain phantom `ProductImageItem` cleanup

Pre-existing phantom imports in out-of-scope files:

- `apps/web/src/app/image-hub/page.tsx:12`
- `apps/web/src/app/image-hub/components/ImageGrid.tsx:5`
- `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx:8`
- `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx:9`

These files import a shared type that never existed. Each belongs to a different domain; cleanup happens in that domain's own plan.

### Product-domain UX follow-ups (not build-blockers)

- `AddProductModal` option-creation flow — after this slice the modal creates master only. The option-add flow (sku / prices / stock) is a separate UX design.
- `useProductImages` error state surfacing — existing TODOS.md item retains its context.

### Performance / security polish

- `ProductCatalogService.counts` — replace in-memory counting with Prisma `groupBy` once product count passes ~10k.
- `MastersService.originalImageBase64` — add domain allowlist (`*.alicdn.com`, configured CDN hosts) before `fetch(url)` to close SSRF-adjacent surface. Preexisting behavior; not widened by this slice.

---

## Self-Review

Spec coverage (v2 read paths only):

- `/api/products/catalog` list/detail/counts: Task 3.
- GET-only deprecated `/api/products` alias with Deprecation/Sunset headers and UUID defense on `:id`: Task 4.
- No new root `/api/products` product-domain callers: Task 5, Task 6, Task 7 grep gates.
- Shared phantom type removal within scoped files: Task 1, Task 5, Task 6.
- `MasterSchema.images` structured shape and server-side normalization in a single atomic commit: Task 1 + Task 2.
- Product catalog stock read-time calculation: Task 3.
- No master-level price reads inside product-domain UI: Task 5, Task 6, Task 7 grep gate (c).
- Legacy identity mismatch on detail page `/api/inventory?productId=` → `?masterId=`: Task 6 Step 1.
- Verification: Task 7 (scoped grep + build + dev:server boot).

Surgical removals (only what the new schema actually rejects):

- `useProductActions` `product.*` branch — legacy `PATCH /api/products/:id` fetch removed, replaced with a "기능 준비 중" toast. UI buttons and confirmation modals stay rendered: Task 6 Step 5.
- `AddProductModal` flat SKU/price/stock inputs and payload fields (these do not fit the master table and would fail DTO validation): Task 5 Step 5.
- Legacy alias PATCH/PUT endpoints: never registered in this slice (Task 4 Step 3).

Explicit deferrals (tracked in §Deferred Work):

- Canonical write-path rewire (spec §6.1 write-path matrix).
- Agent/workflow action redesign.
- Cross-domain phantom `ProductImageItem` cleanup.
- `AddProductModal` option-creation UX.
- `useProductImages` error state.

Type consistency:

- Shared image type is `MasterImageItem`.
- Wire master type remains `Master`.
- Catalog item/detail/counts types are `ProductCatalogListItem`, `ProductCatalogDetail`, and `ProductCatalogCounts`.
- `ProductCatalogController` returns parsed shared schemas.
- `ProductsLegacyController` delegates GET reads to `ProductCatalogService` and `MastersService`; exposes no write methods.

Commit boundaries (each leaves the repo green):

1. Task 1+2 atomic — shared contract + server normalizer.
2. Task 3 — catalog read model.
3. Task 4 — GET-only legacy alias.
4. Task 5+6 atomic — list path + detail path rewire with write UI deletion.
5. Task 7 — verification (no code commit).
