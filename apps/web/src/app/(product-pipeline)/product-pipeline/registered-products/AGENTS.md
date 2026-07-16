Consult this document first instead of relying on memorized knowledge.

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
- The existing two-second browser collection status poll progressively
  invalidates channel-listing and product-operations queries whenever the
  server reports a higher published-product count. Completion performs the
  final matching and channel-availability invalidations; do not add a second
  timer or replace the preserved card layout.
- Products owns channel-origin product/variant creation or exact reuse;
  Channels extracts typed evidence and writes final still-null links. Names and
  AI never auto-confirm identity.

## Boundary Rules

- Do not create channel listings outside backend channel APIs.
- Do not merge channel account identity with product/catalog identity in UI
  types.
- Registration handoff actions must preserve backend ownership of marketplace
  submission and validation.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(product-pipeline\)/product-pipeline/registered-products
```
