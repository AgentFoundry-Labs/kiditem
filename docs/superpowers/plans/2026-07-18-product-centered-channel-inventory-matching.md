# Product-Centered Channel Inventory Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split product/option/recipe operator flow with one account-scoped automatic matching command and a product-grouped review surface.

**Architecture:** Channels builds a complete account context containing product groups and linked variant evidence, classifies every product group, and applies deterministic empty recipes only for groups whose children are all safe. Products remains the only writer of `ProductVariantComponent`; Inventory remains a flat read-only evidence source. The web groups options beneath products and Rocket deep-links to the correct account and product-level queue.

**Tech Stack:** TypeScript 5.8, NestJS 11, Prisma 7, Zod 3, Next.js, React Query, Radix UI, Vitest, Testing Library

## Global Constraints

- Work on the existing `feat/rocket-confirm-restore` branch; do not create a worktree.
- One `상품·재고 자동 매칭` command applies only exact code, unique physical barcode, or unique strict product-name plus option matches with quantity `1`.
- A product group with any unlinked, review, blocked, duplicate, conflict, or pack/BOM-uncertain child receives no new automatic recipe.
- Existing product links, option links, and recipes are never overwritten.
- Product and option relations remain in the schema; only the operator workflow is product-centered.
- Sellpia candidates remain an organization-scoped flat collection and `SellpiaInventorySku.currentStock` is never written.
- Rocket operations do not mutate product matching; they deep-link to the product matching center.
- The existing unshipped `0.1.23` release boundary remains valid; no schema migration or deploy-time backfill is added.
- Update Channels and web matching guides because explicit recipe application changes from preview-plus-confirmation to one explicit account command.

---

## File Structure

- `packages/shared/src/schemas/channel-recipe-automation.ts`: add product-group result contracts and product-level summary fields.
- `apps/server/src/channels/application/port/out/repository/channel-recipe-automation-context.repository.port.ts`: return complete selected-account product topology plus linked variant contexts.
- `apps/server/src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.ts`: load every active selected-account option, including unlinked children.
- `apps/server/src/channels/domain/channel-recipe-automation-product-group.ts`: pure product-group classification and safe variant selection.
- `apps/server/src/channels/application/service/channel-recipe-automation.service.ts`: expose one version-fenced account command that applies only fully safe product groups.
- `apps/web/src/app/(catalog)/product-hub/matching/components/ProductInventoryMatchingTable.tsx`: render product rows with expandable child options and product-level status.
- `apps/web/src/app/(catalog)/product-hub/matching/components/RecipeAutomationPanel.tsx`: make one click execute the safe account command without a second confirmation dialog.
- `apps/web/src/app/(catalog)/product-hub/matching/page.tsx`: remove separate operator steps and filter product groups.
- `apps/web/src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.tsx`: remove recipe mutation and add account/status-aware deep links.

### Task 1: Freeze Product-Group Contracts

**Files:**
- Modify: `packages/shared/src/schemas/channel-recipe-automation.ts`
- Modify: `packages/shared/src/schemas/channel-recipe-automation.spec.ts`

**Interfaces:**
- Produces: `ChannelRecipeAutomationProductGroup`, product-level preview summary, and product-level apply counts.

- [ ] **Step 1: Write failing shared contract tests**

Add a preview fixture with `productGroups` containing `channelListingId`, nullable `masterProductId`, child option and variant IDs, and decision `auto_apply | operator_review | blocked | already_configured`. Assert strict parsing and reject an automatic group with no automatic variant.

- [ ] **Step 2: Run the shared test and verify RED**

Run: `rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-recipe-automation.spec.ts`

Expected: FAIL because `productGroups` and the product summary fields are not accepted.

- [ ] **Step 3: Add the minimal schemas**

Add:

```ts
export const ChannelRecipeAutomationProductGroupSchema = z.object({
  channelListingId: z.string().uuid(),
  masterProductId: z.string().uuid().nullable(),
  channelListingOptionIds: z.array(z.string().uuid()).min(1),
  productVariantIds: z.array(z.string().uuid()),
  decision: ChannelRecipeAutomationDecisionSchema,
  autoApplyProductVariantIds: z.array(z.string().uuid()),
}).strict();
```

Extend preview summary with `products`, `autoApplyProducts`, `operatorReviewProducts`, `blockedProducts`, and `alreadyConfiguredProducts`. Extend apply response with `appliedProducts` and `skippedProducts`.

