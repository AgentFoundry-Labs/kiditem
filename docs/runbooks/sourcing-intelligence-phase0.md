# Sourcing Intelligence Phase 0–1 Runbook

## Purpose

This runbook operates the truth-data foundation from reviewed source access to
a proposed RFQ/sample intent. It does not train a model, create a purchase
order, or call a supplier/provider.

## Prerequisites

- Authenticated KidItem session with an active organization.
- `owner` or `admin` role for source, evidence, offer, launch, decision, and
  intent mutations.
- A configured PostgreSQL `DATABASE_URL` and the current Prisma schema applied.
- A real source-access basis and a credential reference (`env:`, `secret:`,
  `vault:`, `github-env:`, or `aws-secrets-manager:`), never a raw secret.
- Existing target `ChannelAccount` for a LaunchCandidate.

## Safe Sequence

All routes below use the server `/api` prefix.

### 1. Review one source entitlement

`POST /api/sourcing/intelligence/sources`

```json
{
  "sourceKey": "1688-approved-collector",
  "scopeKey": "stationery",
  "lifecycle": "shadow",
  "decisionImpact": "disabled",
  "ownerLabel": "KidItem sourcing operations",
  "legalBasis": "approved operator collection protocol",
  "allowedMethod": "authenticated browser export",
  "credentialRef": "env:KIDITEM_1688_SESSION_REF",
  "permittedFields": ["offerId", "skuId", "priceTier", "moq"],
  "prohibitedUses": ["buyer_reidentification", "credential_persistence"],
  "geographyCoverage": ["CN"],
  "coverageDefinition": "configured stationery and toy searches",
  "denominatorDefinition": "offers returned by the configured searches",
  "expectedDelayMinutes": 60,
  "maxStalenessMinutes": 1440,
  "minimumCoverageBps": 8000,
  "revisionPolicy": "append source revisions",
  "retentionDays": 365,
  "permissionStartsAt": "2026-08-01T00:00:00.000Z",
  "permissionExpiresAt": "2027-08-01T00:00:00.000Z"
}
```

Use `shadow + disabled` until legal, coverage, replay, and quality review are
complete. Only `qualified + enabled` evidence can affect decisions or future
training, and enabled sources must define permitted fields, coverage and its
denominator, maximum staleness, revision policy, and retention. Missing quality
contracts, including a minimum run coverage threshold, are denied at scoring
even for legacy rows.
`POST /api/sourcing/intelligence/sources/:sourceKey/suspend` creates a new
kill-switch version; it does not mutate history.

### 2. Append an evidence run

Start with `POST /api/sourcing/intelligence/evidence-runs`, append with
`POST /api/sourcing/intelligence/evidence-runs/:id/observations`, then finalize
with `POST /api/sourcing/intelligence/evidence-runs/:id/finalize`.

The run must name the exact reviewed scope. A custom scope never falls back to
the source's `default` entitlement:

```json
{
  "sourceKey": "1688-approved-collector",
  "scopeKey": "stationery",
  "runKey": "1688:stationery:2026-08-01T01",
  "collectorVersion": "1688-offer-collector@1.0.0",
  "expectedCount": 1
}
```

A supplier-offer observation must use the same platform and exact external
offer/SKU identity that the Supply snapshot will freeze:

