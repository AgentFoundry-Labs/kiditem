# Plan IDOR Sweep — dashboard-trend + wing-ad-summary + dashboard-ad residual IDORs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 3 residual IDOR leaks in the dashboard domain identified during Plan D.1/D.2/D.3 reviews. Every DB-touching call in `apps/server/src/dashboard/services/` and helpers must filter by `companyId` either via Prisma relation filter or `$queryRaw ${companyId}::uuid` binding. Codify the rule as ADR-0018 so no `$queryRaw` future-regresses.

**Architecture:** Three distinct fixes share one ADR. (1) `dashboard.controller.ts:47-50` `@Get('trend')` currently takes no companyId; we thread `@CurrentCompany()` through `DashboardTrendService.getTrend(companyId, range)` and add predicate to all 3 internal queries (1 Prisma aggregate, 2 `$queryRaw`). (2) `dashboard/helpers/wing-ad-summary.ts` signature gains `companyId` as 2nd parameter — caller at `dashboard-ad.service.ts:67` already has `companyId` in scope, threading is trivial. (3) `dashboard-ad.service.ts:49-57` `dailyAdRows` $queryRaw adds `AND company_id = ${companyId}::uuid`. Each fix lands with a dedicated `*.pg.integration.spec.ts` proving cross-company isolation using the canonical 2-tenant fixture at `apps/server/src/test-helpers/real-prisma.ts`.

**Tech Stack:** NestJS 11 + Prisma 7 (+ `PrismaPg` adapter) + `$queryRaw` tagged templates + Vitest integration runner (`npm run test:integration` — PG on :5434, tmpfs, per-test TRUNCATE CASCADE). ADR format per `.claude/docs/decisions/README.md`.

**Spec linkage:** Plan D.1 final review + Plan D.2 memo + handoff memo `project_next_session_handoff.md`. Known since 2026-04-20. Already in scope of ADR-0006 (authenticated company scope) — ADR-0018 refines "every `$queryRaw` + helper must bind companyId explicitly."

**Co-scheduled plan:** This branch (`feat/plan-e1-idor-sweep`) also contains `docs/superpowers/plans/2026-04-21-plan-e1-coupang-pages-boost.md`. Execute E.1 first (pure frontend), then this (pure server). Zero file overlap; merging in either order is safe but deterministic ordering aids reviewer context.

---

## v2 Review Findings Applied (2026-04-21)

Per critic + architect + consolidated (eng+ceo+design) 5-reviewer pass. **Executor MUST follow the deltas in this section even where Task body text below may still reference v1 structure.**

### Scope expansion (CRITICAL)

**C-01 (critic) / A-05 (architect)** — `dashboard-inventory.service.ts` has **8 Prisma queries with zero `companyId` filter** (`masterProduct.groupBy`, `alert.findMany`, `masterProduct.count`, `profitLoss.findMany`, `inventory.findMany`, `gradeHistory.findMany`, `thumbnail.count`, `masterProduct.findMany`) + controller `getInventory` at `dashboard.controller.ts:40-44` lacks `@CurrentCompany()`. This is an ACTIVE IDOR exposing all tenants' inventory/alerts/grades/thumbnails. **Same controller file as T2.** The plan's claim of "dashboard domain 전수 커버" is false without this.

**Action**: Add new **T4 — dashboard-inventory IDOR fix** between the existing T3 (wing-ad-summary + dashboard-ad) and T4 (audit → now T5). Renumber old T4 audit task to T5.

New T4 scope:
1. Edit `dashboard.controller.ts:40` — add `@CurrentCompany() companyId: string` to `getInventory`. Pass to `getSummary(ctx, companyId)`.
2. Edit `dashboard-inventory.service.ts` — change signature to `getSummary(ctx, companyId: string)`. Add `where: { companyId }` to ALL 8 queries (Prisma `findMany` / `count` / `groupBy`). For `masterProduct.findMany` with `include: { listings }` — the listings join ALSO needs `where: { companyId }` for 2-hop defense (per ADR-0018 Rule 3 + ADR-0017 precedent).
3. Seed fixture + integration test (new `apps/server/src/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts`): 2-tenant fixture, assert TEST sees no OTHER sentinel values across all 8 aggregations.

**M-02 (critic)** — `dashboard.controller.ts:25-29` `getSales` also missing `@CurrentCompany()`. Service currently throws `Not implemented` so inert, but latent IDOR. **Fold into T2** (since same controller file edit): add `@CurrentCompany() companyId: string` to `getSales` and update the service stub signature to accept it (throw unchanged). 2-line preemptive fix.

### Test correctness (CRITICAL)

**C-02 (critic)** — Test seeds create `prisma.ad.create({ ... })` without `listingId`, but `Ad.listingId` is `String @db.Uuid` (REQUIRED non-null per `prisma/models/advertising.prisma:7`). Every integration spec in this plan will fail at seed time with "Missing required field listingId."

**Action**: In all 3 new `*.pg.integration.spec.ts` files (T2 + T3 + new T4), restructure `seedTwoCompanies()` / `seedAdsTwoCompanies()`:
1. Create `MasterProduct` per company FIRST.
2. Create `ChannelListing` per company (references masterProduct).
3. Create `Ad` with `listingId: listingT.id` / `listingO.id`.

Plan T2.4 already has this chain for `profitLoss.listingId` — extend it to cover Ad creation order.

### Test assertion rigor (MAJOR)

**M-01 (critic)** — Current assertions use only `expect(row.revenue).toBeLessThan(999_000_000)` sentinel checks. A partial leak (sum of TEST + OTHER smaller values) can slip through.

**#12 DEX (consolidated)** — Sentinel `999_999_999` is magic; name it.

**Action**:
1. Add to `apps/server/src/test-helpers/real-prisma.ts`: `export const IDOR_SENTINEL = 999_999_999;`
2. All assertions in the 3 integration specs use the constant: `expect(row.adCost).not.toBe(IDOR_SENTINEL);` plus **positive** value assertions: `expect(testRow?.adCost).toBe(500);` (matches the exact TEST-seed value).

### ADR-0018 enforcement (MAJOR)

**#11 DEX (consolidated) / A-03 (architect)** — Rule 4 (CI grep gate) deferred to "post-plan Plan" contradicts root CLAUDE.md "No follow-up issues." Also, the regex `(?!company_id)` lookahead is unsound for multi-line SQL.

