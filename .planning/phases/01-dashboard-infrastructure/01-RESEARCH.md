# Phase 01: Dashboard Infrastructure - Research

**Researched:** 2026-03-26
**Domain:** NestJS module scaffolding, KST timezone math, TypeScript `as const` constants, react-day-picker v9 + Radix Popover
**Confidence:** HIGH

## Summary

Phase 01 installs guard-rails that every later dashboard phase inherits. There are four discrete deliverables: (1) a `kstDayStart` date utility that converts any JS `Date` to the UTC timestamp of KST midnight; (2) a `constants.ts` file exporting order/return status sets as `as const` so TypeScript can narrow them; (3) a `CoupangDashboardModule` registered in `AppModule` with a `GET /api/coupang-dashboard` endpoint whose service uses `Promise.all()` fan-out; and (4) installing `react-day-picker@9` in `apps/web` and wiring a date-range picker inside an existing Radix `<Popover>`.

None of these require schema changes — the Prisma models `CoupangOrder`, `CoupangOrderItem`, and `CoupangReturn` already exist and are seeded (UAT confirmed 298 orders, 20 returns). The existing `DashboardModule` at `apps/server/src/dashboard/` is the reference pattern for the new `CoupangDashboardModule` — three files, registered in `AppModule`.

The KST UTC offset is fixed at +9 hours. Docker containers run UTC. The trap in the existing `DashboardService` (line 11-16: `new Date(now.getFullYear(), now.getMonth(), now.getDate())`) produces midnight in the _server's local timezone_, not KST. The new helper must add 9 hours to produce a UTC timestamp representing KST midnight, then use that in `gte`/`lt` bounds.

**Primary recommendation:** Create `apps/server/src/common/kst.ts` for the `kstDayStart` helper and `apps/server/src/coupang/constants.ts` for status constants. Scaffold `CoupangDashboardModule` following the exact three-file `DashboardModule` pattern. Install `react-day-picker@9` with `npm install react-day-picker@^9` inside `apps/web`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | `kstDayStart(date: Date): Date` helper exists and all date range queries use it. Docker UTC environment filters Korean orders correctly. | KST = UTC+9; midnight KST = day-start UTC minus 9h offset. Helper must live in a shared location so CoupangDashboardService can import it. Existing `DashboardService` shows the anti-pattern to avoid. |
| INFRA-02 | `apps/server/src/coupang/constants.ts` exports `ORDER_STATUSES` and `RETURN_STATUSES` as `as const`. All service queries reference these constants. | Schema already stores `status` as `String`. Constants file does not exist yet. Existing hardcoded strings found in `orders.service.ts` ('ACCEPT') and `returns.service.ts` (['UC','RC']). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

### Enforced by CLAUDE.md

