# Deterministic Sellpia Recipe Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확정 가능한 채널 옵션과 Sellpia SKU 관계는 중앙 `ProductVariantComponent`에 자동 적용하고, 수량·중복·충돌·이름 불충분 항목은 상품 매칭 센터에서 운영자가 이유와 후보를 확인하도록 만든다.

**Architecture:** Channels는 채널 증거 수집, 결정적 판정, 계정별 미리보기와 적용 오케스트레이션을 소유한다. Products는 `ProductVariant` 잠금 아래 비어 있는 중앙 레시피만 `source='deterministic'`으로 생성하며 기존 수동/자동 레시피를 절대 덮어쓰지 않는다. Inventory는 활성 Sellpia SKU 증거와 공통 가용 재고만 제공하고 `currentStock`의 유일한 writer로 남는다.

**Tech Stack:** TypeScript 5.8, NestJS 11, Prisma 7, PostgreSQL 17, Zod 3, Next.js, React Query, Radix UI, Vitest, Testcontainers

## Global Constraints

- 현재 실데이터 기준선은 상품 `1,228/1,228`, 옵션 `2,245/2,245`, 확정 레시피 `0/2,245`다.
- 변경 분류는 하나의 catalog-inventory business domain 안에서 Shared·Channels·Products·Inventory·Web을 잇는 cross-layer ownership extension이며 10개 이상 파일을 변경한다. 새 stock owner나 channel recipe table을 만들지 않는 reconstruction-compatible behavior change로 리뷰한다.
- 현재 읽기 전용 분류는 `unique_code=129`, `quantity_review=23`, `name_review_only=138`, `no_match=1,955`다. 새 이름+옵션 규칙을 구현한 뒤 수치는 반드시 다시 계산한다.
- 자동 적용은 `ProductVariant` 단위다. 같은 운영 옵션을 공유하는 여러 채널 옵션을 중복 레시피로 세지 않는다.
- 자동 적용은 명시적인 계정별 미리보기 후 한 번의 적용 명령으로 실행한다. 페이지 조회, 후보 조회, 재고 수집 자체는 쓰기를 발생시키지 않는다.
- 기존 `ProductVariantComponent`가 하나라도 있으면 자동 적용은 그 운영 옵션을 보존하고 `already_configured`로 건너뛴다.
- 자동 적용 가능한 레시피는 이번 범위에서 단일 활성 Sellpia SKU와 `quantity=1`만 허용한다. 묶음, 다중 구성품, 수량 불일치는 운영자 검토로 보낸다.
- 고유 상품코드, typed provider barcode, 엄격한 정규화 상품명+옵션명이 같은 Sellpia SKU를 가리키고 반대 증거가 없을 때만 자동 적용한다. `rawJson` alias나 출처를 알 수 없는 일반 문자열은 barcode 증거로 사용하지 않는다.
- 이름 정규화는 Unicode `NFKC`, 소문자화, 모든 Unicode 공백 제거만 수행한다. 숫자, 단위, 색상, 사이즈, `+`, `-`, `/`, `&` 등 의미 있는 문자는 보존한다.
- 상품명 자동 확정은 Sellpia 활성 SKU가 조직 안에서 하나뿐이고 옵션 호환성이 확인될 때만 허용한다. 상품명만 같고 옵션이 다르거나 비어 있는 중복 후보는 자동 확정하지 않는다.
- 코드/바코드/이름 증거가 서로 다른 Sellpia SKU를 가리키면 코드 우선으로 덮지 않고 `conflict`로 차단한다.
- 자동 레시피는 `source='deterministic'`, `confirmedBy=null`, 적용 시점의 `confirmedAt`을 기록한다. 운영자가 이후 상품 상세에서 수정하면 완전 교체되어 `source='manual'`, `confirmedBy=<user>`가 된다.
- `SellpiaInventorySku.currentStock`은 어떤 매칭·레시피·Rocket 작업에서도 변경하지 않는다.
- 가용 재고는 `max(currentStock - activeCommitmentQuantity, 0)`이며, 판매 가능 수량은 모든 구성품의 `floor(availableStock / quantity)` 최솟값이다.
- 공식 매칭 엑셀 import는 파일 계약을 받지 못했으므로 이 계획 범위가 아니다. 미해결 행은 숨기지 않고 운영자 검토 큐에 유지한다.
- Prisma 스키마 변경은 없다. 기존 `ProductVariantComponent.source`의 `deterministic` 값을 사용한다.
- 새 persisted behavior이므로 루트 `VERSION`은 `0.1.21`에서 `0.1.22`로 올린다. 시작 시 자동 backfill이나 데이터 마이그레이션은 추가하지 않는다.
- 별도 worktree를 만들지 않는다. 현재 worktree의 `.github/workflows/pr-checks.yml`, `.github/workflows/develop-validation.yml`, `docs/TESTING.md`, `docs/runbooks/deployment-architecture.md` 변경은 사용자 소유이므로 건드리지 않는다.

---

## File Structure

