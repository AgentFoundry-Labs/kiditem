# Warehouse API Provisioning

Use this runbook to provision the Warehouse reference rows consumed by
`StockTransfers` on `/inventory-hub`. The standalone `/warehouses` page is
retired; this procedure does not recreate warehouse CRUD UI or authorize direct
database changes.

## Prerequisites

- Use an authenticated KidItem operator session. The application has no
  organization-selection UI; middleware chooses one active membership for the
  session, so a valid session alone does not prove the intended Organization.
  The server derives `organizationId` from that session; never send it in a
  request body or query string.
- Confirm the target environment and the production owner of the Warehouse
  reference data before any write.
- Use an approved authenticated API client. If using the examples below, set
  `KIDITEM_BASE_URL` to the intended API origin and `KIDITEM_COOKIE_FILE` to an
  operator-provided cookie jar outside the repository. Never print, commit, or
  paste session material into a report.
- Set `KIDITEM_APPROVED_ORGANIZATION_ID` to the exact Organization UUID from a
  separate approval source, and have `jq` available. An organization name is
  insufficient, and `/api/auth/me` does not return one.
- Record the approved warehouse name and any optional `code`, `address`,
  `manager`, `phone`, or `isDefault` value. Omit an unknown optional field;
  especially, omit `code` instead of sending an empty string.

Stop before writing when authentication, the active organization, the target
environment, or production ownership is uncertain.

The current Warehouse controller declares no owner/admin role metadata, so its
write routes are not presently restricted to those roles. Authentication and
active-organization scoping select the data boundary; they do not authorize an
arbitrary write. Obtain the environment and Warehouse data-owner approval
required above before every create, update, or delete.

## Required Organization Gate

Before **every** Warehouse list, create, update, or delete operation, call
`GET /api/auth/me` with the same cookie jar and require its observed
`organizationId` to exactly match `KIDITEM_APPROVED_ORGANIZATION_ID`. A 200
response with `organizationId: null` is possible and must block the operation.

```bash
: "${KIDITEM_APPROVED_ORGANIZATION_ID:?set the separately approved Organization UUID}"
set -o pipefail
rtk curl --fail-with-body --silent --show-error \
  --cookie "$KIDITEM_COOKIE_FILE" \
  --write-out '\n{"httpStatus":"%{http_code}"}\n' \
  "$KIDITEM_BASE_URL/api/auth/me" |
  rtk jq --slurp --arg approved "$KIDITEM_APPROVED_ORGANIZATION_ID" '
    .[0] as $identity
    | .[-1].httpStatus as $httpStatus
    | {httpStatus: $httpStatus, organizationId: $identity.organizationId} as $evidence
    | $evidence,
      (if ($httpStatus == "200"
           and ($identity.organizationId | type) == "string"
           and $identity.organizationId == $approved)
       then empty
       else error("stop: authenticated organization does not match approval")
       end)
  '
```

This projection prints only the HTTP status and observed organization ID. Stop
on a non-200 response, a null ID, a mismatch, or any pipeline failure. Repeat
the gate immediately before the next Warehouse request rather than relying on
an earlier check from a session whose active membership may have changed.

## API Contract

All routes are scoped to the active organization from the authenticated
session.

| Operation | Route | Current success response |
|---|---|---|
| List | `GET /api/warehouses` | `200` with all organization Warehouse rows, each including a shipment-only `shipmentCount` |
| Create | `POST /api/warehouses` | `201` with the created Warehouse row |
| Update | `PATCH /api/warehouses/:id` | `200` with the updated Warehouse row |
| Delete | `DELETE /api/warehouses/:id` | `200` with `{ "ok": true }` |

There is no single-resource `GET /api/warehouses/:id`; use the list and match
the exact returned `id`. Missing or cross-organization update/delete targets
currently return `400`, not `404`. `shipmentCount` counts shipment references
only; it does not include either side of a stock transfer.

The safe create body requires a non-empty `name`. Optional fields are `code`,
`address`, `manager`, `phone`, `isDefault`, and `status`. Do not invent a status
policy or send fields that the data owner did not approve. `POST` is not a
documented idempotent operation, so inspect the list before creating and never
retry an ambiguous create blindly.