**Action**: Expand T5 (audit) to include implementation of a minimal grep-based enforcement script:
1. Create `scripts/check-queryraw-tenancy.sh` — uses `rg` (ripgrep), not `grep -Pzn` (see #3 ENG).
2. Script scans `apps/server/src/**/*.ts` (excluding `__tests__`, `*.spec.ts`) for `$queryRaw` tagged templates, then for each hit file checks whether `company_id` appears within 30 lines of the `$queryRaw` site.
3. Exit 1 if any site is missing `company_id` binding.
4. Wire into `package.json` `check:idor` script: `"check:idor": "./scripts/check-queryraw-tenancy.sh"`.
5. Add the script invocation to ADR-0018 Rule 4 body as the reference implementation (replaces the unsound regex).

No CI workflow wiring in this plan (that's a separate Plan — still deferred), but the script itself ships in-plan.

**#3 ENG (consolidated)** — Replace any `grep -Pzn` examples in plan with `rg -U --multiline` (macOS grep is BSD, doesn't support -P or -z).

### Cross-domain audit kill-switch (MEDIUM)

**A-04 (architect)** — T5 audit will find 2 known cross-domain leaks: `ontology/ontology.service.ts:13` (master_products query, no companyId) + `traffic/traffic.service.ts:280,383` (traffic_stats queries, no companyId). ADR-0019 session-boundary rule still forbids fixing those unrelated business domains here.

**Action**: T5 audit step MUST explicitly:
1. Run the new `check:idor` script.
2. Any findings in OTHER domains (ontology/traffic/etc.) get recorded in ADR-0018 Consequences section under a new `## 미준수 목록` heading — file path + line + "도메인별 후속 Plan 대상" annotation.
3. Only dashboard-domain findings get fixed in this Plan (since this Plan's scope is dashboard).
4. This preserves "No follow-up issues" (findings are recorded, not silently lost) while respecting "One business domain per session."

### Release note + compliance (MAJOR)

**#7 CEO (consolidated)** — Security-relevant fix lacks a release note. D.2/D.3 pattern established per-plan release notes.

**#8 CEO (consolidated)** — Multi-tenant IDOR of this scale (3 + dashboard-inventory = 4 sites, cross-tenant aggregates) is a compliance-relevant event.

**Action**: Expand T5 with a release note task:
1. Create `docs/release-notes/2026-04-dashboard-idor-sweep.md` — references ADR-0018, names the 4 fixed sites, notes "pre-fix dashboard/trend + dashboard/ad + dashboard/inventory KPIs may have been inflated by cross-tenant aggregation in multi-tenant deployments."
2. Optional staging/prod log audit — **document** intent only (not executable in-plan): "Check when dashboard/trend + dashboard/inventory endpoints became reachable in staging; approximate tenant count that may have seen polluted numbers. Append summary to release note after audit."

### Enforcement-by-signature (MINOR)

**#15 ENG (consolidated)** — No explicit guard against `@CurrentCompany()` returning `undefined`. Today the decorator throws `UnauthorizedException` on missing `req.authUser.companyId`, so the service-entry guard is redundant. Document the defense-in-depth at the service level is unnecessary — the decorator alone is sufficient.

**Action**: No code change. Add one-line comment to ADR-0018 Enforcement section: "서비스 진입점에서 재검증 불필요 — `@CurrentCompany()` 데코레이터가 auth guard + companyId null-check 보장 (ADR-0006 `currentCompanyFactory`)."

### Logger cleanliness (MEDIUM)

**#2 ENG (consolidated)** — T2.2 rewrites dashboard-trend.service.ts keeping unused `Logger` field.

**Action**: Either (a) add `this.logger.debug({ msg: 'dashboard-trend.getTrend', companyId, range, days, rowCount: orderRows.length })` at end of getTrend for observability, or (b) drop the `Logger` import + field entirely. Prefer (a) — observability aids future IDOR regression detection.

### ADR frontmatter (LOW)

**#10 DEX (consolidated)** — `affects: apps/server` is coarse. Since the 4 fixed sites are all in `apps/server/src/dashboard`, narrow the frontmatter to `apps/server/src/dashboard` AND add a body note: "Rules 1-3 정책은 apps/server 전역 적용; 본 ADR 의 concrete fix 는 dashboard 도메인."

### Findings acknowledged but not applied (with rationale)

- **#4 ENG (fetchWingAdSummary 5-arg signature)** — Options object refactor is a separate concern. 5 positional args is borderline but manageable with JSDoc. Skip.
- **#6 ENG (ProfitLoss.aggregate full-lifetime scan)** — Pre-existing semantic. Fixing requires re-deciding "avgProfitRate" meaning. Out of scope for IDOR sweep. Document in ADR as "inherited semantic; re-examine in future finance plan."
- **A-02/A-10 (Rule 1 gray zone + Rule 3 lineage wording)** — ADR text polish. Apply only if easy; otherwise defer.

---

## Review Cadence (per memory `feedback_review_cadence.md`)

| Task type | Review |
|---|---|
| T1 (ADR-0018, docs) | 1 combined spec+quality review |
| T2 (dashboard-trend service + controller + integration test) | 2-stage (spec + code quality) |
| T3 (wing-ad-summary + dashboard-ad dailyAdRows + integration tests) | 2-stage |
| T4 (repo-wide $queryRaw audit + verification) | no review — self-evidencing |

Per-task review: dispatch `code-reviewer` subagent (read-only) with specific focus. Spec reviewer: "did the fix fully cover the specified IDOR surface?" Quality reviewer: "any regressions, inefficient query plans, or type drift?"

---

## Files touched (12 files total)

### Created

- `.claude/docs/decisions/0018-dashboard-idor-sweep-raw-sql-tenancy.md` — NEW ADR
- `apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts` — NEW
- `apps/server/src/dashboard/__tests__/dashboard-ad.pg.integration.spec.ts` — NEW
- `apps/server/src/dashboard/__tests__/wing-ad-summary.pg.integration.spec.ts` — NEW

### Modified

- `apps/server/src/dashboard/dashboard.controller.ts` — add `@CurrentCompany()` to `getTrend` (L47-50)
- `apps/server/src/dashboard/services/dashboard-trend.service.ts` — accept `companyId`; fix 3 queries
- `apps/server/src/dashboard/helpers/wing-ad-summary.ts` — add `companyId` param; fix 2 queries
- `apps/server/src/dashboard/services/dashboard-ad.service.ts` — pass `companyId` to helper (L67); fix dailyAdRows raw SQL (L49-57)
- `.claude/docs/decisions/README.md` — add row for ADR-0018

### Schema/test fixture

- No schema change — `Ad.companyId`, `AdSnapshot.companyId`, `Order.companyId`, `ProfitLoss.companyId` all non-null already.
- Existing `test-helpers/real-prisma.ts` `TEST_COMPANY_ID` / `OTHER_COMPANY_ID` / `seedBaseFixture` sufficient.

---

## Task 1 — ADR-0018: Dashboard IDOR sweep + $queryRaw tenancy rule

**Files:**
- Create: `.claude/docs/decisions/0018-dashboard-idor-sweep-raw-sql-tenancy.md`
- Modify: `.claude/docs/decisions/README.md` (index row + By Domain)

**Context for the ADR body:** ADR-0006 (Authenticated company scope) established that `companyId` must come from `@CurrentCompany()`. However, its enforcement surface is per-controller. Three residual bugs slipped through because: (a) one controller method never took the decorator (`@Get('trend')`), (b) one helper function was written without a `companyId` parameter so callers had no slot to thread it through, (c) one `$queryRaw` inside a decorator-ed service was added later without the tenancy predicate. ADR-0018 codifies the stricter rule: **every DB-touching helper or $queryRaw must bind `companyId` in its predicate**, and introduces a grep-based CI gate.

- [ ] **Step 1.1: Write the ADR**

Create `.claude/docs/decisions/0018-dashboard-idor-sweep-raw-sql-tenancy.md`:

```markdown
---
id: 0018
title: Dashboard IDOR Sweep + $queryRaw Tenancy Guarantee
status: Accepted
date: 2026-04-21
supersedes: []
superseded-by: null
affects:
  - apps/server
---

# ADR-0018: Dashboard IDOR Sweep + $queryRaw Tenancy Guarantee

**Related**: [ADR-0006](0006-authenticated-company-scope.md) (Authenticated company scope), [ADR-0009](0009-no-queryraw-unsafe.md) ($queryRawUnsafe 금지)

## Context

ADR-0006 은 컨트롤러 계층에서 `@CurrentCompany()` 경유로 `companyId` 주입을 강제한다. 그러나 Plan D.1/D.2/D.3 리뷰 과정에서 **3건의 residual IDOR** 가 발견됨:

1. **`dashboard.controller.ts:47-50` `@Get('trend')`** — 해당 메서드만 `@CurrentCompany()` 누락. 같은 컨트롤러의 다른 메서드(`getAd` at L31-38)는 정상 주입. Copy-paste 시점에 빠짐.
2. **`dashboard/services/dashboard-trend.service.ts`** — 3개 쿼리 (`profitLoss.aggregate` + 2× `$queryRaw` on `orders`/`ads`) 모두 companyId 필터 없음. 결과: 모든 테넌트의 집계를 반환.
3. **`dashboard/helpers/wing-ad-summary.ts:23-72`** — 헬퍼 signature 자체에 `companyId` 파라미터 없음 → `$queryRaw` on `ad_snapshots` + `adSnapshot.findFirst({ where: { source: 'wing' } })` 둘 다 글로벌 조회. 타 테넌트 wing snapshot 이 더 긴 `period` 를 가지면 현재 테넌트 월별 adRevenue/adSpend 가 덮어쓰여짐.
4. **`dashboard-ad.service.ts:49-57` `dailyAdRows`** — `aggregateAdForRange` 헬퍼 (ADR-0006 컴플라이언트) 와 같은 파일 안 raw SQL 이 companyId 누락. 서비스 시그니처는 `companyId` 받지만 쿼리 내부에 바인딩 안 됨.

공통 원인: **헬퍼/raw SQL 이 컨트롤러 계층 방어선 밖** 에 있으면, ADR-0006 만으로는 강제되지 않음. 타입이 없으므로 TypeScript 가 도와주지 못하고, review 만이 유일한 방어선.

## Decision

### Rule 1 — 모든 DB-touching 헬퍼는 `companyId` 를 파라미터로 명시

프로젝트 내 `apps/server/src/**/helpers/*.ts` 또는 service 외부 함수는 Prisma 호출 또는 `$queryRaw` 사용 시 **반드시** `companyId: string` 을 함수 시그니처에 명시한다. Caller 가 값을 갖고 있든 없든 헬퍼 쪽이 요구하는 형태.

**예외**: 완전히 테넌시 무관한 헬퍼 (예: `percent.ts`, `kst.ts` 같은 순수 계산). DB 조회가 1건이라도 있으면 companyId 필수.

### Rule 2 — 모든 `$queryRaw` 는 `WHERE ... = ${companyId}::uuid` 바인딩 포함

`apps/server/src/**/*.service.ts` + `apps/server/src/**/helpers/*.ts` 안의 모든 `$queryRaw` 템플릿은 `company_id = ${companyId}::uuid` 를 `WHERE` 절에 포함한다. 예외 없음. JOIN 하는 경우 각 JOIN 대상 테이블의 `company_id` 도 바인딩 (2-hop / 3-hop defense).

이미 확립된 canonical pattern (`channel-dashboard.service.ts:96-106`):

~~~ts
const rows = await this.prisma.$queryRaw<Row[]>`
  SELECT ...
  FROM orders o
  JOIN order_line_items oli ON oli.order_id = o.id
  WHERE o.company_id = ${companyId}::uuid
    AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
`;
~~~

### Rule 3 — Prisma relation filter 에서도 2-hop/3-hop companyId

Nullable foreign key 가 있는 모델 (예: `OrderReturn.orderId`) 을 JOIN 할 때 FK 경로의 각 레벨에 `companyId` 명시 (ADR-0017 에서 이미 확립). INNER JOIN 을 강제하여 cross-tenant nullable 경로 차단.

~~~ts
prisma.orderReturnLineItem.findMany({
  where: {
    companyId,                      // level 1
    return: {
      companyId,                    // level 2
      order: {
        companyId,                  // level 3
        orderedAt: { gte, lt },
      },
    },
  },
});
~~~

### Rule 4 — CI grep gate (후속 작업, 본 ADR 에서 정의)

서버 PR 파이프라인에 아래 grep 체크 추가 (구현은 Plan 별도):

~~~bash
# fails CI when any $queryRaw template in services/helpers lacks company_id binding
! grep -rPzn '\$queryRaw[\s\S]*?FROM[\s\S]*?(?!company_id).*?(WHERE|LIMIT|ORDER)' \
    apps/server/src --include="*.service.ts" --include="helpers/*.ts"
~~~

(규정을 먼저 락인. 도구 구현은 후속 작업 — Plan E 이후.)

## Consequences

**긍정**

- 3건 residual IDOR 닫음. dashboard domain 전수 커버.
- 향후 헬퍼 추가 시 `companyId` 누락이 신호 (signature level).
- `$queryRaw` 새 작성 시 pattern 검색으로 (channel-dashboard.service.ts 레퍼런스) 자동 모방.

**부정**

- Rule 1 은 기존 헬퍼 중 미준수 건 refactor 필요할 수 있음 (이 Plan 은 `wing-ad-summary` 만 대상 — 전체 `apps/server/src/**/helpers/` 는 별도 audit 에서).
- Rule 4 는 regex 기반 단순 탐지 — false positive/negative 가능. 운영 중 tuning 예상.
- `test-integration` 소요 시간 증가 — 3건 새 spec file 추가 (각 3-5 it() blocks).

**따라오는 제약**

- 새 서버 도메인 추가 시 `helpers/` 디렉토리의 DB 관련 파일은 companyId 시그니처 리뷰 포인트.
- `channels/CLAUDE.md:153-167` 이미 유사 규칙 ("$queryRaw 에 string concat 금지, parameterized ${companyId}::uuid 사용"). ADR-0018 이 전역화.
- 뒤집으려면 새 ADR 필요.

## Enforcement

- 본 Plan 에서 대상 3건 닫고 integration test 로 cross-company isolation 증명.
- Plan E.1 + IDOR sweep 병합 직후 `grep -rn "\\\$queryRaw" apps/server/src` 실행하여 모든 결과가 `company_id` 포함임을 수동 확인.
- Rule 4 의 CI 게이트 구현은 별도 Plan (본 ADR 에서 트리거만 락인).

## Related

- ADR-0006 — Authenticated company scope (컨트롤러 계층)
- ADR-0009 — No $queryRawUnsafe (string concat 금지)
- ADR-0017 — returnRate 2-hop IDOR pattern (Rule 3 근거)
- `apps/server/src/channels/CLAUDE.md` — channels 도메인 기존 rule
- Plan E.1 + IDOR sweep — 실행 플랜
```

**Note on code fences:** The ADR body uses `~~~` (tilde) fences for inner TS/bash blocks so the outer triple-backtick markdown fence in this plan is preserved. When copying into the ADR file, convert the `~~~` to `` ``` `` (standard triple-backtick) for canonical rendering.

- [ ] **Step 1.2: Update ADR README index**

Edit `.claude/docs/decisions/README.md`:

At line 127 (after ADR-0017 row in the main index table), add:

```markdown
| [0018](0018-dashboard-idor-sweep-raw-sql-tenancy.md) | Dashboard IDOR Sweep + $queryRaw Tenancy Guarantee | Accepted | 2026-04-21 | apps/server |
```

In the "### apps/server" By-Domain section (around line 141), add after line 151 (the ADR-0016 entry):

```markdown
- [0018](0018-dashboard-idor-sweep-raw-sql-tenancy.md) — Dashboard IDOR Sweep + $queryRaw Tenancy Guarantee
```

- [ ] **Step 1.3: Lint check**

Verify file naming: `0018-dashboard-idor-sweep-raw-sql-tenancy.md` matches `NNNN-kebab-title.md`. Verify frontmatter `id: 0018` matches the filename digit block.

Run: `ls .claude/docs/decisions/*.md | sort` — confirm `0018-...` sits between `0017-...` and `README.md`.

- [ ] **Step 1.4: Commit**

```bash
git add .claude/docs/decisions/0018-dashboard-idor-sweep-raw-sql-tenancy.md \
        .claude/docs/decisions/README.md
git commit -m "docs(adr): ADR-0018 dashboard IDOR sweep + \$queryRaw tenancy"
```

**Review**: 1 combined review — verify ADR rules are internally consistent and don't silently supersede ADR-0006.

---

## Task 2 — Fix `dashboard-trend` IDOR: controller + service + integration test

**Files:**
- Modify: `apps/server/src/dashboard/dashboard.controller.ts`
- Modify: `apps/server/src/dashboard/services/dashboard-trend.service.ts`
- Create: `apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts`

**Current state** (lines from survey):

- `dashboard.controller.ts:47-50` — `getTrend` takes no `@CurrentCompany()`
- `dashboard-trend.service.ts:17-19` — `profitLoss.aggregate({ _sum: ... })` no where
- `dashboard-trend.service.ts:26-34` — `$queryRaw` on `orders` no company_id
- `dashboard-trend.service.ts:35-43` — `$queryRaw` on `ads` no company_id

**Target state:** Every query includes companyId. Returns for a given companyId contain ONLY that tenant's rows.

- [ ] **Step 2.1: Update controller**

Edit `apps/server/src/dashboard/dashboard.controller.ts`. Replace line 47-50:

```ts
// BEFORE (lines 47-50)
  @Get('trend')
  async getTrend(@Query() query: DashboardTrendQueryDto): Promise<DashboardTrendItem[]> {
    return this.trendService.getTrend(query.range ?? '30d');
  }

// AFTER
  @Get('trend')
  async getTrend(
    @Query() query: DashboardTrendQueryDto,
    @CurrentCompany() companyId: string,
  ): Promise<DashboardTrendItem[]> {
    return this.trendService.getTrend(companyId, query.range ?? '30d');
  }
```

The `CurrentCompany` import at line 2 already exists — no new import needed.

- [ ] **Step 2.2: Update service**

Edit `apps/server/src/dashboard/services/dashboard-trend.service.ts`. Replace the entire file with:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardTrendItem } from '@kiditem/shared';

@Injectable()
export class DashboardTrendService {
  private readonly logger = new Logger(DashboardTrendService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTrend(companyId: string, range: string): Promise<DashboardTrendItem[]> {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // 월별 평균 이익률 계산 (ProfitLoss 기준, company-scoped)
    const plAgg = await this.prisma.profitLoss.aggregate({
      where: { companyId },
      _sum: { revenue: true, netProfit: true },
    });
    const avgProfitRate =
      (plAgg._sum.revenue ?? 0) > 0
        ? (plAgg._sum.netProfit ?? 0) / (plAgg._sum.revenue ?? 1)
        : 0;

    // ADR-0018 $queryRaw tenancy — companyId bound via ${companyId}::uuid
    const [orderRows, adRows] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; revenue: number }[]>`
        SELECT
          TO_CHAR(ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
          COALESCE(SUM(total_price), 0)::int AS revenue
        FROM orders
        WHERE company_id = ${companyId}::uuid
          AND ordered_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
        SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(spend), 0)::int AS ad_cost
        FROM ads
        WHERE company_id = ${companyId}::uuid
          AND date >= ${since}::date
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const adMap = new Map(adRows.map((r) => [r.date, Number(r.ad_cost)]));

    return orderRows.map((r) => {
      const revenue = Number(r.revenue);
      const profit = Math.round(revenue * avgProfitRate);
      return {
        date: r.date,
        revenue,
        profit,
        adCost: adMap.get(r.date) ?? 0,
      } satisfies DashboardTrendItem;
    });
  }
}
```

- [ ] **Step 2.3: Run tsc**

Run: `cd apps/server && npx tsc --noEmit`
Expected: 0 errors. The controller's `getTrend` change may force other consumers — but `DashboardTrendService` is only called from `dashboard.controller.ts` (verify: `grep -rn 'trendService' apps/server/src --include='*.ts'`).

- [ ] **Step 2.4: Write integration test**

Create `apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardTrendService } from '../services/dashboard-trend.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('DashboardTrendService (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardTrendService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        DashboardTrendService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardTrendService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Seed TEST + OTHER with distinguishable sentinel values:
   *   TEST.orders.totalPrice ∈ {10000, 20000}
   *   OTHER.orders.totalPrice = 999_999_999 (sentinel — must NEVER appear in TEST result)
   *   TEST.ads.spend ∈ {500, 1000}
   *   OTHER.ads.spend = 999_999_999 (sentinel)
   *   TEST.profitLoss.{revenue, netProfit} = {100_000, 30_000}
   *   OTHER.profitLoss.{revenue, netProfit} = {999_999_999, 999_999_999}
   *
   * If any service query leaks, sentinel appears in result and assertion fails.
   */
  async function seedTwoCompanies() {
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayStr = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // TEST orders
    await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'T-1',
        orderedAt: yesterday,
        status: 'paid',
        totalPrice: 10_000,
        receiverName: 'A',
      },
    });
    await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'T-2',
        orderedAt: yesterday,
        status: 'paid',
        totalPrice: 20_000,
        receiverName: 'A',
      },
    });

    // OTHER orders (sentinel)
    await prisma.order.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'O-1',
        orderedAt: yesterday,
        status: 'paid',
        totalPrice: 999_999_999,
        receiverName: 'B',
      },
    });

    // TEST ads
    await prisma.ad.create({
      data: {
        companyId: TEST_COMPANY_ID,
        source: 'wing',
        date: yesterday,
        campaignId: 'C-T-1',
        spend: 500,
        impressions: 100,
        clicks: 10,
        conversions: 1,
        revenue: 1500,
        level: 'campaign',
      },
    });

    // OTHER ads (sentinel)
    await prisma.ad.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        source: 'wing',
        date: yesterday,
        campaignId: 'C-O-1',
        spend: 999_999_999,
        impressions: 100,
        clicks: 10,
        conversions: 1,
        revenue: 999_999_999,
        level: 'campaign',
      },
    });

    // TEST profit-loss (current year/month)
    const ym = { year: today.getFullYear(), month: today.getMonth() + 1 };
    // Need a listing first — ProfitLoss.listingId is required by ADR-0016 schema
    const masterT = await prisma.masterProduct.create({
      data: { companyId: TEST_COMPANY_ID, code: 'M-T', name: 'Master T', category: 'Toy', optionCounter: 1 },
    });
    const listingT = await prisma.channelListing.create({
      data: { companyId: TEST_COMPANY_ID, masterId: masterT.id, channel: 'coupang', externalId: 'L-T' },
    });
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingT.id,
        year: ym.year,
        month: ym.month,
        revenue: 100_000,
        netProfit: 30_000,
      },
    });

    // OTHER profit-loss (sentinel)
    const masterO = await prisma.masterProduct.create({
      data: { companyId: OTHER_COMPANY_ID, code: 'M-O', name: 'Master O', category: 'Toy', optionCounter: 1 },
    });
    const listingO = await prisma.channelListing.create({
      data: { companyId: OTHER_COMPANY_ID, masterId: masterO.id, channel: 'coupang', externalId: 'L-O' },
    });
    await prisma.profitLoss.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        listingId: listingO.id,
        year: ym.year,
        month: ym.month,
        revenue: 999_999_999,
        netProfit: 999_999_999,
      },
    });

    return todayStr;
  }

  it('TEST sees only TEST rows — no OTHER sentinel leakage', async () => {
    await seedTwoCompanies();
    const result = await service.getTrend(TEST_COMPANY_ID, '30d');

    // revenue sentinel 999_999_999 must NOT appear on any day
    for (const row of result) {
      expect(row.revenue).toBeLessThan(999_000_000);
      expect(row.adCost).toBeLessThan(999_000_000);
    }
    // Should at least have yesterday's TEST aggregation (10_000 + 20_000 = 30_000)
    const yesterdayRow = result.find((r) => r.revenue === 30_000);
    expect(yesterdayRow).toBeTruthy();
    expect(yesterdayRow?.adCost).toBe(500);
  });

  it('OTHER sees only OTHER rows — TEST does not leak', async () => {
    await seedTwoCompanies();
    const result = await service.getTrend(OTHER_COMPANY_ID, '30d');

    // TEST values 10_000 / 20_000 / 500 / 1000 must NOT appear
    for (const row of result) {
      expect(row.revenue).not.toBe(10_000);
      expect(row.revenue).not.toBe(20_000);
      expect(row.revenue).not.toBe(30_000);
    }
    // Should see OTHER sentinel values
    const otherRow = result.find((r) => r.revenue === 999_999_999);
    expect(otherRow).toBeTruthy();
  });

  it('fresh company (no orders/ads/pl) returns []', async () => {
    // seedBaseFixture creates company row but no data
    const result = await service.getTrend(TEST_COMPANY_ID, '7d');
    expect(result).toEqual([]);
  });

  it('avgProfitRate uses TEST profit-loss only', async () => {
    await seedTwoCompanies();
    const result = await service.getTrend(TEST_COMPANY_ID, '30d');
    // TEST pl: revenue=100_000, netProfit=30_000 → rate = 0.3
    // Yesterday row revenue=30_000 → profit = 30_000 * 0.3 = 9_000
    const yr = result.find((r) => r.revenue === 30_000);
    expect(yr?.profit).toBe(9_000);
  });
});
```

- [ ] **Step 2.5: Run the integration test**

Prep + run:
```bash
npm run db:test:up
npm run db:test:prepare
npm run test:integration -- src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts
```
Expected: 4 tests pass. If a test fails with sentinel leaking, the fix isn't landing — re-check Step 2.2 for a missed query.

- [ ] **Step 2.6: DI boot sanity**

Run: `npm run dev:server`
Expected: Server boots. Hit `GET http://localhost:4000/api/dashboard/trend?range=30d` via curl with `x-dev-user-id: <dev user>` header — expect 200 + array response. This verifies the new `@CurrentCompany()` injection path doesn't break dev auth.

