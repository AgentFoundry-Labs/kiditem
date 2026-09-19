---
status: accepted
---

# Sales products and their options are a Products-owned registration definition

Cancelling Sabangnet left no place for option products or for its 770 products, and every
mall registration built exactly one option from a sourcing candidate. KidItem keeps the
product it sends to malls as a sales product (`SalesProduct`, Sabangnet 품번) with option
rows (`SalesProductOption`, Sabangnet 단품), owned and mutated only by Products, edited once
and sent to many malls; the channel option recipe stays the only operating recipe, an
option's Sellpia composition is a declaration that is copied only into an empty channel
option recipe when that option is linked, and a sales product holds no stock and no ABC grade.

## Considered options

- **Extend `MasterProduct`.** It is one-to-one with a Sellpia SKU, provisioned by
  Inventory, and the ABC identity; grouping several SKUs under it breaks all three.
- **Extend Sourcing's `ProductPreparation`.** It is per candidate × mall account, so the
  options would be copied per mall, and Sabangnet's products have no candidate.
- **Option JSON on the candidate's `manualBasics`.** Option codes and Sellpia links are
  join keys, which the schema rules keep out of JSON.

## Consequences

This narrows two earlier statements: the Products guide's "do not recreate
`ProductVariant` or an operating option table" (a second operating recipe or stock
balance is still forbidden) and ADR-0012's "mall registration adds no product model".
Per-mall values (Sabangnet 쇼핑몰별별도정보) live on `SalesProductChannelOverride`,
keyed by the mall's `ChannelAccount` row. The link columns
`ChannelListing.salesProductId` and `ChannelListingOption.salesProductOptionId` are
written only through a Products port.
