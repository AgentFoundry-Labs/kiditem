# KidItem

키드아이템 이커머스 운영 자동화. 소싱 → AI 가공 → 리스팅 → 운영.

## 빠른 시작 (새 팀원)

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
npm install

# 환경변수 설정
cp apps/server/.env.example apps/server/.env   # NestJS — DB, Coupang, Gemini 키
cp agents/.env.example agents/.env             # Python agents — AI 모델 키 (OpenAI, Gemini, fal, Langfuse)

# 인프라 실행
docker compose up -d                           # PostgreSQL + NestJS + Python Agents
npm run db:push                                # 스키마 적용

# 프론트엔드
npm run dev                                    # Next.js (localhost:3000)
```

### 상세페이지 생성 테스트

1. `agents/.env`에 AI 키 설정 필수: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `FAL_KEY`
2. `docker compose up -d --build` (서버 + 에이전트 모두 실행)
3. `localhost:3000/sourcing` → 상품 선택 → 에디터 → AI 생성 버튼

## 협업 규칙

### 브랜치

- `main` — 안정 브랜치. 직접 push 금지.
- `feat/{issue번호}-{설명}` — 기능 브랜치. 예: `feat/1-core-services`
- `fix/{설명}` — 버그 수정
- PR → 리뷰 → main merge. squash merge 권장.

### 커밋

```
feat: 기능 추가
fix: 버그 수정
refactor: 리팩토링 (기능 변경 없음)
docs: 문서 변경
test: 테스트 추가/수정
```

### PR

- 이슈 번호 연결: `Closes #1`
- 변경 파일이 많으면 도메인별로 PR 분리
- CLAUDE.md 변경 시 다른 팀원에게 공유

### 작업 범위 분리 (AI 코딩 에이전트 사용 시)

- 한 세션에서 한 도메인만 작업. 여러 도메인 동시 수정 금지.
- 다른 사람이 작업 중인 파일 수정 전 pull 먼저.
- `prisma/schema.prisma` 수정 시 반드시 `npm run db:push` 후 커밋.

## Structure

npm workspaces monorepo. PostgreSQL + Prisma + NestJS + Next.js + Python agents.

```
apps/web/            — Next.js 14 (프론트엔드 전용, API Routes 없음)
apps/server/         — NestJS 11 (백엔드 API, 도메인별 모듈)
agents/              — Python 3.11+ (백그라운드 워커, asyncpg)
apps/server/agent-config/ — Claude CLI 에이전트 런타임 설정 (규칙, 스킬)
packages/shared/     — @kiditem/shared (Zod 스키마 + TypeScript 타입 + 에러 코드)
packages/templates/  — React 상세페이지 템플릿 (bold-vertical, simple-vertical)
extensions/          — Chrome 익스텐션 (1688/Alibaba 스크래퍼)
docs/                — 프로젝트 문서 (아키텍처, 리팩토링 계획)
prisma/              — 공유 스키마 (source of truth)
```

## Commands

```bash
docker compose up -d                 # PostgreSQL + NestJS + Python Agents
docker compose up -d --build         # 코드 변경 후 전체 리빌드
docker compose up -d --build server  # NestJS만 리빌드
docker compose up -d --build agents  # Python agents만 리빌드
docker compose logs -f agents        # Agent 로그 확인
npm run db:push                      # 스키마 적용
npm run dev                          # Next.js 프론트엔드 (localhost:3000)
npm run dev:server                   # NestJS 로컬 개발 (Docker 대신)
```

## Ports

| 서비스 | 포트 | Docker |
|---|---|---|
| Next.js (프론트) | 3000 | ✗ 로컬 |
| NestJS (백엔드) | 4000 | ✓ |
| Python Agents | — (워커) | ✓ |
| PostgreSQL | 5433 | ✓ |

## 아키텍처 레이어

```
[프론트엔드] Next.js — 화면 표시, 사용자 입력
     ↓ apiClient (TanStack Query)
[백엔드 API] NestJS — ValidationPipe + DTO → 비즈니스 로직 → GlobalExceptionFilter
     ↓ Prisma         ↓ spawn('claude', ...)       ↓ agent_tasks INSERT
[DB] PostgreSQL    [Claude CLI Agents]          [Python Agents]
                    판단/분석 에이전트              생성/처리 에이전트
                    (광고, 건강도 평가)            (이미지, 콘텐츠, 소싱)
```

