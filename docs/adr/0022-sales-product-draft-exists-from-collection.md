---
status: accepted
---

# Sales product drafts exist from collection

Keeping a sourcing candidate and a sales product for the same item duplicated edit authority and required promote, demote and lazy-creation paths, so a Channels-owned sales product exists as a draft from the moment an item is collected or authored, with option prices nullable until confirmed, and every preparation step (basics, images, thumbnail, detail page, price) edits that draft. The sourcing candidate keeps only immutable source facts (URL, platform, external id, raw payload, cost, collected images) and sourcing judgments; it carries no edit values and owns no content workspace. This replaces the candidate-as-optional-source and price-before-creation rules of [ADR-0020](0020-channels-owns-reusable-registration-targets.md), whose registration-target ownership and single submission fence remain.

## Consequences

KID and option codes are issued when a selling decision first needs them (the product's registration target, a bulk-sheet file, or direct authoring; Sabangnet imports keep their own code), so collected drafts carry no code until then. A product has at most one active registration target per marketplace account; a promotional listing of the same item is a separate sales product sharing the same source stock through confirmed recipes. Registration, mall sheets and stockout require a confirmed price and refuse drafts. Content workspaces are owned by the sales product or by a channel-listing branch, and AI references to Sourcing become scalar ids validated through owner contracts.
