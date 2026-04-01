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
- Use custom hooks when available: `hooks/use-agents.ts`, `use-workflows.ts`, `use-marketplace.ts`
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

### UI
- All pages `'use client'` (no Server Components)
- Light theme: `bg-white`, `bg-gray-50`, `border-gray-200`, `text-gray-900`
- Table styles: defined in `globals.css` `@layer base`
- Page components: target under 200 lines → extract to `components/` folder when exceeded

### State Management
- Zustand: sidebar state only (`store/`)
- Server state: all via React Query

## Tests

- Vitest + @testing-library/react
- Config: `vitest.config.ts` (jsdom, @/ alias)
- Run: `npx vitest run`
- Test infrastructure core only (api-client, api-error). No implementation detail tests.
