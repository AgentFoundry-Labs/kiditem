Consult this document first instead of relying on memorized knowledge.

# products — Product Operations + Categories Compatibility

`src/products/` owns KidItem product operations, reusable variants, and the
central variant-to-Sellpia recipe. It also retains `/api/categories`
compatibility CRUD. It never owns physical stock.

## Owned Surface

- `/api/products/masters` product-operations list/detail and metadata mutations
- `/api/products/abc-policy` policy reads/updates and
  `/api/products/abc-grade/recalculate` explicit automatic recalculation
- product variant create/update capabilities
- complete `ProductVariantComponent` recipe replacement
- reviewed manual recipe batch plan/create-if-empty capabilities for private
  stable-identity environment transfers
- create-if-empty deterministic recipe capability consumed by Channels after a
  version-fenced, explicitly confirmed preview
- transaction-aware channel-origin `MasterProduct` / `ProductVariant`
  provisioning through the exported Products incoming port
- focused active Sellpia recipe candidates:
  `GET /api/products/recipe-component-candidates`
- `/api/categories`

## Final Owners

- KidItem product metadata: Products `MasterProduct`.
- Automatic product ABC policy, grade publication, and grade history: Products.
- Reusable sellable units and component recipes: Products `ProductVariant` and
  `ProductVariantComponent`.
- Sellpia physical identity and imported quantity: Inventory
  `SellpiaInventorySku`.
- Marketplace product/option source metadata and confirmed links: Channels
  `ChannelListing.masterProductId` and
  `ChannelListingOption.productVariantId`.
- Collected sourcing candidates and product preparation: Sourcing.
- Registered thumbnail/detail content: AI `ContentWorkspace` and its
  generations/revisions.

## Boundary Rules

- Do not add physical stock, source price/barcode/raw import fields, or direct
  Inventory writers to `MasterProduct`.
- Manual recipe writes replace the complete `ProductVariantComponent` set and
  validate positive quantities and tenant ownership. An explicitly reviewed
  manual batch may plan or create exact recipes only for empty variants;
  identical recipes are idempotent and different recipes conflict. The only
  automatic writer is the locked create-if-empty capability: it accepts one active,
  organization-owned Sellpia component with a positive integer quantity, marks its source
  deterministic, and preserves every existing recipe. Channels may invoke it
  only from a matching version-fenced preview based on a unique,
  non-conflicting identifier with name cross-check, exact normalized identity,
  or high-confidence unique name match. Quantities above one require an
  explicit integer pack ratio. Unverifiable pack/BOM composition, duplicates,
  conflicts, close-ranked names, raw aliases, and AI remain non-automatic.
- Product-level inventory is a read projection over distinct linked
  `SellpiaInventorySku` rows hydrated through `InventoryAvailabilityPort`.
  Variant capacity uses common `availableStock`; physical stock and active
  commitments remain separately visible. Products never creates a second
  ledger.
- Product list pagination returns operating summary counts over the complete
  filtered result before page slicing, including ABC grades, channel
  connection, inventory status, negative profit, and Analytics-owned depletion
  coverage/reorder signals; consumers must not reconstruct those counts from
  the current page.
- Recipe candidate search enters Inventory only through the exported
  `SELLPIA_INVENTORY_SKU_READ_PORT`, passes session-owned `organizationId`, and
  returns physical identity/stock facts without source prices or writers.
- Channel-origin provisioning receives a caller-owned transaction, validates
  every listing/option/current-link identity against `organizationId`, and may
  create or reuse Products-owned identities. It never writes Channels-owned
  link columns, physical stock, or inferred component recipes.
- Automatic reuse accepts only unique, non-conflicting typed seller SKU or
  safely normalized barcode evidence. Names, untyped raw payload fields, rank,
  and AI never confirm an existing product, variant, or recipe.
- A recollection never overwrites operator-edited product metadata, active
  state, confirmed links, or recipes. Inactive origin/current products and
  deterministic code collisions are explicit conflicts, not reactivation or
  reuse shortcuts.
- Deterministic `CP-*` and `CP-SKU-*` codes remain internal stable identities.
  Product-operations responses expose channel-origin display references from
  the origin listing and option external IDs; they do not replace stored codes.
- Creating a product creates supplied variants or one default variant when the
  request omits variants.
- `MasterProduct.abcGrade` is a nullable automatic result, never operator input.
  Products calculates it from Analytics metric facts, updates only changed
  grades with history, and recalculates after policy changes or authoritative
  sales ingest. Missing, ambiguous, inactive, or insufficient evidence remains
  `null` rather than synthetic C.
- Every policy/grade publication increments the policy `revision`; publication
  compares the expected revision under the organization advisory lock so an
  older metric snapshot cannot overwrite a newer completed publication.
- Thumbnail analysis quality grades are AI-owned registration evidence and
  remain independent from the automatic product ABC grade.
- Category controllers receive `organizationId` from
  `@CurrentOrganization()` and never accept tenant identity from the client.
- Product and category mutations scope every single-resource operation by
  `{ id, organizationId }`.
