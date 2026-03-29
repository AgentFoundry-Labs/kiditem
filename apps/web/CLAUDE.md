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
├── app/                    # 페이지 (Next.js App Router)
│   ├── page.tsx            # 운영 대시보드
│   ├── sourcing/           # 소싱 파이프라인 (수집, 편집, 에디터)
│   ├── generate/           # AI 콘텐츠 생성
│   ├── products/           # 상품 관리 (운영)
│   ├── products/[id]/      # 상품 상세 (Object View — 메트릭+재고+활동이력+액션)
│   ├── orders/             # 주문 조회
│   ├── cs-management/      # CS 관리 (Phase 2)
│   ├── unshipped-items/    # 미배송 조회 (Phase 2)
│   ├── core-products/      # 핵심상품 (A등급 전용)
│   ├── cleanup/            # 정리 대상 (순이익 3% 이하)
│   ├── inventory/          # 재고 현황
│   ├── purchase-orders/    # 발주 관리 (Phase 2)
│   ├── stock-movement/     # 입출고 현황 (Phase 2)
│   ├── returns/            # 반품 관리
│   ├── profit-loss/        # 손익 분석
│   ├── sales-analysis/     # 통합매출분석 (Phase 2)
│   ├── ads-hub/            # 광고 대시보드 (Phase 2)
│   ├── reviews/            # 리뷰 관리 (Phase 1 — 필터 탭, 통계 카드)
│   ├── thumbnails/         # 썸네일 AI (CTR 추적)
│   ├── ontology/           # Ontology (Phase 1 — 상품 카테고리/브랜드 시각화)
│   ├── reports/            # 리포트/엑셀 출력
│   ├── settings/           # 설정 (Phase 1 — 회사정보, 쿠팡연동, 공통코드)
│   ├── workflows/          # 워크플로우 관리
│   └── logs/               # 실행 로그
├── components/
│   ├── layout/             # AppLayout, Sidebar, Header
│   ├── ui/                 # DataTable, MetricCard, StatusBadge, Pagination
│   └── editor/             # GrapesJS 에디터 (DetailPageEditor, AI 패널)
├── store/                  # Zustand (useStore.ts)
└── lib/
    ├── api.ts              # API_BASE 상수 + apiFetch
    ├── sourcing-api.ts     # productsApi, sourcingApi (소싱 전용)
    └── utils.ts            # formatKRW, formatPercent, cn 등
```

## 사이드바 구조 (8 섹션, 23 항목)

| 섹션 | 항목 | 경로 | 상태 |
|---|---|---|---|
| 소싱 | 소싱/수집 | `/sourcing` | 구현됨 |
| 소싱 | 콘텐츠 생성 | `/generate` | 구현됨 |
| 주문 | 대시보드 | `/` | 구현됨 |
| 주문 | 주문 조회 | `/orders` | 구현됨 |
| 주문 | CS 관리 | `/cs-management` | Phase 2 |
| 주문 | 미배송 조회 | `/unshipped-items` | Phase 2 |
| 상품 | 상품 관리 | `/products` | 구현됨 |
| 상품 | 핵심상품 | `/core-products` | 구현됨 |
| 상품 | 정리대상 | `/cleanup` | 구현됨 |
| 재고 | 재고 현황 | `/inventory` | 구현됨 |
| 재고 | 발주 관리 | `/purchase-orders` | Phase 2 |
| 재고 | 입출고 현황 | `/stock-movement` | Phase 2 |
| 출고 | 반품 관리 | `/returns` | 구현됨 |
| 분석 | 손익 분석 | `/profit-loss` | 구현됨 |
| 분석 | 통합매출분석 | `/sales-analysis` | Phase 2 |
| 분석 | 광고 대시보드 | `/ads-hub` | Phase 2 |
| 운영 | 리뷰 관리 | `/reviews` | Phase 1 강화 |
| 운영 | 썸네일 AI | `/thumbnails` | 구현됨 |
| 운영 | Ontology | `/ontology` | Phase 1 신규 |
| 운영 | 리포트 | `/reports` | 구현됨 |
| 운영 | 설정 | `/settings` | Phase 1 강화 |
| 자동화 | 워크플로우 | `/workflows` | 구현됨 |
| 자동화 | 실행 로그 | `/logs` | 구현됨 |

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

## 테스트

- 프레임워크: Vitest + @testing-library/react
- 설정: `vitest.config.ts` (jsdom, @/ alias)
- 셋업: `test/setup.ts` (@testing-library/jest-dom)
- 실행: `npx vitest run` (apps/web 디렉토리에서)
- 테스트 파일: `test/*.test.{ts,tsx}`