에이전트는 **2개 런타임**으로 나뉨:
- **Claude CLI agents**: NestJS가 `claude -p`로 spawn. 자연어 규칙 해석/판단 작업. `agent-registry`로 관리.
- **Python agents**: DB 폴링 기반 백그라운드 워커. 이미지 API, 스크래핑 등 처리 작업. `runner.py`로 관리.

### @kiditem/shared 패키지

프론트-백엔드 공유 타입 패키지. Zod 스키마 → `z.infer<>` 타입 추론.

```
packages/shared/
├── src/schemas/     — 도메인별 Zod 스키마 (product, order, inventory 등)
├── src/errors/      — ErrorCodes (12 도메인) + AppException
├── src/types/       — z.infer 기반 타입 re-export
└── src/index.ts     — barrel export
```

- **Subpath exports**: `@kiditem/shared`, `@kiditem/shared/schemas`, `@kiditem/shared/errors`
- **Dual format**: ESM (프론트) + CJS (백엔드)
- **satisfies 패턴**: 서비스 17곳에서 `satisfies z.infer<typeof Schema>`로 Prisma-Zod drift 감지
- 새 타입 추가 시: `schemas/` 에 Zod 스키마 정의 → `index.ts`에 export → `npm run build`

### 워크플로우 vs 에이전트 경계

| | 워크플로우 | 에이전트 |
|---|---|---|
| **역할** | 데이터 파이프라인 (수집→변환→필터→알림) | AI 판단/분석 (규칙 해석, 전략 결정) |
| **실행** | 고정 DAG 순회, 결정적 | 자연어 프롬프트, 비결정적 |
| **AI 사용** | 금지 — AI 필요 시 `agent_task.create`로 위임 | 핵심 역할 |
| **예시** | DB 조회 → 재고 부족 필터 → 알림 | "이 상품 ROAS 고려해서 광고 중단 판단" |

**원칙: 워크플로우에서 직접 LLM을 호출하지 않는다.** AI 판단이 필요하면 `agent_task.create` 노드로 에이전트에게 위임한다.

### NestJS 백엔드 패턴

```
apps/server/src/{domain}/
├── {domain}.module.ts
├── {domain}.controller.ts   — @Controller + class-validator DTO
├── {domain}.service.ts      — 비즈니스 로직 + Prisma
└── dto/                     — Request/Response DTO (class-validator)
    ├── {operation}.dto.ts
    └── index.ts
```

- `ValidationPipe({ whitelist: true, transform: true })` — 글로벌 자동 검증
- `GlobalExceptionFilter` — 모든 에러를 `{ statusCode, error, message, timestamp, path }` 형태로 통일
- `ErrorCodes` — `@kiditem/shared`에서 import. 12개 도메인 에러 코드.
- `PrismaModule`이 `@Global()` → 모든 Service에서 `PrismaService` 주입
- 도메인 모듈 간 직접 import 금지 → PrismaService만 공유

### 프론트엔드 패턴

- 모든 페이지 `'use client'` (Server Components 미사용)
- **API 호출**: `apiClient.get/post/patch/delete` from `@/lib/api-client` (raw fetch 금지)
- **데이터 패칭**: TanStack React Query (`useQuery` / `useMutation`)
- **커스텀 훅**: `hooks/use-agents.ts`, `use-workflows.ts`, `use-marketplace.ts`
- **Query Keys**: `lib/query-keys.ts` (22개 도메인 키 팩토리)
- **에러 처리**: `ApiError` + `isApiError()` from `@/lib/api-error`
- **토스트**: `toast.error/success` from `sonner` (QueryCache 글로벌 에러 연동)
- **타입**: `@kiditem/shared`에서 import. 1개 페이지 전용 타입은 인라인 (Novu 패턴).
- 라이트 테마: `bg-white`, `border-gray-200`, `text-gray-900`
- 상세 규칙: `apps/web/CLAUDE.md`

### 백엔드 도메인 모듈

