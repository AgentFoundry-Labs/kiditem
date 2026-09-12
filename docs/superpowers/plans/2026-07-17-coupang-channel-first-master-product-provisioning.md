# Coupang Channel-First MasterProduct Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project has already selected inline execution, so use `superpowers:executing-plans` in the current session.

**Goal:** Make every scraper-published Coupang listing appear in product operations as an idempotently linked `MasterProduct`, while keeping Sellpia recipe confirmation explicit and progressively refreshing registered-product cards.

**Architecture:** Products exports a transaction-aware incoming capability that owns channel-origin `MasterProduct` and `ProductVariant` resolution/creation. The existing Channels catalog publication transaction locks newly published listing rows, calls that capability, writes only still-null channel links, publishes media, and commits the chunk atomically. React Query observes monotonic server publication progress and invalidates channel-listing and product-operation queries without replacing any preserved screen.

**Tech Stack:** TypeScript, NestJS, Prisma 7/PostgreSQL, Zod shared contracts, Next.js App Router, TanStack React Query, Vitest, Testing Library, real Chrome/Wing scraper acceptance.

## Global Constraints

- Root `VERSION` remains exactly `0.1.19`; do not bump it during local implementation.
- Sellpia remains the only physical-stock source of truth; no stock or inferred quantity is written to `MasterProduct`, `ProductVariant`, or Channels.
- AI matching and AI candidate recommendations are outside this work.
- Existing confirmed product links, option links, recipes, and operator-edited product metadata are never overwritten by recollection.
- Normalized registered names remain candidate evidence only and never auto-confirm a product, variant, or recipe.
- The current Coupang collector may reuse an existing identity only from typed `sellerSku` or a safely normalized typed `barcode`; never treat untyped `raw` aliases as exact evidence.
- Barcode normalization accepts digits plus spaces/hyphens only, preserves leading zeroes, and rejects alphabetic or other mixed payloads before any auto-link decision.
- The UI baseline is commit `c9e7caf875ca82574ae566a27fe0afa35c988918`; add status and refresh behavior without replacing layouts or URLs.
- Frontend data continues through NestJS `apiClient` and React Query; no direct database access or new SSE/WebSocket transport.
- Use TDD in the current inline session. Run focused tests while editing and full builds only at the final verification boundary.
- Keep the backend and web apps in watch mode during implementation; do not reset the current development database or interrupt the active scraper collection.
- Existing development listings are repaired by replaying/recollecting through the real scraper path; no staging-data backfill is added, as already approved for the in-development `0.1.19` release.
- An inactive current/origin `MasterProduct` is never silently reactivated or linked. Publication fails clearly and preserves operator intent until the product is reactivated or reassigned.
- Prefix every shell command with `rtk`.

## File Structure

### Products-owned provisioning

- `prisma/models/core.prisma`: add immutable organization-fenced channel-origin provenance, its leading FK index, and name the two `MasterProduct`/`ChannelListing` relations.
- `scripts/__tests__/master-product-operations-schema-contract.test.mjs`: guard the provenance relation and preserve nullable operational links.
- `apps/server/src/products/domain/channel-catalog-product-resolution.ts`: pure stable-code, barcode-normalization, and unique-consistent-target policies.
- `apps/server/src/products/domain/channel-catalog-product-resolution.spec.ts`: prove exact-only resolution and conflict behavior.
- `apps/server/src/products/application/port/in/channel-catalog-product-provisioning.port.ts`: Products-owned incoming transaction capability.
- `apps/server/src/products/application/port/out/repository/channel-catalog-product-provisioning.repository.port.ts`: repository boundary for the capability.
- `apps/server/src/products/application/service/channel-catalog-product-provisioning.service.ts`: thin organization-scoped orchestration.
- `apps/server/src/products/application/service/channel-catalog-product-provisioning.service.spec.ts`: verify input forwarding and result preservation.
- `apps/server/src/products/adapter/out/repository/channel-catalog-product-provisioning.repository.adapter.ts`: transaction validation, scope validation, typed exact-evidence lookup, and batch idempotent product/variant creation inside the caller transaction.
- `apps/server/src/products/__tests__/channel-catalog-product-provisioning.repository.pg.integration.spec.ts`: PostgreSQL identity, tenancy, recipe, and retry coverage.
- `apps/server/src/products/products.module.ts`: bind and export the incoming capability.
- `apps/server/src/products/__tests__/products.architecture.spec.ts`: guard the Products capability binding/export.
- `apps/server/src/products/AGENTS.md`: authorize exact-only channel-origin provisioning while retaining Products stock/recipe boundaries.

### Channels-owned link publication

- `apps/server/src/channels/adapter/out/repository/channel-catalog-identity-upsert.ts`: return persisted listing/option IDs and current links after source-fact upsert.
- `apps/server/src/channels/adapter/out/repository/channel-catalog-identity-upsert.spec.ts`: guard link-preserving identity output.
- `apps/server/src/channels/adapter/out/repository/channel-catalog-operational-product-publication.ts`: lock listing rows, normalize provider evidence, call Products, and apply conditional channel links.
- `apps/server/src/channels/adapter/out/repository/channel-catalog-operational-product-publication.spec.ts`: verify evidence extraction and conditional link writes.
- `apps/server/src/channels/adapter/out/repository/channel-catalog-publication.repository.adapter.ts`: call the new helper between identity upsert and media publication.
- `apps/server/src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts`: prove atomic creation/linking, exact reuse, name-only non-reuse, stable replay, and rollback.
- `apps/server/src/channels/__tests__/kiditem-first-catalog-reconciliation.pg.integration.spec.ts`: prove KidItem-first confirmed links still win.
- `apps/server/src/channels/channels.module.ts`: import `ProductsModule` so the publication adapter can inject the Products capability.
- `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`: guard the owner-module import.
- `apps/server/src/channels/AGENTS.md`: replace the obsolete blanket prohibition with the approved atomic provisioning boundary.

