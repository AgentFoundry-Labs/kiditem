Before working in this directory, always read this document first rather than relying on memory.

# web/registered-products - Confirmed Channel Listings

`registered-products/` owns registered product/channel listing views, content
workspace navigation, confirmed listing APIs, and marketplace registration
handoff screens.

## State Rules

- Use route-local `lib/channel-listings-api.ts` for `/api/channels/listings*`
  calls.
- Keep listing navigation and workspace projection helpers pure and tested.
- Use `queryKeys.channelListings` and `queryKeys.contentWorkspaces` for shared
  server state.
- 상품 받기 is the account's shared collection control over the owner source
  read (`lib/coupang-catalog-collection.ts`). It polls every two seconds while
  the import runs, shows staged-detail progress separately from publication,
  and invalidates listing, product-operations, mapping, and availability
  queries once the whole import completes.
- Products owns channel-origin product/variant creation or exact reuse;
  Channels extracts typed evidence and writes final still-null links. Names and
  AI never auto-confirm identity.

## Boundary Rules

- Do not create channel listings outside backend channel APIs.
- Do not merge channel account identity with product/catalog identity in UI
  types.
- Registration handoff actions must preserve backend ownership of marketplace
  submission and validation.
