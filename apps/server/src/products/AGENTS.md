Consult this document first instead of relying on memorized knowledge.

# products — Product Operations + Categories Compatibility

`src/products/` owns `MasterProduct` operations, automatic profitability ABC,
and the direct inventory composition of channel listing options. It also retains
`/api/categories` compatibility CRUD. It never owns physical stock.

## Owned Surface

- `/api/products/masters` product-operations list/detail and metadata mutations
- `PUT /api/products/channel-options/:channelListingOptionId/inventory-components`
  for complete direct inventory-composition replacement
- focused active Sellpia inventory candidates:
  `GET /api/products/recipe-component-candidates`
- automatic profitability ABC formula, evaluation, publication, and history
- `/api/categories`

## Final Owners

- Cross-channel operating product and ABC: Products `MasterProduct`.
- Marketplace product/option identity: Channels `ChannelListing` and
  `ChannelListingOption`.
- One marketplace product link: `ChannelListing.masterProductId`.
- Per-sale inventory consumption: Products-owned
  `ChannelListingOptionInventoryComponent`, keyed by channel option and
  `SellpiaInventorySku`.
- Physical identity, stock, purchase price, and provider imports: Inventory
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
- Capacity is derived from the option's direct components using common
  `availableStock`; physical stock and commitments remain Inventory-owned.
- Product-level inventory is a read projection over distinct Sellpia SKUs used
  by linked channel options. Products never creates a second ledger.
- Recipe candidate search enters Inventory only through the exported
  `SELLPIA_INVENTORY_SKU_READ_PORT`, passes the session-owned `organizationId`,
  and returns physical identities without a writer.
- Product list pagination returns summary counts over the complete filtered
  result before page slicing. Consumers do not rebuild counts from one page.
- `MasterProduct.imageUrls` is operator-managed metadata. Read responses may
  expose calculated `displayImageUrls`; channel collection never copies media
  into the product.
- Channel import creates or updates only Channels-owned listing identities and
  preserves an existing `masterProductId`. It does not auto-provision
  `MasterProduct` rows.
- Candidate rank, display text, untyped payload fields, and AI never confirm
  product identity. Channels owns conservative typed auto-match and explicit
  operator confirmation.
- `MasterProduct.abcGrade` is nullable automatic output, never operator input.
  Products evaluates Finance-owned profitability evidence for currently selling
  mapped products, persists formula/evaluation provenance, and publishes only
  changed grades with history. Missing or stale evidence stays unclassified;
  it is never synthesized as C.
- Evaluation/publication is organization-locked so an older snapshot cannot
  overwrite a newer completed publication.
- Thumbnail analysis quality grades remain AI registration evidence and are
  independent from automatic product ABC.
- Category controllers receive `organizationId` from
  `@CurrentOrganization()` and never accept tenant identity from clients.
- Product and category mutations scope each resource by `{ id, organizationId }`.
