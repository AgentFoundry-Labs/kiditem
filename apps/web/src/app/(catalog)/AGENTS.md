# web/catalog — Product Operations and Channel Matching

`app/(catalog)/` owns KidItem product metadata, product variants and their
central Sellpia component recipes, plus explicit channel-to-product identity
confirmation. Public URLs remain under `/product-hub`.

## Owned Surfaces

- Product operations list, create/edit, and variant detail under `/product-hub`
- Coupang/Rocket account-scoped product-first, option-second matching under
  `/product-hub/matching`
- Dedicated read-only Sellpia option table under `/product-hub/options`

## Domain Contracts

- `MasterProduct` is KidItem product metadata; `ProductVariant` is a sellable
  KidItem option. Neither is a physical Sellpia inventory row.
- `/product-hub/options` owns the complete read-only Sellpia inventory
  collection and publishes product/variant destinations only from confirmed,
  organization-fenced component relations.
- Matching confirms channel listing -> `MasterProduct` before channel option ->
  `ProductVariant`; candidates and ranking are evidence only and never confirm
  either identity.
- Products owns complete atomic recipes. Matching exposes only the explicit,
  version-fenced create-if-empty command; the nested matching guide owns its
  evidence, pack-ratio, and per-child review policy.
  Existing recipes and every review/blocked child remain untouched.

## Boundary Rules

- Product list/detail and its focused recipe picker use Products APIs; only the
  options route reads the full Inventory SKU collection.
- Do not infer product, variant, or channel identity from display text,
  barcode, normalized name, or candidate rank.
- Catalog routes do not edit Sellpia stock, source prices, or channel prices.
- Do not recreate channel-owned component quantities or overwrite recipes.
- Never send `organizationId`; backend session scope owns it.
- Sourcing candidates, generated content workspaces, marketplace ingest,
  Rocket operations, and purchase orders remain in their owner domains.
