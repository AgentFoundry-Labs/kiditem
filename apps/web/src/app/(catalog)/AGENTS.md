Consult this document first instead of relying on memorized knowledge.

# web/catalog - Sellpia Product Hub and Channel SKU Matching

`app/(catalog)/` owns the preserved product operations center, read-only
Sellpia option projection, and the operator workspace that maps marketplace
channel SKUs to the Sellpia products they consume. Public URLs remain under
`/product-hub`.

## Owned Surfaces

- Preserved product operations-center list under `/product-hub` and preserved
  product detail hierarchy under `/product-hub/[masterProductId]`
- Preserved matching center under `/product-hub/matching`, with account-scoped
  channel SKU component matching added at `?view=channel-recipes`
- Dedicated read-only Sellpia option tables at `/product-hub/options` and
  `/product-hub?view=options`. Replacing the former editable option-management
  UI with this read-only projection is an approved exception.

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

- `/product-hub` preserves the operations-center information hierarchy while
  adapting supported facts to the current APIs. Unsupported historical metrics
  remain visibly unavailable instead of calling removed endpoints.
- The options views present the authoritative Sellpia snapshot in a read-only
  table without restoring removed option mutations.
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
