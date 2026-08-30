# product-hub/matching — Channel Option Recipes

`/product-hub/matching` imports account-scoped Wing/Rocket catalog evidence
and reviews each `ChannelListingOption` against its complete direct Sellpia
component recipe.

## Contract

- React Query owns accounts, queue, candidates, import, and mutation state.
  Recipe replacement invalidates product mappings and channel availability.
- One listing command edits its child option recipes. A saved complete recipe
  derives the nullable listing-level product summary; there is no independent
  product-link confirmation.
- Wing and Rocket share the account-scoped queue. Partial chunks appear without
  absence reconciliation; only a complete snapshot may reconcile missing rows.
- Browser catalog publication preserves existing recipes and product links.
- Automatic matching may fill an empty recipe only from one unique,
  non-conflicting deterministic identity plus verified positive pack quantity.
  Ambiguous, conflicting, alias-only, rank/name/AI, or mismatched pack evidence
  requires operator review.
- Manual replacement accepts active Sellpia identities and positive component
  quantities, sends expected current components, and replaces the whole recipe.
  Never silently merge, flatten a bundle, or overwrite confirmed evidence.
- Channel images and derived product summaries are read-time display values;
  matching never copies them into product metadata.
- Rocket ordering and purchase review remain outside this route.

The backend policy and operator flow authority is
[channel-sellpia-matching.md](../../../../../../../docs/runbooks/channel-sellpia-matching.md).
Focused specs in this directory own status labels, account selection, imports,
evidence review, and optimistic recipe behavior.