- **API paths:** No `/v1/` prefix. New endpoint must be `GET /api/coupang-dashboard`.
- **Domain modules are self-contained:** `CoupangDashboardModule` = its own controller + service in one folder. No importing other domain Services.
- **PrismaService only as shared dependency:** `CoupangDashboardService` injects `PrismaService` only (no cross-domain service injection).
- **Native PG enum forbidden:** Status values remain `String` fields; `ORDER_STATUSES`/`RETURN_STATUSES` are app-level constants, not DB enums.
- **All pages `'use client'`:** The date-range picker component must have `'use client'` directive.
- **Frontend API calls via `API_BASE`:** `fetch(\`${API_BASE}/api/coupang-dashboard\`)` — never direct `/api/` calls.
- **Light theme:** `bg-white`, `border-gray-200`, `text-gray-900` for the date picker UI.
- **Schema changes require `npm run db:push` + `npx prisma generate`:** Not needed for this phase (no schema changes).
- **`dashboard` reads from DB only:** Never mix DB reads and live Coupang API calls in the same service method.
- **`Promise.all()` fan-out required:** All `CoupangDashboardService` aggregation queries must be concurrent.
- **companyId derivation:** No auth session exists; use `prisma.company.findFirst()` (no `where` clause) to get the single company — consistent with `sourcing.controller.ts` line 39 pattern.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 11 (already installed) | Module/controller/service scaffolding | Project standard — `apps/server` |
| Prisma | 7.5.0 (already installed) | DB queries for CoupangOrder/CoupangReturn aggregation | Project standard ORM |
| react-day-picker | ^9.14.0 (to install) | Date range calendar UI | Required by success criteria; v9 is current latest (2026-02-26) |
| @radix-ui/react-popover | ^1.1.15 (already installed) | Popover container for the calendar | Already in `apps/web/package.json` |
| date-fns | ^4.1.0 (already installed) | Date formatting in frontend display label | Already in `apps/web/package.json` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript `as const` | n/a (language feature) | Narrow status string types | For `ORDER_STATUSES` / `RETURN_STATUSES` constants |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-day-picker@9` | `@nextui-org/date-picker` | Phase requirement explicitly specifies react-day-picker@9 — locked |
| Shared `common/` module | Inline in coupang-dashboard | Shared location allows reuse across Phase 2/3 service methods |

**Installation:**
```bash
cd apps/web && npm install react-day-picker@^9
```

**Version verification:**

```
react-day-picker: 9.14.0 (published 2026-02-26) — verified via npm view
@radix-ui/react-popover: 1.1.15 — already installed, verified in package.json
date-fns: 4.1.0 — already installed
```

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
apps/server/src/
├── common/
│   └── kst.ts                           # kstDayStart helper (new)
├── coupang/
│   ├── client.ts                        # existing — HMAC auth
│   ├── orders.ts                        # existing — API calls
│   └── constants.ts                     # ORDER_STATUSES, RETURN_STATUSES (new)
└── coupang-dashboard/
    ├── coupang-dashboard.module.ts       # new
    ├── coupang-dashboard.controller.ts  # new
    └── coupang-dashboard.service.ts     # new

apps/web/src/components/ui/
└── DateRangePicker.tsx                  # new — DayPicker inside Radix Popover
```

### Pattern 1: kstDayStart Helper

**What:** Converts a JS `Date` to the UTC timestamp that represents midnight in KST (UTC+9). The server runs in Docker UTC; `new Date()` in UTC is 9 hours behind KST. To get "today in KST", add the 9-hour offset before flooring.

**When to use:** Every query that filters by `orderedAt` date range (e.g., "today's orders", "last 30 days").

**Example:**
```typescript
// apps/server/src/common/kst.ts
const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // 9 hours in milliseconds

export function kstDayStart(date: Date): Date {
  // Shift the date into KST, floor to midnight, shift back to UTC
  const kstMs = date.getTime() + KST_OFFSET_MS;
  const kstMidnightMs = Math.floor(kstMs / 86400000) * 86400000;
  return new Date(kstMidnightMs - KST_OFFSET_MS);
}
```

Usage in Prisma query:
```typescript
const start = kstDayStart(new Date());
const end = new Date(start.getTime() + 86400000); // next midnight KST

await this.prisma.coupangOrder.aggregate({
  where: { orderedAt: { gte: start, lt: end } },
  // ...
});
```

### Pattern 2: Status Constants

**What:** Single source of truth for status strings used in `CoupangOrder.status` and `CoupangReturn.receiptStatus`. Current code has them hardcoded as inline strings.

**Example:**
```typescript
// apps/server/src/coupang/constants.ts
export const ORDER_STATUSES = {
  ACCEPT:         'ACCEPT',
  INSTRUCT:       'INSTRUCT',
  DEPARTURE:      'DEPARTURE',
  DELIVERING:     'DELIVERING',
  FINAL_DELIVERY: 'FINAL_DELIVERY',
  CANCELED:       'CANCELED',
} as const;

export type OrderStatus = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

export const RETURN_STATUSES = {
  UC: 'UC', // Unconfirmed
  RC: 'RC', // Returned Complete
} as const;

export type ReturnStatus = typeof RETURN_STATUSES[keyof typeof RETURN_STATUSES];
```