## Read And Create

1. Read the current organization list and record only the row count and the
   exact IDs/names relevant to the operation:

   ```bash
   set -o pipefail
   rtk curl --fail-with-body --silent --show-error \
     --cookie "$KIDITEM_COOKIE_FILE" \
     --write-out '\n{"httpStatus":"%{http_code}"}\n' \
     "$KIDITEM_BASE_URL/api/warehouses" |
     rtk jq --slurp '
       .[0] as $body
       | .[-1].httpStatus as $httpStatus
       | if ($body | type) == "array" then
           {httpStatus: $httpStatus,
            warehouseCount: ($body | length),
            warehouses: ($body | map({id, name, shipmentCount}))}
         else
           {httpStatus: $httpStatus,
            error: ($body | {statusCode, error, message})}
         end
     '
   ```

   When verifying an approved optional field, add only that field to the
   `map({ ... })` projection. Never print a full Warehouse row.

2. Stop if the intended warehouse already exists or ownership is ambiguous.
   Otherwise create the smallest approved row. Add optional fields only when
   their values are known:

   ```bash
   set -o pipefail
   rtk curl --fail-with-body --silent --show-error \
     --cookie "$KIDITEM_COOKIE_FILE" \
     --header 'Content-Type: application/json' \
     --request POST \
     --data '{"name":"APPROVED_WAREHOUSE_NAME"}' \
     --write-out '\n{"httpStatus":"%{http_code}"}\n' \
     "$KIDITEM_BASE_URL/api/warehouses" |
     rtk jq --slurp '
       .[0] as $body
       | .[-1].httpStatus as $httpStatus
       | if ($body.id? | type) == "string" then
           {httpStatus: $httpStatus, warehouse: ($body | {id, name})}
         else
           {httpStatus: $httpStatus,
            error: ($body | {statusCode, error, message})}
         end
     '
   ```

   If optional fields were separately approved, add only those exact fields to
   the success projection; never display the full address, manager, or phone
   row.

3. Require `201`, retain the returned Warehouse `id`, then repeat the list
   request. Verify exactly one row with that ID and the approved values appears
   in the active organization.
4. Hard-reload `/inventory-hub` before inspecting **창고 이관 기록**. An API
   write performed outside the page does not invalidate the React Query cache
   in an already-open tab. With at least one Warehouse row, the zero-row
   provisioning message is absent and **이관 기록 추가** is enabled. When two
   Warehouse rows are available, open the form and confirm the source and
   destination options use the exact two returned IDs; saving a transfer must
   send those exact values as `fromWarehouseId` and `toWarehouseId`.

## Safe Update

1. Use `GET /api/warehouses` and match the exact target ID. Do not infer an ID
   from a name alone when names are duplicated.
2. Patch only the approved fields:

   ```bash
   : "${WAREHOUSE_ID:?set the exact approved Warehouse ID}"
   set -o pipefail
   rtk curl --fail-with-body --silent --show-error \
     --cookie "$KIDITEM_COOKIE_FILE" \
     --header 'Content-Type: application/json' \
     --request PATCH \
     --data '{"name":"APPROVED_UPDATED_NAME"}' \
     --write-out '\n{"httpStatus":"%{http_code}"}\n' \
     "$KIDITEM_BASE_URL/api/warehouses/$WAREHOUSE_ID" |
     rtk jq --slurp '
       .[0] as $body
       | .[-1].httpStatus as $httpStatus
       | if ($body.id? | type) == "string" then
           {httpStatus: $httpStatus, warehouse: ($body | {id, name})}
         else
           {httpStatus: $httpStatus,
            error: ($body | {statusCode, error, message})}
         end
     '
   ```

3. Require `200`, then list again and verify the exact ID has only the intended
   changes. Stop on any API error instead of changing the database directly.

## Safe Delete

Deletion is destructive and Warehouse foreign keys use restrictive reference
behavior.