Kill server.

- [ ] **Step 2.7: Commit**

```bash
git add apps/server/src/dashboard/dashboard.controller.ts \
        apps/server/src/dashboard/services/dashboard-trend.service.ts \
        apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts
git commit -m "fix(dashboard): IDOR — dashboard-trend companyId binding (ADR-0018, IDOR T2)"
```

**Review**: 2-stage. Spec: verify all 3 queries bind companyId. Quality: verify test sentinel discipline (OTHER values never leak through).

---

## Task 3 — Fix `wing-ad-summary` + `dashboard-ad` dailyAdRows IDOR

**Files:**
- Modify: `apps/server/src/dashboard/helpers/wing-ad-summary.ts`
- Modify: `apps/server/src/dashboard/services/dashboard-ad.service.ts`
- Create: `apps/server/src/dashboard/__tests__/wing-ad-summary.pg.integration.spec.ts`
- Create: `apps/server/src/dashboard/__tests__/dashboard-ad.pg.integration.spec.ts`

**Current state:**

- `wing-ad-summary.ts:23-28` — signature `(prisma, year, month, monthStart)` — no `companyId`
- `wing-ad-summary.ts:31-42` — `$queryRaw` on `ad_snapshots` no `company_id`
- `wing-ad-summary.ts:52-56` — `prisma.adSnapshot.findFirst({ where: { source: 'wing' } })` no `companyId`
- `dashboard-ad.service.ts:49-57` — `dailyAdRows` $queryRaw no `company_id`
- `dashboard-ad.service.ts:67` — caller `fetchWingAdSummary(this.prisma, year, month, monthStart)` — caller already has `companyId` in scope as method parameter

