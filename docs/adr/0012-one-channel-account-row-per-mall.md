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
and every mall-scoped record (login, listing profile, listings, orders,
attempts) hangs off that row, because a single identity is what the
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

The channel registry (`MALL_CHANNELS` in `@kiditem/shared/channel-registry`,
with the seed's `ORDER_COLLECTION_MALL_ENV_PREFIX`) stays the source of channel
keys and names. A mall row also keeps the mall key in `externalAccountId`, so
the `[organizationId, channel, externalAccountId]` unique key admits one row
per mall. A mall that belongs to an existing marketplace seller system uses that
row instead of its own: Coupang direct shipping (`coupang-direct`) signs in on
the `rocket` row, where its orders and attempts already live, and saving that
login leaves the row's name and status to the marketplace connection. Login
credentials stay in `config.orderCollection`; a mall's listing profile lives in
`config.listingProfile` on the same row. Observed mall outcomes
(`MallOperationOutcome`) are the exception: they key on the mall's channel key
rather than on the account row, because some outcomes — a registration fill
among them — are recorded for a mall that has no row. A mall that shares
another mall's account row records under that row's key (`coupang-direct` under
`rocket`), a fold that lives in `@kiditem/shared` (`channelOutcomeKey`) so
writers and readers agree. Mall registration adds no product model: it
creates `ChannelListing` rows under the mall's account that point at
`MasterProduct`, the only canonical product. The seed, the mall account
service and the collection source repository switch from
`channel: 'order_collection'` to `channel: mallKey`. There is no data migration:
after the v0.1.31 cutover the operator re-runs the mall account seed
(`npm run seed:order-collection-malls`) so each mall gets its new-style row, and
the old pseudo-channel rows stay in place, because `channel_accounts` is an
ADR-0010 kept table and nothing reads them any more; QA databases are re-seeded
the same way.
