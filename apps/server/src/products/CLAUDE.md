Before working in this directory, always read this document first rather than relying on memory.

# products — Source Products And ABC

Products owns `MasterProduct`, Sellpia collection and publication, current stock,
source price, operator-managed images, product reads/exports and ABC evaluation.
Channels owns marketplace listings, options and recipes (ADR-0017). Inventory
retains warehouse records only; no second mutable source stock exists.

## Source Product Contract

- Internal references use the immutable UUID; `code` is an immutable globally
  issued `KID` plus eight digits. Source account/product/option codes are plain
  identity fields, unique together with organization. Never infer identity from
  a name or barcode. Only explicit source-binding correction changes source codes.
- Successful complete Sellpia publication updates name, option, barcode, stock
  and nullable purchase price atomically with source-scope completion. Preserve
  UUID, KID code and images. Missing products remain with zero stock; a confirmed
  empty collection zeros the entire source scope. Failed/partial/cancelled
  attempts do not change current products.
- Only images are manually editable. Unknown purchase price stays null, is
  excluded from priced asset totals and is counted separately. No product
  activation, sale-price, raw-payload or per-row import-run field is authoritative.
- Preserve attempt fencing, idempotency, source-deduplicated failure alerts and
  success resolution. A later attempt never rewrites an earlier failure record.
- Ordinary reads return stored current products. Purchase/Rocket calculations
  use the exact completed collection attempt and locked current generation;
  elapsed time is not an availability rule.
- Source completion never triggers ABC or downstream calculations implicitly.
- Sellpia transport may retain existing Inventory URLs during caller migration;
  its implementation and canonical mutation authority are Products.

## Hexagonal Boundaries

- Put public capability contracts in `application/port/in`, external contracts
  in `application/port/out`, orchestration in `application/usecase`, pure product
  and ABC rules in `domain`, and failures in the relevant `exception` directory.
- Web adapters live in `adapter/in/web`; persistence readers and locks live in
  `adapter/out/persistence`. Module wiring binds tokens to implementations.
- Consumers use input ports. The transactional read port binds directly to its
  persistence adapter and preserves the caller's transaction and organization
  lock evidence (ADR-0015); do not add a forwarding service just for symmetry.
- Channels validates recipe components against Products and owns atomic recipe
  replacement/clearing and derived listing summaries. Product reads never mutate
  recipes, and recipes never mutate current stock.
- Product list totals cover the complete filtered result before pagination.
  Selling-status filters derive from Channel facts, not a MasterProduct flag.
- `imageUrls` is operator-owned; derived display images may use Channel media
  without copying it into source-product metadata.

## ABC Contract

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
- Formula version 3 (`historicalAdvertisingPolicy: EXCLUDED_V1`) grades on
  Sellpia alone: evidence loads with `advertising: 'excluded'`, the evaluation
  and publication carry no advertising provenance (null, never invented), and
  display status does not wait on advertising (`advertisingRequired: false`).
  Only that formula may omit advertising; version 2 still refuses without it.
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