**Target state:** Helper signature takes `companyId`. Both helper queries + service raw SQL bind it.

- [ ] **Step 3.1: Update wing-ad-summary helper**

Edit `apps/server/src/dashboard/helpers/wing-ad-summary.ts`. Replace the entire file:

```ts
import type { PrismaService } from '../../prisma/prisma.service';
import type { WingAdSummary } from '@kiditem/shared';

export interface WingAdSummaryResult extends WingAdSummary {
  lastSyncAt: Date | null;
}

/**
 * Fetch + parse the current month's Wing adSummary snapshot for a specific company.
 *
 * Source: ad_snapshots rows where source='wing', page_type='dashboard_kpi',
 * captured_at >= monthStart, raw_json.startDate == current-month-first-day,
 * raw_json.adSummary.adGmv > 0. Ordered by raw_json.period DESC (longer-span
 * snapshots win over partial/daily), then captured_at DESC. Limit 1.
 *
 * Returns null when no qualifying snapshot exists (fresh tenant / Wing sync
 * not run). Caller should treat null as "no override data" and keep their
 * base calculations.
 *
 * ADR-0018 multi-tenant IDOR guard: companyId is bound via $queryRaw tagged
 * template → ${companyId}::uuid. Each AdSnapshot row MUST belong to the caller's
 * company — cross-tenant wing snapshot pool previously leaked (IDOR sweep 2026-04).
 */
export async function fetchWingAdSummary(
  prisma: PrismaService,
  companyId: string,
  year: number,
  month: number,
  monthStart: Date,
): Promise<WingAdSummaryResult | null> {
  const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;

  const wingAdSnapRows = await prisma.$queryRaw<{ raw_json: Record<string, unknown> }[]>`
    SELECT raw_json
    FROM ad_snapshots
    WHERE company_id = ${companyId}::uuid
      AND source = 'wing'
      AND page_type = 'dashboard_kpi'
      AND captured_at >= ${monthStart}
      AND raw_json->>'startDate' = ${monthStartStr}
      AND raw_json->'adSummary'->>'adGmv' IS NOT NULL
      AND (raw_json->'adSummary'->>'adGmv')::float > 0
    ORDER BY (raw_json->>'period')::int DESC, captured_at DESC
    LIMIT 1
  `;

  const rawAdSummary = wingAdSnapRows[0]?.raw_json
    ? ((wingAdSnapRows[0].raw_json as Record<string, unknown>).adSummary ?? null)
    : null;

  if (!rawAdSummary) {
    return null;
  }

  const lastSyncRow = await prisma.adSnapshot.findFirst({
    where: { companyId, source: 'wing' },
    orderBy: { capturedAt: 'desc' },
    select: { capturedAt: true },
  });

  const summary = rawAdSummary as Record<string, unknown>;
  const adRevenue = Math.round(Number(summary.adGmv) || 0);
  const adSpend = Math.round(Number(summary.adSpend) || 0);
  const adRoas = adSpend > 0
    ? Math.round((adRevenue / adSpend) * 100 * 100) / 100
    : 0;

  return {
    adRevenue,
    adSpend,
    adRoas,
    rawAdSummary: summary,
    lastSyncAt: lastSyncRow?.capturedAt ?? null,
  } satisfies WingAdSummaryResult;
}
```