- [ ] **Step 4: Run the shared test and build**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-recipe-automation.spec.ts
rtk npm run build --workspace=packages/shared
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/shared/src/schemas/channel-recipe-automation.ts packages/shared/src/schemas/channel-recipe-automation.spec.ts
rtk git commit -m "feat: define product-centered matching contracts"
```

### Task 2: Classify Complete Product Groups

**Files:**
- Create: `apps/server/src/channels/domain/channel-recipe-automation-product-group.ts`
- Create: `apps/server/src/channels/domain/channel-recipe-automation-product-group.spec.ts`
- Modify: `apps/server/src/channels/application/port/out/repository/channel-recipe-automation-context.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.spec.ts`

**Interfaces:**
- Consumes: variant-level recipe automation items.
- Produces: `classifyRecipeAutomationProductGroups(products, items)` and complete account topology.

- [ ] **Step 1: Write failing domain tests**

Cover these exact cases:

```ts
expect(classify(group(auto, configured))).toMatchObject({
  decision: 'auto_apply',
  autoApplyProductVariantIds: [variantA],
});
expect(classify(group(auto, operatorReview))).toMatchObject({
  decision: 'operator_review',
  autoApplyProductVariantIds: [],
});
expect(classify(group(auto, unlinkedOption))).toMatchObject({
  decision: 'blocked',
  autoApplyProductVariantIds: [],
});
```

- [ ] **Step 2: Run domain tests and verify RED**

Run: `rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/channel-recipe-automation-product-group.spec.ts`

Expected: FAIL because the policy does not exist.

- [ ] **Step 3: Implement the pure grouping policy**

The policy receives complete product topology and a map from selected option ID to variant decision. Decision precedence is `blocked`, `operator_review`, `auto_apply`, `already_configured`; an unlinked option is `blocked`. Return sorted IDs for stable proposal hashes.

- [ ] **Step 4: Write failing repository adapter tests**

Assert that selected account topology includes an option with `productVariantId: null`, while variant contexts contain only linked unique variants and preserve every selected `{ channelListingId, channelListingOptionId }` pair.

- [ ] **Step 5: Run adapter tests and verify RED**

Run: `rtk npm exec --workspace=apps/server vitest -- run src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.spec.ts`

Expected: FAIL because `listContexts` returns only linked variant contexts.

- [ ] **Step 6: Return complete account context**

Change the port to return:

```ts
type ChannelRecipeAutomationAccountContext = {
  products: Array<{
    channelListingId: string;
    masterProductId: string | null;
    options: Array<{
      channelListingOptionId: string;
      productVariantId: string | null;
    }>;
  }>;
  variants: ChannelRecipeAutomationContext[];
};
```

Keep cross-account linked options in each variant evidence context, but selected account topology must include only the requested account.

- [ ] **Step 7: Run domain and adapter tests**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/channel-recipe-automation-product-group.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/server/src/channels/domain/channel-recipe-automation-product-group.ts apps/server/src/channels/domain/channel-recipe-automation-product-group.spec.ts apps/server/src/channels/application/port/out/repository/channel-recipe-automation-context.repository.port.ts apps/server/src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.ts apps/server/src/channels/adapter/out/repository/channel-recipe-automation-context.repository.adapter.spec.ts
rtk git commit -m "feat: classify complete channel product match groups"
```

### Task 3: Apply Only Fully Safe Product Groups

**Files:**
- Modify: `apps/server/src/channels/application/service/channel-recipe-automation.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-recipe-automation.service.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-recipe-automation.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/AGENTS.md`

**Interfaces:**
- Consumes: complete account context and product-group classifier.
- Produces: existing preview/apply endpoints with product-level groups and counts.

- [ ] **Step 1: Write failing service tests**

Assert that preview returns product groups and that apply sends Products only the `auto_apply` variants belonging to product groups with no unresolved child. Include a two-option product where one option is `quantity_review`; assert zero recipes are sent for both.

- [ ] **Step 2: Run service tests and verify RED**

Run: `rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-recipe-automation.service.spec.ts`

Expected: FAIL on missing product groups and partial recipe application.

- [ ] **Step 3: Implement product-safe preview/apply**

Use the complete context, build variant items, classify products, include groups in `proposalVersion`, and select recipes only from `autoApplyProductVariantIds`. Return product and variant application counts without changing the HTTP paths.

- [ ] **Step 4: Write and run PG regression**

Seed one product with two linked variants where only one is deterministic. Apply and assert neither variant receives a component. Seed a second single-option exact product and assert it receives one deterministic component while `SellpiaInventorySku.currentStock` is unchanged.

Run: `rtk npm exec --workspace=apps/server vitest -- run src/channels/__tests__/channel-recipe-automation.pg.integration.spec.ts`

Expected: PASS after implementation.

- [ ] **Step 5: Update Channels guidance**

Document that one explicit account command applies only fully safe product groups; preview remains a read model for counts but a second confirmation dialog is not required by the web. Product-group review remains account-scoped.