```json
{
  "observations": [{
    "platform": "1688",
    "evidenceFamily": "1688_supplier_offer",
    "signalRole": "supply",
    "granularity": "supply_catalog",
    "conceptKey": "concept:magnetic-pencil-case:v1",
    "sourceEntityType": "supplier_offer_sku",
    "sourceEntityId": "EXTERNAL_SKU_ID",
    "schemaVersion": "1688-offer-v1",
    "observationKey": "SERVER_OR_COLLECTOR_STABLE_64_CHAR_MAX_KEY",
    "revision": 1,
    "supportsCandidate": true,
    "sourceUrl": "https://detail.1688.com/offer/EXTERNAL_OFFER_ID.html",
    "eventAt": "2026-08-01T01:00:00.000Z",
    "observedAt": "2026-08-01T01:01:00.000Z",
    "availableAt": "2026-08-01T01:02:00.000Z",
    "rawPayload": {
      "supplierOffer": {
        "supplierName": null,
        "identityStatus": "exact_variant",
        "sourcePlatform": "1688",
        "sourceUrl": "https://detail.1688.com/offer/EXTERNAL_OFFER_ID.html",
        "externalSupplierKey": null,
        "externalOfferId": "EXTERNAL_OFFER_ID",
        "externalSkuId": "EXTERNAL_SKU_ID",
        "variantKey": "blue-24",
        "productName": "자석 필통",
        "variantName": "파랑 24개입",
        "currency": "CNY",
        "orderUnit": "BOX",
        "unitsPerOrderUnit": 24,
        "minOrderQuantity": 10,
        "sampleAvailable": true,
        "samplePriceCny": "18.00",
        "domesticFreightCny": null,
        "productionLeadTimeDaysMin": 3,
        "productionLeadTimeDaysMax": 5,
        "dispatchLeadTimeDaysMin": 1,
        "dispatchLeadTimeDaysMax": 2,
        "grossWeightGrams": 9600,
        "lengthMm": 500,
        "widthMm": 400,
        "heightMm": 300,
        "material": "ABS",
        "packCount": 24,
        "capturedAt": "2026-08-01T01:01:00.000Z",
        "validUntil": "2026-08-08T01:01:00.000Z",
        "priceTiers": [{
          "minQuantity": 10,
          "maxQuantity": 49,
          "unitPriceCny": "12.30"
        }]
      }
    }
  }]
}
```

The payload hash is server-built. Reusing one observation key/revision with a
different payload is a conflict. Finalize the run as `complete` or `partial`
before freezing an offer. Collection is re-authorized on every append, so a
suspension, permission expiry, or kill switch stops an already-open run. Any
entitlement-version change also closes the run's admissible lane; start a new
run rather than mixing governance versions.

Revisions are sequential and keep one immutable source/scope/platform/entity/
concept/schema envelope. A missing predecessor or an envelope change is a
conflict. Only a `complete` run meeting the entitlement's
`minimumCoverageBps` can support a positive decision; `partial`, unknown, or
below-threshold coverage remains context-only. Coverage is computed by the
server from distinct accepted observation series divided by the run's frozen
`expectedCount`; correction revisions do not increase the numerator. A supplied
`coverageBps` is only an assertion and is rejected when it differs from the
server value. Example finalization body:

```json
{
  "status": "complete",
  "watermarkEventAt": "2026-08-01T01:00:00.000Z"
}
```

### 3. Freeze supplier commercial terms

`POST /api/supplier-offer-snapshots` creates an immutable Supply record. The
referenced observation must be organization-scoped supply evidence from the
same platform and must identify `externalOfferId` or `externalSkuId`. Every
snapshot field must exactly reproduce `rawPayload.supplierOffer` above;
`capturedAt` must equal the observation's `observedAt`, and `sourceUrl` must
also match. Optional canonical fields are explicit `null`, not omitted.

The selected evidence must be the absolute latest revision visible at the
cutoff. A newer failed or quarantined correction intentionally invalidates an
older complete revision instead of allowing stale commercial terms to revive.

Use `offer_only` for RFQ discovery. Use `exact_variant` only when external SKU,
variant, order unit, unit conversion, and terms are known. Price tiers are
server-hashed with the snapshot.

### 4. Freeze a LaunchCandidate

`POST /api/sourcing/intelligence/launch-candidates` requires an unexpired
`exact_variant` offer, target channel account, product-concept and Korean bundle
version keys, initial quantity, target price, fulfillment mode, and versioned
launch/compliance/IP/quality snapshots. Known economics requires integer KRW
landed cost, target sale price, and profit P10.

### 5. Generate an immutable shadow decision batch