- [ ] **Step 3.2: Update dashboard-ad.service.ts**

Edit `apps/server/src/dashboard/services/dashboard-ad.service.ts`.

**Change 1**: line 67 — update caller to thread companyId.

```ts
// BEFORE line 67
        // Wing adSummary snapshot
        fetchWingAdSummary(this.prisma, year, month, monthStart),

// AFTER
        // Wing adSummary snapshot (ADR-0018 — companyId threaded)
        fetchWingAdSummary(this.prisma, companyId, year, month, monthStart),
```

**Change 2**: lines 49-57 — fix `dailyAdRows` $queryRaw:

```ts
// BEFORE (lines 49-57)
        this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
          SELECT
            TO_CHAR(date, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(spend), 0)::int AS ad_cost
          FROM ads
          WHERE date >= ${thirtyDaysAgo}::date
          GROUP BY 1
          ORDER BY 1
        `,

// AFTER (ADR-0018 companyId binding)
        this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
          SELECT
            TO_CHAR(date, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(spend), 0)::int AS ad_cost
          FROM ads
          WHERE company_id = ${companyId}::uuid
            AND date >= ${thirtyDaysAgo}::date
          GROUP BY 1
          ORDER BY 1
        `,
```

Note: `companyId` is already a parameter of `getSummary(ctx: DashboardContext, companyId: string)` (line 22) — no signature change needed.

