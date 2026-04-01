# apps/web — Next.js Frontend

프론트엔드 전용. API Routes 없음. 모든 데이터는 NestJS(`localhost:4000`)에서 fetch.

## 실행

```bash
npm run dev    # localhost:3000
npm run build  # 프로덕션 빌드
npx vitest run # 테스트 실행
```

환경변수: `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000`

## 디렉토리

```
src/
├── app/                        # 페이지 (Next.js App Router)
│   ├── page.tsx                # 운영 대시보드
│   ├── sourcing/               # 소싱 (수집, 편집, 에디터) + components/
│   ├── generate/               # AI 콘텐츠 생성 + components/
│   ├── products/               # 상품 관리 + components/
│   ├── products/[id]/          # 상품 상세 + components/
│   ├── orders/                 # 주문 조회
│   ├── agents/                 # 에이전트 + [id]/ + activity/ + costs/ + org/ + skills/
│   ├── workflows/              # 워크플로우 관리
│   ├── settings/               # 설정 + components/ (탭별)
│   └── ...                     # 기타 도메인별 페이지
├── components/
│   ├── layout/                 # AppLayout, Sidebar, Header
│   ├── ui/                     # DataTable, MetricCard, StatusBadge, Pagination
│   ├── providers/              # QueryProvider (TanStack React Query)
│   ├── dashboard/              # 대시보드 섹션 컴포넌트 7개
│   ├── workflows/              # WorkflowCanvas, WorkflowList 등
│   ├── marketplace/            # MarketplaceCard, InstallModal
│   ├── ontology/               # OntologyGraph, BrandNode 등
│   └── editor/                 # GrapesJS 에디터 (DetailPageEditor, AI 패널)
├── hooks/                      # React Query 커스텀 훅
│   ├── use-agents.ts           # 12 훅 (6 query + 6 mutation)
│   ├── use-workflows.ts        # 7 훅 (4 query + 3 mutation)
│   └── use-marketplace.ts      # 6 훅 (2 query + 4 mutation)
├── store/                      # Zustand (sidebar 상태만)
└── lib/
    ├── api-client.ts           # 통합 API 클라이언트 (get/post/patch/put/delete/fetchRaw)
    ├── api-error.ts            # ApiError 클래스 + isApiError 타입 가드
    ├── api.ts                  # API_BASE 상수 + getCompanyId (URL resolve용)
    ├── query-client.ts         # QueryClient 팩토리 (staleTime 1분, gcTime 5분)
    ├── query-keys.ts           # Query Key Factory (22개 도메인)
    ├── agent-api.ts            # 에이전트 API (agentApi 객체)
    ├── workflow-api.ts         # 워크플로우 API (workflowApi 객체)
    ├── marketplace-api.ts      # 마켓플레이스 API (marketplaceApi 객체)
    ├── sourcing-api.ts         # 소싱 API (productsApi, sourcingApi)
    ├── agent-types.ts          # @kiditem/shared re-export + UI 상수
    ├── workflow-types.ts       # @kiditem/shared re-export + 헬퍼
    ├── marketplace-types.ts    # @kiditem/shared re-export + UI 타입
    └── utils.ts                # formatKRW, formatPercent, cn 등
```

## 규칙

### API 호출
- **`apiClient.get/post/patch/delete`** from `@/lib/api-client` 사용 (raw fetch 금지)
- blob 응답: `apiClient.fetchRaw()` 사용
- `API_BASE` 직접 사용은 이미지 URL resolve 등 비-fetch 용도만 허용

### 데이터 패칭
- **`useQuery` / `useMutation`** from `@tanstack/react-query` 사용 (useState+useEffect+fetch 금지)
- 커스텀 훅 있으면 사용 (`useAgents()`, `useWorkflows()`, `useMarketplaceAgents()`)
- 커스텀 훅 없는 도메인은 inline `useQuery` + `queryKeys.*`
- 폴링: `refetchInterval` 옵션 사용 (setInterval 금지)
- mutation 후: `queryClient.invalidateQueries({ queryKey: queryKeys.xxx.all })`

### 타입
- API 응답 타입: `@kiditem/shared`에서 import (`import type { ProductListItem } from '@kiditem/shared'`)
- 1개 페이지 전용 타입: 인라인 허용 (Novu 패턴)
- Props: 컴포넌트 파일에 인라인 (export 안 함)
- 2-3개 컴포넌트 공유: 부모에서 export → 자식에서 import

### 에러 처리
- `isApiError(err)` from `@/lib/api-error`로 분기
- 사용자 알림: `toast.error/success` from `sonner` (alert() 금지, prompt/confirm 제외)
- 글로벌 에러: QueryCache onError에서 자동 toast

### UI
- 모든 페이지 `'use client'` (Server Components 미사용)
- 라이트 테마: `bg-white`, `bg-gray-50`, `border-gray-200`, `text-gray-900`
- 테이블 스타일: `globals.css`의 `@layer base`에 정의됨
- 소싱 페이지: `draft`/`processing`/`processed` 상품만 표시
- 운영 페이지: `active` 상품 표시
- 페이지 컴포넌트: 200줄 이하 목표 → 초과 시 components/ 폴더로 분리

## 테스트

- 프레임워크: Vitest + @testing-library/react
- 설정: `vitest.config.ts` (jsdom, @/ alias)
- 셋업: `test/setup.ts` (@testing-library/jest-dom)
- 실행: `npx vitest run` (apps/web 디렉토리에서)
- 테스트 파일: `test/*.test.{ts,tsx}`
- 인프라 핵심만 테스트: api-client, api-error (구현 세부사항 테스트 금지)
