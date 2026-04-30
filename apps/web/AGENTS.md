# apps/web — Next.js Frontend

Frontend only. No API Routes. All data fetched from NestJS (`localhost:4000`).

## Run

```bash
npm run dev    # localhost:3000
npm run build  # Production build
npx vitest run # Tests
```

Env: `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000`

## Scoped Instructions

- Shared frontend rules live in this `AGENTS.md`.
- Nested route guidance is still maintained in `src/app/(group-name)/{domain}/CLAUDE.md`. Read the matching file before editing that route until nested `AGENTS.md` files are added.

### Route Groups

Top-level routes are organized into Next.js App Router route groups (`(name)`). Route groups do **not** affect URLs — `/agents` still resolves to `src/app/(automation)/agents/page.tsx`. Group folders only exist to colocate related domains for navigation and ownership.

| Group | Routes |
|---|---|
| `(automation)` | agents, workflows, marketplace, action-board |
| `(catalog)` | products, product-hub |
| `(sourcing)` | sourcing, suppliers |
| `(inventory)` | inventory, inventory-hub, stock-ops, warehouses, unshipped-items |
| `(orders)` | orders, order-hub, order-status-hub, returns, reviews, return-scan |
| `(finance)` | finance-hub, profit-loss, sales-analysis, supplier-hub |
| `(media-ai)` | thumbnails, thumbnail-editor, image-hub, generate |

Routes outside any group (`ad-ops`, `cs-management`, `outbound`, `purchase-orders`, `reports`, `settings`, `__tests__`, `components`) remain at `src/app/{name}/`.

## Rules

### API Calls
- Use **`apiClient.get/post/patch/delete`** from `@/lib/api-client` (no raw fetch)
- For blob responses: `apiClient.fetchRaw()`
- Direct `API_BASE` usage only for non-fetch purposes (e.g., image URL resolution)
- Frontend code must not import Prisma, `pg`, server-only DB adapters, or direct database clients. All data comes from NestJS APIs.
- **Tenant scope is server-owned.** Never send `companyId` in a query string or request body. Backend resolves the tenant from the authenticated session via `@CurrentCompany()`; any client-supplied `companyId` is untrusted and silently dropped by the controller DTO whitelist. Query params carry **business filters only** (status, dateRange, module, etc.). Helpers like `getCompanyId()` for client-side tenant resolution are forbidden — if you find yourself reaching for one, the backend contract is wrong.

### Data Fetching
- Use **`useQuery` / `useMutation`** from `@tanstack/react-query` (no useState+useEffect+fetch)
- Domain hooks are co-located: `app/(automation)/agents/hooks/useAgents.ts`, `app/(automation)/workflows/hooks/useWorkflows.ts`
- App-wide cross-domain hooks stay in `src/hooks/`. Route-group-only shared hooks stay inside that group, for example `app/(automation)/_shared/marketplace/hooks/useMarketplace.ts` (agents + marketplace).
- For domains without custom hooks: inline `useQuery` + `queryKeys.*` from `lib/query-keys.ts`
- Polling: `refetchInterval` option (no setInterval)
- After mutation: `queryClient.invalidateQueries({ queryKey: queryKeys.xxx.all })`

