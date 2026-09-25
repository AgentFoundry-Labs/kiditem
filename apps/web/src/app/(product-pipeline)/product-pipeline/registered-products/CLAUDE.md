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
- 상품 받기 is the account's shared collection control over the operation
  reader (`lib/wing-catalog-collection.ts`, `GET /api/operations` for the three
  Wing catalog kinds, KID-354). It starts the list kind through the extension
  (`operation.start`), polls every two seconds only while an operation runs,
  reports each finished operation's own result (never a whole-catalog
  completion for a one-product refetch), and invalidates listing,
  product-operations, mapping, and availability queries when one succeeds.
  상세 다시 받기 on a Wing listing card starts the details kind for that one
  product.
- Products owns channel-origin product/variant creation or exact reuse;
  Channels extracts typed evidence and writes final still-null links. Names and
  AI never auto-confirm identity.

## Boundary Rules

- Do not create channel listings outside backend channel APIs.
- Do not merge channel account identity with product/catalog identity in UI
  types.
- Registration handoff actions must preserve backend ownership of marketplace
  submission and validation.
