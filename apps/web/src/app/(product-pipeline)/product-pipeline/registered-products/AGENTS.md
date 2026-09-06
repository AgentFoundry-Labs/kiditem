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
- Poll owner collection status every two seconds. Show staged-detail progress
  separately from publication; invalidate listing, product-operations, mapping,
  and availability queries once the owner confirms the whole catalog commit.
  Preserve the card layout and reuse the existing poll.
- Products owns channel-origin product/variant creation or exact reuse;
  Channels extracts typed evidence and writes final still-null links. Names and
  AI never auto-confirm identity.

## Boundary Rules

- Do not create channel listings outside backend channel APIs.
- Do not merge channel account identity with product/catalog identity in UI
  types.
- Registration handoff actions must preserve backend ownership of marketplace
  submission and validation.
