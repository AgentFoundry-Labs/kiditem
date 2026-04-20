# Plan D.3b — statistics / settlements / sales-plans live aggregation (stub)

> **Stub plan** — D.3a (sales-analysis) merged. Full plan body 는 next session 에서 D.3a 패턴 재사용으로 작성.

## Scope (TODO in next session)

3 services + 3 pages to migrate from `profitLoss.groupBy` reads to live aggregation:

| Service | Profit-loss calls | Consumer page |
|---|---|---|
| `statistics.service` | 5 profitLoss calls | `Statistics.tsx` |
| `settlements.service` | profitLoss reconcile | `Settlements.tsx` |
| `sales-plans.service` | profitLoss aggregate | `SalesPlans.tsx` |

All 3 services read the empty `ProfitLoss` table (ADR-0016 § Scope boundaries), producing 0-valued responses. Migration unlocks meaningful UI data.

## Pattern reuse from D.3a

- **Live aggregation**: Order + OrderLineItem + OrderReturnLineItem + Ad.groupBy (3-query Promise.all)
- **3-hop IDOR** (`companyId` at 3 layers on return path)
- **ADR-0017 returnRate** semantic (if applicable per service)
- **`apiClient.getParsed` + URL period + 3-state** frontend pattern (D.1 T8 / D.3 T5)
- **Shared test helpers**: `apps/server/src/test-helpers/finance-seeds.ts` (Plan D.3 T0 extract)

## Estimated scope

12-18 tasks, 2-3 day execution (3 services × ~5 tasks + 3 pages × ~2 tasks + verification). Possibly split into D.3b (services + 2 pages) + D.3c (remaining page) if too large.

## Review cadence (per feedback_review_cadence memo)

- Service rewrite: 2-stage
- Unit test: 2-stage
- PG integration: 2-stage
- Frontend page rewire: 2-stage
- RTL test: 1 combined
- Schemas (docs/trivial): 1 combined
- Verification: none

## Dependencies

- D.3a merged (shared schemas pattern, finance-seeds helpers, service rewrite pattern proven)
- No further ADR needed — ADR-0016 (ProfitLoss bypass) + ADR-0017 (returnRate) cover all 3 services

## Placeholders (fill in next session)

- [ ] Current state of each service: enumerate methods + profitLoss call sites
- [ ] Frontend page field mappings (current inline TS → shared Zod)
- [ ] Per-service Zod schemas needed (statistics already has some — audit)
- [ ] SortableHeader adoption candidates (Settlements has custom `SortTh`)
- [ ] Integration test cases per service
- [ ] Release note scope (may amend D.3a's or create new)

## Follow-up after D.3b

- Remaining ProfitLoss readers: ad-strategy (Plan E), dashboard-inventory (D.4), dashboard-trend (D.4), action-task × 2 (D.5)
- Plan E ADR-0018 integrated audit — update ADR-0016 § Scope boundaries status

## Reference

- Plan D.3a: `docs/superpowers/plans/2026-04-20-plan-d3-sales-analysis-live.md`
- ADR-0016: `.claude/docs/decisions/0016-profit-loss-live-aggregation.md` (§ Scope boundaries lists 7 remaining readers post-D.3a — 3 resolved by D.3b)
- ADR-0017: `.claude/docs/decisions/0017-returnrate-semantic-unification.md`