- [ ] **Step 3.3: Run tsc**

Run: `cd apps/server && npx tsc --noEmit`
Expected: 0 errors. `fetchWingAdSummary` signature change ripples only to the one caller in dashboard-ad.service.ts (verify: `grep -rn 'fetchWingAdSummary' apps/server/src`).

- [ ] **Step 3.4: Write wing-ad-summary integration test**

Create `apps/server/src/dashboard/__tests__/wing-ad-summary.pg.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { fetchWingAdSummary } from '../helpers/wing-ad-summary';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('fetchWingAdSummary (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedWingSnapshot(
    companyId: string,
    adGmv: number,
    adSpend: number,
    period: number,
    capturedAt: Date,
  ) {
    const monthStart = new Date(capturedAt);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    await prisma.adSnapshot.create({
      data: {
        companyId,
        source: 'wing',
        pageType: 'dashboard_kpi',
        date: capturedAt,
        capturedAt,
        level: 'dashboard',
        rawJson: {
          startDate: monthStartStr,
          period,
          adSummary: { adGmv: String(adGmv), adSpend: String(adSpend) },
        },
      },
    });
  }

  it('returns TEST snapshot only — OTHER sentinel never leaks', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // TEST — small values
    await seedWingSnapshot(TEST_COMPANY_ID, 1000, 500, 30, now);
    // OTHER — sentinel + longer period (would win if IDOR)
    await seedWingSnapshot(OTHER_COMPANY_ID, 999_999_999, 999_999_999, 90, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as typeof prisma,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).not.toBeNull();
    expect(result?.adRevenue).toBe(1000);
    expect(result?.adSpend).toBe(500);
  });

  it('OTHER call returns OTHER — sentinel reflects correctly', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    await seedWingSnapshot(TEST_COMPANY_ID, 1000, 500, 30, now);
    await seedWingSnapshot(OTHER_COMPANY_ID, 999_999_999, 999_999_999, 90, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as typeof prisma,
      OTHER_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result?.adRevenue).toBe(999_999_999);
    expect(result?.adSpend).toBe(999_999_999);
  });

  it('returns null when no snapshot exists for this company', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Only OTHER has a snapshot
    await seedWingSnapshot(OTHER_COMPANY_ID, 500, 250, 30, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as typeof prisma,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).toBeNull();
  });

  it('lastSyncAt pulled from TEST company only', async () => {
    const now = new Date();
    const otherEarlier = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    await seedWingSnapshot(TEST_COMPANY_ID, 1000, 500, 30, now);
    // OTHER has a much more recent snapshot — if IDOR, lastSyncAt would leak
    await seedWingSnapshot(OTHER_COMPANY_ID, 500, 250, 90, otherEarlier);

    const result = await fetchWingAdSummary(
      prisma as unknown as typeof prisma,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result?.lastSyncAt?.getTime()).toBe(now.getTime());
  });
});
```

