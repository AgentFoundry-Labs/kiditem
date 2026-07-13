Consult this document first instead of relying on memorized knowledge.

# products — Categories Compatibility Surface

`src/products/` now contains only the `/api/categories` compatibility CRUD.
The former internal catalog, product-option, bundle, stock, and content owners
have been removed.

## Owned Surface

- `/api/categories`

## Final Owners

- Sellpia physical product identity and imported quantity: Inventory
  `MasterProduct`.
- Marketplace product/SKU metadata and component recipes: Channels
  `ChannelListing`, `ChannelListingOption`, and `ChannelSkuComponent`.
- Collected sourcing candidates and product preparation: Sourcing.
- Registered thumbnail/detail content: AI `ContentWorkspace` and its
  generations/revisions.

## Boundary Rules

- Do not restore `/api/products/*`, internal product-option CRUD, bundle stock,
  or product-owned stock fields in this directory.
- Category controllers receive `organizationId` from
  `@CurrentOrganization()` and never accept tenant identity from the client.
- New category behavior stays under `categories/`; other product workflows go
  to their final owner domain.
