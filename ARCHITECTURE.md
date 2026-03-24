# KidItem Architecture

키드아이템 이커머스 운영 자동화 시스템.
3개 기존 프로젝트를 통합하여 단일 monorepo로 구성.

## Origin — 3개 소스 프로젝트

| 프로젝트 | 역할 | 기술 스택 |
|---|---|---|
| `e-commerce-system` | 1688/Douyin 소싱 → AI 가공 → 쿠팡 상세페이지 | FastAPI + SQLAlchemy |
| `kiditem_dashboard` | LISTED 이후 운영 CRUD (주문/재고/손익/광고) | Next.js + Prisma |
| `kiditem_workflow_autosystem` | Agent OS 비전 프로토타입 | Next.js + Zustand + ReactFlow |

## 기술 스택

| 레이어 | 기술 | 포트 |
|---|---|---|
| **프론트엔드** | Next.js 14 + React 18 + Tailwind CSS | 3000 |
| **백엔드** | NestJS 11 + Prisma v7 | 4000 |
| **DB** | PostgreSQL 17 | 5433 |
| **외부 API** | Coupang Wing API (HMAC-SHA256) | — |
| **Phase 2 (미래)** | Python + asyncpg (Agent 워커) | — |

## Phase 전략

### Phase 1 — 서비스 기능 (현재)

```
사용자 → Next.js (3000) → NestJS API (4000) → PostgreSQL (5433)
                                    ↕
                              Coupang API
```

### Phase 2 — Agent 기능 (미래)

```
사용자 → Next.js → NestJS → PostgreSQL ← asyncpg ← Python Workers
                                  ↕
                             LISTEN/NOTIFY
```

- Python 워커는 HTTP 서버 없이 DB 폴링/LISTEN으로 작업 감지
- `.prisma` → Pydantic 모델 자동생성 (`@lexmata/prisma-python-generator`)
- Agent 간 직접 import 금지. DB 상태 관찰로만 소통

## 디렉토리 구조

```
kiditem/
├── prisma/
│   ├── schema.prisma              # 통합 스키마 (source of truth)
│   └── seed.ts                    # 시드 데이터
├── prisma.config.ts               # Prisma v7 설정
│
├── apps/
│   ├── web/                       # Next.js (프론트엔드 전용)
│   │   ├── src/
│   │   │   ├── app/               # 페이지 (라우팅 + UI)
│   │   │   │   ├── page.tsx       # 운영 대시보드
│   │   │   │   ├── products/      # 상품 관리
│   │   │   │   ├── orders/        # 주문 처리
│   │   │   │   ├── returns/       # 반품/교환
│   │   │   │   ├── inventory/     # 재고/발주
│   │   │   │   ├── profit-loss/   # 손익분석
│   │   │   │   ├── ads/           # 광고 관리
│   │   │   │   ├── reviews/       # 리뷰
│   │   │   │   ├── thumbnails/    # 썸네일 CTR
│   │   │   │   ├── core-products/ # 핵심상품 (A등급)
│   │   │   │   ├── cleanup/       # 저수익 정리
│   │   │   │   ├── reports/       # Excel 리포트
│   │   │   │   ├── settings/      # Coupang 연동
│   │   │   │   ├── workflows/     # 워크플로우 (자동화 뷰)
│   │   │   │   ├── logs/          # 실행 로그
│   │   │   │   └── layout.tsx
│   │   │   ├── components/        # 공유 UI
│   │   │   │   ├── layout/        #   AppLayout, Sidebar, Header
│   │   │   │   └── ui/            #   DataTable, MetricCard, StatusBadge
│   │   │   ├── store/             # Zustand (useStore.ts)
│   │   │   └── lib/
│   │   │       ├── api.ts         # API_BASE URL + apiFetch 헬퍼
│   │   │       └── utils.ts       # 포맷팅, 색상 유틸리티
│   │   └── package.json
│   │
│   └── server/                    # NestJS (백엔드 API)
│       ├── src/
│       │   ├── main.ts            # 엔트리 (port 4000, CORS, /api prefix)
│       │   ├── app.module.ts      # 루트 모듈 (11개 도메인 등록)
│       │   │
│       │   ├── products/          # 도메인 모듈 (Controller + Service)
│       │   ├── orders/            #   GET + POST (쿠팡 API)
│       │   ├── inventory/
│       │   ├── profit-loss/
│       │   ├── ads/
│       │   ├── reviews/
│       │   ├── thumbnails/
│       │   ├── returns/           #   GET + POST (쿠팡 API)
│       │   ├── companies/
│       │   ├── dashboard/         #   매출/손익/알림 집계
│       │   ├── alerts/
│       │   │
│       │   ├── coupang/           # Coupang HMAC 클라이언트
│       │   ├── prisma/            # PrismaModule (@Global)
│       │   └── common/            # Guards, Filters, Interceptors
│       ├── nest-cli.json
│       └── package.json
│
├── agents/                        # Phase 2: Python 워커 (미래)
│
├── docker-compose.yml             # PostgreSQL 17
└── package.json                   # monorepo (npm workspaces)
```