- [ ] **Step 3.5: Write dashboard-ad integration test (dailyAdRows focus)**

Create `apps/server/src/dashboard/__tests__/dashboard-ad.pg.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardAdService } from '../services/dashboard-ad.service';
import { buildDashboardContext } from '../services/context';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('DashboardAdService.getSummary (PG integration) — IDOR + dailyAdRows', () => {
  let prisma: PrismaClient;
  let service: DashboardAdService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        DashboardAdService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardAdService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedAdsTwoCompanies() {
    const today = new Date();
    // TEST ads — 1 row, spend 500
    await prisma.ad.create({
      data: {
        companyId: TEST_COMPANY_ID,
        source: 'wing',
        date: today,
        campaignId: 'C-T',
        spend: 500,
        impressions: 100,
        clicks: 10,
        conversions: 1,
        revenue: 1500,
        level: 'campaign',
      },
    });
    // OTHER ads — sentinel spend
    await prisma.ad.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        source: 'wing',
        date: today,
        campaignId: 'C-O',
        spend: 999_999_999,
        impressions: 100,
        clicks: 10,
        conversions: 1,
        revenue: 999_999_999,
        level: 'campaign',
      },
    });
  }

  it('TEST getSummary().dailyAd never includes OTHER sentinel spend', async () => {
    await seedAdsTwoCompanies();
    const ctx = buildDashboardContext('30d');
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    if (result.dailyAd) {
      for (const row of result.dailyAd) {
        expect(row.adCost).toBeLessThan(999_000_000);
      }
    }
  });

  it('OTHER getSummary().dailyAd sees only OTHER sentinel', async () => {
    await seedAdsTwoCompanies();
    const ctx = buildDashboardContext('30d');
    const result = await service.getSummary(ctx, OTHER_COMPANY_ID);

    if (result.dailyAd && result.dailyAd.length > 0) {
      // At least one row should be the sentinel
      const hasSentinel = result.dailyAd.some((r) => r.adCost === 999_999_999);
      expect(hasSentinel).toBe(true);
      // TEST value 500 must not appear
      for (const row of result.dailyAd) {
        expect(row.adCost).not.toBe(500);
      }
    }
  });

  it('monthly metrics reflect TEST-only ads (ROAS based on TEST revenue/spend)', async () => {
    await seedAdsTwoCompanies();
    const ctx = buildDashboardContext('30d');
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    // TEST has 1 ad row for current month: spend=500, revenue=1500
    // Expected monthly.totalAdSpend tie to calculateProfitForRange (not ad.spend) —
    // but monthly.roas = pct2(revenue, spend) should use TEST revenue/spend.
    // We just assert no sentinel bleed.
    expect(result.monthly.totalAdSpend).toBeLessThan(999_000_000);
  });
});
```