### Pattern 3: CoupangDashboardModule — Three-File NestJS Module

**What:** Mirrors `DashboardModule` exactly. Three files in one folder, registered in `AppModule`.

**Reference:** `apps/server/src/dashboard/dashboard.module.ts` (lines 1-9) — the minimal module pattern.

```typescript
// apps/server/src/coupang-dashboard/coupang-dashboard.module.ts
import { Module } from '@nestjs/common';
import { CoupangDashboardController } from './coupang-dashboard.controller';
import { CoupangDashboardService } from './coupang-dashboard.service';

@Module({
  controllers: [CoupangDashboardController],
  providers: [CoupangDashboardService],
})
export class CoupangDashboardModule {}
```

AppModule registration (add to existing imports array):
```typescript
import { CoupangDashboardModule } from './coupang-dashboard/coupang-dashboard.module';
// ...
@Module({ imports: [..., CoupangDashboardModule] })
```

### Pattern 4: Promise.all() Fan-out in Service

**What:** All aggregation queries run concurrently, not sequentially. Required by STATE.md decision.

**Example:**
```typescript
// apps/server/src/coupang-dashboard/coupang-dashboard.service.ts
async getSummary(companyId: string) {
  const todayStart = kstDayStart(new Date());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [todayOrders, pendingAccept, pendingReturns] = await Promise.all([
    this.prisma.coupangOrder.aggregate({
      _sum: { totalPrice: true },
      _count: true,
      where: { companyId, orderedAt: { gte: todayStart, lt: todayEnd } },
    }),
    this.prisma.coupangOrder.count({
      where: { companyId, status: ORDER_STATUSES.ACCEPT },
    }),
    this.prisma.coupangReturn.count({
      where: { companyId, receiptStatus: RETURN_STATUSES.UC },
    }),
  ]);

  return { todayOrders, pendingAccept, pendingReturns };
}
```

### Pattern 5: companyId Derivation

**What:** No auth session in this codebase. Controller fetches the single company via `prisma.company.findFirst()`.

**Reference:** `apps/server/src/sourcing/sourcing.controller.ts` line 39.

```typescript
// In CoupangDashboardController or CoupangDashboardService
const company = await this.prisma.company.findFirst();
if (!company) throw new NotFoundException('회사 정보 없음');
return this.service.getSummary(company.id);
```

### Pattern 6: react-day-picker v9 + Radix Popover

**What:** `DayPicker` in `mode="range"` inside a `@radix-ui/react-popover` Popover.

**CSS import required:** `import 'react-day-picker/style.css'` (v9 ships its own CSS).

