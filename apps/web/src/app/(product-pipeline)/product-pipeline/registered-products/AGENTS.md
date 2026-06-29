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

## Boundary Rules

- Do not create channel listings outside backend channel APIs.
- Do not merge channel account identity with product/catalog identity in UI
  types.
- Registration handoff actions must preserve backend ownership of marketplace
  submission and validation.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(product-pipeline\)/product-pipeline/registered-products
npm run build --workspace=apps/web
```