- `packages/shared/src/schemas/channel-recipe-automation.ts`: 자동 판정, 미리보기, 적용 요청/응답의 Zod 계약을 소유한다.
- `packages/shared/src/channel-recipe-automation.ts`: `@kiditem/shared/channel-recipe-automation` focused export를 제공한다.
- `packages/shared/package.json`: 새 focused subpath export와 `typesVersions`를 추가한다.
- `apps/server/src/channels/domain/channel-recipe-suggestion.ts`: 코드·바코드·상품명+옵션·수량 증거의 순수 분류 정책을 소유한다.
- `apps/server/src/channels/domain/channel-recipe-suggestion.spec.ts`: 자동 가능/검토/차단 판정 행렬을 고정한다.
- `apps/server/src/channels/application/port/out/cross-domain/sellpia-recipe-evidence.port.ts`: Channels가 Inventory에서 읽는 코드·바코드·이름 증거 계약을 소유한다.
- `apps/server/src/channels/adapter/out/inventory/sellpia-recipe-evidence.adapter.ts`: Inventory read capability를 Channels 증거 모델로 변환한다.
- `apps/server/src/channels/application/port/out/repository/channel-recipe-automation-context.repository.port.ts`: 계정별 중앙 variant 컨텍스트 일괄 조회 계약을 소유한다.
- `apps/server/src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.ts`: 선택 계정의 variant를 찾고 조직 전체 공유 옵션 증거를 bounded query로 읽는다.
- `apps/server/src/products/application/port/in/product-variant-recipe-automation.port.ts`: Products가 노출하는 결정적 레시피 일괄 적용 capability를 소유한다.
- `apps/server/src/products/application/port/out/repository/product-operations.repository.port.ts`: 잠금 기반 `applyDeterministicRecipesIfEmpty` 저장 계약을 추가한다.
- `apps/server/src/products/application/service/product-variant-recipe-automation.service.ts`: Products incoming capability를 구현한다.
- `apps/server/src/products/adapter/out/repository/product-operations.repository.adapter.ts`: 중앙 variant 잠금, 기존 레시피 보존, 활성 SKU 검증, 결정적 component 생성을 한 트랜잭션에 수행한다.
- `apps/server/src/channels/application/service/channel-recipe-automation.service.ts`: 계정별 preview hash 계산과 Products 일괄 적용을 조합한다.
- `apps/server/src/channels/adapter/in/http/channel-product-matching.controller.ts`: preview GET과 apply POST를 노출한다.
- `apps/server/src/channels/channels.module.ts`, `apps/server/src/products/products.module.ts`: 새 포트와 서비스를 wiring/export한다.
- `apps/web/src/app/(catalog)/product-hub/matching/components/RecipeAutomationPanel.tsx`: 자동 가능/검토/차단 요약과 적용 확인 다이얼로그를 소유한다.
- `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuMappingTable.tsx`: 옵션 행별 자동/검토 이유와 적용 출처를 표시한다.
- `apps/web/src/app/(catalog)/product-hub/matching/components/RecipeSuggestionDialog.tsx`: 자동 적용 가능 여부, 추천 수량, 현재 레시피 출처를 설명한다.
- `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.ts`: preview/apply React Query 흐름과 invalidation을 소유한다.
- `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.ts`: 새 HTTP 계약을 Zod로 파싱한다.
- `apps/web/src/lib/query-keys.ts`: 계정별 recipe automation preview key를 추가한다.
- `docs/runbooks/channel-sellpia-matching.md`: 결정적 자동 적용과 운영자 큐의 실제 운영 절차를 설명한다.
- `docs/ARCHITECTURE.md`와 관련 scoped `AGENTS.md`: 중앙 recipe 소유권은 유지하면서 이름/코드 증거의 새로운 자동 확정 예외를 반영한다.

### Task 1: Freeze The Deterministic Decision Contract

**Files:**
- Create: `packages/shared/src/schemas/channel-recipe-automation.ts`
- Create: `packages/shared/src/schemas/channel-recipe-automation.spec.ts`
- Create: `packages/shared/src/channel-recipe-automation.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/schemas/channel-product-matching.ts`
- Modify: `packages/shared/src/schemas/channel-product-matching.spec.ts`
- Modify: `apps/server/src/channels/domain/channel-recipe-suggestion.ts`
- Modify: `apps/server/src/channels/domain/channel-recipe-suggestion.spec.ts`

**Interfaces:**
- Consumes: existing `ChannelRecipeSuggestionInput`, Sellpia code/name/option facts, shared channel option identifiers.
- Produces: `ChannelRecipeAutomationDecision`, `ChannelRecipeAutomationReason`, `ChannelRecipeAutomationPreview`, `ApplyChannelRecipeAutomationInput`, `classifyChannelRecipeSuggestion(input)` with `automationDecision` and `recommendedQuantity`.

- [ ] **Step 1: Write the failing shared contract tests**

Create strict schemas with these exact values and invariants.

```ts
import { describe, expect, it } from 'vitest';
import {
  ApplyChannelRecipeAutomationInputSchema,
  ChannelRecipeAutomationPreviewSchema,
} from './channel-recipe-automation';

describe('channel recipe automation contracts', () => {
  it('accepts a version-fenced preview with explicit variant and option counts', () => {
    expect(ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        variants: 3,
        affectedOptions: 4,
        autoApply: 1,
        operatorReview: 1,
        blocked: 1,
        alreadyConfigured: 0,
      },
      items: [],
    }).proposalVersion).toHaveLength(64);
  });

  it('requires the exact preview version when applying', () => {
    expect(() => ApplyChannelRecipeAutomationInputSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'stale',
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the shared contract test and verify RED**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-recipe-automation.spec.ts
```

Expected: FAIL because the new schema module does not exist.

- [ ] **Step 3: Implement the focused shared contract**

Define the exact public types below. Every preview item is central-variant scoped and carries all affected channel option IDs.

```ts
import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ChannelRecipeAutomationDecisionSchema = z.enum([
  'auto_apply',
  'operator_review',
  'blocked',
  'already_configured',
]);

export const ChannelRecipeAutomationReasonSchema = z.enum([
  'exact_unique_code',
  'unique_physical_barcode',
  'exact_unique_name_option',
  'quantity_review',
  'conflict',
  'ambiguous',
  'name_review_only',
  'no_match',
  'already_configured',
]);

export const ChannelRecipeAutomationItemSchema = z.object({
  productVariantId: z.string().uuid(),
  masterProductId: z.string().uuid(),
  channelListingOptionIds: z.array(z.string().uuid()).min(1),
  decision: ChannelRecipeAutomationDecisionSchema,
  reason: ChannelRecipeAutomationReasonSchema,
  sellpiaInventorySkuId: z.string().uuid().nullable(),
  sellpiaCode: z.string().min(1).nullable(),
  recommendedQuantity: z.number().int().positive().nullable(),
  evidenceLabels: z.array(z.string().min(1)),
}).strict().superRefine((item, ctx) => {
  if (item.decision === 'auto_apply'
    && (!item.sellpiaInventorySkuId || item.recommendedQuantity !== 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recommendedQuantity'],
      message: 'auto_apply requires one Sellpia SKU with quantity 1',
    });
  }
});

export const ChannelRecipeAutomationPreviewSchema = z.object({
  channelAccountId: z.string().uuid(),
  proposalVersion: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: zIsoDate,
  summary: z.object({
    variants: z.number().int().nonnegative(),
    affectedOptions: z.number().int().nonnegative(),
    autoApply: z.number().int().nonnegative(),
    operatorReview: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    alreadyConfigured: z.number().int().nonnegative(),
  }).strict(),
  items: z.array(ChannelRecipeAutomationItemSchema),
}).strict();

export const ApplyChannelRecipeAutomationInputSchema = z.object({
  channelAccountId: z.string().uuid(),
  proposalVersion: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const ApplyChannelRecipeAutomationResponseSchema = z.object({
  proposalVersion: z.string().regex(/^[a-f0-9]{64}$/),
  appliedVariants: z.number().int().nonnegative(),
  affectedOptions: z.number().int().nonnegative(),
  skippedExistingVariants: z.number().int().nonnegative(),
}).strict();

export type ChannelRecipeAutomationPreview = z.infer<
  typeof ChannelRecipeAutomationPreviewSchema
>;
export type ApplyChannelRecipeAutomationInput = z.infer<
  typeof ApplyChannelRecipeAutomationInputSchema
>;
export type ApplyChannelRecipeAutomationResponse = z.infer<
  typeof ApplyChannelRecipeAutomationResponseSchema
>;
```

