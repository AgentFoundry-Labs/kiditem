Consult this document first instead of relying on memorized knowledge.

# products — Product Operations + Categories Compatibility

`src/products/` owns KidItem product operations, reusable variants, and the
central variant-to-Sellpia recipe. It also retains `/api/categories`
compatibility CRUD. It never owns physical stock.

## Owned Surface

- `/api/products/masters` product-operations list/detail and metadata mutations
- product variant create/update capabilities
- complete `ProductVariantComponent` recipe replacement
- create-if-empty deterministic recipe capability consumed by Channels after a
  version-fenced, explicitly confirmed preview
- transaction-aware channel-origin `MasterProduct` / `ProductVariant`
  provisioning through the exported Products incoming port
- focused active Sellpia recipe candidates:
  `GET /api/products/recipe-component-candidates`
- `/api/categories`

## Final Owners

- KidItem product metadata: Products `MasterProduct`.
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
  validate positive quantities and tenant ownership. The only automatic writer
  is the locked create-if-empty capability: it accepts one active,
  organization-owned Sellpia component with quantity `1`, marks its source
  deterministic, and preserves every existing recipe. Channels may invoke it
  only from a matching version-fenced preview based on a unique,
  non-conflicting exact code, verified unique physical barcode, or strict exact
  normalized product-name plus option match. Pack/BOM uncertainty, duplicates,
  conflicts, product-name-only evidence, similarity, rank, raw aliases, and AI
  remain non-automatic.
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
- Category controllers receive `organizationId` from
  `@CurrentOrganization()` and never accept tenant identity from the client.
- Product and category mutations scope every single-resource operation by
  `{ id, organizationId }`.
