# KidItem

키드아이템 이커머스 운영 자동화. 소싱 → AI 가공 → 리스팅 → 운영.

## 빠른 시작 (새 팀원)

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
npm install
cp apps/server/.env.example apps/server/.env   # API 키 설정
docker compose up -d                           # PostgreSQL + NestJS + Langfuse
npm run db:push                                # 스키마 적용
npm run db:seed                                # 시드 데이터
npm run dev                                    # Next.js (localhost:3000)
```

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
packages/templates/  — React 상세페이지 템플릿 (bold-vertical, simple-vertical, oneshot)
extensions/          — Chrome 익스텐션 (1688/Alibaba 스크래퍼)
prisma/              — 공유 스키마 (source of truth)
```

## Commands

```bash
docker compose up -d              # PostgreSQL + NestJS + Langfuse
docker compose up -d --build server  # NestJS 코드 변경 후 리빌드
npm run db:push                   # 스키마 적용
npm run db:seed                   # 시드 데이터
npm run dev                       # Next.js 프론트엔드 (localhost:3000)
npm run dev:server                # NestJS 로컬 개발 (Docker 대신)
cd agents && .venv/bin/python -m src.runner  # Python agent runner
```

## Ports

| 서비스 | 포트 | Docker |
|---|---|---|
| Next.js (프론트) | 3000 | ✗ 로컬 |
| NestJS (백엔드) | 4000 | ✓ |
| PostgreSQL | 5433 | ✓ |
| Langfuse | 3100 | ✓ |

## 아키텍처 레이어

```
[프론트엔드] Next.js — 화면 표시, 사용자 입력
     ↓ fetch
[백엔드 API] NestJS — CRUD, 비즈니스 로직, 워크플로우 실행
     ↓ Prisma                    ↓ agent_tasks INSERT
[DB] PostgreSQL              [Python Agents] — AI 가공, 스크래핑
```

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

### Python Agent 패턴

```
agents/src/agents/{name}/
├── agent.py          — BaseAgent 상속, execute() 구현
└── *.py              — 서비스 로직
```

- `agent_tasks` 테이블 LISTEN/NOTIFY → 작업 감지 → 실행 → 결과 기록
- DB 접근: asyncpg raw SQL (ORM 없음)
- 트리거: NestJS `POST /api/agent-tasks` → DB insert → Python runner 감지
- 워크플로우 엔진과 독립. 워크플로우가 AI 작업 필요 시 agent_task 생성으로 위임.

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
- **Agent 간 직접 import 금지** → DB 상태 관찰로만 소통.
- **Silent model fallback 금지** → `model = model or default` 패턴 금지.
- **프론트에서 직접 DB 접근 금지** → 반드시 NestJS API 경유.
- **API 경로에 /v1/ 금지** → `/api/{domain}` 직접 매핑.
- **도메인 모듈 자기 완결** → Controller + Service가 한 폴더에.
- **워크플로우 AI 분석은 실행당 1회만** → 개별 노드에 ai.analyze 넣지 말 것.
