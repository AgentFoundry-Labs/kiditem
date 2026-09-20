Before working in this directory, always read this document first rather than relying on memory.

# products — Product Operations + Categories Compatibility

`src/products/` owns canonical inventory-product (`MasterProduct`) operations,
absolute profitability ABC, and the direct inventory composition of channel
listing options. It also retains `/api/categories` compatibility CRUD. It never
owns physical stock quantities.

## Owned Surfaces

- Canonical `MasterProduct` operations and category compatibility.
- Direct channel-option inventory composition.
- Products-owned absolute ABC formula, evaluation, publication, current grade,
  and history.

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
  physical `currentStock` projection.
- Product-level inventory is the owned source SKU of the canonical
  MasterProduct. Channel options are consumers of that inventory product;
  Products never creates a second ledger.
- Stock-aware recipe candidate search uses `INVENTORY_AVAILABILITY_PORT` with
  the session-owned `organizationId`; unavailable stock stays nullable, and
  the published inventory fence applies before pagination. Identity-only
  lookup uses `SELLPIA_INVENTORY_SKU_READ_PORT`. Neither port grants a writer.
- Product list pagination returns summary counts over the complete filtered
  result before page slicing. Consumers do not rebuild counts from one page.
- `MasterProduct.imageUrls` is operator-managed metadata. Read responses may
  expose calculated `displayImageUrls`; channel collection never copies media
  into the product.
- Channel import creates or updates only Channels-owned listing identities and
  preserves existing option recipes. The listing-level `masterProductId` is
  rebuilt from those recipes and is null when options are incomplete or span
  multiple inventory products.
- Products is the only mutation boundary for channel-option recipes and their
  derived listing summary. Channels may submit a complete operator replacement
  or ask Products to fill an empty recipe; it never writes component rows.
- Automatic name matching requires one clearly separated candidate, no
  identifier/spec/option conflict, and a confirmed positive selling quantity.
  Ambiguous names, conflicting evidence, and unknown quantities require
  operator review. AI output and rank alone never confirm inventory identity.
- The current `MasterProductAbcEvaluation` is the nullable official ABC output;
  `MasterProduct` has no grade column, and no grade is operator input.
  Products publishes ABC only through the explicit grade-refresh command, which
  both Product Hub and Dashboard call. The service reads the latest compatible
  `COMPLETE` source snapshots, persists formula/evaluation provenance, and
  records only actual grade changes in history.
- Evaluation requires a selling product, valid mapping, complete Sellpia
  profitability coverage, `ORDER_TIME_SUPPLY_COST`, VAT provenance, a verified
  sale age of at least 30 days at the evaluation cutoff, and a measured
  monthly ad spend, which is `0` when the organization has no advertising.
  Missing or incompatible Sellpia, mapping, or advertising evidence produces
  no publication; it is never zero-filled or synthesized as C. An existing normal grade remains visible while the source
  is stale. Judge data sufficiency by completeness and validity of the selected
  evaluation period, separately from sale age; there is no minimum evidence-day
  count. Derive sale start only from validly mapped channel `saleStartedAt`
  values under the approved spec, without inferring missing dates or coverage.
- ABC is a versioned absolute formula with fixed business anchors and
  thresholds. A product's score depends only on its own complete facts and the
  formula version; cohort rank, percentile/quota, population hash, calibration,
  and reliability adjustments are forbidden. Exact formula policy belongs in
  the approved ABC design/spec.
- Revenue and operating-profit contribution, rank, cumulative share, and loss
  impact are separate reporting metrics. They never alter `abcGrade`.
- Validity and freshness are distinct. Publication uses the newest cutoff every
  compatible complete source pair reaches, so evidence that lags the latest
  closed day still publishes at its own actual cutoff, and a newer RUNNING or
  FAILED collection alone does not invalidate a compatible complete source.
  Persist and display that actual cutoff separately from the desired latest
  cutoff.
- A Sellpia and an advertising generation pair only when they end on the same
  day or the earlier one ends on a month's last day: month totals cannot be cut
  back to an earlier day inside a month. Whichever source is newer, publication
  pairs the newest retained generations that end together; with none, the
  refresh returns `SOURCE_NOT_READY` and nothing is written. An advertising
  collection that held its closed day as unreported therefore delays a refresh
  on a newer Sellpia generation by one day unless an older Sellpia generation
  ends on the held end.
- Source readiness is each source's own, not the selected pair's: `sources[x]`
  judges the source's newest complete generation on the current mapping
  generation. Sellpia is due through the latest closed KST day and advertising
  through Advertising's derived evidence cutoff (`adReportEvidenceCutoff` over
  the generation's `requestedThrough` and `coveredThrough`), so a held closed
  day never reads stale. Without a pair, `SOURCE_NOT_READY` carries `pairing`
  (the source that ends earlier and both ends) unless both sources are stale,
  when `sources` already names them.
- Evaluation/publication is organization-locked so an older snapshot cannot
  overwrite a newer completed publication.
- Publication verifies the evaluated generation's identity as given; it does
  not re-select a current generation. A newer complete generation is freshness
  and does not refuse a publication, so the evaluated pair commits and the next
  recalculation picks the newer one up. Published provenance and the official
  cutoff come from the evaluated selection, and the transaction still refuses
  an input that disagrees with itself or with mutable state it re-reads.
- Publication does not move the official cutoff backward because every
  collection plan requests coverage through KST-yesterday (an advertising
  collection may confirm one day less) and `targetCutoff` is the latest closed
  KST day, so the actual cutoff cannot precede a published one.
  No guard enforces this. It rests on two things: a collection plan's coverage
  end, and a forward-moving clock. A remapping followed by a collection that
  ran while the host clock was behind produces an older actual cutoff over a
  settled grade.
- Products owns the ABC evidence cutoff — the latest closed KST day — and
  publishes one per-product view of the facts that decide the display word
  (retained evaluation, `sources.sellpia.ready`, `sources.advertising.ready`,
  `sources.mapping.valid`) through `PRODUCT_ABC_READ_PORT`; no reader picks a
  cutoff of its own. The view carries no display word: every consumer derives
  it with `productAbcDisplayStatus` from `@kiditem/shared/product-abc`
  ([ADR 0006](../../../../docs/adr/0006-a-displayed-number-is-a-measurement-or-nothing.md),
  [ADR 0009](../../../../docs/adr/0009-one-ledger-one-reader.md)).
- Thumbnail analysis quality grades remain AI registration evidence and are
  independent from automatic product ABC.