Export this file only through `@kiditem/shared/channel-recipe-automation`; do not expand the package root barrel.

Extend the existing `ChannelRecipeSuggestionStatusSchema` with `unique_barcode` and `exact_name_option`. Extend the existing suggestion response contract with these exact fields:

```ts
automationDecision: ChannelRecipeAutomationDecisionSchema,
recommendedQuantity: z.number().int().positive().nullable(),
existingComponents: z.array(z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  code: z.string().min(1),
  quantity: z.number().int().positive(),
  source: z.enum(['manual', 'deterministic']),
  confirmedBy: z.string().uuid().nullable(),
  confirmedAt: zIsoDate,
}).strict()),
```

Change proposal `requiresQuantityConfirmation` from `z.literal(true)` to `z.boolean()` and add `recommendedQuantity: z.number().int().positive().nullable()`. Enforce that `requiresQuantityConfirmation=false` requires `recommendedQuantity=1`, and every `auto_apply` response has exactly one proposal.

- [ ] **Step 4: Write failing domain decision tests**

Add tests covering the entire policy matrix.

```ts
it('auto-applies one unique exact code with a compatible unit signature', () => {
  const result = classifyChannelRecipeSuggestion(input({
    codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
  }));
  expect(result).toMatchObject({
    status: 'unique_code',
    automationDecision: 'auto_apply',
    recommendedQuantity: 1,
  });
});

it('auto-applies one strict unique normalized product-and-option pair', () => {
  const result = classifyChannelRecipeSuggestion(input({
    nameOptionEvidence: [{
      productValue: ' 키즈 식판 ',
      optionValue: '블루 1개',
      normalizedProductValue: '키즈식판',
      normalizedOptionValue: '블루1개',
      sku: sku({ optionName: '블루 1개' }),
    }],
  }));
  expect(result).toMatchObject({
    status: 'exact_name_option',
    automationDecision: 'auto_apply',
    recommendedQuantity: 1,
  });
});

it('blocks exact name duplicates and cross-signal disagreement', () => {
  const duplicate = classifyChannelRecipeSuggestion(input({
    nameOptionEvidence: [
      nameEvidence(sku()),
      nameEvidence(sku({
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
        code: 'SP-002',
      })),
    ],
  }));
  expect(duplicate.automationDecision).toBe('blocked');
  expect(duplicate.status).toBe('ambiguous');

  const conflict = classifyChannelRecipeSuggestion(input({
    codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
    nameOptionEvidence: [nameEvidence(sku({
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
      code: 'SP-002',
    }))],
  }));
  expect(conflict.status).toBe('conflict');
});

it('requires operator review when pack signatures do not agree', () => {
  const result = classifyChannelRecipeSuggestion(input({
    options: [{ ...input().options[0], itemName: '블루 4개입' }],
    codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
  }));
  expect(result).toMatchObject({
    status: 'quantity_review',
    automationDecision: 'operator_review',
    recommendedQuantity: null,
  });
});
```

- [ ] **Step 5: Implement strict normalization, pack compatibility, and decisions**

Keep the domain pure. Replace the current broad name-only branch with explicit product+option evidence. The normalization and unit checks must preserve meaningful characters.

Add these exact input shapes before implementing the classifier branches:

```ts
type BarcodeEvidence = {
  kind: 'unique_physical_barcode';
  channelValue: string;
  normalizedValue: string;
  sku: ChannelRecipeSuggestionSku;
};

type NameOptionEvidence = {
  productValue: string;
  optionValue: string | null;
  normalizedProductValue: string;
  normalizedOptionValue: string | null;
  sku: ChannelRecipeSuggestionSku;
};

export type ChannelRecipeSuggestionInput = {
  channelListingOptionId: string;
  productVariantId: string | null;
  masterProductId: string | null;
  options: Array<{
    channelListingOptionId: string;
    listingName: string | null;
    itemName: string | null;
    sellerSku: string | null;
    modelNumber: string | null;
    barcode: string | null;
  }>;
  existingComponents: Array<{
    sellpiaInventorySkuId: string;
    code: string;
    quantity: number;
    source: 'manual' | 'deterministic';
    confirmedBy: string | null;
    confirmedAt: Date | string;
  }>;
  codeEvidence: CodeEvidence[];
  barcodeEvidence: BarcodeEvidence[];
  nameOptionEvidence: NameOptionEvidence[];
  nameEvidence: NameEvidence[];
};
```

```ts
export function normalizeRecipeIdentityText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.normalize('NFKC').toLocaleLowerCase().replace(/\s/gu, '');
  return normalized || null;
}

const PACK_TOKEN = /(?:\d+\s*(?:개입|개|입|팩|pcs?|p)\b|x\s*\d+|세트|묶음|구성|bundle|set)/giu;

export function packSignature(...values: Array<string | null>): string[] {
  return values
    .flatMap((value) => value?.normalize('NFKC').toLocaleLowerCase().match(PACK_TOKEN) ?? [])
    .map((value) => value.replace(/\s/gu, ''))
    .sort();
}

function compatibleUnit(
  channelValues: Array<string | null>,
  sku: ChannelRecipeSuggestionSku,
): boolean {
  const channel = packSignature(...channelValues);
  const physical = packSignature(sku.name, sku.optionName);
  return channel.length === 0 || JSON.stringify(channel) === JSON.stringify(physical);
}
```

Add `automationDecision` and `recommendedQuantity` to the existing suggestion response. `unique_code`, `unique_barcode`, and `exact_name_option` may return `auto_apply` only when one SKU remains after all evidence is unioned, no contradictory evidence exists, and `compatibleUnit` is true. Existing components always return `already_configured`.