### Web refresh, warning copy, and current ownership guidance

- `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.ts`: invalidate progressively on monotonic publication count.
- `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx`: replace the completion-only regression with progressive refresh coverage.
- `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.tsx`: render `configuration_required` as `재고 연결 필요`.
- `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.tsx`: use the same filter copy.
- `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.spec.tsx`: preserve the staged layout while asserting the new warning copy.
- `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.tsx`: use the same product-level warning copy.
- `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductVariantPanel.tsx`: use the same variant-level warning copy without changing the recipe editor.
- `apps/web/src/app/(catalog)/product-hub/matching/components/VariantRecipeSummary.tsx`: distinguish `재고 연결 필요` from `검토 필요`.
- `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuMappingTable.spec.tsx`: prove the recipe remains read-only and the warning is visible.
- `apps/web/src/app/(catalog)/product-hub/AGENTS.md`, `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`, `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/AGENTS.md`: describe channel-origin rows, exact-only correction, and progressive refresh.
- `docs/ARCHITECTURE.md`: document the new Products incoming capability consumed during Channels catalog publication.
- `docs/superpowers/specs/archive/2026-07-17-coupang-channel-first-master-product-provisioning-design.md`: mark the approved design current and align it with typed Coupang evidence, bulk publication, and failure behavior.
- `docs/superpowers/specs/archive/2026-07-16-master-product-operations-inventory-design.md`: point the superseded channel-first section at the approved 2026-07-17 design.

---

### Task 1: Products-owned idempotent provisioning capability

