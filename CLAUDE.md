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
     ↓ fetch
[백엔드 API] NestJS — CRUD, 비즈니스 로직, 에이전트 오케스트레이션
     ↓ Prisma         ↓ spawn('claude', ...)       ↓ agent_tasks INSERT
[DB] PostgreSQL    [Claude CLI Agents]          [Python Agents]
                    판단/분석 에이전트              생성/처리 에이전트
                    (광고, 건강도 평가)            (이미지, 콘텐츠, 소싱)
```

에이전트는 **2개 런타임**으로 나뉨:
- **Claude CLI agents**: NestJS가 `claude -p`로 spawn. 자연어 규칙 해석/판단 작업. `agent-registry`로 관리.
- **Python agents**: DB 폴링 기반 백그라운드 워커. 이미지 API, 스크래핑 등 처리 작업. `runner.py`로 관리.

### NestJS 백엔드 패턴

```
apps/server/src/{domain}/
├── {domain}.module.ts
├── {domain}.controller.ts
└── {domain}.service.ts
```

- `app.setGlobalPrefix('api')` → 모든 라우트 `/api/*`
- `PrismaModule`이 `@Global()` → 모든 Service에서 `PrismaService` 주입
- 도메인 모듈 간 직접 import 금지 → PrismaService만 공유

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
- Executor 추가: `types.ts → catalog.ts → executor 구현 → registerNode() → 프론트 동기화`.
- 상세 규칙: `apps/server/src/workflows/CLAUDE.md`.

### ActivityEvent 시스템

워크플로우 실행 결과를 객체 단위로 기록. 팔란티어 스타일 Object View의 활동 이력.

```
apps/server/src/activity-events/   — CRUD API
```

- 워크플로우 완료 시 자동 생성 (AI 분석 결과 + 추천 액션 포함)
- `objectType` + `objectId`로 특정 객체의 이력 조회
- 프론트엔드 상품 상세 페이지에서 세션 카드로 표시

### Agent Platform (Paperclip 패턴)

```
apps/server/src/agent-registry/     — 에이전트 플랫폼 코어
├── adapters/                       — 런타임 추상화 (claude-local, process, http)
│   ├── types.ts                    — AdapterModule 인터페이스
│   ├── registry.ts                 — adapter type → 구현 매핑
│   └── claude-local/execute.ts     — Claude CLI spawn 로직
├── heartbeat.service.ts            — Heartbeat 실행 엔진 + 타이머
├── wakeup.service.ts               — Wakeup 요청 큐 (coalescing)
├── skills.service.ts               — Skills 주입 관리 (symlink)
├── agent-registry.service.ts       — CRUD + run() + receiveResults()
├── agent-registry.controller.ts    — REST API
└── seed-agents.ts                  — 기본 에이전트 정의

apps/server/src/ad-agent/           — 광고 전략 (도메인 후처리)
apps/server/src/rules/              — 건강도 평가 (도메인 후처리)
```

**핵심 개념 (Paperclip 패턴):**
- **Adapter**: `claude_local` 등 교체 가능한 실행 런타임. 새 CLI 추가 시 adapter만 작성.
- **Heartbeat**: 에이전트는 짧은 실행 윈도우(heartbeat) 단위로 동작. Session resume으로 연속성 보장.
- **Wakeup 4종**: `timer` | `assignment` | `on_demand` | `automation`. Coalescing으로 중복 방지.
- **Skills**: `agent-config/skills/` 디렉토리의 SKILL.md 파일을 런타임에 symlink 주입.
- **Hierarchy**: `reportsTo`로 에이전트 간 위임. operator → specialist 계층.

**DB 테이블:**
- `agent_definitions` — 에이전트 정의 (adapter, hierarchy, skills, permissions, 예산)
- `heartbeat_runs` — 각 실행의 완전한 기록 (stdout, stderr, 토큰, 세션 ID)
- `agent_wakeup_requests` — 실행 요청 큐 (source 4종, coalescing, 감사 추적)
- `agent_runtime_state` — 에이전트별 영속 상태 (sessionId, 누적 토큰/비용)

**에이전트 런타임 설정 (`apps/server/agent-config/`):**
- `rules/operations.md` — 광고 운영 규칙
- `rules/health-rules.md` — 건강도 평가 규칙
- `skills/db-query/` — DB 쿼리 스킬
- `skills/result-callback/` — 콜백 스킬

에이전트 종류:
- `ad_strategy` (specialist) — 광고 전략 판단
- `rules_evaluation` (specialist) — 상품 건강도 평가
- `rules_suggest` (specialist) — 규칙 임계값 추천

새 에이전트 추가:
1. `seed-agents.ts`에 정의 추가 (또는 `POST /api/agent-registry`로 동적 등록)
2. role, adapterType, skills, permissions 설정
3. `agent-config/skills/` 에 필요한 스킬 추가
4. 서버 재시작 시 자동 시드

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

환경변수: `agents/.env` (AI 모델 키, Langfuse, DB 등)

- `agent_tasks` 테이블 폴링 → 작업 감지 → 실행 → 결과 기록
- DB 접근: asyncpg raw SQL (ORM 없음)
- 트리거: NestJS `POST /api/agent-tasks` → DB insert → Python runner 감지
- Docker 컨테이너로 실행 (`docker compose up -d agents`)

### 프론트엔드 패턴

- 모든 페이지 `'use client'` (Server Components 미사용)
- API 호출: `API_BASE` from `@/lib/api` → `fetch(\`${API_BASE}/api/...\`)`
- 소싱 페이지: `productsApi` / `sourcingApi` from `@/lib/sourcing-api`
- 라이트 테마: `bg-white`, `border-gray-200`, `text-gray-900`
- 상세 규칙: `apps/web/CLAUDE.md`

## Prisma 규칙

- 스키마: `prisma/schema.prisma` (루트)
- `@@map("snake_case")` 으로 테이블명 매핑
- camelCase 필드명 (Prisma) → snake_case DB 컬럼 (`@map`)
- Native PG enum 금지 → `String` 필드 + app-level validation
- UUID PK: `@default(uuid()) @db.Uuid`
- 스키마 수정 후 반드시 `npm run db:push` + `npx prisma generate`

## Overrides

- **Native PG enum 금지** → `String` + validation. 프로덕션 cast 에러 경험.
- **Server Components 미사용** → 모든 페이지 `'use client'`.
- **Python Agent 간 직접 import 금지** → DB 상태 관찰로만 소통.
- **Silent model fallback 금지** → `model = model or default` 패턴 금지.
- **프론트에서 직접 DB 접근 금지** → 반드시 NestJS API 경유.
- **API 경로에 /v1/ 금지** → `/api/{domain}` 직접 매핑.
- **도메인 모듈 자기 완결** → Controller + Service가 한 폴더에.
- **워크플로우 AI 분석은 실행당 1회만** → 개별 노드에 ai.analyze 넣지 말 것.

## Project

**KidItem**

키드아이템 이커머스 운영 자동화 플랫폼. 중국(1688/타오바오) 소싱 상품을 AI로 가공하여 한국 마켓플레이스에 리스팅하는 셀러 운영 도구. Next.js 프론트엔드 + NestJS 백엔드 + Python AI 에이전트 구조.

**Core Value:** 소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환하고, 운영 전반을 하나의 대시보드에서 관리한다.

### Constraints

- **Tech stack**: 기존 스택 유지 (NestJS + Next.js + Prisma + PostgreSQL)
- **DB**: Native PG enum 금지 → String + validation
- **Architecture**: 프론트 → NestJS API → DB 흐름 유지
- **Frontend**: 'use client' only, 라이트 테마, API_BASE fetch 패턴

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
