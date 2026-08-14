# products — Product Operations + Categories Compatibility

`src/products/` owns canonical inventory-product (`MasterProduct`) operations,
automatic profitability ABC, and the direct inventory composition of channel
listing options. It also retains `/api/categories` compatibility CRUD. It never
owns physical stock quantities.

## Owned Surface

- `/api/products/masters` product-operations list/detail and metadata mutations
- `PUT /api/products/channel-options/:channelListingOptionId/inventory-components`
  for complete direct inventory-composition replacement
- focused active Sellpia inventory candidates:
  `GET /api/products/recipe-component-candidates`
- automatic profitability ABC formula, evaluation, publication, and history
- `/api/categories`

## Final Owners

- Canonical inventory product and ABC: Products `MasterProduct`.
- Marketplace product/option identity: Channels `ChannelListing` and
  `ChannelListingOption`.
- Derived single-inventory-product listing summary:
  `ChannelListing.masterProductId`.
- Per-sale inventory consumption: Products-owned
  `ChannelListingOptionInventoryComponent`, keyed by channel option and
  `SellpiaInventorySku`.
- Sellpia source identity, stock, purchase price, provider imports, and
  one-to-one canonical MasterProduct provisioning: Inventory
  `SellpiaInventorySku`.
- Collected sourcing candidates and product preparation: Sourcing.
- Registered thumbnail/detail content: AI `ContentWorkspace` and its revisions.

## Boundary Rules

- Do not recreate `ProductVariant`, `ProductVariantComponent`, an operating
  option table, a master-level inventory recipe, or a second stock balance.
- `MasterProduct` is the only ABC owner. Channel option inventory composition is
  logistics data and does not create a second product grade.
- A channel option recipe is an atomic complete replacement of distinct,
  organization-owned Sellpia SKU IDs with positive integer quantities. An empty
  replacement explicitly clears the composition. Physical stock is never
  mutated by this endpoint.
- Capacity is derived from the option's direct components using Inventory's
  physical `availableStock === currentStock` projection.
- Product-level inventory is the owned source SKU of the canonical
  MasterProduct. Channel options are consumers of that inventory product;
  Products never creates a second ledger.
- Recipe candidate search enters Inventory only through the exported
  `SELLPIA_INVENTORY_SKU_READ_PORT`, passes the session-owned `organizationId`,
  and returns physical identities without a writer.
- Product list pagination returns summary counts over the complete filtered
  result before page slicing. Consumers do not rebuild counts from one page.
- `MasterProduct.imageUrls` is operator-managed metadata. Read responses may
  expose calculated `displayImageUrls`; channel collection never copies media
  into the product.
- Channel import creates or updates only Channels-owned listing identities and
  preserves existing option recipes. The listing-level `masterProductId` is
  rebuilt from those recipes and is null when options are incomplete or span
  multiple inventory products.
- Candidate rank, display text, untyped payload fields, and AI never confirm
  inventory identity. Channels owns conservative typed option-to-Sellpia
  matching and explicit operator confirmation.
- `MasterProduct.abcGrade` is nullable automatic output, never operator input.
  Products evaluates Finance-owned profitability evidence for currently selling
  mapped products, persists formula/evaluation provenance, and publishes only
  changed grades with history. Missing or stale Sellpia/mapping evidence stays
  unclassified; V1 missing or stale advertising evidence is a calculation-only
  0 KRW cost with its source provenance preserved. Neither case is synthesized
  as C.
- ABC uses fixed operating policy, not a predictive model: a 90-day half-life,
  50% profit velocity / 30% contribution margin / 20% inverse loss-recurrence
  score, and a 30-day shrinkage constant. On each publication, source-ready
  selling products with positive weighted contribution receive score quantiles
  of A top 20%, B next 50%, C remaining 30%; non-positive contribution is C.
- Evaluation/publication is organization-locked so an older snapshot cannot
  overwrite a newer completed publication.
- Thumbnail analysis quality grades remain AI registration evidence and are
  independent from automatic product ABC.
