---
status: accepted
---

# One channel account row per mall or marketplace

Order collection kept each mall's login under a pseudo-channel row
(`channel = 'order_collection'`, `externalAccountId = mallKey`), while listings,
orders, registration executions and collection attempts key on marketplace rows
(`channel = 'coupang'`, `'naver'`, …), so one mall could own two rows that nothing
tied together and every consumer decided again which row "is" the mall. From now
on one `ChannelAccount` row identifies one mall or marketplace seller system:
`channel` is the registry mall key (`kidkids`, `toss`, `coupang`, `rocket`, …),
and every mall-scoped record (login, listing profile, listings, orders, attempts,
observed outcomes) hangs off that row, because a single identity is what the
organization/channel-account contract already promises and the pseudo-channel
was a seeding shortcut, not a model.

## Considered options

- **Keep the `order_collection` pseudo-channel and link it to the marketplace
  row.** Preserves the seed as it is, but every consumer must remember one
  more join, and two rows for one mall can disagree on status and config.
- **A separate `MallAccount` model.** A clearer name, but it duplicates
  `ChannelAccount` (organization scope, status, config) and splits the listing
  and order relations across two tables.

## Consequences

The mall registry (`ORDER_COLLECTION_MALL_ENV`, `mallByKey`) stays the source of
channel keys and names. Login credentials stay in `config.orderCollection`; a
mall's listing profile lives in `config.listingProfile` on the same row. Mall
registration adds no product model: it creates `ChannelListing` rows under the
mall's account that point at `MasterProduct`, the only canonical product. The
seed, the mall account service and the collection source repository switch
from `channel: 'order_collection'` to `channel: mallKey`. Office has not been
deployed, so there is no data migration: local and QA databases are re-seeded.