- [ ] **Step 6: Run focused tests and build shared**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-recipe-automation.spec.ts src/schemas/channel-product-matching.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/channel-recipe-suggestion.spec.ts
rtk npm run build --workspace=packages/shared
```

Expected: all focused tests pass; shared package builds with the new focused export.

- [ ] **Step 7: Commit the decision contract**

```bash
rtk git add packages/shared/package.json packages/shared/src/channel-recipe-automation.ts packages/shared/src/schemas/channel-recipe-automation.ts packages/shared/src/schemas/channel-recipe-automation.spec.ts apps/server/src/channels/domain/channel-recipe-suggestion.ts apps/server/src/channels/domain/channel-recipe-suggestion.spec.ts
rtk git commit -m "feat: classify deterministic Sellpia recipes"
```

### Task 2: Build Batched Tenant-Fenced Evidence Preview

**Files:**
- Modify: `apps/server/src/channels/application/port/out/cross-domain/sellpia-recipe-evidence.port.ts`
- Modify: `apps/server/src/channels/adapter/out/inventory/sellpia-recipe-evidence.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/inventory/sellpia-recipe-evidence.adapter.spec.ts`
- Modify: `apps/server/src/inventory/application/port/in/stock/sellpia-inventory-sku-read.port.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/sellpia-inventory-sku-read.repository.port.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-sku-read.service.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-sku-read.service.spec.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-inventory-sku-read.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-inventory-sku-read.repository.adapter.spec.ts`
- Modify: `apps/server/src/channels/application/port/out/repository/channel-recipe-suggestion-context.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-recipe-suggestion-context.repository.adapter.ts`
- Create: `apps/server/src/channels/application/port/out/repository/channel-recipe-automation-context.repository.port.ts`
- Create: `apps/server/src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.ts`
- Create: `apps/server/src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-recipe-suggestion.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-recipe-suggestion.service.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-recipe-suggestion.pg.integration.spec.ts`

**Interfaces:**
- Consumes: Task 1 normalization/classifier and Inventory `SellpiaInventorySkuReadPort` methods `findByCodes`, `findByBarcodes`, `findByNormalizedNames`.
- Produces: `listContexts(organizationId, channelAccountId)` grouped once per central `ProductVariant`; suggestion service can classify one context or a batch without N+1 reads.

- [ ] **Step 1: Write failing bridge and service tests**

Require physical barcode and option-aware name facts.

```ts
expect(evidence.findByNormalizedBarcodes).toHaveBeenCalledWith(
  organizationId,
  ['001234567890'],
);
expect(result).toMatchObject({
  status: 'exact_name_option',
  automationDecision: 'auto_apply',
  recommendedQuantity: 1,
});
```

Add a test where two active Sellpia rows share the same barcode and assert `ambiguous`, plus a test where code and strict name+option point to different SKU IDs and assert `conflict`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-recipe-suggestion.service.spec.ts src/channels/adapter/out/inventory/sellpia-recipe-evidence.adapter.spec.ts
```

Expected: FAIL because barcode evidence and strict name+option evidence are not present.

- [ ] **Step 3: Add normalized physical-barcode reads to Inventory**

Add `findByNormalizedBarcodes(organizationId, normalizedBarcodes)` to the Inventory incoming and repository ports. The service deduplicates only valid 8–14 digit keys and short-circuits empty input. The repository uses Prisma tagged SQL and returns every active organization-owned row whose stored barcode normalizes to one of the requested keys.

```ts
async findByNormalizedBarcodes(
  organizationId: string,
  normalizedBarcodes: string[],
): Promise<SellpiaInventorySkuReadModel[]> {
  const rows = await this.prisma.$queryRaw<SelectedSellpiaInventorySku[]>(Prisma.sql`
    SELECT
      id,
      code,
      name,
      option_name AS "optionName",
      barcode,
      current_stock AS "currentStock",
      purchase_price AS "purchasePrice",
      sale_price AS "salePrice",
      is_active AS "isActive",
      last_import_run_id AS "lastImportRunId"
    FROM sellpia_inventory_skus
    WHERE organization_id = ${organizationId}::uuid
      AND is_active = true
      AND regexp_replace(coalesce(barcode, ''), '[^0-9]', '', 'g')
        IN (${Prisma.join(normalizedBarcodes)})
    ORDER BY code ASC, id ASC
  `);
  return rows.map(toReadModel);
}
```

The repository spec asserts tagged SQL, organization/active predicates, duplicate barcode preservation, and no foreign rows.

- [ ] **Step 4: Extend the Inventory evidence bridge**

Use the existing Inventory read service rather than adding Prisma to Channels. The Channels port becomes:

```ts
export type SellpiaRecipeEvidenceSku = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
};

export interface SellpiaRecipeEvidencePort {
  findByCodes(organizationId: string, codes: string[]): Promise<SellpiaRecipeEvidenceSku[]>;
  findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]>;
  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]>;
}
```

The adapter delegates `findByNormalizedBarcodes` to the Inventory incoming read capability and preserves duplicate results so the classifier can reject ambiguity.

- [ ] **Step 5: Add barcode and shared-variant facts to the context**

Extend every option context with `barcode`. For a linked variant, preserve the existing behavior that loads all active organization-owned channel options sharing that variant, not just the selected account row.

```ts
options: Array<{
  channelListingOptionId: string;
  listingName: string | null;
  itemName: string | null;
  sellerSku: string | null;
  modelNumber: string | null;
  barcode: string | null;
}>;
```

Existing components must also include `source`, `confirmedBy`, and `confirmedAt` so the UI can distinguish automatic and manual recipes. The web renders only `source`, confirmation time, and whether an operator confirmer exists; it does not expose an internal user UUID as display text.

- [ ] **Step 6: Implement one batched context query per account**

`ChannelRecipeAutomationContextRepositoryPort.listContexts` returns one row per distinct active linked variant in the selected active organization-owned account. The adapter must:

1. find distinct selected-account `productVariantId` values from the same finalized matching scope as `/api/channels/product-mappings`;
2. load all active organization-owned channel options for those variants in one `findMany`;
3. load existing components in the same variant include;
4. group in memory by sorted `productVariantId`;
5. include every selected-account option ID as `selectedChannelListingOptionIds` and every shared option as evidence.

Return the interface below.

```ts
export type ChannelRecipeAutomationContext = {
  productVariantId: string;
  masterProductId: string;
  selectedChannelListingOptionIds: string[];
  allLinkedOptions: ChannelRecipeSuggestionContext['options'];
  existingComponents: ChannelRecipeSuggestionContext['existingComponents'];
};

export interface ChannelRecipeAutomationContextRepositoryPort {
  listContexts(
    organizationId: string,
    channelAccountId: string,
  ): Promise<ChannelRecipeAutomationContext[]>;
}
```

Do not implement this by calling `getContext` 2,245 times.

- [ ] **Step 7: Update the suggestion service to batch evidence**

Add `suggestBatch(organizationId, contexts)` that deduplicates all code, barcode, and normalized product-name keys before exactly three Inventory reads. It then creates per-context code, barcode, and strict name+option evidence and calls the Task 1 classifier.

```ts
const [skusByCode, skusByBarcode, skusByName] = await Promise.all([
  this.evidence.findByCodes(organizationId, allCodes),
  this.evidence.findByNormalizedBarcodes(organizationId, allBarcodes),
  this.evidence.findByNormalizedNames(organizationId, allProductNames),
]);
```

Name evidence is automatic only when the normalized Sellpia `name` equals the normalized listing product name and option compatibility is exact:

```ts
const optionCompatible =
  normalizeRecipeIdentityText(sku.optionName)
  === normalizeRecipeIdentityText(option.itemName)
  || (
    normalizeRecipeIdentityText(sku.optionName) === null
    && normalizeRecipeIdentityText(option.itemName)
      === normalizeRecipeIdentityText(option.listingName)
  );
```