**Example:**
```tsx
// apps/web/src/components/ui/DateRangePicker.tsx
'use client';
import { useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white hover:bg-gray-50">
          {value?.from && value?.to
            ? `${format(value.from, 'yyyy.MM.dd')} – ${format(value.to, 'yyyy.MM.dd')}`
            : '날짜 선택'}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50">
          <DayPicker
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

### Anti-Patterns to Avoid

- **`new Date(now.getFullYear(), now.getMonth(), now.getDate())`:** Uses server's local timezone (UTC in Docker), not KST. This is the bug in the existing `DashboardService` — do not copy it into `CoupangDashboardService`.
- **Inline status strings:** `'ACCEPT'`, `['UC','RC']` hardcoded in service files. Replace with `ORDER_STATUSES.ACCEPT`, etc. after creating constants.
- **Sequential `await` chains for aggregations:** `const a = await ...; const b = await ...;` — use `Promise.all()` instead.
- **Cross-domain service injection:** Do not inject `OrdersService` or `ReturnsService` into `CoupangDashboardService`. Use `PrismaService` directly.
- **Live Coupang API calls in dashboard service:** Dashboard reads DB only. Never call `getOrderSheets()` etc. from dashboard service.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date calendar UI | Custom calendar | `react-day-picker@9` | Phase success criterion explicitly names it |
| Popover wrapper | Custom dropdown | `@radix-ui/react-popover` | Already installed, primitive handles focus/positioning/a11y |
| Date formatting | Manual string concat | `date-fns` `format()` | Already installed; handles locale, edge cases |
| Concurrent DB queries | Promise chaining | `Promise.all()` | Locked decision from STATE.md roadmap |

**Key insight:** All UI dependencies are already installed (`@radix-ui/react-popover`, `date-fns`). Only `react-day-picker@9` needs to be added.

## Common Pitfalls

### Pitfall 1: KST Midnight Off-by-One

**What goes wrong:** `new Date(y, m, d)` in a Docker UTC container produces UTC midnight, not KST midnight. KST midnight = UTC 15:00 the previous calendar day. Queries for "today's orders" miss the first 9 hours of the KST day.

**Why it happens:** `new Date(year, month, day)` uses the runtime's local timezone. Docker containers default to UTC. Korean customers place orders after 00:00 KST (= 15:00 UTC previous day) which falls outside the UTC-midnight range.

**How to avoid:** Use `kstDayStart()` always. The UAT data confirms this: `ordered_at 2026-03-23 05:19:48+00` is KST 14:19:48 — if you query `gte 2026-03-23 00:00:00 UTC`, you'd capture it. But if you query `gte 2026-03-23 15:00:00 UTC` (KST midnight), you'd miss it. The helper must subtract the 9h offset after flooring.

**Warning signs:** "Today's order count" is 0 even though there are orders timestamped today in the UI.

### Pitfall 2: react-day-picker v9 Missing CSS

**What goes wrong:** Calendar renders with no styling — boxes and numbers appear unstyled.

**Why it happens:** v9 ships its own CSS file (`react-day-picker/style.css`) that must be explicitly imported. It does NOT inject styles automatically.

**How to avoid:** Add `import 'react-day-picker/style.css'` in the `DateRangePicker.tsx` component (or in `globals.css`).

**Warning signs:** Calendar renders as plain unstyled HTML elements with no grid layout.

### Pitfall 3: Radix Popover Content z-index conflict

**What goes wrong:** Calendar popover renders behind other elements (sidebar, modals).

**Why it happens:** Radix `PopoverContent` without `Portal` renders in-DOM at the element's position. Without explicit `z-50`, it may be covered.

**How to avoid:** Always use `<Popover.Portal>` wrapping `<Popover.Content>` and add `z-50` (Tailwind) or equivalent to the content. The Portal renders at document root.

**Warning signs:** Calendar appears clipped or invisible when trigger is in a table/card.

### Pitfall 4: CoupangDashboardModule Not Registered

**What goes wrong:** `GET /api/coupang-dashboard` returns 404.

**Why it happens:** NestJS requires modules to be imported in `AppModule`. Creating the module files is not enough.

**How to avoid:** Always add the import to `app.module.ts` imports array immediately after creating the three files.

**Warning signs:** `curl localhost:4000/api/coupang-dashboard` → 404.

### Pitfall 5: companyId Missing in Where Clause

**What goes wrong:** Dashboard returns aggregated data across all companies (multi-tenant leak).

**Why it happens:** Forgetting to add `companyId` to the Prisma `where` clause. The schema has `companyId` on both `CoupangOrder` and `CoupangReturn`.

**How to avoid:** Every query in `CoupangDashboardService` must include `where: { companyId }`. Fetch `companyId` once at the start of `getSummary()`.

**Warning signs:** Order count seems too high compared to what the seed data for a single company should show.

## Code Examples

Verified patterns from official sources:

### kstDayStart Implementation
```typescript
// apps/server/src/common/kst.ts
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstDayStart(date: Date): Date {
  const kstMs = date.getTime() + KST_OFFSET_MS;
  const kstMidnightMs = Math.floor(kstMs / 86400000) * 86400000;
  return new Date(kstMidnightMs - KST_OFFSET_MS);
}

