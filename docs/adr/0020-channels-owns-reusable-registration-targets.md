---
status: accepted
---

# Channels owns reusable registration targets

Candidate-bound drafts cannot represent independent selling products or repeated registrations of the same product to one store. Channels owns common selling products and options plus persistent registration targets, and reuses the existing execution ledger with many immutable executions per target, so editing, observed marketplace facts and submitted evidence remain distinct. This replaces the Products catalog ownership in [ADR-0018](0018-sales-products-are-a-products-owned-registration-definition.md) and the one-shot draft lifetime in [ADR-0014](0014-channels-owns-the-registration-execution-fence.md), while preserving its single submission fence.

## Consequences

`ProductPreparation` becomes a Channels-owned persistent registration target; sourcing candidates and generated content are optional provenance, not required parents. A product and account may have multiple explicit targets. Completing a submission does not close the target; a new intent creates a new execution, an identical idempotency key replays the existing one, and an unresolved execution prevents another submission for that target.

Common options hold final sale prices and optional normal prices. Each target selects options and stores only explicit overrides and marketplace inputs; product-by-account overrides, independent purchase costs and continuously applied price ratios are removed. Confirmed listing recipes alone determine operational capacity; registration templates never silently replace them, and external stock submissions retain the existing provider behavior.

Products continues to own source MasterProduct identities and stock. Channels references those UUIDs through owner interfaces without a cross-owner foreign key. Used composition changes create a new option UUID and KID, preserving existing external identifiers and historical links until a confirmed marketplace transition.

## Considered options

Keeping one closed draft per candidate and account simplifies duplicate prevention but cannot support candidate-free authoring or repeated, separately configured registrations. Adding another catalog-specific draft would retain that restriction by duplicating the editing authority; instead the existing table and execution boundary are evolved together.