## 데이터베이스 스키마

PostgreSQL 17. Prisma ORM이 마이그레이션 소유.

```
companies ─────┐
               ├──→ users
               ├──→ products ──┬──→ inventory (1:1)
               │               ├──→ orders (customer→seller)
               │               ├──→ ads
               │               ├──→ profit_loss
               │               ├──→ thumbnails
               │               ├──→ reviews
               │               └──→ alerts
               └──→ purchase_orders ──→ purchase_order_items
                    (seller→supplier)
```

12 모델, UUID PK, timestamptz, native PG enum 금지.

### products 통합 설계

```
소싱 (e-commerce-system)          운영 (kiditem_dashboard)
──────────────────────           ──────────────────────
sourceUrl, sourcePlatform        sellPrice, commissionRate
costCny, marginRate              shippingCost, abcGrade
rawData, processedData           adTier, coupangProductId
```

### orders vs purchase_orders

- `orders` = 판매주문 (고객 → 셀러). 쿠팡/네이버 등.
- `purchase_orders` = 구매발주 (셀러 → 1688/공급사).

## NestJS 백엔드 구조

각 도메인 = Module + Controller + Service. 하나의 NestJS 인스턴스에서 동작.

| 도메인 | Route | Method | 기능 |
|---|---|---|---|
| dashboard | `/api/dashboard` | GET | 매출/손익/알림 집계 |
| products | `/api/products` | GET, POST | 상품 CRUD |
| orders | `/api/orders` | GET, POST | 쿠팡 주문 조회/승인/송장 |
| inventory | `/api/inventory` | GET | 재고 현황 + 발주 계산 |
| profit-loss | `/api/profit-loss` | GET | 월별 손익 분석 |
| ads | `/api/ads` | GET | 광고비/ROAS/CTR |
| reviews | `/api/reviews` | GET | 리뷰 집계 |
| thumbnails | `/api/thumbnails` | GET | 썸네일 CTR 모니터링 |
| returns | `/api/returns` | GET, POST | 반품/교환 (쿠팡 API) |
| companies | `/api/companies` | GET | 회사 목록 |
| alerts | `/api/alerts` | GET | 시스템 알림 |

PrismaModule은 `@Global()`로 등록 — 모든 Service에서 `PrismaService` 주입.

나중에 특정 도메인을 독립 서비스로 분리할 때: 해당 폴더를 떼어서 별도 NestJS 프로젝트로 만들고, PrismaService를 자체 DB 연결로 교체하면 됨.

## 외부 API 연동

### Coupang Wing API

`apps/server/src/coupang/client.ts`에 HMAC-SHA256 인증 구현.

- 주문 조회/확인/송장 업로드 (`orders.ts`)
- 상품 목록 조회 (`products.ts`)

환경변수: `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`, `COUPANG_VENDOR_ID`

## 개발 환경

```bash
# 인프라 시작
docker compose up -d

# Prisma 클라이언트 생성
npm run db:generate

# DB 스키마 적용
export DATABASE_URL="postgresql://kiditem:kiditem@localhost:5433/kiditem"
npm run db:push

# 시드 데이터
npm run db:seed

# 개발 서버 (터미널 2개)
cd apps/server && npm run start:dev   # NestJS → localhost:4000
cd apps/web && npm run dev            # Next.js → localhost:3000
```

환경변수:
- 루트 `.env` 또는 `export`: `DATABASE_URL`
- `apps/web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:4000`
- `apps/server`: `DATABASE_URL`, `COUPANG_*` 키들

## 이식 현황

### 완료

- [x] 3개 프로젝트 통합 (스키마 + 코드)
- [x] Prisma ORM + PostgreSQL 17 (12 모델)
- [x] NestJS 백엔드 분리 (11개 도메인 모듈)
- [x] Next.js 프론트엔드 전용 전환 (17 pages, 0 API routes)
- [x] 시드 데이터 (10 상품, 주문, 손익, 광고, 리뷰, 알림)
- [x] 라이트 테마 통일
- [x] 대시보드/설정 페이지 통합
- [x] Coupang HMAC 클라이언트

### 미착수

- [ ] 인증/세션 관리
- [ ] Mock 데이터 완전 제거 (workflow 페이지의 useStore 하드코딩)
- [ ] Phase 2: Python agent layer

## 규칙

- **Native PG enum 금지** → `String` 필드 + app-level validation
- **Server Components 미사용** → 모든 페이지 `'use client'`
- **Agent 간 직접 import 금지** (Phase 2) → DB 상태 관찰로만 소통
- **Silent model fallback 금지** → `model = model or default` 패턴 금지
- **도메인 모듈 자기 완결** → Controller + Service + DTO가 한 폴더에
