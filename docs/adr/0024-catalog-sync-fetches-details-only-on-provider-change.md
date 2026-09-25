---
status: accepted
---

# Catalog sync fetches listing details only when the provider reports a change

A full Coupang Wing seller-catalog collection took about an hour because it re-fetched every listing's detail document one request at a time, although the list endpoint returns every listing with price, stock, status and the provider's `modifiedOn` in three requests, and `modifiedOn` moves when the seller edits a listing. Channels therefore reads the complete listing list on every sync, fetches detail documents only for new listings, listings whose provider modification time changed and listings without a stored detail, and takes provider-side catalog attribute changes, which `modifiedOn` does not reflect, from an operator-requested provider catalog export merged into the stored listing. There is no periodic full detail sweep, and the Coupang Open API stays out of the collection path.

## Consequences

Detail completion is scoped to the sync's target set rather than the whole listing list. The list, detail and export writers each own a schema-validated section of `ChannelListing.rawJson` and never replace another writer's section; `attributesJson` keeps purchase and search attributes per kind with their provider attribute ids. No columns are added: a stored value becomes a column only when SQL filters, joins, orders or aggregates on it, another owner or screen reads it as a business fact, it needs a database constraint, or it is KidItem-derived state, which is why detail hashes are computed on comparison and not stored.

A listing missing from a complete list is recorded as deleted only when the provider's deleted-listing search returns it; otherwise it stays active and the run reports it as unconfirmed. Provider changes to images, descriptions, notices or certifications that do not move `modifiedOn` are not detected; operators can re-fetch one listing, and a rotating re-check is added only if such changes are observed.
