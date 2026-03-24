# apps/web — Next.js Frontend

프론트엔드 전용. API Routes 없음. 모든 데이터는 NestJS(`localhost:4000`)에서 fetch.

## 실행

```bash
npm run dev    # localhost:3000
npm run build  # 프로덕션 빌드
```

환경변수: `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000`

## 디렉토리

```
src/
├── app/                    # 페이지 (Next.js App Router)
│   ├── page.tsx            # 운영 대시보드
│   ├── sourcing/           # 소싱 파이프라인 (수집, 편집, 에디터)
│   ├── generate/           # AI 콘텐츠 생성
│   ├── products/           # 상품 관리 (운영)
│   ├── products/[id]/      # 상품 상세 (Object View — 메트릭+재고+활동이력+액션)
│   ├── orders/             # 주문
│   ├── inventory/          # 재고
│   ├── ads/                # 광고 관리
│   ├── profit-loss/        # 손익표
│   ├── reviews/            # 리뷰 관리
│   ├── thumbnails/         # 썸네일 관리 (CTR 추적)
│   ├── core-products/      # 핵심상품 (A등급 전용)
│   ├── cleanup/            # 정리 대상 (순이익 3% 이하)
│   ├── reports/            # 리포트/엑셀 출력
│   ├── workflows/          # 워크플로우 관리
│   └── ...
├── components/
│   ├── layout/             # AppLayout, Sidebar, Header
│   ├── ui/                 # DataTable, MetricCard, StatusBadge
│   └── editor/             # GrapesJS 에디터 (DetailPageEditor, AI 패널)
├── store/                  # Zustand (useStore.ts)
└── lib/
    ├── api.ts              # API_BASE 상수 + apiFetch
    ├── sourcing-api.ts     # productsApi, sourcingApi (소싱 전용)
    └── utils.ts            # formatKRW, formatPercent, cn 등
```

## 규칙

- 모든 페이지 `'use client'` (Server Components 미사용)
- API 호출: `fetch(\`${API_BASE}/api/...\`)` — 절대 `/api/` 직접 호출 금지
- 라이트 테마: `bg-white`, `bg-gray-50`, `border-gray-200`, `text-gray-900`
- 테이블 스타일: `globals.css`의 `@layer base`에 정의됨 (별도 클래스 불필요)
- 소싱 페이지: `draft`/`processing`/`processed` 상품만 표시
- 운영 페이지 (products, orders 등): `active` 상품 표시

## 소싱 vs 운영 페이지

| 소싱 (`/sourcing`) | 운영 (`/products`) |
|---|---|
| 수집된 상품 (draft) | 등록된 상품 (active) |
| `productsApi` from `sourcing-api.ts` | `fetch(\`${API_BASE}/api/products\`)` |
| 중국어 원본 데이터 | 한국어 가공 데이터 |
| AI 가공 버튼 | 매출/손익 분석 |

## API 응답 매핑

NestJS는 camelCase, 프론트는 snake_case 타입 사용:
- `sourcing-api.ts`의 `getDetail()`, `list()`에서 매핑 처리
- `p.thumbnailUrl` → `thumbnail_url`, `p.rawData` → `raw_data`
