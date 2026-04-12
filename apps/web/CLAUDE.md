# apps/web — Next.js Frontend

Frontend only. No API Routes. All data fetched from NestJS (`localhost:4000`).

## Run

```bash
npm run dev    # localhost:3000
npm run build  # Production build
npx vitest run # Tests
```

Env: `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000`

## Rules

### API Calls
- Use **`apiClient.get/post/patch/delete`** from `@/lib/api-client` (no raw fetch)
- For blob responses: `apiClient.fetchRaw()`
- Direct `API_BASE` usage only for non-fetch purposes (e.g., image URL resolution)

### Data Fetching
- Use **`useQuery` / `useMutation`** from `@tanstack/react-query` (no useState+useEffect+fetch)
- Domain hooks are co-located: `app/agents/hooks/useAgents.ts`, `app/workflows/hooks/useWorkflows.ts`
- Cross-domain hooks stay in `src/hooks/`: `useMarketplace.ts`
- For domains without custom hooks: inline `useQuery` + `queryKeys.*` from `lib/query-keys.ts`
- Polling: `refetchInterval` option (no setInterval)
- After mutation: `queryClient.invalidateQueries({ queryKey: queryKeys.xxx.all })`

### Types
- API response types: import from `@kiditem/shared` (`import type { ProductListItem } from '@kiditem/shared'`)
- Single-page types: inline allowed (Novu pattern)
- Props: inline in component file (don't export)
- Shared across 2-3 components: export from parent → import in children

### Error Handling
- Branch with `isApiError(err)` from `@/lib/api-error`
- User notifications: `toast.error/success` from `sonner` (no alert(), except prompt/confirm)
- Global errors: auto-toast via QueryCache onError

### Styling
- **Tailwind CSS** + `cn()` utility from `@/lib/utils` (clsx + tailwind-merge)
- Light theme: `bg-white`, `bg-gray-50`, `border-gray-200`, `text-gray-900`
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

Each route can have co-located directories:
```
app/{domain}/
  page.tsx           # Composition layer (hooks + state + component imports)
  components/        # Domain-specific UI components
  hooks/             # Domain-specific custom hooks
  lib/               # Domain-specific utilities, constants, types
```

Shared directories (`src/components/`, `src/hooks/`, `src/lib/`) contain ONLY cross-domain code (2+ domains):
- `src/components/ui/` — PageSkeleton, Pagination, DateRangePicker, StatusBadge
- `src/components/layout/` — AppLayout, Header, Sidebar
- `src/components/marketplace/` — InstallModal, MarketplaceCard (agents + workflows)
- `src/hooks/` — useMarketplace.ts (agents + workflows)
- `src/lib/` — api-client, api-error, query-keys, utils (universal infra)

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
- Zustand: sidebar state only (`store/`)
- Server state: all via React Query

## Tests

- Vitest + @testing-library/react
- Config: `vitest.config.ts` (jsdom, @/ alias)
- Run: `npx vitest run`
- Test infrastructure core only (api-client, api-error). No implementation detail tests.
