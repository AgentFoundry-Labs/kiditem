# Normalized Registered-Name Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 쿠팡 등록상품명과 Sellpia 상품명이 NFKC·소문자·공백 제거 후 완전히 같으면 후보를 `등록상품명 일치`로 표시하고, 구성품을 자동 생성하지 않은 채 상태만 `확인 필요`로 갱신한다.

**Architecture:** Channels 도메인이 정규화 키와 후보 우선순위를 소유하고, Inventory 읽기 포트가 조직별 활성 `MasterProduct.name`을 같은 키로 일괄 조회한다. 기존 상품코드·바코드 자동 매칭은 먼저 실행하며 이름 근거는 후보와 advisory 상태에만 사용한다.

**Tech Stack:** TypeScript, NestJS, Prisma tagged SQL, PostgreSQL Unicode normalization, Zod, Vitest, React Testing Library, Next.js

## Global Constraints

- 사용자-facing 상태 문구는 `확인 필요`; 저장 값은 기존 `needs_review`를 유지한다.
- 정규화 순서는 Unicode `NFKC`, 소문자화, 모든 Unicode 공백 제거다.
- 숫자와 `+`, `-`, `/`, `&`를 포함한 의미 있는 기호를 보존한다.
- 비교 대상은 쿠팡 `등록상품명`과 Sellpia `MasterProduct.name`뿐이다.
- 이름 근거로 `ChannelSkuComponent`를 생성하거나 구성 수량을 추론하지 않는다.
- 모든 Inventory 조회는 `organizationId`와 `isActive = true`로 제한한다.
- Prisma raw SQL은 tagged template과 `Prisma.join`만 사용한다.
- 스키마, backfill, `VERSION`, 라우트 형태, 상위 아키텍처 소유권은 변경하지 않는다.
- 기존 상품코드·바코드 자동 매칭, 일반 이름 제안, 운영자 검색 결과를 보존한다.

---

## File Structure

- `packages/shared/src/schemas/channel-sku-matching.ts`: 새 후보 사유 API 계약을 소유한다.
- `apps/server/src/channels/domain/channel-sku-candidate-ranking.ts`: 등록상품명 정규화와 후보 강도·상태 판정을 소유한다.
- `apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts`: 저장소에서 읽어오는 등록상품명 근거를 명시한다.
- `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts`: `ChannelListing.channelName`을 등록상품명 근거로 보존한다.
- `apps/server/src/inventory/application/port/in/stock/sellpia-master-product-read.port.ts`: 정규화 이름 일괄 조회 capability를 공개한다.
- `apps/server/src/inventory/application/service/sellpia-master-product-read.service.ts`: 빈 키 단락과 키 중복 제거를 담당한다.
- `apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.ts`: 조직·활성 범위의 정규화 이름 SQL을 실행한다.
- `apps/server/src/channels/application/port/out/cross-domain/sellpia-master-product-read.port.ts`: Channels가 사용하는 좁은 Inventory 읽기 계약을 확장한다.
- `apps/server/src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.ts`: Inventory 모델을 Channels 후보 모델로 변환한다.
- `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`: 후보 조회, 상태 새로고침, 명시적 매칭 해제의 이름 근거 흐름을 조합한다.
- `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuComponentDialog.tsx`: 새 근거를 `등록상품명 일치`로 표시한다.
- `docs/runbooks/channel-sellpia-matching.md`: 운영자에게 `확인 필요` 의미와 비자동매칭 규칙을 설명한다.

### Task 1: Shared Contract and Domain Ranking

**Files:**
- Modify: `packages/shared/src/schemas/channel-sku-matching.spec.ts`
- Modify: `packages/shared/src/schemas/channel-sku-matching.ts`
- Modify: `apps/server/src/channels/domain/channel-sku-candidate-ranking.spec.ts`
- Modify: `apps/server/src/channels/domain/channel-sku-candidate-ranking.ts`

**Interfaces:**
- Consumes: 기존 `ChannelSkuEvidence`, `CandidateSellpiaMasterProduct`, `statusForUnmappedCandidates` 계약.
- Produces: `normalizeRegisteredName(value: string | null): string | null`, `registeredName` evidence, `normalizedNameCandidates`, 후보 사유 `exact_normalized_name`.

