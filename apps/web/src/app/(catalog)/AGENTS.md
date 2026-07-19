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
- Products owns complete atomic variant recipes. Manual replacement lives on
  product detail. Matching exposes only an explicit version-fenced command that
  may create an empty recipe with one active Sellpia component and a verified
  positive integer channel-to-Sellpia pack ratio.
- Automatic recipe evidence must select one SKU without conflict through a
  name-compatible exact code or physical barcode, a unique exact normalized
  name, or a unique contained/fuzzy name above the domain thresholds and
  runner-up margin. Ambiguous identifiers, incompatible names, unverifiable
  pack/BOM data, raw aliases, close-ranked names, and AI remain review-only.
- Safe child variants apply independently; existing links and recipes are never
  overwritten. Recipe automation never changes product or variant identity.
  Existing recipes and every review/blocked child remain untouched.

## Boundary Rules

- Product list/detail and its focused recipe picker use Products APIs; only the
  options route reads the full Inventory SKU collection.
- Do not infer product, variant, or channel identity from display text,
  barcode, normalized name, or candidate rank.
- Catalog routes do not edit Sellpia stock, source prices, or channel prices.
- Do not recreate channel-owned component quantities. Manual complete recipe
  edits live on product detail; matching exposes only the narrow deterministic
  create-if-empty command.
- Never send `organizationId`; backend session scope owns it.
- Sourcing candidates, generated content workspaces, marketplace ingest,
  Rocket operations, and purchase orders remain in their owner domains.
