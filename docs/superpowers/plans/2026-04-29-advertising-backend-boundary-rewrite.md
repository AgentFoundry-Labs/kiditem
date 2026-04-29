# Advertising Backend Boundary Rewrite Plan

Parent plan: `docs/superpowers/plans/2026-04-28-codebase-reconstruction.md`

Scope: Phase 3 backend hardening for `apps/server/src/advertising/**` only. No frontend, shared, Prisma, dependency purge, or unrelated business-domain changes.

## Risk Map

- `ad-action.service.ts`: raw SQL joins must scope every tenant-owned table by `company_id`; lifecycle updates must use caller `companyId`; relation hydration for `listing`, `masterProduct`, and daily target rows must not pull cross-tenant rows through includes.
- `advertising.service.ts`: `changeTier` writes through `masterProduct`; listing summary hydration must confirm the listing and master both belong to the caller company.
- `ad-campaigns.service.ts`: campaign/trend reads use listing and master metadata; relation includes must not bypass tenant ownership on the second hop.
- `ad-sync.service.ts`: scrape target mutation paths and channel listing option hydration must include caller `companyId` in write predicates and lookup predicates.
- `ad-benchmark.service.ts` and strategy helpers: 2-hop listing -> master/option/inventory hydration must perform explicit scoped lookups.
- `ad-execution.service.ts`: lease/report/heartbeat mutations must use caller company scope; worker conflict checks must not trust task relation includes.

## Plan

1. Add focused unit tests for cross-tenant failure modes around action lifecycle writes, listing/master hydration, scrape target writes, execution report writes, and campaign/strategy 2-hop reads.
2. Replace relation include hydration on tenant-owned second-hop records with explicit `findMany`/map joins scoped by `companyId`.
3. Replace bare or relation-only mutating writes with `updateMany` predicates that include caller company scope and fail on `count === 0`.
4. Check raw SQL joins manually so each tenant-owned table has its own `company_id` predicate.
5. Run IDOR scanner, tenant-scope scanner, server build, advertising unit tests, advertising real Postgres integration tests, Nest boot check, and diff whitespace check.

## Out Of Scope

- Phase 4 frontend rewrite and any `apps/web` consumer changes.
- Phase 5 dependency purge or Vitest alias/config cleanup outside advertising tests.
- Prisma schema, `init.sql.gz`, shared package exports, or cross-domain service rewrites.