- [ ] **Step 1: Write the failing shared and domain tests**

`ChannelSkuMatchCandidateReasonSchema.options` 기대값의 `ambiguous_identifier` 다음에 `exact_normalized_name`을 추가한다. Domain spec의 `baseEvidence`에는 `registeredName: null`을 추가하고 다음 테스트를 작성한다.

```ts
it('normalizes NFKC, case, and Unicode whitespace while preserving semantic punctuation', () => {
  expect(normalizeRegisteredName(' Ａb\tC\u3000아기 + 컵/2&1 '))
    .toBe('abc아기+컵/2&1');
  expect(normalizeRegisteredName('아기-컵')).toBe('아기-컵');
  expect(normalizeRegisteredName('아기+컵')).not.toBe(normalizeRegisteredName('아기컵'));
  expect(normalizeRegisteredName(' \t\u3000 ')).toBeNull();
});

it('ranks every exact normalized registered-name match before general suggestions', () => {
  const first = { ...sku('name-b', 'SP-B'), name: '아기 컵+빨대' };
  const second = { ...sku('name-a', 'SP-A'), name: '아기컵 + 빨대' };
  const suggestion = sku('suggestion', 'SP-S');
  const results = rank({
    evidence: { ...baseEvidence, registeredName: '아기 컵 + 빨대' },
    normalizedNameCandidates: [first, second],
    nameSuggestionCandidates: [suggestion],
  });

  expect(results.map(({ id, reason }) => ({ id, reason }))).toEqual([
    { id: 'name-a', reason: 'exact_normalized_name' },
    { id: 'name-b', reason: 'exact_normalized_name' },
    { id: 'suggestion', reason: 'name_suggestion' },
  ]);
  expect(statusForUnmappedCandidates(results)).toBe('needs_review');
});

it('rejects normalized-name candidates with different semantic punctuation', () => {
  const results = rank({
    evidence: { ...baseEvidence, registeredName: '아기+컵' },
    normalizedNameCandidates: [{ ...sku('plain', 'SP-PLAIN'), name: '아기컵' }],
  });

  expect(results).toEqual([]);
});
```

`rank` 테스트 helper 입력과 기본값에 아래 필드를 추가한다.

```ts
normalizedNameCandidates?: CandidateSellpiaMasterProduct[];
```

```ts
normalizedNameCandidates: [],
```

- [ ] **Step 2: Run the focused tests and verify the red state**

Run:

```bash
rtk npm exec --workspace=packages/shared -- vitest run --config vitest.config.ts src/schemas/channel-sku-matching.spec.ts
rtk npm exec --workspace=apps/server -- vitest run src/channels/domain/channel-sku-candidate-ranking.spec.ts
```

Expected: shared reason list omits `exact_normalized_name`; domain compilation fails because `normalizeRegisteredName`, `registeredName`, and `normalizedNameCandidates` do not exist.

- [ ] **Step 3: Implement the shared reason and strict domain normalization**

Add `exact_normalized_name` after `ambiguous_identifier` in the shared enum and ranked reason union. Extend the evidence and ranking input with these exact properties.

```ts
export type ChannelSkuEvidence = {
  sellerSku: string | null;
  modelNumber: string | null;
  barcode: string | null;
  registeredName: string | null;
  productNames: string[];
  optionName: string | null;
};
```

```ts
normalizedNameCandidates: CandidateSellpiaMasterProduct[];
```

Add the priority between ambiguous identifiers and general suggestions.

```ts
const REASON_PRIORITY: Record<RankedSellpiaMasterProductCandidate['reason'], number> = {
  exact_sellpia_code: 0,
  unique_barcode: 1,
  ambiguous_identifier: 2,
  exact_normalized_name: 3,
  name_suggestion: 4,
  manual_search: 5,
};
```

After identifier ranking and before general suggestions, insert strict candidate verification.

```ts
const normalizedRegisteredName = normalizeRegisteredName(input.evidence.registeredName);
if (normalizedRegisteredName) {
  for (const candidate of dedupeCandidates(input.normalizedNameCandidates)) {
    if (normalizeRegisteredName(candidate.name) !== normalizedRegisteredName) continue;
    keepStronger(matches, {
      candidate,
      reason: 'exact_normalized_name',
      exactSourcePriority: Number.POSITIVE_INFINITY,
    });
  }
}
```