If product name is exact but this option rule fails, keep it as `name_review_only` rather than discarding it.

- [ ] **Step 8: Add PostgreSQL integration coverage**

Prove all of the following in `channel-recipe-suggestion.pg.integration.spec.ts`:

- foreign organization/account IDs return no contexts;
- a barcode-like value present only in `rawJson` never becomes typed barcode evidence;
- duplicate active names do not auto-apply;
- duplicate barcodes remain ambiguous;
- one exact name+option pair is auto-eligible;
- code/name disagreement is conflict;
- all options linked to one variant participate in conflict detection;
- an existing manual or deterministic recipe is preserved.

- [ ] **Step 9: Run focused and PostgreSQL tests**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-sku-read.service.spec.ts src/inventory/adapter/out/repository/sellpia-inventory-sku-read.repository.adapter.spec.ts src/channels/domain/channel-recipe-suggestion.spec.ts src/channels/application/service/__tests__/channel-recipe-suggestion.service.spec.ts src/channels/adapter/out/inventory/sellpia-recipe-evidence.adapter.spec.ts src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-recipe-suggestion.pg.integration.spec.ts
```

Expected: all focused and PG cases pass without adding components.

- [ ] **Step 10: Commit batched preview evidence**

```bash
rtk git add apps/server/src/inventory apps/server/src/channels
rtk git commit -m "feat: batch deterministic recipe evidence"
```

### Task 3: Add The Products-Owned Deterministic Recipe Writer

**Files:**
- Create: `apps/server/src/products/application/port/in/product-variant-recipe-automation.port.ts`
- Create: `apps/server/src/products/application/service/product-variant-recipe-automation.service.ts`
- Create: `apps/server/src/products/application/service/product-variant-recipe-automation.service.spec.ts`
- Modify: `apps/server/src/products/application/port/out/repository/product-operations.repository.port.ts`
- Modify: `apps/server/src/products/adapter/out/repository/product-operations.repository.adapter.ts`
- Create: `apps/server/src/products/__tests__/product-variant-recipe-automation.pg.integration.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`

**Interfaces:**
- Consumes: only Task 1 `auto_apply` proposals with one active Sellpia SKU and quantity `1`.
- Produces: `PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT.applyIfEmpty(input)` with atomic existing-recipe preservation and deterministic source metadata.

- [ ] **Step 1: Write failing service and repository integration tests**

The main PG test seeds two empty variants, one configured variant, active and inactive Sellpia rows, and then asserts:

```ts
const result = await service.applyIfEmpty({
  organizationId: TEST_ORGANIZATION_ID,
  recipes: [
    { productVariantId: emptyA.id, sellpiaInventorySkuId: activeA.id, quantity: 1 },
    { productVariantId: configured.id, sellpiaInventorySkuId: activeB.id, quantity: 1 },
  ],
});

expect(result).toEqual({
  appliedProductVariantIds: [emptyA.id],
  skippedExistingProductVariantIds: [configured.id],
});
expect(await prisma.productVariantComponent.findMany({
  where: { productVariantId: emptyA.id },
})).toEqual([expect.objectContaining({
  sellpiaInventorySkuId: activeA.id,
  quantity: 1,
  source: 'deterministic',
  confirmedBy: null,
})]);
```

Also assert that a foreign variant, foreign SKU, inactive SKU, duplicate variant entry, non-positive quantity, and multi-component recipe reject the entire request before creation.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/products/application/service/product-variant-recipe-automation.service.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/products/__tests__/product-variant-recipe-automation.pg.integration.spec.ts
```

Expected: FAIL because the Products automation capability does not exist.

- [ ] **Step 3: Define and export the Products incoming capability**

```ts
export const PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT = Symbol(
  'PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT',
);

export type DeterministicVariantRecipeInput = {
  productVariantId: string;
  sellpiaInventorySkuId: string;
  quantity: 1;
};

export interface ProductVariantRecipeAutomationPort {
  applyIfEmpty(input: {
    organizationId: string;
    recipes: DeterministicVariantRecipeInput[];
  }): Promise<{
    appliedProductVariantIds: string[];
    skippedExistingProductVariantIds: string[];
  }>;
}
```

Bind the symbol to `ProductVariantRecipeAutomationService` and export the symbol from `ProductsModule`. Channels must inject this incoming port, not the Products repository or concrete application service.

- [ ] **Step 4: Add the outgoing repository operation**

Extend `ProductOperationsRepositoryPort` with the exact same structured input and result. The application service performs shape validation, then delegates.

```ts
applyDeterministicRecipesIfEmpty(input: {
  organizationId: string;
  recipes: DeterministicVariantRecipeInput[];
}): Promise<{
  appliedProductVariantIds: string[];
  skippedExistingProductVariantIds: string[];
}>;
```

- [ ] **Step 5: Implement sorted locking and atomic creation**

Inside one Prisma transaction:

1. sort and deduplicate all `productVariantId` values;
2. lock every organization-owned variant in sorted order with `FOR UPDATE`;
3. reject if the number of locked variants differs from the request;
4. read all current components for the locked variants;
5. preserve every variant with at least one current component;
6. validate all remaining Sellpia IDs are active and organization-owned;
7. create one component per empty variant with the data below.

```ts
{
  organizationId: input.organizationId,
  productVariantId: recipe.productVariantId,
  sellpiaInventorySkuId: recipe.sellpiaInventorySkuId,
  quantity: 1,
  source: 'deterministic',
  confirmedBy: null,
  confirmedAt,
}
```

Do not call the manual `replaceRecipe` path because it deletes existing components and assigns a user confirmer.

- [ ] **Step 6: Prove concurrency behavior**

Add a PG case that starts a manual replacement and deterministic apply against the same variant. After both settle, exactly one complete recipe exists; the deterministic path either applies first and is later replaced manually, or reports the manual recipe as existing. It must never delete the manual recipe or create duplicate components.

- [ ] **Step 7: Run Products verification**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/products
rtk npm run test:integration --workspace=apps/server -- src/products/__tests__/product-variant-recipe-automation.pg.integration.spec.ts src/products/__tests__/product-operations.repository.pg.integration.spec.ts
rtk npm run build --workspace=apps/server
```

Expected: Products unit/integration suites and server build pass.

- [ ] **Step 8: Commit the central writer**

```bash
rtk git add apps/server/src/products
rtk git commit -m "feat: apply deterministic variant recipes"
```

### Task 4: Add Version-Fenced Preview And Apply APIs

**Files:**
- Create: `apps/server/src/channels/application/service/channel-recipe-automation.service.ts`
- Create: `apps/server/src/channels/application/service/__tests__/channel-recipe-automation.service.spec.ts`
- Modify: `apps/server/src/channels/adapter/in/http/channel-product-matching.controller.ts`
- Modify: `apps/server/src/channels/adapter/in/http/__tests__/channel-product-matching.controller.spec.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Create: `apps/server/src/channels/__tests__/channel-recipe-automation.pg.integration.spec.ts`

