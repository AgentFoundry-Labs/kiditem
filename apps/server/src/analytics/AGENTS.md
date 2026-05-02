# analytics — Reporting / Read-Model Owner Domain

@AGENTS.md

Wave H1 Lane R folded the four reporting / read-model surfaces — `dashboard`,
`statistics`, `traffic`, `supplier-stats` — under a single `analytics` owner
root. The owner-domain shape follows the backend architecture contract in
`apps/server/AGENTS.md`: domain-first modular architecture with selective
hexagonal ports, applied where it removes coupling rather than as a global
dogma.

## Public Routes (preserved)

| Route | Capability |
|---|---|
| `GET /api/dashboard/sales` | dashboard sales summary (today, monthly, top products, monthly trend, range KPI, daily revenue, plan achievement, traffic KPI with optional Wing override) |
| `GET /api/dashboard/ad` | dashboard ad summary (monthly, range KPI, ad KPI, daily ad, industry benchmark, saving, Wing override) |
| `GET /api/dashboard/inventory` | dashboard inventory snapshot (gradeCount, alerts, warnings, gradeChanges, dataFreshness) |
| `GET /api/dashboard/trend` | per-day revenue + ad cost trend (`7d` / `30d` / `90d`) |
| `GET /api/statistics?type=…` | overview / products / categories / delivery / grades / pareto / repurchase |
| `GET /api/traffic/summary` | period traffic summary over `ChannelListingDailySnapshot.traffic*` |
| `GET /api/traffic/monthly` | per-day traffic + KST month aggregate |
| `POST /api/traffic/upload` | operator-driven CSV/XLSX traffic upload (the only mutation lane in this owner) |
| `GET /api/supplier-stats?type=…` | sales / productSales / history per supplier |

## Sub-Domain Layout

| Path | Shape |
|---|---|
| [`dashboard/`](dashboard) | Reconstructed: `adapter/in/http/`, `adapter/out/repository/`, `application/service/`, `helpers/` (pure). All `$queryRaw` lives behind `@Injectable` repository adapters; the prisma-coupled report-hydration helpers (`profit-calculation`, `ad-aggregation`, `wing-ad-summary`) are functions in the same out-adapter lane. |
| [`statistics/`](statistics) | Flat (transitional): `statistics.controller.ts` + `statistics.service.ts` + `dto/`. No raw SQL surface; Prisma findMany/groupBy/aggregate stays in the service. Report aggregation reuses `common/per-listing-profit`. |
| [`traffic/`](traffic) | Flat (transitional): `traffic.controller.ts` + `traffic.service.ts`. Read paths aggregate `ChannelListingDailySnapshot.traffic*`. Ingest path writes daily-fact + `ChannelScrapeRun`/`ChannelScrapeSnapshot` audit rows. |
| [`supplier-stats/`](supplier-stats) | Flat (transitional): `supplier-stats.controller.ts` + `supplier-stats.service.ts` + `dto/`. Pure Prisma reads, chunked `OrderLineItem.optionId` groupBy with organizationId-scoped `order` filter. |

The `dashboard` reconstruction is the priority case for this owner — it has
the only `$queryRaw` calls and the biggest report-hydration surface, so
isolating those into `adapter/out/repository/` matched the contract's "where
appropriate" criterion. The other three are tolerated legacy CRUD-shape
modules per the contract: their flat layout is fine until a concrete
fat-service or repeated-invariant problem appears.

## Tenant Predicate Contract

Every read in this owner binds `organizationId` from `@CurrentOrganization()`:

- ORM paths: `where: { organizationId, ... }` on every tenant-owned table.
- Raw SQL paths (dashboard only): `${organizationId}::uuid` with a
  predicate on each tenant-owned join table (orders, channel_listings,
  master_products) — see `dashboard/adapter/out/repository/*.repository.adapter.ts`.
- 2-hop joins use the predicate on every tenant-owned hop. The `topProducts`
  raw SQL is the canonical example: it asserts `o.organization_id`,
  `cl.organization_id`, and `mp.organization_id` simultaneously.

`@Body()` / `@Query()` `organizationId` injection is banned. The traffic CSV
upload is the only mutation path — it scopes its scrape-run + daily-fact
upserts via the `@CurrentOrganization()` value passed from the controller.

## Cross-Domain Read Dependencies

The analytics owner reads from many other domains' tables but never imports
their services. Reads bypass through Prisma for read-models only, and
mutation authority stays with the canonical owner:

- Orders / OrderLineItem (orders owner) — revenue, line-item aggregation,
  receiver-level repurchase.
- ChannelListing / ChannelListingOption / ChannelListingDailySnapshot /
  ChannelAccountDailyKpiSnapshot / ChannelScrapeRun / ChannelScrapeSnapshot
  (channels owner) — listing metadata + daily-fact source-of-truth.
- MasterProduct / ProductOption (products owner) — master metadata, grade,
  category, pricing inputs.
- Inventory / Alert / GradeHistory / Thumbnail (inventory + ai owners) —
  dashboard inventory snapshot inputs.
- Supplier / SupplierProduct / MasterSupplierProduct / PurchaseOrder /
  SupplierPayment (sourcing/finance owners) — supplier-stats aggregation.
- Shipment (orders owner) — statistics delivery aggregate.

If any of these owners refactors its mutation path or read schema, this
owner's read paths must be re-aligned by the same PR — or the owner-domain
PR must record an explicit compatibility waypoint.

## Rules

- Do not rewrite metrics formulas inside this owner without an explicit
  scoped plan. Wave H1 Lane R was a topology fold, not a correctness rewrite.
- Do not add behavior to dashboard services outside their existing
  `application/service/` orchestration shape. Raw SQL must go through
  `adapter/out/repository/`. New reports for the same sub-domain extend
  those adapters first.
- `ChannelScrapeSnapshot` is audit/debug/replay evidence only. Reporting APIs
  must read product/listing/account daily facts and join product schemas as
  needed; do not derive dashboard/table rows directly from raw snapshot JSON.
- Statistics / traffic / supplier-stats may stay flat until a concrete
  invariant or fat-service driver appears. When one does, follow the
  dashboard pattern (extract raw SQL / report hydration into
  `adapter/out/repository/` and lift orchestration into
  `application/service/`).
- The traffic CSV upload mutation lane stays in `traffic.service.ts` until a
  separate ingest plan moves it. Do not unify it with
  `/api/ads/extension/sync` — the upload is operator-driven, while the
  extension-sync ingest is push-driven from the channels domain.
- No `$queryRawUnsafe` / `$executeRawUnsafe` (root-level reconstruction
  rule). All raw SQL uses Prisma tagged templates.

## Tests

```bash
npm exec --workspace=apps/server -- vitest run \
  src/analytics src/dashboard src/statistics src/traffic src/supplier-stats
```

The legacy directories no longer exist; the remaining historical paths in
that command line stay as a no-op safety net so older CI invocations still
work after this fold.

Real-Postgres integration suites for each sub-domain live under
`__tests__/*.pg.integration.spec.ts` and run via the integration vitest
config. They use `test-helpers/real-prisma` + `test-helpers/finance-seeds`
and cover IDOR isolation on every report path.