Export the normalization helper.

```ts
export function normalizeRegisteredName(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.normalize('NFKC').toLowerCase().replace(/\s/gu, '');
  return normalized || null;
}
```

Include `exact_normalized_name` in `statusForUnmappedCandidates` so it maps to `needs_review`.

- [ ] **Step 4: Run focused tests and verify they pass**

Run the two commands from Step 2.

Expected: both files pass; the domain test proves duplicate name candidates remain separate and punctuation is preserved.

- [ ] **Step 5: Commit the domain contract**

```bash
rtk git add packages/shared/src/schemas/channel-sku-matching.ts packages/shared/src/schemas/channel-sku-matching.spec.ts apps/server/src/channels/domain/channel-sku-candidate-ranking.ts apps/server/src/channels/domain/channel-sku-candidate-ranking.spec.ts
rtk git commit -m "feat: add normalized registered-name evidence"
```

### Task 2: Inventory Normalized-Name Read Capability

**Files:**
- Modify: `apps/server/src/inventory/application/port/in/stock/sellpia-master-product-read.port.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-master-product-read.service.spec.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-master-product-read.service.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.spec.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/port/out/cross-domain/sellpia-master-product-read.port.ts`
- Modify: `apps/server/src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.ts`

**Interfaces:**
- Consumes: Task 1이 만든 normalized registered-name key.
- Produces: `findByNormalizedNames(organizationId: string, normalizedNames: string[]): Promise<SellpiaMasterProductReadModel[]>` on the Inventory port and the corresponding `Promise<CandidateSellpiaMasterProduct[]>` on the Channels port.

- [ ] **Step 1: Write failing service, repository, and bridge tests**

Inventory service spec에 중복 제거와 빈 입력 단락을 고정한다.

```ts
it('deduplicates normalized names and skips an empty normalized-name read', async () => {
  const repository = makeRepository();
  const service = new SellpiaMasterProductReadService(repository);

  await service.findByNormalizedNames(organizationId, [
    '아기컵',
    ' 아기컵 ',
    '',
    '빨대컵',
  ]);
  await expect(service.findByNormalizedNames(organizationId, [' ', '']))
    .resolves.toEqual([]);

  expect(repository.findByNormalizedNames).toHaveBeenCalledOnce();
  expect(repository.findByNormalizedNames).toHaveBeenCalledWith(
    organizationId,
    ['아기컵', '빨대컵'],
  );
});
```

`makeRepository`에 typed mock을 추가한다.

```ts
findByNormalizedNames: vi
  .fn<SellpiaMasterProductReadRepositoryPort['findByNormalizedNames']>()
  .mockResolvedValue([]),
```

Repository spec에는 tagged SQL의 조직·활성·정규화 조건과 반환 매핑을 검증한다.

```ts
it('batch-reads active tenant Masters by the strict normalized-name expression', async () => {
  const queryRaw = vi.fn().mockResolvedValue([
    stagedMaster('master-1', 'SP-1', '아기 컵+빨대'),
    stagedMaster('master-2', 'SP-2', '아기컵 + 빨대'),
  ]);
  const repository = new SellpiaMasterProductReadRepositoryAdapter({
    $queryRaw: queryRaw,
  } as unknown as PrismaService);

  const rows = await repository.findByNormalizedNames(
    organizationId,
    ['아기컵+빨대'],
  );

  const statement = queryRaw.mock.calls[0]?.[0];
  expect(statement.text).toContain('FROM master_products');
  expect(statement.text).toContain('organization_id =');
  expect(statement.text).toContain('is_active = true');
  expect(statement.text).toContain('normalize(name, NFKC)');
  expect(statement.text).toContain("'[[:space:]]+'");
  expect(statement.values).toEqual([organizationId, '아기컵+빨대']);
  expect(rows.map(({ id }) => id)).toEqual(['master-1', 'master-2']);
});
```

Channels Inventory adapter spec에는 전달과 모델 변환을 고정한다.