**Files:**
- Modify: `prisma/models/core.prisma`
- Modify: `scripts/__tests__/master-product-operations-schema-contract.test.mjs`
- Create: `apps/server/src/products/domain/channel-catalog-product-resolution.ts`
- Create: `apps/server/src/products/domain/channel-catalog-product-resolution.spec.ts`
- Create: `apps/server/src/products/application/port/in/channel-catalog-product-provisioning.port.ts`
- Create: `apps/server/src/products/application/port/out/repository/channel-catalog-product-provisioning.repository.port.ts`
- Create: `apps/server/src/products/application/service/channel-catalog-product-provisioning.service.ts`
- Create: `apps/server/src/products/application/service/channel-catalog-product-provisioning.service.spec.ts`
- Create: `apps/server/src/products/adapter/out/repository/channel-catalog-product-provisioning.repository.adapter.ts`
- Create: `apps/server/src/products/__tests__/channel-catalog-product-provisioning.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Modify: `apps/server/src/products/__tests__/products.architecture.spec.ts`
- Modify: `apps/server/src/products/AGENTS.md`

**Interfaces:**
- Consumes: a caller-owned opaque Prisma transaction, organization/user identity, stable channel listing/option IDs, current confirmed links, and normalized exact identifier evidence.
- Produces: `CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT` with `provision(input): Promise<ChannelCatalogProductProvisioningResult>`; it creates/reuses Products-owned identities but never writes Channels-owned link columns.

- [ ] **Step 1: Update the Products owner contract, then write the failing schema and pure-policy tests**

First revise `apps/server/src/products/AGENTS.md` so the implementation is
aligned with the already approved design before code changes: Products may create or reuse channel-origin
products and variants through its exported transaction-aware incoming port;
it still may not write channel link columns, stock, or inferred component
recipes. Typed seller SKU and safely normalized barcode evidence may select an
existing identity only when unique and non-conflicting; untyped `raw`, names,
and AI remain non-confirming evidence. The scoped guide change ships in the
same PR and is called out in the PR body for team review.

Extend the schema contract with these exact expectations:

```js
expectFields(master, [
  'originChannelListingId',
  'originChannelListing',
]);
assert.match(master, /@@unique\(\[organizationId, originChannelListingId\]\)/);
assert.match(master, /@@index\(\[originChannelListingId\]\)/);
assert.match(
  master,
  /@relation\("ChannelListingOriginProduct", fields: \[originChannelListingId, organizationId\], references: \[id, organizationId\]/,
);
assert.match(
  modelBlock(core, 'ChannelListing'),
  /^\s*originatedMasterProduct\s+MasterProduct\?/m,
);
```

Create the domain spec with stable code limits and exact conflict behavior:

```ts
import { describe, expect, it } from 'vitest';
import {
  channelOriginProductCode,
  channelOriginVariantCode,
  normalizeExactBarcode,
  selectUniqueMasterProduct,
  selectUniqueProductVariant,
} from './channel-catalog-product-resolution';

describe('channel catalog product resolution', () => {
  it('derives stable organization-safe codes from persisted UUID identities', () => {
    const listingId = '11111111-1111-4111-8111-111111111111';
    const optionId = '22222222-2222-4222-8222-222222222222';
    expect(channelOriginProductCode(listingId)).toBe(`CP-${listingId}`);
    expect(channelOriginVariantCode(optionId)).toBe(`CP-SKU-${optionId}`);
    expect(channelOriginProductCode(listingId).length).toBeLessThanOrEqual(100);
    expect(channelOriginVariantCode(optionId).length).toBeLessThanOrEqual(100);
  });

  it('accepts one exact target and rejects ambiguity or conflicting exact evidence', () => {
    expect(selectUniqueMasterProduct([{ masterProductId: 'master-1' }])).toBe('master-1');
    expect(selectUniqueMasterProduct([
      { masterProductId: 'master-1' },
      { masterProductId: 'master-1' },
    ])).toBe('master-1');
    expect(selectUniqueMasterProduct([
      { masterProductId: 'master-1' },
      { masterProductId: 'master-2' },
    ])).toBeNull();
    expect(selectUniqueMasterProduct([])).toBeNull();
  });

  it('selects a variant only inside the selected product', () => {
    expect(selectUniqueProductVariant('master-1', [
      { masterProductId: 'master-1', productVariantId: 'variant-1' },
      { masterProductId: 'master-2', productVariantId: 'variant-2' },
    ])).toBe('variant-1');
    expect(selectUniqueProductVariant('master-1', [
      { masterProductId: 'master-1', productVariantId: 'variant-1' },
      { masterProductId: 'master-1', productVariantId: 'variant-2' },
    ])).toBeNull();
  });

  it('normalizes only valid 8-14 digit barcodes', () => {
    expect(normalizeExactBarcode(' 001-2345-67890 ')).toBe('001234567890');
    expect(normalizeExactBarcode('ABC12345678XYZ')).toBeNull();
    expect(normalizeExactBarcode('1234/5678')).toBeNull();
    expect(normalizeExactBarcode('short')).toBeNull();
    expect(normalizeExactBarcode(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
rtk node --test scripts/__tests__/master-product-operations-schema-contract.test.mjs
rtk npm exec --workspace=apps/server vitest -- run src/products/domain/channel-catalog-product-resolution.spec.ts
```

Expected: the schema test fails because `originChannelListingId` is absent, and Vitest fails because the new domain module does not exist.

- [ ] **Step 3: Add the provenance relation and pure resolution functions**

Use two named relations because `ChannelListing` already has the current operational link:

```prisma
model MasterProduct {
  originChannelListingId String? @map("origin_channel_listing_id") @db.Uuid

  channelListings     ChannelListing[] @relation("ChannelListingOperationalProduct")
  originChannelListing ChannelListing? @relation(
    "ChannelListingOriginProduct",
    fields: [originChannelListingId, organizationId],
    references: [id, organizationId],
    onDelete: Restrict
  )

  @@unique([organizationId, originChannelListingId])
  @@index([originChannelListingId])
}

model ChannelListing {
  masterProduct       MasterProduct? @relation(
    "ChannelListingOperationalProduct",
    fields: [masterProductId, organizationId],
    references: [id, organizationId],
    onDelete: Restrict
  )
  originatedMasterProduct MasterProduct? @relation("ChannelListingOriginProduct")
}
```

Create the pure module with these exact exports:

```ts
export type ExactProductTarget = Readonly<{ masterProductId: string }>;
export type ExactVariantTarget = Readonly<{
  masterProductId: string;
  productVariantId: string;
}>;

export function channelOriginProductCode(channelListingId: string): string {
  return `CP-${channelListingId}`;
}

export function channelOriginVariantCode(channelListingOptionId: string): string {
  return `CP-SKU-${channelListingOptionId}`;
}

export function normalizeExactBarcode(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^[0-9 -]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[ -]/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

export function selectUniqueMasterProduct(
  targets: readonly ExactProductTarget[],
): string | null {
  const ids = [...new Set(targets.map((target) => target.masterProductId))];
  return ids.length === 1 ? ids[0] : null;
}

export function selectUniqueProductVariant(
  masterProductId: string,
  targets: readonly ExactVariantTarget[],
): string | null {
  const ids = [...new Set(targets
    .filter((target) => target.masterProductId === masterProductId)
    .map((target) => target.productVariantId))];
  return ids.length === 1 ? ids[0] : null;
}
```

Run the two focused tests again. Expected: PASS.

- [ ] **Step 4: Define the Products incoming and repository contracts with a failing service test**

Use this internal contract; do not add it to `@kiditem/shared` because it is a backend transaction boundary:

```ts
export type ChannelCatalogProvisioningOption = Readonly<{
  channelListingOptionId: string;
  currentProductVariantId: string | null;
  name: string;
  sellerSku: string | null;
  barcode: string | null;
}>;

export type ChannelCatalogProvisioningListing = Readonly<{
  channelListingId: string;
  currentMasterProductId: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  options: readonly ChannelCatalogProvisioningOption[];
}>;

export type ChannelCatalogProductProvisioningResult = Readonly<{
  listings: readonly Readonly<{
    channelListingId: string;
    masterProductId: string;
    optionLinks: readonly Readonly<{
      channelListingOptionId: string;
      productVariantId: string | null;
    }>[];
  }>[];
  createdMasterProductCount: number;
  reusedMasterProductCount: number;
  createdVariantCount: number;
}>;

export interface ChannelCatalogProductProvisioningPort {
  provision(input: {
    transaction: unknown;
    organizationId: string;
    userId: string;
    listings: readonly ChannelCatalogProvisioningListing[];
  }): Promise<ChannelCatalogProductProvisioningResult>;
}

export const CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT = Symbol(
  'CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT',
);
```

The outgoing repository port exposes the same `provision` signature. The
service test must assert that `organizationId`, `userId`, the transaction
object, current links, and typed exact evidence pass unchanged and that the
result is returned unchanged. The repository adapter must reject a non-Prisma
transaction object at runtime, following the existing catalog-media
publication guard.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/products/application/service/channel-catalog-product-provisioning.service.spec.ts
```

Expected: FAIL until the service and port bindings exist, then PASS after the thin service delegates to the repository.

- [ ] **Step 5: Write the PostgreSQL tests for new, reused, and ambiguous products**

Create one real transaction test fixture containing a Coupang account, listing, and option. Cover these exact assertions:

```ts
const created = await prisma.$transaction((transaction) => service.provision({
  transaction,
  organizationId: TEST_ORGANIZATION_ID,
  userId: TEST_USER_ID,
  listings: [{
    channelListingId: listing.id,
    currentMasterProductId: null,
    name: '쿠팡 등록 상품',
    category: '완구',
    brand: 'KidItem',
    options: [{
      channelListingOptionId: option.id,
      currentProductVariantId: null,
      name: '파랑',
      sellerSku: null,
      barcode: null,
    }],
  }],
}));

expect(created).toMatchObject({
  createdMasterProductCount: 1,
  reusedMasterProductCount: 0,
  createdVariantCount: 1,
});
const product = await prisma.masterProduct.findFirstOrThrow({
  where: { organizationId: TEST_ORGANIZATION_ID, originChannelListingId: listing.id },
  include: { variants: { include: { components: true } } },
});
expect(product).toMatchObject({
  code: `CP-${listing.id}`,
  name: '쿠팡 등록 상품',
  category: '완구',
  brand: 'KidItem',
});
expect(product.variants).toEqual([
  expect.objectContaining({ code: `CP-SKU-${option.id}`, isDefault: true }),
]);
expect(product.variants[0].components).toEqual([]);
```

In the same file add cases that:

- call `provision` twice and assert stable product/variant IDs;
- reuse an active variant when `sellerSku === ProductVariant.code`;
- resolve safely normalized barcode only through active confirmed components;
- create a channel-origin product when exact evidence points at multiple products;
- create a channel-origin product when only the normalized product name matches an existing product;
- preserve `currentMasterProductId` and `currentProductVariantId` without querying a replacement;
- reject foreign-organization listing/option/current-product/current-variant IDs before any write;
- fail clearly when the current or prior origin product is inactive, without reactivating it;
- reject a deterministic `CP-*` code collision owned by another product instead of reusing it;
- preserve operator-edited product/variant names, category, brand, active state, and recipes on replay;
- handle two concurrent direct provisioning calls without duplicate identities or an unclassified unique-constraint error.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/products/__tests__/channel-catalog-product-provisioning.repository.pg.integration.spec.ts
```

Expected: FAIL because the repository adapter is not implemented.

- [ ] **Step 6: Implement the repository algorithm and module binding**

Implement one batch-oriented repository call with this decision order for each
locked listing after validating every supplied listing, option, current
product, and current variant against the same organization and parent:

```ts
const selectedMasterProductId =
  listing.currentMasterProductId
  ?? activeOriginProductByListingId.get(listing.channelListingId)?.id
  ?? selectUniqueMasterProduct(exactTargetsFor(listing));

if (selectedMasterProductId) {
  return reuseProductAndResolveExactVariants(selectedMasterProductId, listing);
}

return stageChannelOriginProductAndVariants(listing);
```

If provenance exists only on an inactive origin product, or the current linked
product is inactive, throw a classified conflict before staging any write.
Never reactivate it. Validate the opaque transaction with the same focused
runtime guard used by catalog-media publication.

The repository must preload exact evidence in fixed-size batches and issue no
per-listing or per-option lookup query:

- `ProductVariant.code` for the nonblank `sellerSku` set;
- active component barcodes whose source matches `^[0-9 -]+$`, normalized with
  PostgreSQL `regexp_replace(barcode, '[ -]', '', 'g')` through a Prisma tagged
  query so database and TypeScript policy cannot diverge;
- prior origin products by `originChannelListingId`, including inactive rows so
  deactivation can be handled explicitly;
- every current product/variant link needed for organization, activity, and
  parent validation.

Do not include names or untyped `raw` aliases in any exact-target map. The only
use of `listing.name`, `category`, and `brand` is the initial product payload.

For an existing operator-managed product, return only unique existing variant
matches and leave unresolved option links null. For the listing's own
channel-origin product, stage any missing deterministic option variants with
no components. Insert staged products and variants through bounded
`createMany`/tagged bulk operations, reload them once, and return stable IDs.
Set `isDefault: true` only for the first active variant when the product has no
active default. A deterministic `CP-*` code already owned by different
provenance is a classified conflict, not an exact-match shortcut.

Bind the repository adapter to its outgoing token, bind the service to
`CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT`, and export only the incoming token
from `ProductsModule`. Extend `products.architecture.spec.ts` to assert the
provider bindings and export.

- [ ] **Step 7: Apply the schema and run the Task 1 gate**

Run:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk node --test scripts/__tests__/master-product-operations-schema-contract.test.mjs
rtk npm exec --workspace=apps/server vitest -- run src/products/domain/channel-catalog-product-resolution.spec.ts src/products/application/service/channel-catalog-product-provisioning.service.spec.ts src/products/__tests__/channel-catalog-product-provisioning.repository.pg.integration.spec.ts src/products/__tests__/products.architecture.spec.ts
```

Expected: schema push and Prisma generation succeed; every focused test passes.

- [ ] **Step 8: Commit Task 1**

```bash
rtk git add prisma/models/core.prisma scripts/__tests__/master-product-operations-schema-contract.test.mjs apps/server/src/products
rtk git commit -m "feat: provision channel-origin products"
```

---

### Task 2: Atomically connect Coupang chunk publication to Products

**Files:**
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-identity-upsert.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-identity-upsert.spec.ts`
- Create: `apps/server/src/channels/adapter/out/repository/channel-catalog-operational-product-publication.ts`
- Create: `apps/server/src/channels/adapter/out/repository/channel-catalog-operational-product-publication.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-publication.repository.adapter.ts`
- Modify: `apps/server/src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/__tests__/kiditem-first-catalog-reconciliation.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Modify: `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`
- Modify: `apps/server/src/channels/AGENTS.md`

**Interfaces:**
- Consumes: `CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT` from Task 1 plus the current `upsertChannelCatalogIdentities` result.
- Produces: an atomic detail-chunk transaction in which source facts, operational product/variant identities, channel links, media, and `publishedAt` either all commit or all roll back.

- [ ] **Step 1: Update the Channels owner contract, then write the failing identity/helper tests**

First revise `apps/server/src/channels/AGENTS.md` so Wing publication is
allowed to call Products' transaction-aware provisioning port and write only
still-null product/variant links. Keep the existing prohibitions on recipe and
stock writes, name/AI confirmation, accountless listings, and recollection
overwriting confirmed links.

Extend `ChannelCatalogIdentityUpsertResult` so its persisted identity output has this exact shape:

```ts
persistedListings: Array<{
  id: string;
  externalProductId: string;
  masterProductId: string | null;
  options: Array<{
    id: string;
    externalOptionId: string;
    productVariantId: string | null;
  }>;
}>;
```

Update its unit spec to assert existing links remain in the returned result and
raw upsert SQL still omits both link columns from `DO UPDATE`.

Create a helper spec that supplies validated catalog products and persisted IDs
and asserts the Products input exactly maps:

```ts
expect(buildCatalogProductProvisioningListings(products, persistedListings)).toEqual([{
  channelListingId: 'listing-1',
  currentMasterProductId: null,
  name: '등록상품명',
  category: '완구',
  brand: '브랜드',
  options: [{
    channelListingOptionId: 'option-1',
    currentProductVariantId: null,
    name: '파랑',
    sellerSku: 'SELLER-001',
    barcode: '001234567890',
  }],
}]);
```

Add nullable-name cases and assert the helper uses
`registeredName ?? displayName ?? externalProductId` for the product and
`optionName ?? sellerSku ?? externalOptionId` for the option. `sellerSku` and
`barcode` come only from the validated typed fields. Put tempting
`productCode`/`sellpiaCode` values in `raw` and assert they are ignored.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/adapter/out/repository/channel-catalog-identity-upsert.spec.ts src/channels/adapter/out/repository/channel-catalog-operational-product-publication.spec.ts
```

Expected: FAIL until the identity result and helper exist.

- [ ] **Step 2: Implement identity output, row locking, and conditional link application**

After the existing option upsert, reload persisted listings with active options
and return them in stable external-ID order. In the new helper:

1. sort listing UUIDs and lock them with `SELECT ... FOR UPDATE` inside the
   publication transaction;
2. reload their current product and option links after the lock;
3. call `provisioner.provision({ transaction, organizationId, userId, listings })`;
4. validate all returned product/variant memberships in one batch query;
5. bulk-update `ChannelListing.masterProductId` only where it is null;
6. reload selected listing links once and bulk-update an option only when the
   returned variant belongs to that selected product and the option link is
   still null;
7. never clear or replace an existing link.

Use bounded JSONB payloads and tagged `UPDATE ... FROM` statements with
organization fences. Do not issue one `updateMany` or membership lookup per
listing/option:

```ts
type ProductLinkWrite = {
  channelListingId: string;
  masterProductId: string;
};
type VariantLinkWrite = ProductLinkWrite & {
  channelListingOptionId: string;
  productVariantId: string;
};

await applyProductLinksInBatches(tx, organizationId, productLinks, 500);
await applyVariantLinksInBatches(tx, organizationId, variantLinks, 500);
```

The variant batch preload must prove
`ProductVariant.masterProductId === ChannelListing.masterProductId` before the
option payload is admitted. Count only rows actually changed by the bulk
statements. The helper's unit test uses a 1,225-listing/2,241-option fixture and
asserts database operations scale by fixed-size batches, not by row count.

- [ ] **Step 3: Write the failing publication integration tests**

Change the first publication test from `productVariantId: null` to these
atomic expectations:

```ts
expect(listing.masterProductId).not.toBeNull();
expect(listing.options[0].productVariantId).not.toBeNull();
const product = await prisma.masterProduct.findUniqueOrThrow({
  where: { id: listing.masterProductId! },
  include: { variants: { include: { components: true } } },
});
expect(product.originChannelListingId).toBe(listing.id);
expect(product.variants[0].components).toEqual([]);
```

Add focused cases for:

- replaying one detail chunk and asserting the product and variant IDs stay stable;
- creating an existing product/variant with typed exact `sellerSku` evidence and asserting the listing reuses them;
- creating an existing component recipe with a safely formatted typed barcode and asserting it resolves, while alphanumeric/mixed barcode payloads do not;
- creating an existing product with the same NFKC/lowercase/whitespace-normalized name but no exact identifier and asserting a different channel-origin product is created;
- publishing nullable registered/option names and asserting external-ID fallbacks create valid names;
- putting plausible `productCode` and `sellpiaCode` values only in `raw` and asserting they do not influence linking;
- media failure rolling back listing, option, product, variant, and chunk publication together;
- final recollection preserving manual links and a manual recipe;
- KidItem-first provisional links surviving detail publication;
- a manual link committed while publication waits for the listing lock winning without an extra origin product;
- foreign-organization or wrong-parent IDs being rejected before any product/link write;
- a full 1,225-listing/2,241-option final publication completing within the existing transaction timeout and with bulk-operation counts bounded by batch count rather than row count.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts src/channels/__tests__/kiditem-first-catalog-reconciliation.pg.integration.spec.ts
```

Expected: FAIL because the publication adapter does not yet call Products.

- [ ] **Step 4: Wire provisioning into both incremental and final publication**

Inject `CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT` into
`ChannelCatalogPublicationRepositoryAdapter`. In `upsertCoupangCatalogRows`,
call the new helper immediately after `upsertChannelCatalogIdentities` and
before media publication. Merge these numeric counters into the existing
publication changes:

```ts
{
  createdMasterProductCount,
  reusedMasterProductCount,
  createdVariantCount,
  linkedProductCount,
  linkedVariantCount,
}
```

Because both `publishChunk` and final `publish` already call
`upsertCoupangCatalogRows`, this one integration point covers incremental
visibility and final idempotent reconciliation. Do not add a second final-only
provisioning loop.

Import `ProductsModule` in `ChannelsModule`. Extend the wiring spec to assert
`ProductsModule` is present while the Products capability token is not
re-exported from Channels.

Update every direct test construction of
`ChannelCatalogPublicationRepositoryAdapter` to supply the real Products
service/repository pair. Keep the failing-media test's Products dependency real
so its rollback assertion covers cross-domain writes.

- [ ] **Step 5: Run the Task 2 gates**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/adapter/out/repository/channel-catalog-identity-upsert.spec.ts src/channels/adapter/out/repository/channel-catalog-operational-product-publication.spec.ts src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts src/channels/__tests__/kiditem-first-catalog-reconciliation.pg.integration.spec.ts src/channels/__tests__/channels.module.wiring.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
```

Expected: every test and organization-boundary check passes; the NestJS server
build succeeds. Keep the existing watch-mode backend running and confirm it
restarts without dependency-injection errors.

- [ ] **Step 6: Commit Task 2**

```bash
rtk git add apps/server/src/channels apps/server/src/products/products.module.ts apps/server/src/products/application apps/server/src/products/adapter apps/server/src/products/domain
rtk git commit -m "feat: connect Coupang catalog to product operations"
```

---

### Task 3: Progressive UI refresh, warning copy, ownership docs, and live scraper acceptance

**Files:**
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductVariantPanel.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/VariantRecipeSummary.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuMappingTable.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/AGENTS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/superpowers/specs/archive/2026-07-17-coupang-channel-first-master-product-provisioning-design.md`
- Modify: `docs/superpowers/specs/archive/2026-07-16-master-product-operations-inventory-design.md`

**Interfaces:**
- Consumes: existing `CoupangCatalogCollectionRun.progress.publishedProducts`, `queryKeys.channelListings`, `queryKeys.products.operations`, `queryKeys.channelProductMappings`, and existing inventory warning enums.
- Produces: progressive registered-product refresh and consistent operator copy; no new API route, persisted status, or UI replacement.

- [ ] **Step 1: Replace the completion-only hook test with failing progressive tests**

The current test explicitly expects no invalidation at `publishedProducts: 20`.
Replace it with assertions that:

```ts
expect(invalidate).toHaveBeenCalledWith({
  queryKey: queryKeys.channelListings.all,
});
expect(invalidate).toHaveBeenCalledWith({
  queryKey: queryKeys.products.operations.all,
});
```

Then publish the same count a second time and assert neither query family is
invalidated again. Increase to `40` and assert one additional invalidation for
each. On `status: 'completed'`, assert final invalidation of:

```ts
queryKeys.channelListings.all
queryKeys.products.operations.all
queryKeys.channelProductMappings.all
queryKeys.channelSkuAvailability.all
```

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx'
```

Expected: FAIL because the hook still invalidates only on completion.

- [ ] **Step 2: Implement monotonic progress invalidation**

Add one run-scoped ref:

```ts
const publicationProgressRef = useRef<{ runId: string; count: number } | null>(null);
```

In an effect keyed by `serverStatusQuery.data`, reset the ref when the run ID
changes. When `publishedProducts` is greater than the stored count, update the
ref first and invalidate channel listings and product operations. When status
becomes completed, keep the existing one-time completion fence and invalidate
all four query families listed in Step 1. Clear the progress ref in `reset()`.

Do not add a timer: the existing 2-second server-status React Query poll is the
single refresh clock.

Run the focused hook test again. Expected: PASS.

- [ ] **Step 3: Write and pass the warning-copy regression tests**

Update the staged product-operations fixture to include a channel-origin
configuration-required product and assert:

```ts
expect(screen.getAllByText('재고 연결 필요').length).toBeGreaterThan(0);
expect(screen.getByText('스테이지 상품')).toBeInTheDocument();
expect(screen.getByRole('columnheader', { name: '상품' })).toBeInTheDocument();
expect(screen.getByRole('columnheader', { name: '재고' })).toBeInTheDocument();
```

Update `ChannelSkuMappingTable.spec.tsx` with a linked variant whose
`recipeStatus` is `configuration_required` and assert `재고 연결 필요`,
`판매 가능 미확정`, and `중앙 레시피 보기` are visible while no quantity
input exists.

Change only operator-facing labels:

```ts
configuration_required: '재고 연결 필요'
```

Apply the same text in the list filter, product info card, variant panel, and
matching recipe summary. Keep enum values and API schemas unchanged.

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub' 'src/app/(product-pipeline)/product-pipeline/registered-products'
```

Expected: PASS with the preserved product operations and registered-products
screen tests.

- [ ] **Step 4: Update current ownership documentation in the same Task**

Change the three web scoped guides so they state:

- Products owns the transaction-aware creation/reuse of channel-origin
  products and variants;
- Channels owns exact evidence extraction and writes the final listing/option
  links;
- normalized names and AI never auto-confirm;
- browser catalog chunks progressively invalidate registered-product and
  product-operation queries;
- matching remains the operator correction and recipe-attention workspace.

In the 2026-07-16 design, replace only the obsolete channel-first flow with a
short supersession note linking
`2026-07-17-coupang-channel-first-master-product-provisioning-design.md`.
Mark the 2026-07-17 design approved and align its evidence list with the real
typed collector contract (`sellerSku`, `barcode`), nullable-name fallbacks,
inactive-origin conflict behavior, bulk final-publication path, and explicit
reason why this already belongs to release `0.1.19` without a new version bump
or staging backfill. Update `docs/ARCHITECTURE.md` with the Products capability
consumed by Channels.
Do not rewrite unrelated historical sections.

- [ ] **Step 5: Run the complete repository verification boundary**

Run focused and full gates once after implementation is complete:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
rtk node --test extensions/tests/coupang-catalog-collector.test.mjs
rtk npm exec --workspace=apps/server vitest -- run src/products src/channels
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub' 'src/app/(product-pipeline)/product-pipeline/registered-products'
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:conventions
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npx vitest run
```

Expected: every command exits 0. Confirm the watch-mode backend reports a
successful NestJS boot and the watch-mode web app has no compile error. Confirm
`rtk git diff -- VERSION` is empty.

- [ ] **Step 6: Perform real scraper-driven browser acceptance**

Use the already open authenticated Chrome session and the running watch-mode
apps. Do not upload a Coupang workbook and do not reset the database.

1. Open `/product-pipeline/registered-products` and resume or start the real
   browser scraper collection. Existing unlinked development rows are repaired
   by this real replay/recollection path; do not run a synthetic backfill.
2. Record the current server `publishedProducts` count and visible card total.
3. Wait for the next real detail chunk; verify the server count rises and the
   cards refetch without completion or a manual refresh.
4. Open `/product-hub`; verify new rows exist and a channel-origin row shows
   `재고 연결 필요` with a nonzero channel count.
5. Open that row's detail; verify its channel-origin variants have no component
   recipe and capacity is `미확정`, not zero.
6. Open `/product-hub/matching`; verify the product is linked, its unconfigured
   variant shows `재고 연결 필요`, and name-only candidates did not replace the
   link.
7. Configure one test variant through the existing recipe editor using a real
   active Sellpia SKU, then verify product detail, matching, and channel SKU
   availability show the same Sellpia stock/capacity basis.
8. Resume or replay collection and verify listing, product, variant, recipe,
   and confirmed link IDs stay stable.
9. Check the browser console on all three screens; accept no KidItem application
   errors. Ignore only identified third-party extension warnings.

Save screenshots and a concise QA report under the existing gitignored
`.gstack/qa-reports/` directory. The report must include the run ID, before/after
published counts, tested listing/product/variant IDs, and any concern that
remains.

- [ ] **Step 7: Commit Task 3**

```bash
rtk git add apps/web/src/app/'(catalog)'/product-hub apps/web/src/app/'(product-pipeline)'/product-pipeline/registered-products docs/ARCHITECTURE.md docs/superpowers/specs/archive/2026-07-17-coupang-channel-first-master-product-provisioning-design.md docs/superpowers/specs/archive/2026-07-16-master-product-operations-inventory-design.md docs/ERD.md docs/erd graphify-out
rtk git commit -m "fix: surface collected products in operations"
```

## Plan Completion Review

Before reporting completion, verify all of the following from current evidence:

- Every active browser-published Coupang listing has a non-null operational
  product link or an explicitly reported transaction failure.
- No name-only candidate wrote a link.
- No new component recipe or quantity was inferred.
- Existing KidItem-first/manual links and recipes survived recollection.
- Replayed chunks preserved product and variant IDs.
- Registered-product cards refreshed before full-run completion.
- Product management, matching, and registered-products layouts still match
  their preserved screen contracts.
- Root `VERSION` is still `0.1.19`.
- The worktree contains no unrelated or untracked source changes.

## What Already Exists

- The Wing collector already emits a validated typed contract with at least one
  option per product, typed `sellerSku`/`barcode`, and detail chunks capped at
  20 products. This plan consumes that contract and does not invent raw aliases.
- `ChannelCatalogPublicationRepositoryAdapter` already owns one PostgreSQL
  transaction, an account advisory lock, chunk replay fencing, media
  publication, and final absence reconciliation. This plan extends that path
  instead of building a parallel importer.
- Catalog-media publication already demonstrates the opaque-transaction port
  plus runtime transaction guard pattern. Products reuses that boundary.
- `MasterProduct`, `ProductVariant`, and central component recipes already
  drive `/product-hub`; no second operational product model is added.
- `/product-hub/matching` already supports manual correction and recipe review.
  Auto-created identities remain visible there without adding AI.
- `useCoupangCatalogImport` already polls server status every two seconds and
  invalidates listings on completion. The plan extends that clock rather than
  adding SSE, WebSocket, or a second timer.

## NOT in Scope

- AI match candidates or automated recipe inference: deferred by explicit user
  decision; exact deterministic evidence only.
- A staging-data migration or synthetic backfill: development rows are repaired
  by real scraper replay/recollection under the approved `0.1.19` data policy.
- New Coupang `productCode`/`sellpiaCode` collector fields: the live collector
  does not expose typed fields with those semantics, so raw lookalikes are
  intentionally ignored.
- Automatic reassignment after an origin product is linked: existing links stay
  stable; later correction remains an operator action in matching.
- A persisted provisional/mapping provenance state: current relations derive
  the needed warning states, and adding another state machine is unnecessary.
- Purchase-order copy changes or Sellpia sync redesign: those are separate
  operational flows and are not required to make collected products visible.
- New routes, screen replacements, polling transports, or extension UI.

## Reviewed Data Flow

```text
Wing typed detail payload (max 20 products/chunk)
  -> validate sellerSku/barcode + nullable-name fallbacks
  -> existing Channels publication transaction
       -> source-fact bulk upsert
       -> deterministic listing-row locks
       -> Products port runtime transaction/scope validation
       -> batch-load current/origin/exact targets
       -> batch-create only missing channel-origin identities
       -> batch-validate returned product/variant membership
       -> conditional bulk link writes (still-null only)
       -> provider media publication
       -> chunk publishedAt/progress update
       -> COMMIT or full rollback
  -> existing 2-second status poll observes higher publishedProducts
  -> invalidate registered listings + product operations
  -> completion also invalidates matching + channel availability
```

Inline ASCII comments are required only in the two non-obvious batch pipeline
files:

- `channel-catalog-product-provisioning.repository.adapter.ts`: resolution and
  staged bulk-create decision order;
- `channel-catalog-operational-product-publication.ts`: lock, validate, and
  conditional bulk-link sequence.

The Prisma relation is described by `/// @describe` plus named relations; no
large state-machine comment is needed in the schema.

## Test Coverage Review

```text
CODE PATHS                                             USER FLOWS
[+] Products exact resolution                         [+] Real Wing collection
  |- [PLANNED ***] typed sellerSku unique/ambiguous      |- [PLANNED E2E] chunk appears before completion
  |- [PLANNED ***] safe barcode/mixed-value rejection    |- [PLANNED E2E] row appears in /product-hub
  |- [PLANNED ***] name-only never confirms              |- [PLANNED E2E] no recipe => 재고 연결 필요
  |- [PLANNED ***] nullable name fallbacks                `- [PLANNED E2E] recipe edit shares Sellpia stock
  `- [PLANNED ***] inactive/collision conflict

[+] Products identity persistence                     [+] Retry and correction
  |- [PLANNED PG] new product + variants, no recipe      |- [PLANNED PG] duplicate chunk stable IDs
  |- [PLANNED PG] current/manual links win               |- [PLANNED PG] concurrent manual link wins
  |- [PLANNED PG] organization/parent fences             `- [PLANNED E2E] replay preserves manual recipe
  `- [PLANNED PG] concurrent provisioning is idempotent

[+] Channels atomic publication                       [+] Progressive screen refresh
  |- [PLANNED PG] media/product/link rollback             |- [PLANNED WEB] 20 -> duplicate 20 -> 40
  |- [PLANNED PG] conditional bulk links                  |- [PLANNED WEB] run change/reset
  |- [PLANNED PG] 1,225/2,241 bulk scale                  `- [PLANNED WEB] completion invalidates 4 families
  `- [PLANNED PG] final absence reconciliation

Coverage after plan revision: 24/24 identified branches and user flows have a
named unit, PostgreSQL integration, web regression, or real-browser acceptance
check. Uncovered gaps: 0. No LLM path exists, so no eval suite is required.
```

## Failure Modes

| Failure | Planned test | Handling | Operator result |
|---|---|---|---|
| Invalid/global Prisma client passed to Products | service/adapter unit | runtime reject before DB work | classified collection failure |
| Foreign-org or wrong-parent IDs | Products PG | scope validation + composite fences | full chunk rollback |
| Ambiguous seller SKU/barcode | domain + PG | create/reuse origin identity; never unsafe reuse | visible `재고 연결 필요` |
| Mixed alphanumeric barcode | domain + publication PG | reject as evidence | no silent false match |
| Inactive current/origin product | Products PG | classified conflict; never reactivate | operator reactivates/reassigns |
| Deterministic code collision | Products PG | classified conflict | no accidental identity reuse |
| Concurrent retry/manual link | Products/Channels PG | lock + unique provenance + still-null writes | stable IDs; manual link wins |
| Large final snapshot | 1,225/2,241 PG fixture | bounded reads/creates/updates | stays inside 120-second transaction |
| Products or media write failure | publication PG | one transaction rollback | no listing-only partial state |
| Duplicate progress count | web hook test | monotonic ref fence | no repeated refetch storm |
| Final absence reconciliation | PG + web completion test | final four-family invalidation | removed listings disappear after completion |

Critical silent gaps after review: 0.

## Execution Dependency Review

| Task | Modules | Depends on |
|---|---|---|
| Task 1 | `prisma/`, `apps/server/src/products/` | approved design |
| Task 2 | `apps/server/src/channels/`, Products port | Task 1 |
| Task 3 | `apps/web/`, architecture/spec docs, live Chrome | Tasks 1 and 2 |

Sequential implementation, no worktree parallelization opportunity. Task 2
depends on the exact port and schema from Task 1; Task 3's real-browser result
depends on both backend tasks. Keeping three reviewer-sized Tasks avoids merge
conflicts and matches the user-selected inline TDD execution mode.

## Implementation Tasks

The review findings are folded into the same three major Tasks; no extra
micro-Tasks are introduced.

- [ ] **T1 (P1, human: ~1.5 days / inline agent: ~45 min)** — Products — Build the typed, tenant-safe, idempotent provisioning boundary.
  - Surfaced by: Architecture/Code Quality — raw evidence, nullable names, transaction/scope validation, FK index, inactive/collision behavior.
  - Files: `prisma/models/core.prisma`, `apps/server/src/products/`
  - Verify: Task 1 focused schema, unit, and PostgreSQL gates.
- [ ] **T2 (P1, human: ~1 day / inline agent: ~45 min)** — Channels — Publish and link identities atomically with bounded bulk operations.
  - Surfaced by: Performance/Test Review — row-by-row final publication would not fit the existing 1,225/2,241 fixture safely.
  - Files: `apps/server/src/channels/adapter/out/repository/`, Channels PG integration tests.
  - Verify: Task 2 gates plus the large-fixture transaction/query-bound test.
- [ ] **T3 (P2, human: ~0.5 day / inline agent: ~30 min)** — Web/QA — Refresh progressively, preserve screens, and prove the real scraper flow.
  - Surfaced by: Test Review — current test explicitly preserves stale cards until completion.
  - Files: registered-products hook, product-hub warning labels/tests, architecture/spec docs.
  - Verify: Task 3 web/build gates and real Chrome acceptance report.

## Engineering Review Summary

- Step 0 Scope Challenge: scope accepted as-is; many files but only three
  dependent cross-layer work units, with no new infrastructure.
- Architecture Review: 2 findings, both folded (typed real evidence; explicit
  transaction/tenant boundary).
- Code Quality Review: 4 findings, all folded (name fallback, barcode safety,
  inactive/collision behavior, leading FK index).
- Test Review: diagram produced; 2 gaps folded (concurrent idempotency and
  large-snapshot bulk behavior).
- Performance Review: 1 finding folded (replace per-row link work with bounded
  bulk operations).
- NOT in scope: written.
- What already exists: written and reused.
- `TODOS.md`: absent; 0 TODOs proposed because every in-scope issue is handled
  now and deferred product decisions are explicitly out of scope.
- Failure modes: 0 critical silent gaps after revision.
- Outside voice: GPT-5.6 Sol ran read-only; 8 applicable concerns were folded,
  4 were rejected as already-decided or already-covered constraints.
- Parallelization: 1 sequential lane, 0 parallel lanes.
- Lake Score: 9/9 applicable recommendations use the complete option.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Approved product/design decisions were used as input |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | reviewed | 12 concerns raised; 8 folded, 4 rejected as decided/already covered |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 9 issues folded, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | Existing UI is preserved; visual acceptance remains in Task 3 |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Inline TDD/watch-mode workflow is explicit |

**CODEX:** GPT-5.6 Sol exposed the real typed-evidence, tenant validation, nullable-name, barcode, FK-index, collision/concurrency, transaction-guard, and bulk-publication gaps; the plan now covers them.

**CROSS-MODEL:** The final plan keeps the approved product behavior and adopts the independent review's safety/performance corrections without adding Tasks or new infrastructure.

**VERDICT:** ENG CLEARED — ready to implement inline with three sequential Tasks.

NO UNRESOLVED DECISIONS
