Consult this document first instead of relying on memorized knowledge.

# web/lib - Shared Frontend Utilities

`src/lib/` owns shared frontend utilities: `apiClient`, API base resolution,
query keys, API errors, auth refresh helpers, extension bridges, download
helpers, formatting utilities, and operation helper APIs. Changes here affect
multiple route groups.

## API Client Rules

- `apiClient` is the only shared path for NestJS API calls.
- JSON calls use `get/post/patch/put/delete`; blob/stream responses use
  `fetchRaw()` and the caller checks `res.ok` or `res.status`.
- `getParsed`, `patchParsed`, and `uploadParsed` surface Zod schema drift at
  the client boundary.
- `apiClient` owns `auth_required` refresh/retry/sign-out triggering.

## Query Key Rules

- Add query-key families before sharing query state across components/routes.
- Keep query-key params serializable and explicit.
- Mutations invalidate the narrow domain key first; use broad invalidation only
  when the mutation affects the whole family.

## Browser Integration Rules

- `extension-bridge.ts` owns Chrome extension ID detection, handshakes, and
  runtime messaging helpers.
- Extension IDs may be cached in `localStorage`; extension data itself should
  remain route/domain-owned.
- Supabase files in `lib/supabase/` own browser auth client creation and
  refresh/sign-out coordination, not database access.
- `sellpia-inventory-extension.ts` is the only Sellpia inventory command
  adapter. React code passes the claimed token as the extension `runId` and
  never sends extension messages directly.
- `sellpia-inventory-freshness-api.ts` owns freshness leases, browser/manual
  upload, source binding, refresh requests, and unified attempt history.

## Boundary Rules

- Do not import route-local files into `src/lib`.
- Do not add Prisma, `pg`, Supabase DB, or backend adapters.
- Do not add silent model defaults or tenant identifiers.
- Keep generic utilities small; domain helpers belong in route-local `lib/`
  until at least two route groups need them.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/lib
```