```ts
it('forwards normalized-name batches through the Inventory owner port', async () => {
  const owner = {
    findByNormalizedNames: vi.fn().mockResolvedValue([{
      id: '00000000-0000-4000-8000-000000000002',
      code: 'SP-001',
      name: '아기 컵',
      optionName: null,
      barcode: null,
      currentStock: 8,
      purchasePrice: 1_500,
      salePrice: 2_500,
      isActive: true,
      lastImportRunId: null,
    }]),
  } as unknown as SellpiaMasterProductReadPort;
  const adapter = new ChannelsSellpiaMasterProductReadAdapter(owner);

  const result = await adapter.findByNormalizedNames(organizationId, ['아기컵']);

  expect(owner.findByNormalizedNames).toHaveBeenCalledWith(organizationId, ['아기컵']);
  expect(result[0]).toMatchObject({ sellpiaProductCode: 'SP-001', name: '아기 컵' });
});
```

- [ ] **Step 2: Run the three focused specs and verify the red state**

Run:

```bash
rtk npm exec --workspace=apps/server -- vitest run src/inventory/application/service/sellpia-master-product-read.service.spec.ts src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.spec.ts src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.spec.ts
```

Expected: failures report that `findByNormalizedNames` is missing from the ports and implementations.

- [ ] **Step 3: Extend the Inventory and Channels read ports**

Add this signature to both `SellpiaMasterProductReadPort` and `ChannelsSellpiaMasterProductReadPort` with their respective return types.

```ts
findByNormalizedNames(
  organizationId: string,
  normalizedNames: string[],
): Promise<SellpiaMasterProductReadModel[]>;
```

The Channels version returns `Promise<CandidateSellpiaMasterProduct[]>`.

- [ ] **Step 4: Implement service deduplication and adapter forwarding**

Inventory service:

```ts
findByNormalizedNames(
  organizationId: string,
  normalizedNames: string[],
): Promise<SellpiaMasterProductReadModel[]> {
  return this.readIdentifiers(normalizedNames, (values) =>
    this.repository.findByNormalizedNames(organizationId, values));
}
```

Channels adapter:

```ts
async findByNormalizedNames(
  organizationId: string,
  normalizedNames: string[],
): Promise<CandidateSellpiaMasterProduct[]> {
  return this.map(this.inventory.findByNormalizedNames(organizationId, normalizedNames));
}
```

- [ ] **Step 5: Implement the tagged normalized-name SQL**

Change the Prisma import to a value import and add this method before `search`.

```ts
async findByNormalizedNames(
  organizationId: string,
  normalizedNames: string[],
): Promise<SellpiaMasterProductReadModel[]> {
  const rows = await this.prisma.$queryRaw<SelectedSellpiaMaster[]>(Prisma.sql`
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
    FROM master_products
    WHERE organization_id = ${organizationId}::uuid
      AND is_active = true
      AND regexp_replace(
        lower(normalize(name, NFKC)),
        '[[:space:]]+',
        '',
        'g'
      ) IN (${Prisma.join(normalizedNames)})
    ORDER BY code ASC, id ASC
  `);
  return rows.map(toReadModel);
}
```

- [ ] **Step 6: Run focused tests and verify they pass**

Run the command from Step 2.

Expected: all three specs pass; the SQL assertion proves parameter binding contains only organization and normalized keys.

- [ ] **Step 7: Commit the Inventory capability**

```bash
rtk git add apps/server/src/inventory/application/port/in/stock/sellpia-master-product-read.port.ts apps/server/src/inventory/application/service/sellpia-master-product-read.service.ts apps/server/src/inventory/application/service/sellpia-master-product-read.service.spec.ts apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.ts apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.spec.ts apps/server/src/channels/application/port/out/cross-domain/sellpia-master-product-read.port.ts apps/server/src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.ts apps/server/src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.spec.ts
rtk git commit -m "feat: read Sellpia products by normalized name"
```

### Task 3: Channels Evidence and Advisory Status Orchestration

**Files:**
- Modify: `apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`

**Interfaces:**
- Consumes: `normalizeRegisteredName`, `findByNormalizedNames`, `exact_normalized_name` from Tasks 1–2.
- Produces: candidate endpoint name evidence; bulk refresh and explicit unmapping that yield `needs_review` without a component.

- [ ] **Step 1: Write the failing repository evidence test**

