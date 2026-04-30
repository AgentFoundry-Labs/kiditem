# TODOS

Cross-cutting deferred work only. Completed migration notes and historical
plans belong in dated release notes or `docs/superpowers/`, not here.

---

## Production Auth — Replace Panel SSE Dev Header

**Context**: `apps/web/src/components/panel/lib/panel-sse-client.ts` currently
talks to `DevAuthMiddleware` with `x-dev-user-id`. Once production auth lands,
Panel SSE must use the same token/cookie mechanism as the rest of the app.

**Depends on / blocked by**:

- JWT/session issuance and validation in `apps/server/src/auth/`
- A matching frontend session/token storage strategy
- CORS credential policy if cookie auth is selected

**Acceptance**:

- [ ] `PanelSseClient.connect()` no longer injects `x-dev-user-id`
- [ ] SSE auth uses the chosen production auth mechanism
- [ ] Token expiry/refresh and SSE reconnect behavior are defined
- [ ] Panel SSE tests assert the production auth path

**Refs**:

- `apps/web/src/components/panel/lib/panel-sse-client.ts`
- `apps/server/src/auth/`

---

## Agent/Workflow Product Actions — Canonical Write Contract

**Context**: Product read paths were moved to the master/option catalog
contract, but product write actions remain intentionally unwired in the product
detail UI and in automation action seeds. The canonical write contract should
distinguish master-level writes from option-level writes and handle
multi-option selection explicitly.

Current state:

- `apps/web/src/app/(catalog)/products/[id]/hooks/useProductActions.ts` renders
  product actions but shows "기능 준비 중" for `product.*` write actions.
- `apps/server/src/automation/domain/policy/action-seeds.ts` still seeds
  product-adjacent action-board API calls through compatibility endpoints such
  as `/api/products/calculate-grades`.
- `apps/server/src/products/adapter/in/http/products-legacy.controller.ts`
  keeps compatibility read/calculation routes, including
  `POST /api/products/calculate-grades`.

**Acceptance**:

- [ ] Product detail actions call canonical endpoints:
  `/api/products/masters/:id` for master-level fields and
  `/api/products/options/:optionId` for SKU-level fields
- [ ] Multi-option masters require an explicit option picker before option
  writes; single-option masters can auto-select
- [ ] `stop_ads` semantics are decided (`adTier: 'off'` vs `null`) and server
  counts stay consistent
- [ ] Automation/action-board seeds stop depending on stale product write
  aliases
- [ ] Legacy product controller stays read/calculation compatibility only

**Refs**:

- `apps/web/src/app/(catalog)/products/[id]/hooks/useProductActions.ts`
- `apps/server/src/automation/domain/policy/action-seeds.ts`
- `apps/server/src/automation/application/service/action-board.service.ts`
- `apps/server/src/products/adapter/in/http/products-legacy.controller.ts`

---

## ProductCatalogService.counts — SQL Aggregation

**Context**: `ProductCatalogService.counts()` currently loads filtered master
rows through `findCatalogCountsRows()` and counts categories in memory. This is
acceptable at current local scale but should become SQL aggregation before the
catalog grows substantially.

**Acceptance**:

- [ ] Replace `findCatalogCountsRows()` with SQL/Prisma aggregation for
  `abcGrade`, `adTier`, `pipelineStep`, and `isTemporary`
- [ ] Preserve `ProductCatalogCountsSchema` response shape
- [ ] Keep `/api/products/catalog/counts` and compatibility
  `/api/products/pipeline-stats` behavior stable

**Refs**:

- `apps/server/src/products/application/service/product-catalog.service.ts`
- `apps/server/src/products/adapter/out/prisma/product-catalog.query.ts`
- `apps/server/src/products/mapper/product-catalog.mapper.ts`

---

## originalImageBase64 — CDN Allowlist

**Context**: `MastersService.originalImageBase64()` has minimum SSRF defense:
http(s) only and private/loopback/link-local/cloud metadata host blocking.
It still allows arbitrary public hosts.

**Acceptance**:

- [ ] Add configurable CDN/domain allowlist
- [ ] Reject non-allowlisted image hosts before fetching
- [ ] Consider reusing the allowlist for master image write validation
- [ ] Document DNS rebinding / TOCTOU posture

**Refs**:

- `apps/server/src/products/application/service/masters.service.ts`
- `apps/server/src/products/domain/policy/public-image-url.ts`