1. List Warehouses and match the exact target ID in the active organization.
   Require its shipment-only `shipmentCount` to be zero, but do not treat that
   as proof that the row is otherwise unreferenced.
2. Read the organization stock-transfer records through the minimized check
   below and stop if the target ID appears as either `fromWarehouse.id` or
   `toWarehouse.id`. Stop as well when shipment ownership or any other
   reference cannot be established safely.

   ```bash
   : "${WAREHOUSE_ID:?set the exact approved Warehouse ID}"
   set -o pipefail
   rtk curl --fail-with-body --silent --show-error \
     --cookie "$KIDITEM_COOKIE_FILE" \
     --write-out '\n{"httpStatus":"%{http_code}"}\n' \
     "$KIDITEM_BASE_URL/api/stock-transfers" |
     rtk jq --slurp --arg warehouseId "$WAREHOUSE_ID" '
       .[0] as $body
       | .[-1].httpStatus as $httpStatus
       | if ($body | type) == "array" then
           {httpStatus: $httpStatus,
            stockTransferReferenceCount:
              ([$body[] | select(.fromWarehouse.id == $warehouseId
                                  or .toWarehouse.id == $warehouseId)] | length),
            stockTransferIds:
              [$body[] | select(.fromWarehouse.id == $warehouseId
                                 or .toWarehouse.id == $warehouseId) | .id]}
         else
           {httpStatus: $httpStatus,
            error: ($body | {statusCode, error, message})}
         end
     '
   ```

3. Only after those checks, delete the exact ID:

   ```bash
   : "${WAREHOUSE_ID:?set the exact approved Warehouse ID}"
   set -o pipefail
   rtk curl --fail-with-body --silent --show-error \
     --cookie "$KIDITEM_COOKIE_FILE" \
     --request DELETE \
     --write-out '\n{"httpStatus":"%{http_code}"}\n' \
     "$KIDITEM_BASE_URL/api/warehouses/$WAREHOUSE_ID" |
     rtk jq --slurp '
       .[0] as $body
       | .[-1].httpStatus as $httpStatus
       | if ($body.ok? | type) == "boolean" then
           {httpStatus: $httpStatus, ok: $body.ok}
         else
           {httpStatus: $httpStatus,
            error: ($body | {statusCode, error, message})}
         end
     '
   ```

4. Require `200` and `{ "ok": true }`, then list again and verify the exact ID
   is absent. Hard-reload an already-open `/inventory-hub` before checking the
   UI because the external delete does not invalidate its React Query cache. If
   the last Warehouse was deleted, the page must show the `/api/warehouses`
   provisioning explanation, disable **이관 기록 추가**, and prevent the
   transfer form from opening.

If deletion reports a reference/foreign-key failure or any unexpected API
error, stop and report it. Never bypass the failure with raw SQL, cascading
deletes, or stored-row edits.

## Blockers

Stop and report the exact blocker when:

- `/api/auth/me` is non-200, reports a null `organizationId`, or reports an ID
  different from `KIDITEM_APPROVED_ORGANIZATION_ID`;
- an API response is non-successful, ambiguous, or inconsistent with the
  follow-up list;
- a create may already have succeeded but its response was lost;
- a delete target has shipment or stock-transfer references, or the deletion
  fails because of a reference;
- production ownership or authorization for the intended Warehouse row is
  uncertain.

## Final Report Format

Do not include cookies, authorization headers, or full API payload dumps.

```text
Environment: <local|staging|production API origin>
Verified organization: approved <uuid>; observed <uuid>; exact match yes
Operation: <read|create|update|delete>
Before: Warehouse rows <count>; target <present|absent>
Request: <method and path>; organizationId sent by client <no>
Response: HTTP <status>; Warehouse ID <id or none>
Reference precheck: shipments <count|not applicable>; stock-transfer refs <count|not applicable>
After: Warehouse rows <count>; target <present|absent>
Inventory hub: <zero-row blocked|provisioned and enabled|not checked>
Raw SQL/stored-row bypass: not used
Blockers: <none or exact observed blocker>
```