### Types
- API response types: prefer domain subpaths from `@kiditem/shared/*` when available. Existing root imports from `@kiditem/shared` are allowed during migration, but new domains must not expand the root barrel.
- Single-page types: inline allowed (Novu pattern)
- Props: inline in component file (don't export)
- Shared across 2-3 components: export from parent → import in children

### Error Handling
- Branch with `isApiError(err)` from `@/lib/api-error`
- User notifications: `toast.error/success` from `sonner` (no alert(), except prompt/confirm)
- Global errors: auto-toast via QueryCache onError

### Styling
- **Tailwind CSS** + `cn()` utility from `@/lib/utils` (clsx + tailwind-merge)
- **금지**: `className={`...${condition}...`}` 템플릿 리터럴 조건부. 항상 `cn('base', condition && 'class')` 사용. (전체 마이그레이션 완료)
- **Dark mode**: `darkMode: 'class'` + next-themes. 신규/수정 시 시맨틱 토큰 우선:
  - Surface/Card: `bg-[var(--surface)]`, `bg-[var(--surface-sunken)]`, `bg-[var(--surface-raised)]`
  - Text: `text-[var(--text-primary|secondary|tertiary|muted)]`
  - Border: `border-[var(--border|border-subtle|border-strong)]`
  - Primary/Accent: `bg-[var(--primary)]`, `text-[var(--primary)]`, `bg-[var(--primary-soft)]`
  - Common classes (`.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.tab-*`, `.modal-*`, `.agent-card`, `.glass-card`) 은 이미 var 기반 → 그대로 사용하면 다크 자동 반영
  - 차트: `useChartTheme()` from `@/lib/chart-theme`
  - Toast: `<ThemedToaster />` (이미 layout 에 배선)
- Hard-coded `bg-white / text-slate-*` 는 legacy — 파일 편집 시 위 토큰으로 치환
- Table styles: defined in `globals.css` `@layer base`
- Icons: **Lucide React** only (`import { Icon } from 'lucide-react'`). No other icon libraries.

### Formatting Utilities (`@/lib/utils`)
- `formatNumber()` — locale-aware number (`Intl.NumberFormat('ko-KR')`)
- `formatCurrency()` / `formatKRW()` — KRW currency
- `formatPercent()` — percentage (1 decimal)
- `formatDateTime(date, opts?)` — 날짜+시간 (기본 YYYY-MM-DD HH:mm:ss)
- `formatDate(date, opts?)` — 날짜만
- `formatTime(date, opts?)` — 시각만 (HH:mm:ss)
- `formatDurationMinutes(minutes)` — 분 단위 → "2시간 30분"
- **금지**: `Intl.*`, `toLocaleString()`, `toLocaleDateString()`, `toLocaleTimeString()` 직접 호출. 항상 위 유틸 경유.

### UI
- `'use client'`: 훅(useState, useQuery 등)이나 브라우저 API를 쓰는 파일에 필수. 순수 레이아웃은 예외.
- Radix UI primitives: Popover, Select, Tabs, DropdownMenu

### Directory Structure

Each grouped route can have co-located directories:
```
app/(group-name)/{domain}/
  page.tsx           # Composition layer (hooks + state + component imports)
  components/        # Domain-specific UI components
  hooks/             # Domain-specific custom hooks
  lib/               # Domain-specific utilities, constants, types
```
Ungrouped routes use the same shape at `app/{domain}/`.

Shared directories (`src/components/`, `src/hooks/`, `src/lib/`) contain ONLY cross-domain code (2+ domains):
- `src/components/ui/` — PageSkeleton, Pagination, DateRangePicker, StatusBadge
- `src/components/layout/` — AppLayout, Header, Sidebar
- `src/lib/` — api-client, api-error, query-keys, utils (universal infra)

Route-group private shared directories contain ONLY code shared by 2+ routes inside that group:
- `app/(automation)/_shared/marketplace/` — marketplace API/types/hooks/cards/modals (agents + marketplace)

### Large Component Policy

- Do not add substantial behavior to 700+ line components.
- Before editing a large component, write a route-scoped split plan that identifies pure helpers, presentational components, hooks, and state orchestration boundaries.
- Keep API behavior stable while splitting. First extract tested helpers/presentational pieces; then replace stateful orchestration.
- New reusable UI belongs in `src/components` only when at least two routes actually share it.

### File Naming
- Components: **PascalCase.tsx** (`ProductCard.tsx`)
- Hooks: **camelCase** (`useAgents.ts`) — must start with `use`
- Utilities, constants, types: **kebab-case.ts** (`barcode-print.ts`, `query-keys.ts`)

### Import Order
1. `'use client'` directive
2. React imports (`import { useState } from 'react'`)
3. Third-party libraries (tanstack, lucide-react, sonner, etc.)
4. Local absolute imports (`@/lib/*`, `@/components/*`)
5. Relative imports (`./components/*`, `../lib/*`)
6. Type imports (`import type { ... }`)

### State Management
- Zustand: 전역 클라이언트 상태 — sidebar (`src/store/useStore.ts`), panel (`src/components/panel/lib/panel-store.ts`). Request/response로 내려받는 서버 상태가 아닌 것(토글·선호·실시간 SSE 이벤트 큐)에만 한정.
- Server state: 전부 React Query (`useQuery`/`useMutation`)
- **Zustand selector 주의**: `(s) => s.method()` 가 배열/객체를 반환하면 매 렌더 새 레퍼런스 → `useSyncExternalStore` infinite loop. byId 같은 stable ref를 구독하고 `useMemo`로 파생. primitive 반환 메서드는 안전.

### SSE (Server-Sent Events)
- **기본 금지** — `EventSource`는 헤더 전송 불가 → DevAuthMiddleware(ADR-0006) 호환 안 됨. agents/thumbnails 도메인은 polling 유지.
- **Panel 도메인 예외** — ADR-0010 하에 `@microsoft/fetch-event-source` 사용. 격리된 `PanelSseClient` (`src/components/panel/lib/panel-sse-client.ts`) 래퍼 경유만 허용. 다른 도메인이 SSE 원하면 별도 ADR.

## Domain Guides — 서브 페이지 작업 전 scoped instruction 먼저 Read

**규칙**: `src/app/(group-name)/{domain}/` 하위 파일을 Edit 하기 전, 아래 표의 해당 행이 가리키는 scoped document 를 먼저 Read 한다. 현재 전용 서브 페이지 문서는 `CLAUDE.md` 로 유지 중이다.

### 전용 CLAUDE.md 가 있는 서브 페이지 (6)

| 경로 | 크기 | 핵심 포인트 |
|---|---|---|
| [`src/app/(automation)/agents/CLAUDE.md`](src/app/(automation)/agents/CLAUDE.md) | 129줄 | Agent Lifecycle/Trace/Org/Cost UI — 조건부 Polling, Thin Compositor, Trace Timeline, queryKeys hierarchy |
| [`src/app/(orders)/return-scan/CLAUDE.md`](src/app/(orders)/return-scan/CLAUDE.md) | 73줄 | Barcode Input + Local-Only Logging — stateless 플로우, local sync 예외 |
| [`src/app/(sourcing)/sourcing/CLAUDE.md`](src/app/(sourcing)/sourcing/CLAUDE.md) | 151줄 | Product Sourcing + GrapesJS WYSIWYG Editor + AI Edit Panels — custom blocks 7종, iframe 주입, UndoManager pause |
| [`src/app/(media-ai)/thumbnail-editor/CLAUDE.md`](src/app/(media-ai)/thumbnail-editor/CLAUDE.md) | 120줄 | Use-Case-Driven Generation — 용도 카드 분기, mutation workflow, 이미지 허브 임포트 |
| [`src/app/(media-ai)/thumbnails/CLAUDE.md`](src/app/(media-ai)/thumbnails/CLAUDE.md) | 73줄 | Smart Polling + Batch + Optimistic UI — dynamic refetchInterval, rollback, AbortController |
| [`src/app/(automation)/workflows/CLAUDE.md`](src/app/(automation)/workflows/CLAUDE.md) | 88줄 | Wildcard Invalidation + UseQueryOptions Forwarding — thin page composition |

### Notable Sub-Domains (LOW signal — 별도 scoped doc 없음)

부모 Next.js 패턴(이 문서)으로 거의 커버되지만, 아래 도메인은 한 가지 특이점이 있다.

- **`app/(inventory)/inventory/`** — `lib/barcode-print.ts` 의 `printBarcodeWindow()` (window.open + `<style>` 인쇄) + xlsx import/export. 브라우저 print API 직접 사용 케이스.
- **`app/settings/`** — 다양한 file upload (CSV/Image), printer 연결 (`PrinterSettings` 컴포넌트), health check + sync 운영 액션. system-level operations 가 한 페이지에 모임.
- **`app/(finance)/sales-analysis/`** — `Settlements` 탭이 streaming 패턴 (스트림 chunked download). xlsx export 도 함.
- **`app/(orders)/orders/`** — Pipeline state UI (ACCEPT → INSTRUCT → DEPARTURE → DELIVERING 시각화) + scheduled sync polling (`SYNC_HOURS` 상수로 정해진 시각마다 자동 sync invoke).
- **`components/panel/`** — Live slide-out 패널 (ADR-0010 SSE 예외). `AppLayout`에 상시 mount. PanelSseClient → Zustand store → Radix Sheet. Sidebar Bell 한 곳에서만 토글 (P3). PR1: workflow run only; PR2에서 agent/image/alert 확장.

각 도메인 작업 시 위 특이점만 의식하면 부모 Next.js 패턴으로 충분.

## Tests

- Vitest + @testing-library/react
- Config: `vitest.config.ts` (jsdom, @/ alias)
- Run: `npx vitest run`
- Test infrastructure core only (api-client, api-error). No implementation detail tests.
