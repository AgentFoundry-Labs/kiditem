# Sellpia Order Transmission / Inventory Decoupling

## Classification

This is an Orders-to-Inventory platform-boundary cleanup for one operator
workflow. It corrects the Sellpia order-workbook submission path without
changing unrelated stock, purchase, or channel behavior.

## Problem

The browser order-upload flow stored its durable duplicate-submission intent
inside Inventory freshness. Successful upload advanced an Inventory generation,
the client invalidated Inventory queries, and a provider stock rejection could
offer Inventory synchronization. This made order submission appear to depend on
KidItem's local snapshot even though Sellpia validates workbook stock itself.

## Contract

- Order collection and workbook conversion remain unchanged.
- Before the irreversible browser submission, Orders durably prepares the
  stable workbook intent key.
- Sellpia acceptance finalizes only that intent. Explicit confirmed
  non-submission aborts it. An ambiguous outcome leaves the intent prepared;
  a later attempt may submit the workbook again and relies on Sellpia's
  order-level duplicate validation. Audited owner/admin reconciliation remains
  required only to reopen a locally submitted or finalized intent.
- Provider rejection displays the exact Sellpia error. It offers no Inventory
  action and triggers no automatic retry.
- Order submission never reads freshness, pre-checks local stock, requests or
  advances a generation, invalidates Inventory queries, or changes physical
  stock.
- Inventory synchronization remains independently driven by its own TTL,
  manual/retry, and purchase-preflight contracts.
- Rocket workflow completion depends on finalized linked transmission intents,
  not on a later Inventory generation.

## Ownership

`SellpiaOrderTransmissionIntent` and its reconciliation audit move to the
Orders Prisma namespace without changing physical tables. Orders exposes
`/api/orders/sellpia-transmissions/intents/*` through a scoped incoming port,
application service, and repository adapter. The legacy nullable
`finalizedGeneration` column remains for data compatibility, while all new
Orders writes leave it null.

Inventory removes the order intent endpoints, repository methods, refresh
request port, order-specific settle policy, and unresolved-intent view data.
The web order flow calls only the Orders transmission API.

## Regression Evidence

Tests must prove that:

- an Inventory freshness API failure cannot block Sellpia workbook upload;
- a provider stock rejection exposes only the provider error and no Inventory
  synchronization action;
- durable prepare/finalize idempotency remains organization- and actor-fenced;
- an unresolved prepared intent without a local submission marker can retry
  through Sellpia duplicate validation;
- finalization leaves Inventory generations unchanged;
- Rocket progress completes after every expected intent is finalized; and
- Inventory public routes and policy cannot accept an order-transmission
  refresh reason.