```
apps/server/src/
├── products/          — 상품 CRUD + 리뷰 + 썸네일
├── advertising/       — 광고 관리 (products에서 분리)
├── orders/            — 주문 + 반품 + CS
├── inventory/         — 재고 + 입출고
├── procurement/       — 발주 관리 (inventory에서 분리)
├── channels/          — 채널 통합 (adapters/coupang/)
├── workflows/         — 워크플로우 엔진
├── agent-registry/    — 에이전트 플랫폼 (Paperclip 패턴)
├── marketplace/       — 에이전트/워크플로우 카탈로그
├── rules/             — 비즈니스 규칙 + 알림
├── finance/           — 손익 + 매출 분석
├── sourcing/          — 1688 소싱
├── ai/                — AI 서비스 (텍스트, 이미지)
├── dashboard/         — 대시보드 집계
├── activity-events/   — 활동 이력
├── ontology/          — 데이터 온톨로지
├── companies/         — 멀티테넌트
└── common/            — 공유 (pagination, dto, filters)
```

### 워크플로우 엔진

셀러 관리 특화 워크플로우 자동화. NestJS 기반 실행 엔진.

```
apps/server/src/workflows/          — 엔진 + API + 노드 카탈로그
apps/server/src/workflows/executors/ — 노드 실행기 (표준 엔티티 필수)
apps/server/src/workflows/actions/   — 액션 카탈로그 (AI 추천용)
```

- 실행: 스택 기반 DAG 순회 (n8n 패턴). 에러 시 로깅 후 중단, 재시도 없음.
- 데이터 플로우: `{{nodes.X.output.Y}}` 템플릿으로 노드 간 데이터 참조.
- AI 분석: 워크플로우 완료 후 자동 1회 (Gemini + responseSchema → structured JSON).
- 외부 API 데이터는 `StandardOrder`, `StandardProduct` 등 표준 타입으로 변환 필수.
- 상세 규칙: `apps/server/src/workflows/CLAUDE.md`.

### Agent Platform (Paperclip + Claude Code 패턴)

```
apps/server/src/agent-registry/     — 에이전트 플랫폼 코어
├── adapters/                       — 런타임 추상화 (Strategy 패턴)
│   └── claude-local/               — Claude CLI spawn 구현
├── heartbeat/                      — Heartbeat 실행 엔진 + 에러 캐스케이드
├── wakeup/                         — Wakeup 요청 큐 (coalescing)
├── events/                         — EventEmitter2 + SSE (Observer 패턴)
├── schemas/                        — Structured Output Zod 검증
├── skills/                         — Skills 주입 (symlink)
├── domains/                        — 도메인별 후처리
│   ├── ad-strategy/                — 광고 전략
│   └── manager/                    — 매니저 + 워크플로우 (Async Generator 패턴)
├── dto/                            — class-validator DTO
└── seed-agents.ts                  — 기본 에이전트 정의

apps/server/src/feature-gate/       — 피처 게이트 (@Global, DB 기반)
apps/server/src/rules/              — 건강도 평가 (도메인 후처리)
```

- **상세 규칙: `apps/server/src/agent-registry/CLAUDE.md`**

**적용된 Claude Code 패턴 5개:**
1. **Strategy** — AdapterModule 인터페이스 (새 런타임 추가 시 adapter만 구현)
2. **Observer/Pub-Sub** — EventEmitter2 + SSE (에이전트 상태 실시간 알림)
3. **Async Generator** — 매니저 워크플로우 (Human-in-the-loop 승인)
4. **피처 게이트** — DB 기반 런타임 게이트 (멀티테넌트 점진 롤아웃)
5. **Immutable Context** — Readonly + Object.freeze (실행 컨텍스트 변조 방지)

### Python Agent 패턴 (생성/처리)

```
agents/src/agents/{name}/
├── agent.py          — BaseAgent 상속, execute() 구현
└── *.py              — 서비스 로직
```

에이전트 종류:
- `content` — AI 상세페이지 생성 (2-step: 카피 생성 → 이미지 편집)
- `image_edit` — 개별 이미지 AI 편집
- `sourcing` — 1688 스크래핑, Douyin 라이브
- `inventory` — 재고 부족 감지

## Prisma 규칙

- 스키마: `prisma/schema.prisma` (루트)
- `@@map("snake_case")` 으로 테이블명 매핑
- camelCase 필드명 (Prisma) → snake_case DB 컬럼 (`@map`)
- Native PG enum 금지 → `String` 필드 + app-level validation
- UUID PK: `@default(uuid()) @db.Uuid`
- 스키마 수정 후 반드시 `npm run db:push` + `npx prisma generate`
- Zod 스키마와 동기화: 서비스에서 `satisfies z.infer<typeof Schema>` 패턴 사용