- [ ] **Step 6: Run focused Channels tests**

Run: `rtk npm exec --workspace=apps/server vitest -- run src/channels`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/server/src/channels
rtk git commit -m "feat: apply deterministic inventory matches by product"
```

### Task 4: Replace Split Matching Steps With Product Rows

**Files:**
- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/ProductInventoryMatchingTable.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ProductInventoryMatchingTable.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/RecipeAutomationPanel.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/RecipeAutomationPanel.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`

**Interfaces:**
- Consumes: queue products/options and recipe `productGroups`.
- Produces: one product-centered matching workspace.

- [ ] **Step 1: Write failing component tests**

Assert one product row renders an option count and product-level status, expanding it renders every child option, and the table exposes existing product/variant/Sellpia candidate actions only inside that product.

- [ ] **Step 2: Run the component test and verify RED**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/components/__tests__/ProductInventoryMatchingTable.spec.tsx'`

Expected: FAIL because the product-centered table does not exist.

- [ ] **Step 3: Implement the product table**

Group queue options by `listing.id`, map the server product group by `channelListingId`, render one summary row, and reveal child option evidence/actions through an explicit `상품별 확인` toggle. Use fixed columns, minimum width, truncation, and scoped horizontal overflow.

- [ ] **Step 4: Write failing one-click panel test**

Assert clicking `상품·재고 자동 매칭` calls apply immediately with the current proposal version and no confirmation dialog. Assert the success toast reports product and option counts.

- [ ] **Step 5: Run panel test and verify RED**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/components/__tests__/RecipeAutomationPanel.spec.tsx'`

Expected: FAIL because the current button opens a second dialog.

- [ ] **Step 6: Implement the single command and page composition**

Remove the separate `1 상품 연결` / `2 옵션 연결` controls. Keep account/search state and replace queue statuses with `all`, `auto_apply`, `operator_review`, `blocked`, and `already_configured`. Render `ProductInventoryMatchingTable`; keep existing dialogs for focused corrections launched from the expanded product.

- [ ] **Step 7: Update page tests and guide**

Lock one account command, product grouping, URL-authoritative account/status filters, and the fact that options are child rows rather than a peer workspace.

- [ ] **Step 8: Run the matching web suite**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching'`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add 'apps/web/src/app/(catalog)/product-hub/matching'
rtk git commit -m "feat: make channel matching product centered"
```

### Task 5: Make Rocket Review a Correct Deep Link

**Files:**
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.spec.tsx`
- Modify: `apps/web/src/app/(supply)/AGENTS.md`

**Interfaces:**
- Consumes: account-scoped recipe preview.
- Produces: no matching mutation; exact product-matching center deep links.

- [ ] **Step 1: Write failing Rocket panel tests**

Assert there is no apply button/API mutation. Assert `운영자 검토` links to `/product-hub/matching?channelAccountId=<id>&status=operator_review` and blocked links to the same route with `status=blocked`.

- [ ] **Step 2: Run test and verify RED**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.spec.tsx'`

Expected: FAIL because the panel still owns apply and drops the account ID.

- [ ] **Step 3: Implement metric deep links**

Make unresolved metrics links, preserve counts, remove the Radix confirmation and mutation, and keep `onApplied` out of the component contract.

- [ ] **Step 4: Run Supply/Rocket web tests**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(supply)/purchase-orders' 'src/app/(orders)/rocket-orders'`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add 'apps/web/src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.tsx' 'apps/web/src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.spec.tsx' 'apps/web/src/app/(supply)/AGENTS.md'
rtk git commit -m "fix: route Rocket matching review to product center"
```

### Task 6: Full Verification and Live Matching

**Files:**
- No production files unless a failing gate reveals an in-scope regression.

**Interfaces:**
- Verifies all earlier deliverables together.

- [ ] **Step 1: Run backend and shared gates**

```bash
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/channels src/products src/supply
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
```

Expected: PASS.

- [ ] **Step 2: Run frontend gates**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub' 'src/app/(supply)/purchase-orders' 'src/app/(orders)/rocket-orders'
rtk npm run build --workspace=apps/web
```

Expected: PASS.

- [ ] **Step 3: Run PR guards**

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk git diff --check
```

Expected: PASS.

- [ ] **Step 4: Verify the actual UI**

On `/product-hub/matching`, select `Coupang Rocket`, click `상품·재고 자동 매칭` once, and assert the exact candidate changes from automatic to configured. Reopen `/rocket-orders`, recalculate the saved collection, and assert that candidate renders current stock `0`, active commitment `0`, and available stock `0`, while unresolved products remain grouped review items.