**Interfaces:**
- Consumes: Task 2 batched contexts/suggestions and Task 3 `PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT`.
- Produces: `GET /api/channels/product-mappings/recipe-automation/preview` and `POST /api/channels/product-mappings/recipe-automation/apply`.

- [ ] **Step 1: Write failing application-service tests**

Test deterministic ordering, preview counts, version fencing, and idempotent reapply.

```ts
const preview = await service.preview(organizationId, channelAccountId);
expect(preview.items.map((item) => item.productVariantId)).toEqual([
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
]);
expect(preview.summary).toMatchObject({ autoApply: 1, operatorReview: 1 });
expect(preview.proposalVersion).toMatch(/^[a-f0-9]{64}$/);

await expect(service.apply(organizationId, {
  channelAccountId,
  proposalVersion: '0'.repeat(64),
})).rejects.toBeInstanceOf(ConflictException);
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-recipe-automation.service.spec.ts
```

Expected: FAIL because the orchestration service is absent.

- [ ] **Step 3: Implement stable preview hashing**

Build preview items sorted by `productVariantId`. Hash only stable business fields, not `generatedAt` or stock quantities.

```ts
function proposalVersion(items: ChannelRecipeAutomationItem[]): string {
  const stable = items.map((item) => ({
    productVariantId: item.productVariantId,
    channelListingOptionIds: [...item.channelListingOptionIds].sort(),
    decision: item.decision,
    reason: item.reason,
    sellpiaInventorySkuId: item.sellpiaInventorySkuId,
    recommendedQuantity: item.recommendedQuantity,
  }));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
```

The summary counts central variants by decision and separately sums affected selected-account options.

- [ ] **Step 4: Implement version-fenced apply**

`apply` parses `ApplyChannelRecipeAutomationInputSchema`, recomputes the preview, rejects stale versions with HTTP 409, and forwards only `decision='auto_apply'` items to Products.

```ts
if (input.proposalVersion !== preview.proposalVersion) {
  throw new ConflictException('Recipe automation preview changed; refresh and review again');
}

const result = await this.products.applyIfEmpty({
  organizationId,
  recipes: preview.items
    .filter((item) => item.decision === 'auto_apply')
    .map((item) => ({
      productVariantId: item.productVariantId,
      sellpiaInventorySkuId: item.sellpiaInventorySkuId!,
      quantity: 1 as const,
    })),
});
```

Return applied variant count, selected-account affected option count for applied variants, and skipped-existing count.

- [ ] **Step 5: Add static routes before parameter routes**

Add these controller methods before `@Get(':channelListingId/candidates')` so `recipe-automation` cannot be parsed as a listing UUID.

```ts
@Get('recipe-automation/preview')
previewRecipeAutomation(
  @CurrentOrganization() organizationId: string,
  @Query('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
) {
  return this.recipeAutomation.preview(organizationId, channelAccountId);
}

@Post('recipe-automation/apply')
applyRecipeAutomation(
  @CurrentOrganization() organizationId: string,
  @Body() body: unknown,
) {
  return this.recipeAutomation.apply(organizationId, body);
}
```

- [ ] **Step 6: Add real PostgreSQL acceptance**

The integration spec must prove:

- foreign account access is rejected or empty without data leakage;
- a complete selected-account queue produces one item per central variant;
- preview does not mutate `ProductVariantComponent` or Sellpia stock;
- apply writes only eligible empty variants with `source='deterministic'`;
- quantity review, conflict, ambiguous, duplicate name, and no-match rows remain empty;
- an existing manual component remains byte-for-byte unchanged;
- applying the same preview twice is idempotent;
- stale preview versions return conflict;
- `SellpiaInventorySku.currentStock` is byte-for-byte unchanged before/after.

- [ ] **Step 7: Run controller, service, integration, and boundary gates**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-recipe-automation.service.spec.ts src/channels/adapter/in/http/__tests__/channel-product-matching.controller.spec.ts src/channels/channels.module.wiring.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-recipe-automation.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:directory-architecture
```

Expected: all tests and organization/architecture scanners pass.

- [ ] **Step 8: Commit the API workflow**

```bash
rtk git add apps/server/src/channels
rtk git commit -m "feat: expose deterministic recipe automation"
```

### Task 5: Expose Automatic And Operator-Review States In The UI

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.spec.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/RecipeAutomationPanel.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/RecipeAutomationPanel.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuMappingTable.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuMappingTable.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/RecipeSuggestionDialog.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/RecipeSuggestionDialog.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.spec.tsx`

**Interfaces:**
- Consumes: Task 4 preview/apply APIs.
- Produces: 계정별 자동 매칭 미리보기, 결정적 일괄 적용, 행별 이유/필터, 자동/수동 레시피 출처 표시.

- [ ] **Step 1: Write failing API and hook tests**

```ts
it('posts the exact preview version and invalidates every inventory consumer', async () => {
  vi.mocked(applyChannelRecipeAutomation).mockResolvedValue({
    proposalVersion: 'a'.repeat(64),
    appliedVariants: 7,
    affectedOptions: 9,
    skippedExistingVariants: 0,
  });
  const hook = renderHook(() => useApplyChannelRecipeAutomation(), {
    wrapper: wrapper(client),
  });

  await act(() => hook.result.current.mutateAsync({
    channelAccountId: ACCOUNT_ID,
    proposalVersion: 'a'.repeat(64),
  }));

  expect(client.invalidateQueries).toHaveBeenCalledWith({
    queryKey: queryKeys.channelProductMappings.all,
  });
  expect(client.invalidateQueries).toHaveBeenCalledWith({
    queryKey: queryKeys.channelSkuAvailability.all,
  });
  expect(client.invalidateQueries).toHaveBeenCalledWith({
    queryKey: queryKeys.products.operations.all,
  });
});
```

- [ ] **Step 2: Run focused web tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts' 'src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.spec.tsx'
```

Expected: FAIL because preview/apply functions and hooks do not exist.

- [ ] **Step 3: Add parsed API functions and query keys**

```ts
export function getChannelRecipeAutomationPreview(
  channelAccountId: string,
): Promise<ChannelRecipeAutomationPreview> {
  return apiClient.getParsed(
    `/api/channels/product-mappings/recipe-automation/preview?channelAccountId=${encodeURIComponent(channelAccountId)}`,
    ChannelRecipeAutomationPreviewSchema,
  );
}