```ts
it('keeps the registered channel name distinct from display and option names', async () => {
  const findFirst = vi.fn().mockResolvedValue({
    id: ids[0],
    sellerSku: null,
    modelNumber: null,
    barcode: null,
    itemName: '파랑',
    listing: { channelName: ' 등록 상품명 ', displayName: '노출 상품명' },
  });
  const repository = new ChannelSkuMappingRepositoryAdapter({
    channelListingOption: { findFirst },
  } as unknown as PrismaService);

  const result = await repository.findEvidence(organizationId, ids[0]!);

  expect(result).toMatchObject({
    registeredName: '등록 상품명',
    productNames: ['등록 상품명', '노출 상품명'],
    optionName: '파랑',
  });
});
```

- [ ] **Step 2: Write failing candidate, refresh, and unmapping tests**

Update the service test `evidence` helper with `registeredName: null`, and `makeInventory` with a typed `findByNormalizedNames` mock. Add these tests.

```ts
it('ranks a strict registered-name match ahead of general name suggestions', async () => {
  const repository = makeRepository();
  repository.findEvidence.mockResolvedValue(evidence({
    registeredName: '아기 컵 + 빨대',
    productNames: ['아기 컵 + 빨대', '노출 상품명'],
  }));
  const inventory = makeInventory();
  inventory.findByNormalizedNames.mockResolvedValue([
    inventorySku(inventorySkuId, { name: '아기컵+빨대' }),
  ]);
  inventory.search.mockResolvedValue([
    inventorySku(secondInventorySkuId, { name: '일반 제안' }),
  ]);
  const service = new ChannelSkuMappingService(repository, inventory);

  const result = await service.candidates(organizationId, channelSkuId, {});

  expect(inventory.findByNormalizedNames).toHaveBeenCalledWith(
    organizationId,
    ['아기컵+빨대'],
  );
  expect(result.items[0]).toMatchObject({
    masterProductId: inventorySkuId,
    reason: 'exact_normalized_name',
  });
});

it('refreshes a name-only SKU to needs_review without creating a component', async () => {
  const repository = makeRepository();
  repository.listUnmappedEvidence.mockResolvedValue([
    evidence({ registeredName: ' 아기 컵 ', productNames: ['아기 컵'] }),
  ]);
  const inventory = makeInventory();
  inventory.findByNormalizedNames.mockResolvedValue([
    inventorySku(inventorySkuId, { name: '아기컵' }),
    inventorySku(secondInventorySkuId, { name: '아기 컵' }),
  ]);
  const service = new ChannelSkuMappingService(repository, inventory);

  await service.refreshStatuses(organizationId, {});

  expect(repository.applyAutomaticMatches).toHaveBeenCalledWith(organizationId, [{
    channelSkuId,
    mappingStatus: 'needs_review',
  }]);
});

it('returns an explicitly unmapped name candidate to needs_review', async () => {
  const repository = makeRepository();
  repository.findEvidence.mockResolvedValue(evidence({ registeredName: '아기 컵' }));
  repository.findOne.mockResolvedValue(mappingRow([], channelSkuId, 'needs_review'));
  const inventory = makeInventory();
  inventory.findByNormalizedNames.mockResolvedValue([
    inventorySku(inventorySkuId, { name: '아기컵' }),
  ]);
  const service = new ChannelSkuMappingService(repository, inventory);

  await service.replaceComponents(organizationId, userId, channelSkuId, { components: [] });

  expect(repository.replaceComponents).toHaveBeenCalledWith(expect.objectContaining({
    components: [],
    nextStatus: 'needs_review',
  }));
});
```

- [ ] **Step 3: Run focused Channels specs and verify the red state**

Run:

```bash
rtk npm exec --workspace=apps/server -- vitest run src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.spec.ts src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts
```

Expected: repository evidence lacks `registeredName`; service does not call normalized-name lookup or produce the new reason.

- [ ] **Step 4: Preserve the registered name in the repository contract**

Add the field to `UnmappedChannelSkuEvidenceRow`.

```ts
registeredName: string | null;
```

In both `findEvidence` and `listUnmappedEvidence`, continue selecting `listing.channelName`. In `toEvidenceRow`, set the dedicated field and preserve the existing general suggestion array.

