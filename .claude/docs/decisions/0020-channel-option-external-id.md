---
id: 0020
title: Channel Option External ID Naming
status: Accepted
date: 2026-04-24
supersedes: []
superseded-by: null
affects:
  - prisma
  - apps/server
  - apps/server/src/channels
  - apps/server/src/advertising
  - packages/shared
---

# ADR-0020: Channel Option External ID Naming

- Date: 2026-04-24
- Status: Accepted
- Supersedes: none
- Related: ADR-0013, ADR-0015

## Context

`ChannelListingOption.vendorItemId` used a Coupang provider term in the canonical DB model. Coupang's Open API uses `sellerProductId` for the registered product and `vendorItemId` for the approved option/item. That term is correct at the Coupang adapter boundary, but not as a channel-neutral DB field.

## Decision

Rename the canonical `ChannelListingOption` field to `externalOptionId` and the physical DB column to `external_option_id`.

Provider-specific payloads may keep their native field names. Coupang order/product/ad sync maps `vendorItemId` into `externalOptionId` before touching canonical tables.

`ChannelListing.externalId` is listing-level and remains separate from `ChannelListingOption.externalOptionId`, which is option-level.

## Drivers

- Prevent Coupang vocabulary from becoming the internal multi-channel contract.
- Keep order/ad matching exact and tenant-scoped.
- Avoid a duplicated `channel` column on `ChannelListingOption` while `ChannelListing` already owns channel identity.

## Alternatives Considered

1. Keep `vendorItemId` in DB.
   - Rejected because it keeps a provider term in a canonical model.
2. Add `ChannelListingOption.channel`.
   - Rejected for this phase because it duplicates `ChannelListing.channel` and introduces drift risk.
3. Rename to `externalOptionId` and query through `ChannelListing`.
   - Accepted because it gives neutral naming with minimal schema expansion.

## Consequences

- Prisma code uses `externalOptionId`.
- Coupang adapter/input code still uses `vendorItemId`.
- Exact matching can use `(companyId, listing.externalId, externalOptionId)` when `sellerProductId` is present, and `(companyId, listing.channel, externalOptionId)` fallback when it is not.
- Excel rows without a true option-level external ID do not create `ChannelListingOption` rows.

## Verification

- `rg -n "channelListingOption.*vendorItemId|companyId_vendorItemId|vendor_item_id" apps prisma packages scripts`
- `npm run db:push`
- `npx prisma generate`
- `npm run db:3layer-setup`
- `cd packages/shared && npm run build`
- `npm run dev:server`