`POST /api/sourcing/intelligence/decision-batches` accepts only search input,
idempotency, expiry, and explicit candidate-to-offer/launch/evidence bindings.
The server runs the existing 30-day replay and freezes all supplier matches,
not only positive UI recommendations.

Clients cannot submit scores, model versions, canonical decisions,
probabilities, or propensities. The current baseline uses coverage confidence,
so it cannot emit an execution-eligible `test_order`. Legacy discovery rows are
recorded only as unentitled shadow context; they cannot satisfy evidence gates.
Positive gates count only demand/supply evidence and require the exact pair of
Coupang demand plus 1688 supply; risk, compliance, execution, outcome, or
role-swapped platform observations remain context-only.

### 6. Propose an RFQ or sample intent

`POST /api/sourcing/intelligence/decision-items/:id/procurement-intents`

```json
{
  "idempotencyKey": "sample:DECISION_ITEM_ID:v1",
  "intentType": "request_sample",
  "requestedOrderUnits": 1
}
```

RFQ may use `offer_only`. Sample requires exact variant and positive quantity.
Test order additionally requires an execution-eligible canonical `test_order`,
a LaunchCandidate, selected tier, known CNY terms, unexpired offer, and quantity
at or above MOQ. For a test order the client does not choose a second quantity:
`requestedPurchaseUnits` is frozen from `LaunchCandidate.initialOrderQuantity`,
and Supply computes
`requestedSellableUnits = requestedPurchaseUnits * unitsPerOrderUnit /
unitsPerSellableBundle`. Non-integral conversion is rejected, and all three
quantities are frozen in the request hash. A sample without a LaunchCandidate
keeps `requestedSellableUnits` null instead of guessing a Korean bundle.

Offer and intent creation recheck the evidence source's current exact
`sourceKey + scopeKey` entitlement under the repository transaction. Suspension,
expiry, retention denial, or a kill switch blocks even an idempotent retry from
reviving the old request. Test orders additionally require the source to remain
`qualified + enabled`, and its completed run to remain above the minimum
coverage threshold. Phase 0 cannot satisfy the calibrated-decision gate.

Read snapshots and intents with:

- `GET /api/supplier-offer-snapshots`
- `GET /api/procurement-test-intents`
- `GET /api/sourcing/intelligence/decision-batches/latest`

## Verification

```bash
npx prisma validate
npx prisma generate
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
npm run dev:server
```

For a schema-bearing change also run `npm run db:push`,
`cd packages/shared && npm run build`, `npm run db:erd`, and
`npm run graphify:schema`.

## Blockers And Stop Conditions

- Missing/expired access permission, raw credential input, or kill switch.
- Source still shadow/disabled when decision impact is requested.
- Evidence platform/entity mismatch or future `availableAt`.
- Evidence with future `ingestedAt`, a non-terminal run, a superseding
  correction, a mismatched concept, or a revoked exact source scope.
- Offer-only/expired/ambiguous variant for LaunchCandidate.
- Unknown/blocked compliance, IP, quality, unit conversion, or economics.
- Coverage confidence presented as a calibrated probability.
- Any attempt to convert a ProcurementTestIntent directly into a PurchaseOrder
  or call a provider from this flow.

## Current Non-Goals

- No live 1688/SNS/Coupang connector or schedule is enabled by this foundation.
- The generic evidence endpoint preserves reviewed collector facts but does not
  replace source-specific server parsers/signatures; those validators are an
  activation gate, not evidence that may be inferred from client labels.
- No outcome/exposure ledger, backtest, calibrated purchase probability,
  contextual bandit, or reinforcement-learning policy is trained yet.
- No China-to-Korea order-flow inference is treated as observed market share.
- No procurement intent can create a purchase order or call a supplier.

## Operator Report

Report source/version, run ID and terminal coverage, accepted/duplicate/rejected
counts, offer and LaunchCandidate IDs, decision batch/model/policy versions,
canonical action and reason codes, intent ID/type, and every unresolved blocker.
Do not report shadow data as market share or a proposed intent as an order.
