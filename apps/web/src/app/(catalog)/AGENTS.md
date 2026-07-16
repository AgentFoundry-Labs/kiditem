Consult this document first instead of relying on memorized knowledge.

# web/catalog - Sellpia Product Hub and Channel SKU Matching

`app/(catalog)/` owns the baseline read-only Sellpia product catalog, snapshot
detail, dedicated read-only options table, and Coupang ChannelSku-to-Sellpia
component matching route. Public URLs remain under `/product-hub`.

## Owned Surfaces

- Read-only Sellpia snapshot list and detail under `/product-hub`
- Coupang Wing catalog upload and account-scoped channel SKU component matching
  under `/product-hub/matching`
- Dedicated read-only Sellpia option table under `/product-hub/options`

## Data Flow

```text
React Query + apiClient
  -> GET /api/inventory/sellpia-skus
  -> GET /api/inventory/sellpia-skus/:masterProductId
  -> GET /api/channels/accounts
  -> POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
  -> GET /api/channels/sku-mappings
  -> GET /api/channels/sku-mappings/:channelSkuId/candidates
  -> PUT /api/channels/sku-mappings/:channelSkuId/components
  -> GET /api/channels/sku-availability
  -> queryKeys.inventory, channelAccounts, channelSkuMappings, channelSkuAvailability
```

## State Rules

- `/product-hub` is a read-only projection of the latest Sellpia full-snapshot
  import. It never creates, edits, deletes, or adjusts physical products.
- `/product-hub/options` presents the same authoritative snapshot in its
  dedicated read-only table without restoring removed option mutations.
- One physical `MasterProduct` is one Sellpia product-code row, including its
  option name when Sellpia distinguishes the option at that code.
- Channel matching uses focused account, source-import, and channel SKU
  matching contracts and never sends `organizationId`.
- Candidate rows are suggestions. Only a saved `ChannelSkuComponent` recipe is
  matching truth.

## Boundary Rules

- Do not call removed `/api/products*` routes or recreate `ProductOption` CRUD.
- Do not infer a channel SKU link from names, barcodes, or candidate rank.
- Do not edit Sellpia stock, source prices, or channel prices in catalog routes.
- Sourcing candidates, generated content workspaces, marketplace ingest,
  Rocket operations, and purchase orders remain in their owner domains.