// Verification: 2026-03-23 05:19:48 UTC is 14:19:48 KST (same calendar day)
// kstDayStart(new Date('2026-03-23T05:19:48Z'))
//   → kstMs = 2026-03-23T14:19:48 KST
//   → kstMidnightMs = 2026-03-23T00:00:00 KST
//   → return 2026-03-22T15:00:00 UTC (= KST midnight)
// Then lt: new Date(kstMidnightMs - KST_OFFSET_MS + 86400000) = 2026-03-23T15:00:00 UTC
// The order at 05:19 UTC is between 2026-03-22T15:00Z and 2026-03-23T15:00Z → captured correctly
```

### ORDER_STATUSES / RETURN_STATUSES
```typescript
// apps/server/src/coupang/constants.ts
export const ORDER_STATUSES = {
  ACCEPT:         'ACCEPT',
  INSTRUCT:       'INSTRUCT',
  DEPARTURE:      'DEPARTURE',
  DELIVERING:     'DELIVERING',
  FINAL_DELIVERY: 'FINAL_DELIVERY',
  CANCELED:       'CANCELED',
} as const;

export type OrderStatus = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

export const RETURN_STATUSES = {
  UC: 'UC',
  RC: 'RC',
} as const;

export type ReturnStatus = typeof RETURN_STATUSES[keyof typeof RETURN_STATUSES];
```

Source: Status strings verified from `orders/orders.service.ts` ('ACCEPT'), `orders/page.tsx` STATUS_TABS (ACCEPT/INSTRUCT/DEPARTURE/DELIVERING/FINAL_DELIVERY), and `returns/returns.service.ts` (['UC','RC']).

### react-day-picker v9 DateRange type
```typescript
// From react-day-picker v9 API (verified: latest is 9.14.0, 2026-02-26)
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';

// DateRange shape: { from?: Date; to?: Date }
// mode="range" onSelect: (range: DateRange | undefined) => void
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-day-picker v7 (separate CSS import path) | react-day-picker v9 (`import 'react-day-picker/style.css'`) | v9.0 (2024) | New import path — v7/v8 path was `react-day-picker/dist/style.css` |
| `mode` prop on `DayPicker` was called `type` in v7 | `mode="range"` in v9 | v8+ | Phase requires v9 explicitly |

**Deprecated/outdated:**
- `react-day-picker/dist/style.css`: v7/v8 path. v9 uses `react-day-picker/style.css`.
- `<DayPicker type="range">`: v7 API. Use `mode="range"` in v9.

## Open Questions

1. **`companyId` guard in controller vs service**
   - What we know: No auth middleware. `sourcing.controller.ts` calls `prisma.company.findFirst()` directly in the controller. `DashboardService` does not use `companyId` at all (no multi-tenancy guard).
   - What's unclear: STATE.md flags this as a concern: "companyId derivation pattern in dashboard controller guards needs clarification from existing auth session code."
   - Recommendation: Match the `sourcing.controller.ts` pattern — `prisma.company.findFirst()` (no `where`) and pass `company.id` to the service. This is consistent with the single-company seeded data. The planner should note this is not a hard blocker — the pattern exists and is clear.

2. **CSS import location for react-day-picker**
   - What we know: `import 'react-day-picker/style.css'` is required.
   - What's unclear: Whether to import it in the component file itself or in `globals.css`.
   - Recommendation: Import inside `DateRangePicker.tsx` to keep it co-located. Next.js 14 with Tailwind handles this correctly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install | N/A (assumed) | — | — |
| `@radix-ui/react-popover` | DateRangePicker component | Already installed | 1.1.15 | — |
| `date-fns` | DateRangePicker display formatting | Already installed | 4.x | — |
| `react-day-picker@9` | DateRangePicker calendar | NOT installed | — | Install: `cd apps/web && npm install react-day-picker@^9` |
| PostgreSQL (seeded) | CoupangDashboardService queries | Confirmed (UAT pass) | — | — |
| `PrismaService` | CoupangDashboardService | Available (global module) | 7.5.0 | — |