```ts
const registeredName = row.listing.channelName?.trim() || null;
return {
  channelSkuId: row.id,
  sellerSku: row.sellerSku,
  modelNumber: row.modelNumber,
  barcode: row.barcode,
  registeredName,
  optionName: row.itemName,
  productNames: [registeredName, row.listing.displayName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value)),
};
```

- [ ] **Step 5: Load and rank normalized-name candidates**

Import `normalizeRegisteredName`. Extend `loadCandidatePools` return type with `normalizedNameCandidates`. Compute the single strict key from `evidence.registeredName`, add `findByNormalizedNames` to the existing `Promise.all`, and return the new pool.

```ts
const normalizedName = normalizeRegisteredName(evidence.registeredName);
```

```ts
normalizedName
  ? this.inventory.findByNormalizedNames(organizationId, [normalizedName])
  : Promise.resolve([]),
```

Keep `optionName` and `productNames` in `suggestionQueries`; they remain lower-priority general suggestions.

- [ ] **Step 6: Add bulk name evidence to status refresh without auto-matching**

Compute distinct non-null keys once and add the third batch read.

```ts
const normalizedNames = [...new Set(evidenceRows
  .map((evidence) => normalizeRegisteredName(evidence.registeredName))
  .filter((value): value is string => value !== null))];
```

```ts
const [exactCodeCandidates, identifierCandidates, normalizedNameCandidates] =
  await Promise.all([
    exactCodes.length
      ? this.inventory.findBySellpiaCodes(organizationId, exactCodes)
      : Promise.resolve([]),
    identifiers.length
      ? this.inventory.findByBarcodes(organizationId, identifiers)
      : Promise.resolve([]),
    normalizedNames.length
      ? this.inventory.findByNormalizedNames(organizationId, normalizedNames)
      : Promise.resolve([]),
  ]);
```

Retain the existing automatic matcher. For a non-matched result, preserve its `needs_review` result first; otherwise evaluate only normalized-name candidates and do not set `component`.

```ts
if (match.status === 'needs_review') {
  return { channelSkuId: evidence.channelSkuId, mappingStatus: 'needs_review' as const };
}
if (match.status === 'unmatched') {
  const nameCandidates = rankSellpiaMasterProductCandidates({
    evidence,
    exactCodeCandidates: [],
    identifierCandidates: [],
    normalizedNameCandidates,
    nameSuggestionCandidates: [],
    manualSearchCandidates: [],
  });
  return {
    channelSkuId: evidence.channelSkuId,
    mappingStatus: statusForUnmappedCandidates(nameCandidates),
  };
}
```

The existing matched branch continues writing only `product_code` or `barcode`, `quantity: 1`.

- [ ] **Step 7: Run focused Channels tests and verify they pass**

Run the command from Step 3 and the domain spec from Task 1.

Expected: all pass; the name-only refresh update contains no `component` property.

- [ ] **Step 8: Commit the Channels orchestration**

```bash
rtk git add apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.spec.ts apps/server/src/channels/application/service/channel-sku-mapping.service.ts apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts
rtk git commit -m "feat: flag normalized name matches for confirmation"
```

### Task 4: Operator Label and Runbook