- [ ] **Step 3.6: Run both integration tests**

```bash
npm run test:integration -- \
  src/dashboard/__tests__/wing-ad-summary.pg.integration.spec.ts \
  src/dashboard/__tests__/dashboard-ad.pg.integration.spec.ts
```
Expected: 7 tests pass total (4 + 3). If wing-ad-summary test reports a cross-company leak, re-check Step 3.1. If dashboard-ad test reports dailyAd sentinel, re-check Step 3.2 Change 2.

- [ ] **Step 3.7: Commit**

```bash
git add apps/server/src/dashboard/helpers/wing-ad-summary.ts \
        apps/server/src/dashboard/services/dashboard-ad.service.ts \
        apps/server/src/dashboard/__tests__/wing-ad-summary.pg.integration.spec.ts \
        apps/server/src/dashboard/__tests__/dashboard-ad.pg.integration.spec.ts
git commit -m "fix(dashboard): IDOR — wing-ad-summary + dashboard-ad dailyAdRows (ADR-0018, IDOR T3)"
```

**Review**: 2-stage. Spec: verify both helper queries + dashboard-ad dailyAdRows bind companyId. Quality: verify helper signature change doesn't leak to any unlisted caller (grep `fetchWingAdSummary` confirms 1 caller).

---

## Task 4 — Repo-wide $queryRaw audit + final verification

**Files:**
- No new files. This task is a manual + scripted audit to prove no residual IDOR beyond the plan's 3 targets.

- [ ] **Step 4.1: Repo-wide $queryRaw audit**

Run from repo root:

```bash
grep -rn '\$queryRaw' apps/server/src --include='*.ts' \
  | grep -v __tests__ | grep -v '\.spec\.' \
  > /tmp/queryRaw-audit.txt
cat /tmp/queryRaw-audit.txt
```

For each result, verify the file contains `company_id = \${companyId}::uuid` (or equivalent) in the same tagged template. Mentally walk through each hit — or use:

```bash
# Heuristic: count lines where $queryRaw appears but company_id doesn't within 15 lines
grep -rPzn '\$queryRaw\b[\s\S]{0,800}?(?:;|\`)' apps/server/src --include='*.ts' \
  | grep -v __tests__ | grep -v '\.spec\.' \
  | awk '/\$queryRaw/ && !/company_id/' || echo "OK: all raw SQL sites have company_id"
```

Expected after this plan: no un-bound sites. If the audit surfaces a 4th site, file must be fixed in this same task (root CLAUDE.md "No follow-up issues").

- [ ] **Step 4.2: DI boot sanity + smoke across endpoints**

```bash
npm run dev:server &
sleep 10
curl -s -H 'x-dev-user-id: <dev user>' 'http://localhost:4000/api/dashboard/trend?range=7d' | head
curl -s -H 'x-dev-user-id: <dev user>' 'http://localhost:4000/api/dashboard/ad?range=30d' | head
kill %1
```

Expected: each curl returns JSON (not 500). If 500, check dev:server logs for DI or runtime errors.

- [ ] **Step 4.3: Full integration suite**

```bash
npm run db:test:up
npm run db:test:prepare
npm run test:integration
```

Expected: full suite passes. The 3 new spec files contribute ~11-12 it() blocks; none regress existing tests.

- [ ] **Step 4.4: Web build sanity (co-running with Plan E.1)**

```bash
cd apps/web && npm run build && cd ../..
```

Expected: clean build. If E.1 finished first, this is already green from E.1 T7; re-confirming here catches any cross-plan merge bug.

- [ ] **Step 4.5: Commit (audit notes only, if any)**

If Step 4.1 found residual $queryRaw hits that required fixing, those fixes go in their own commit:

```bash
git add apps/server/src/...
git commit -m "fix(server): close residual \$queryRaw IDOR hits surfaced by audit (ADR-0018)"
```

If the audit is clean (expected), no commit here — this task's output is verification evidence in the review note.

- [ ] **Step 4.6: Optional — add grep-based pre-commit hook note to issue tracker**

Not a commit. Note for future Plan (beyond IDOR sweep scope): implement ADR-0018 Rule 4 as a pre-commit or CI grep gate. Out of scope for this plan — "rules locked in via ADR, tool landing later."

**Review**: No review — verification only.

---

## Self-Review Checklist

**Spec coverage**

| Spec item (from handoff memo + ADR-0018 decision) | Task |
|---|---|
| ADR (memo said ADR-0019; actual next slot is ADR-0018 — corrected) | T1 ✓ |
| dashboard-trend.service IDOR fix | T2 ✓ |
| dashboard-trend.service integration test | T2 ✓ |
| wing-ad-summary helper IDOR fix | T3 ✓ |
| wing-ad-summary caller (dashboard-ad.service.ts:67) fix | T3 ✓ |
| dashboard-ad.service dailyAdRows raw SQL fix | T3 ✓ |
| dashboard-ad integration test | T3 ✓ |
| Repo-wide audit ($queryRaw exhaustive check) | T4 ✓ |
| Verification (DI boot + full integration + web build) | T4 ✓ |

**Placeholder scan**: no TBDs. All commit messages, file paths, code blocks, test assertions concrete.

**Type consistency**:
- `fetchWingAdSummary(prisma, companyId, year, month, monthStart)` signature identical in T3.1 (helper) and T3.2 (caller). Arg order matches the helper's parameter list.
- `DashboardTrendService.getTrend(companyId, range)` signature identical in T2.1 (controller call) and T2.2 (service def).
- `TEST_COMPANY_ID`/`OTHER_COMPANY_ID` constants reused from `test-helpers/real-prisma.ts` — no local duplication.
- `buildDashboardContext` imported from `services/context` — matches existing dashboard-ad.service.ts:11 pattern.

---

## Post-plan execution handoff

After approval, execute via `superpowers:subagent-driven-development` — 4 tasks, ~10 subagent dispatches (2-stage review on T2/T3 + 1-stage on T1, no review on T4). T2 and T3 are sequential (T3 depends on T2's dev:server verification path). T4 is post-both.

This plan's 4 commits join Plan E.1's 7 commits in branch `feat/plan-e1-idor-sweep`. Final `superpowers:finishing-a-development-branch` squash-merges all 11 commits as one `feat: Plan E.1 + IDOR sweep` commit to `main`.