export async function applyChannelRecipeAutomation(
  input: ApplyChannelRecipeAutomationInput,
): Promise<ApplyChannelRecipeAutomationResponse> {
  const response = await apiClient.post<unknown>(
    '/api/channels/product-mappings/recipe-automation/apply',
    ApplyChannelRecipeAutomationInputSchema.parse(input),
  );
  return ApplyChannelRecipeAutomationResponseSchema.parse(response);
}
```

Add `queryKeys.channelProductMappings.recipeAutomationPreview(channelAccountId)` under the existing query family.

- [ ] **Step 4: Add preview and apply hooks**

Preview runs only when an account is selected. Apply success invalidates:

- all channel product mapping queries;
- channel SKU availability;
- Products operations list/detail family;
- Inventory reverse-link collection;
- the selected preview key.

Do not update counts optimistically because one central variant may affect multiple channel rows.

- [ ] **Step 5: Write the failing automation-panel UI tests**

Cover these visible behaviors:

```ts
expect(screen.getByText('자동 적용 가능 129')).toBeInTheDocument();
expect(screen.getByText('수량·상품 검토 161')).toBeInTheDocument();
expect(screen.getByText('매칭 정보 없음 1,955')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: '확정 기준 자동 매칭' }));
expect(screen.getByText(/기존 레시피는 덮어쓰지 않습니다/)).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: '129개 운영 옵션 적용' }));
expect(apply).toHaveBeenCalledWith(expect.objectContaining({
  proposalVersion: 'a'.repeat(64),
}));
```

The button is disabled for zero auto-eligible variants, loading state, stale apply, or failed preview.

- [ ] **Step 6: Implement `RecipeAutomationPanel`**

Show variant counts and affected channel option counts separately. Use a Radix confirmation dialog; do not use `window.confirm`.

Required copy:

```text
확정 기준 자동 매칭
코드·고유 바코드·상품명+옵션이 하나의 Sellpia SKU로 일치하는 항목만 수량 1로 적용합니다.
기존 레시피는 덮어쓰지 않으며 묶음·중복·충돌 항목은 검토 큐에 남습니다.
```

After success show a toast with applied variant and affected option counts and refetch the preview.

- [ ] **Step 7: Add row reasons and queue filters**

Create a `Map<channelListingOptionId, ChannelRecipeAutomationItem>` in `page.tsx` and pass the item to option rows. Add filters:

- `auto_apply`: 자동 적용 가능
- `operator_review`: 운영자 검토
- `blocked`: 매칭 없음/충돌
- `recipe_confirmed`: 구성 완료

Display these labels in the recipe column:

```text
자동 매칭 가능 · 상품코드 정확 일치
자동 매칭 가능 · 상품명+옵션 정확 일치
수량 확인 필요
중복 후보
증거 충돌
매칭 정보 없음
자동 구성 완료
운영자 구성 완료
```

Long names/codes remain inside fixed-layout cells using `overflow-hidden`, `break-words`, and `break-all` as appropriate; do not reintroduce overlapping table text.

- [ ] **Step 8: Update the suggestion dialog**

Replace the unconditional copy “수량과 다중 SKU BOM은 반드시 확인” with decision-specific guidance:

- `auto_apply`: show the selected SKU, `추천 수량 1`, and the exact deterministic evidence;
- `operator_review`: preselect the candidate but require product-detail quantity/BOM confirmation;
- `blocked`: explain duplicate/conflict/no-match and offer product-detail search only;
- `already_configured`: show `source`, confirmer when present, timestamp, and current components.

- [ ] **Step 9: Run the complete matching UI suite**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching'
rtk npm run build --workspace=apps/web
```

Expected: all matching tests and the production build pass.

- [ ] **Step 10: Commit the operator workflow**

```bash
rtk git add apps/web/src/lib/query-keys.ts 'apps/web/src/app/(catalog)/product-hub/matching'
rtk git commit -m "feat: review and apply automatic inventory matches"
```

### Task 6: Make Every Downstream Consumer Use Common Availability

