# Sellpia Inventory Collection

Sellpia is the physical-stock authority. KidItem displays its current stored
inventory; it does not reserve or independently adjust quantities.

## Collect and inspect

1. Use an authenticated organization account, Chrome and the current KidItem
   extension supporting `sellpiaInventorySourceOwnerV1`.
2. Confirm the fixed source binding `https://kiditem.sellpia.com` / `kiditem`
   through the organization owner/admin control. This is identity validation,
   not an age-based freshness rule.
3. Choose Sellpia inventory collection. Every screen shares the source control.
   A second start joins the existing organization attempt.
4. The extension reads the server-issued plan/token, collects every page,
   uploads the complete result and requests completion. A start/handoff response
   does not mean the database has been updated.
5. Observe the attempt until completion. Successful publication and terminal
   state commit atomically. The inventory list then reads all current DB rows.

Products publishes directly to `MasterProduct`. Existing source identities retain
their UUIDs, KID codes and images; a new source identity receives a new UUID and
KID code from the shared sequence. Channel options reference those UUIDs through
Channels-owned recipes.
Codes absent from a successful full collection retain their rows with quantity
zero. A validated empty full collection sets every existing quantity to zero.
A login error, missing list shape, partial pagination or failed attempt is not
an empty collection and must not clear inventory.

## Failures and cancellation

A failure leaves current quantities unchanged and creates or updates the
source Alert. Repeated failures do not add separate Alerts. A later successful
publication resolves that Alert; failed attempts remain in collection history. Cancellation is a stopped attempt, not a failure
notification. Late results from a stopped/terminal attempt cannot publish.

Retry explicitly after fixing login, extension version, source identity or
payload shape. Manual inventory file-upload recovery is retired. Do not edit
`currentStock` directly as a recovery step.

## Purchase and Rocket calculations

Each calculation action starts or joins a Sellpia collection through the shared
control, waits for its successful DB publication, and sends its attempt ID to
the backend calculation. Failure or cancellation stops the calculation; an old
snapshot is not a fallback. There is no ten-minute TTL rule or automatic timer
that expires current stock. Execution leases still fence dead browser work.

The calculation observer polls through React Query at most once per second
while waiting (60 requests/minute per tab, default API budget 600). Navigation
stops observation without cancelling another screen's shared collection.
Provider submission is never automatically retried after an ambiguous outcome.
See [Rocket boundary](sellpia-rocket-inventory-sync.md).

## Verification

Use disposable PostgreSQL for source completion, rollback, cancellation,
concurrent starts, replay, organization scope, missing-row zeroing and alert
history tests. Also verify current-list/export/barcode behavior, failed
collection blocking calculation, and unchanged Orders reconciliation.
Production schema changes follow the documented release cutover; test database
setup is not authorization to synchronize the live database.