**Files:**
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuComponentDialog.tsx`
- Modify: `docs/runbooks/channel-sellpia-matching.md`
- Modify: `docs/superpowers/specs/2026-07-14-normalized-registered-name-matching-design.md`

**Interfaces:**
- Consumes: shared `exact_normalized_name` candidate reason.
- Produces: `등록상품명 일치` evidence badge and one consistent status phrase, `확인 필요`.

- [ ] **Step 1: Write the failing UI tests**

Add an `exact_normalized_name` candidate to the evidence badge test and assert its label.

```ts
candidate({
  masterProductId: '00000000-0000-4000-8000-000000000006',
  reason: 'exact_normalized_name',
}),
```

```ts
expect(screen.getByText('등록상품명 일치')).toBeInTheDocument();
```

Add a name-specific no-auto-save regression test.

```ts
it('does not auto-add or save an exact registered-name candidate', () => {
  mockCandidates([candidate({ reason: 'exact_normalized_name' })]);

  renderDialog(item({ components: [] }));

  expect(screen.queryByLabelText('SP-002 수량')).not.toBeInTheDocument();
  expect(mutateAsync).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused UI spec and verify the red state**

Run:

```bash
rtk npm test --workspace=apps/web -- --run 'src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx'
```

Expected: the exhaustive reason label record and badge assertion fail because the new label is absent.

- [ ] **Step 3: Add the label and align durable wording**

Add the reason label between identifier and general-name labels.

```ts
exact_normalized_name: '등록상품명 일치',
```

Update the runbook to state:

```md
- `needs_review` is displayed as **확인 필요**. It means strong evidence exists,
  but no operator-confirmed component recipe exists yet.
- `등록상품명 일치` compares only Coupang registered name and Sellpia name after
  NFKC, lowercase, and whitespace removal. It never creates a component or infers quantity.
- If multiple active Sellpia Masters share the normalized name, show all candidates
  and leave the SKU in **확인 필요** until an operator saves a recipe.
```

Ensure the design document also writes `needs_review (화면 문구: 확인 필요)` and contains no user-facing `검토 필요` label.

- [ ] **Step 4: Run the UI spec and documentation checks**

Run:

```bash
rtk npm test --workspace=apps/web -- --run 'src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx'
rtk rg -n "검토 필요|확인 필요|등록상품명 일치" docs/superpowers/specs/2026-07-14-normalized-registered-name-matching-design.md docs/runbooks/channel-sellpia-matching.md apps/web/src/app/'(catalog)'/product-hub/matching
```

Expected: the UI spec passes; `검토 필요` has no match; `확인 필요` and `등록상품명 일치` appear in the expected UI and docs.

- [ ] **Step 5: Commit UI and documentation**

```bash
rtk git add apps/web/src/app/'(catalog)'/product-hub/matching/components/ChannelSkuComponentDialog.tsx apps/web/src/app/'(catalog)'/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx docs/runbooks/channel-sellpia-matching.md docs/superpowers/specs/2026-07-14-normalized-registered-name-matching-design.md
rtk git commit -m "feat: label registered-name match candidates"
```

### Task 5: Cross-Layer Verification

**Files:**
- Verify: all files changed in Tasks 1–4
- Reference: `docs/superpowers/plans/2026-07-14-normalized-registered-name-matching.md` (project policy keeps temporary execution plans ignored and out of git)

**Interfaces:**
- Consumes: completed cross-layer implementation.
- Produces: fresh evidence that contracts, builds, and Nest wiring remain valid.

- [ ] **Step 1: Run all focused contract tests together**

```bash
rtk npm exec --workspace=packages/shared -- vitest run --config vitest.config.ts src/schemas/channel-sku-matching.spec.ts
rtk npm exec --workspace=apps/server -- vitest run src/channels/domain/channel-sku-candidate-ranking.spec.ts src/inventory/application/service/sellpia-master-product-read.service.spec.ts src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.spec.ts src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.spec.ts src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.spec.ts src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts
rtk npm test --workspace=apps/web -- --run 'src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx' 'src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts'
```

Expected: every focused test passes with zero failed tests.

- [ ] **Step 2: Run package builds**

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

Expected: all commands exit 0; TypeScript exhaustiveness proves every port mock and reason label handles the new contract.

- [ ] **Step 3: Boot the NestJS application**

Run:

```bash
rtk npm run dev:server
```

Expected: Nest logs `Nest application successfully started`. Stop the watcher after that line; any missing provider or port method is a failure.

- [ ] **Step 4: Inspect the final diff and release boundary**

```bash
rtk git diff --check 5b7cc98b^...HEAD
rtk git diff --stat 5b7cc98b^...HEAD
rtk git status --short --branch
rtk git diff 5b7cc98b^...HEAD -- VERSION prisma docs/ARCHITECTURE.md
```

Expected: no whitespace errors; `VERSION`, Prisma schema, and `docs/ARCHITECTURE.md` remain unchanged. Compare the in-scope files against the File Structure section; unrelated user-owned commits that landed during execution may also appear in the branch diff and must remain untouched.

- [ ] **Step 5: Confirm the temporary plan remains outside git**

```bash
rtk git check-ignore -v docs/superpowers/plans/2026-07-14-normalized-registered-name-matching.md
rtk git status --short --branch
```

Expected: `.gitignore` reports `docs/superpowers/plans/`; the worktree is clean apart from unrelated user-owned files, and the branch contains the design and implementation commits while the temporary execution plan stays local.