**Files:**
- Modify: `apps/server/src/channels/application/service/channel-product-matching.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-product-matching.service.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts`
- Modify: `apps/server/src/channels/__tests__/channel-product-matching.pg.integration.spec.ts`
- Verify: `apps/server/src/products/domain/product-variant-capacity.ts`
- Verify: `apps/server/src/channels/application/service/channel-sku-availability.service.ts`
- Verify: `apps/server/src/supply/application/service/rocket-purchase-preview.service.ts`
- Verify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.service.ts`

**Interfaces:**
- Consumes: deterministic and manual `ProductVariantComponent` rows plus Inventory `availableStock`.
- Produces: matching center, product operations, channel availability, Rocket preview, and product outflow all retain their documented ownership and formulas.

- [ ] **Step 1: Write a failing commitment-aware matching test**

Seed `currentStock=10`, active commitment `4`, recipe quantity `2`. Assert matching center capacity is `3`, not `5`.

```ts
expect(result.options[0]).toMatchObject({
  recipeStatus: 'matched',
  capacity: 3,
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-product-matching.service.spec.ts
```

Expected: FAIL because the current queue repository projects with `activeCommitmentQuantity=0`.

- [ ] **Step 3: Hydrate queue capacity through the shared availability capability**

Inject `CHANNEL_SKU_AVAILABILITY_PORT` into `ChannelProductMatchingService`. After the repository loads identity rows, batch-read availability for all linked option IDs and replace every returned row’s `recipeStatus` and `capacity` with the common projection.

```ts
const availability = await this.channelAvailability.findByChannelSkuIds(
  organizationId,
  queue.options
    .filter((row) => row.option.productVariantId !== null)
    .map((row) => row.option.id),
);
const byOptionId = new Map(availability.map((item) => [item.sku.id, item]));
```

Recompute queue counts from the hydrated rows. The repository may continue loading component identity for candidate/detail rows, but it must not be the final capacity authority.

- [ ] **Step 4: Add downstream regression assertions**

Use the same recipe fixtures to prove:

- Products detail capacity uses `availableStock`;
- Channel SKU availability exposes physical stock, active commitment, available stock, and bottleneck;
- Rocket preview clamps requested quantity to the same component capacity;
- adding a recipe alone does not change `SellpiaProductMonthlySales` depletion facts or Sellpia `currentStock`.

- [ ] **Step 5: Run downstream suites**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels src/products src/supply/application/service/rocket-purchase-preview.service.spec.ts src/analytics/sellpia-product-sales
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-product-matching.pg.integration.spec.ts src/channels/__tests__/channel-recipe-automation.pg.integration.spec.ts src/analytics/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts
```

Expected: all consumers agree on capacity while depletion facts and physical stock remain unchanged.

- [ ] **Step 6: Commit the common-capacity correction**

```bash
rtk git add apps/server/src/channels/application/service/channel-product-matching.service.ts apps/server/src/channels/application/service/__tests__/channel-product-matching.service.spec.ts apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts apps/server/src/channels/__tests__/channel-product-matching.pg.integration.spec.ts
rtk git commit -m "fix: share committed inventory capacity across product flows"
```

### Task 7: Update Durable Policy, Release Contract, And Roll Out Existing Data

**Files:**
- Modify: `apps/server/src/channels/AGENTS.md`
- Modify: `apps/server/src/products/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`
- Modify: `docs/runbooks/channel-sellpia-matching.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `VERSION`

**Interfaces:**
- Consumes: Tasks 1–6 completed code and the current active organization/account data.
- Produces: release `0.1.22`, reproducible read-only preview evidence through the public API/UI, explicit one-time current-data application, and durable operating guidance.

- [ ] **Step 1: Update policy documents before rollout**

Replace the obsolete blanket prohibition “evidence never automatically writes a recipe” with the bounded rule:

```text
Only a version-fenced, explicitly invoked deterministic automation command may create an empty central ProductVariant recipe. It may create exactly one active Sellpia component with quantity 1 from a unique, non-conflicting exact code, verified unique physical barcode, or strict normalized product-name+option match. Existing recipes, pack/BOM uncertainty, duplicates, conflicts, similarity, rank, raw aliases, and AI remain non-automatic.
```

Keep Products as the only recipe writer and Inventory as the only physical-stock writer. Update `docs/ARCHITECTURE.md` only where the current wording claims all recipe evidence is permanently read-only.

- [ ] **Step 2: Bump the release version**

Change root `VERSION` from:

```text
0.1.21
```

to:

```text
0.1.22
```

No Prisma migration or `scripts/data-migrations/v0.1.22` file is required because the schema is unchanged and existing business rows are applied through the explicit version-fenced command.

- [ ] **Step 3: Run the complete local gate**

Run:

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-recipe-automation.spec.ts src/schemas/channel-product-matching.spec.ts src/schemas/product-operations.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels src/products src/inventory src/supply/application/service/rocket-purchase-preview.service.spec.ts src/analytics/sellpia-product-sales
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub'
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:directory-architecture
rtk npm run dev:server
```

Expected: builds and tests pass, scanners pass, and NestJS boots on port 4000. Stop the dev server after boot confirmation.

- [ ] **Step 4: Run PR release guards**

Run against the actual target base branch:

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk git diff --check
```

Expected: reconstruction and release guards pass; the release report states `VERSION=0.1.22`, no Prisma schema change, and no automatic startup backfill.

- [ ] **Step 5: Recompute the current preview before any write**

Start the server, open `/product-hub/matching?level=options` with the authenticated browser session, select the intended Coupang account, and capture the response from `GET /api/channels/product-mappings/recipe-automation/preview?channelAccountId=<selected-account-id>`. Record:

- total central variants and affected options;
- auto exact-code count;
- auto unique-barcode count;
- auto strict-name+option count;
- quantity review, conflict, ambiguous, name review, and no-match counts;
- proposal version;
- total components and a hash of `(skuId,currentStock)` before apply.

Inspect at least five rows from each auto reason and five each from quantity review, duplicate/ambiguous, and name-review-only. If any auto row has wrong physical packaging or contradictory evidence, stop and tighten Task 1 policy before applying.

- [ ] **Step 6: Apply through the public workflow**

Open `/product-hub/matching?level=options`, select the intended account, verify the preview counts match the report, open the confirmation dialog, and invoke the version-fenced apply once.

Expected:

- only the preview’s `auto_apply` variants receive components;
- existing recipes remain unchanged;
- the result reports applied variants and affected options;
- a second apply is idempotent and creates zero additional component pairs.

- [ ] **Step 7: Verify the real UI and downstream flows**

Using the authenticated browser session, verify all of the following after a hard refresh:

1. matching summary shows non-zero Sellpia recipe confirmations;
2. automatic rows show `자동 구성 완료`, deterministic source, SKU, and quantity 1;
3. review rows remain filterable with their exact reason;
4. product operations detail shows physical stock, active commitment, available stock, capacity, and bottleneck;
5. `/product-hub/options` shows reverse product/variant destinations for new components;
6. product-outflow still shows the same Sellpia sales facts and gains only the intended recipe linkage projection;
7. Rocket purchase preview uses the same available component capacity;
8. no Sellpia `currentStock` value changed because of recipe application.

- [ ] **Step 8: Record the acceptance evidence**

The final report must use this exact structure:

```text
Collection: products <linked>/<all>; options <linked>/<all>
Recipes before: <n>
Preview: auto code <n>; auto barcode <n>; auto name+option <n>; quantity review <n>; conflict/ambiguous <n>; name review <n>; no match <n>
Applied: variants <n>; affected options <n>; skipped existing <n>
Recipes after: deterministic <n>; manual <n>; unresolved <n>
Physical stock mutations: 0
Downstream: product operations <pass/fail>; options reverse links <pass/fail>; product outflow <pass/fail>; Rocket preview <pass/fail>
UI hard-refresh verification: <pass/fail>
Blockers: <none or exact blocker>
```

- [ ] **Step 9: Commit release policy**

```bash
rtk git add VERSION docs/ARCHITECTURE.md docs/runbooks/channel-sellpia-matching.md apps/server/src/channels/AGENTS.md apps/server/src/products/AGENTS.md 'apps/web/src/app/(catalog)/AGENTS.md' 'apps/web/src/app/(catalog)/product-hub/AGENTS.md' 'apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md'
rtk git commit -m "docs: define deterministic inventory matching rollout"
```

## Self-Review

- Spec coverage: the plan covers exact code, unique physical barcode, strict normalized product-name+option, pack/BOM uncertainty, duplicate/conflict handling, existing recipe preservation, operator visibility, current-data application, and downstream inventory consumers.
- Ownership: Channels owns evidence/decision/orchestration, Products alone writes central recipes, Inventory alone writes physical stock. No channel-owned recipe table or second stock ledger is introduced.
- Data safety: preview is read-only; apply is version-fenced, tenant-scoped, central-variant grouped, sorted-lock atomic, and idempotent. Existing recipes are never overwritten.
- UI safety: automatic and unresolved states are separately visible and filterable; hidden background writes and page-load mutations are excluded.
- Schema/release: no Prisma change is needed; `VERSION` advances because persisted business behavior changes. Existing-data application is an explicit business command, not an automatic startup migration.
- Type consistency: `ChannelRecipeAutomationItem`, `ChannelRecipeAutomationPreview`, `ApplyChannelRecipeAutomationInput`, and `ProductVariantRecipeAutomationPort.applyIfEmpty` names and fields are consistent across Tasks 1–7.
- Placeholder scan: the plan contains no `TBD`, `TODO`, “similar to”, or unspecified error-handling steps.