## Overrides

- **Native PG enum 금지** → `String` + validation. 프로덕션 cast 에러 경험.
- **Server Components 미사용** → 모든 페이지 `'use client'`.
- **Python Agent 간 직접 import 금지** → DB 상태 관찰로만 소통.
- **Silent model fallback 금지** → `model = model or default` 패턴 금지.
- **프론트에서 직접 DB 접근 금지** → 반드시 NestJS API 경유.
- **API 경로에 /v1/ 금지** → `/api/{domain}` 직접 매핑.
- **도메인 모듈 자기 완결** → Controller + Service + DTO가 한 폴더에.
- **워크플로우 AI 분석은 실행당 1회만** → 개별 노드에 ai.analyze 넣지 말 것.
- **raw fetch 금지** → `apiClient.get/post/patch/delete` 사용. blob은 `apiClient.fetchRaw`.
- **useState+useEffect fetch 금지** → `useQuery` / `useMutation` 사용.
- **alert() 금지** → `toast.error/success` from `sonner` 사용 (prompt/confirm 제외).
- **200 응답에 ok: false 금지** → 실패 시 반드시 HttpException throw.

## 테스트

```bash
cd apps/server && npx vitest run    # 백엔드 테스트
cd apps/web && npx vitest run       # 프론트엔드 테스트
```

- 프레임워크: Vitest
- 백엔드: `src/**/__tests__/*.spec.ts` (GlobalExceptionFilter, DTO 검증, 도메인 서비스)
- 프론트: `test/*.test.{ts,tsx}` (apiClient, ApiError)
- 인프라 핵심 테스트만 유지 — 구현 세부사항(배선) 테스트 금지 (TkDodo 권고)

## Project

**KidItem**

키드아이템 이커머스 운영 자동화 플랫폼. 중국(1688/타오바오) 소싱 상품을 AI로 가공하여 한국 마켓플레이스에 리스팅하는 셀러 운영 도구. Next.js 프론트엔드 + NestJS 백엔드 + Python AI 에이전트 구조.

**Core Value:** 소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환하고, 운영 전반을 하나의 대시보드에서 관리한다.

### Constraints

- **Tech stack**: 기존 스택 유지 (NestJS + Next.js + Prisma + PostgreSQL)
- **DB**: Native PG enum 금지 → String + validation
- **Architecture**: 프론트 → NestJS API → DB 흐름 유지
- **Frontend**: 'use client' only, apiClient + useQuery, Sonner 토스트, 라이트 테마
- **Backend**: class-validator DTO + ValidationPipe, GlobalExceptionFilter, @kiditem/shared 타입
- **Types**: @kiditem/shared가 single source of truth. 프론트 인라인 타입은 1개 페이지 전용만 허용.

## 환경변수

### apps/server/.env

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem
COUPANG_ACCESS_KEY=         # 쿠팡 Wing API
COUPANG_SECRET_KEY=
COUPANG_VENDOR_ID=
GEMINI_API_KEY=             # 텍스트 AI (워크플로우 분석)
AI_TEXT_MODEL=gemini-2.5-flash
```

### agents/.env

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem

# AI API 키
AI_MODE=proxy                        # proxy (VectorEngine) 또는 direct
AI_BASE_URL=https://api.vectorengine.ai/v1
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
VECTORENGINE_API_KEY=sk-...
FAL_KEY=...

# AI 모델
AI_TEXT_MODEL=gemini-2.5-flash                    # 카피 생성
AI_IMAGE_ANALYSIS_MODEL=gemini-3.1-flash-lite-preview  # 상품 이미지 분석
AI_IMAGE_MODEL=gemini-3.1-flash-image-preview     # 히어로/배너 이미지 생성
AI_IMAGE_EDIT_MODEL=fal-ai/flux-2-pro/edit        # 이미지 편집 (fal)
AI_IMAGE_DETAIL_MODEL=fal-ai/flux-pro/kontext/max # 상세 이미지 편집 (fal)
AI_IMAGE_EDIT_SIZE_MODEL=gemini-3.1-flash-image-preview  # 사이즈 차트 편집

# Langfuse Cloud
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Runner
POLL_INTERVAL_SECONDS=5
```
