---
status: accepted
---

# Channels owns the registration execution fence

Registration crosses two owners: Sourcing prepares what to sell (candidate,
draft, review) and until now also owned the submission fence
(`product_registration_executions`: frozen payload, SHA-256, idempotency key,
lease, provider result, `externalListingId`), while Channels owns the account,
the resulting `ChannelListing`, the owner receipts and the observations, and
the mall wizard's Wing path submitted without passing that fence at all. From
now on Channels owns the execution fence: every submission to a channel
account, whether Wing autoSubmit, a spreadsheet upload or an API mall, goes
through the one Channels fence, Sourcing stops at the draft and reads the
execution back through the Channels reader to reflect candidate state, and a
mall form fill without a submission stays an observation. We chose this over
keeping the fence in Sourcing because everything an execution row points at
(account row, listing, receipt) is Channels state and the only Sourcing
reference is the draft id, so the fence belongs with the account it protects.

## Considered options

- **Keep the fence in Sourcing and make the wizard call it.** Keeps the
  0.1.8–0.1.25 shape, but leaves "registration" with two owners and makes the
  no-double-submit guarantee depend on each channel path remembering to call
  another domain's fence.
- **One fence per channel path** (Wing form, spreadsheet, API). Simplest per
  path, but the guarantee "the same draft is never sent twice to one account"
  would differ by channel.

## Consequences

The Prisma model moves to `channels.prisma` with the table name unchanged;
`productPreparationId` becomes an indexed id without `@relation`
([ADR-0013](0013-cross-owner-references-are-ids-not-foreign-keys.md)), the
account and listing relations stay as intra-owner foreign keys, and the three
`ProductRegistrationExecution` entries leave the cross-owner allowlist. The
execution lifecycle (create, lease, submit, confirm, cancel) is a Channels
interface; the product-pipeline Wing flow, the mall wizard and the extension's
result report all call it. Sourcing reflects candidate state by reading the
Channels execution reader ([ADR-0009](0009-one-ledger-one-reader.md)) and
never writes execution rows. A submission whose payload hash no longer matches
the draft is rejected by Channels, as today. No data moves during the cutover;
only the draft foreign key constraint is dropped.