**Missing dependencies with no fallback:**
- `react-day-picker@9` — must be installed before the frontend component can render.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

> `workflow.nyquist_validation` is not set to `false` in config.json — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected (no jest.config, no vitest.config, no test/ directory in apps/server or apps/web) |
| Config file | none — Wave 0 gap |
| Quick run command | Manual: `curl http://localhost:4000/api/coupang-dashboard` |
| Full suite command | Manual: HTTP smoke tests + TypeScript compilation check |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | `kstDayStart(new Date('2026-03-23T05:19:48Z'))` returns `2026-03-22T15:00:00.000Z` | unit | No test framework — manual verify in REPL or add inline test | No test framework |
| INFRA-01 | `GET /api/coupang-dashboard` `todayOrders` count is KST-correct | smoke | `curl localhost:4000/api/coupang-dashboard` | Runtime only |
| INFRA-02 | `constants.ts` exports `ORDER_STATUSES` and `RETURN_STATUSES` as `as const` | compile | `npx tsc --noEmit` in `apps/server` | TypeScript compile |
| INFRA-02 | No hardcoded status strings remain in service files | manual grep | `grep -rn "'ACCEPT'\|'UC'\|'RC'" apps/server/src/` | Manual |
| INFRA-01+02 | `GET /api/coupang-dashboard` returns HTTP 200 | smoke | `curl -s -o /dev/null -w "%{http_code}" localhost:4000/api/coupang-dashboard` | Runtime only |
| INFRA-01+02 | `Promise.all()` fan-out verified (no sequential awaits in service) | manual review | Code review | Manual |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` in `apps/server` (TypeScript compile check)
- **Per wave merge:** Full smoke: `curl localhost:4000/api/coupang-dashboard` → HTTP 200 + valid JSON
- **Phase gate:** TypeScript clean + HTTP 200 + `kstDayStart` unit verification before marking complete

### Wave 0 Gaps

- [ ] No automated test framework configured — consider adding a minimal unit test for `kstDayStart` using Node's built-in `assert` (no dependency needed)
- [ ] `apps/server` has no `jest.config` or equivalent — all tests are manual/smoke for this phase

*(No existing test infrastructure covers phase requirements)*

## Sources

### Primary (HIGH confidence)

- Codebase direct inspection — `apps/server/src/dashboard/`, `apps/server/src/coupang/`, `apps/server/src/orders/`, `apps/server/src/returns/`, `apps/server/src/app.module.ts`
- `prisma/schema.prisma` — CoupangOrder, CoupangOrderItem, CoupangReturn model fields verified
- `.planning/phases/01-foundation/01-UAT.md` — confirmed seeded data: 298 orders, 20 returns, KST→UTC conversion working
- `apps/web/package.json` — confirmed installed packages (@radix-ui/react-popover@1.1.15, date-fns@4.x)
- `npm view react-day-picker version` → 9.14.0 (2026-02-26) — latest v9

### Secondary (MEDIUM confidence)

- [https://daypicker.dev/selections/range-mode](https://daypicker.dev/selections/range-mode) — react-day-picker v9 range mode API (`mode="range"`, `DateRange` type, `onSelect` signature)
- [https://daypicker.dev/docs/styling](https://daypicker.dev/docs/styling) — CSS import: `import 'react-day-picker/style.css'`
- `.planning/STATE.md` — `Promise.all()` fan-out decision, DB-only reads decision, `companyId` concern flagged

### Tertiary (LOW confidence)

- None — all critical claims verified from primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json and npm registry
- Architecture: HIGH — verified from existing codebase patterns (DashboardModule, sourcing controller)
- KST math: HIGH — verified against UAT data (`ordered_at 2026-03-23 05:19:48+00` = KST 14:19:48)
- react-day-picker v9 API: MEDIUM — verified from official docs URL, CSS import confirmed

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable libraries; react-day-picker v9 minor versions may update)
