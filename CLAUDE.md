# KidItem

키드아이템 이커머스 운영 자동화. 소싱 → AI 가공 → 리스팅 → 운영.
아키텍처: `ARCHITECTURE.md`.

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

## NestJS 백엔드 패턴

```
apps/server/src/{domain}/
├── {domain}.module.ts
├── {domain}.controller.ts
└── {domain}.service.ts
```

- `app.setGlobalPrefix('api')` → 모든 라우트 `/api/*`
- `PrismaModule`이 `@Global()` → 모든 Service에서 `PrismaService` 주입
- CORS: `localhost:*` 허용

## Python Agent 패턴

```
agents/src/agents/{name}/
├── agent.py          — BaseAgent 상속, execute() 구현
└── *.py              — 서비스 로직
```

- `agent_tasks` 테이블 폴링 → 작업 감지 → 실행 → 결과 기록
- DB 접근: asyncpg raw SQL (ORM 없음)
- 트리거: NestJS `POST /api/agent-tasks` → DB insert → Python runner 감지

## 프론트엔드 패턴

- 모든 페이지 `'use client'` (Server Components 미사용)
- API 호출: `API_BASE` from `@/lib/api` → `fetch(\`${API_BASE}/api/...\`)`
- 소싱 페이지: `productsApi` / `sourcingApi` from `@/lib/sourcing-api`
- 라이트 테마: `bg-white`, `border-gray-200`, `text-gray-900`

## Prisma 규칙

- 스키마: `prisma/schema.prisma` (루트)
- `@@map("snake_case")` 으로 테이블명 매핑
- camelCase 필드명 (Prisma) → snake_case DB 컬럼 (`@map`)
- Native PG enum 금지 → `String` 필드 + app-level validation
- UUID PK: `@default(uuid()) @db.Uuid`

## Overrides

- **Native PG enum 금지** → `String` + validation. 프로덕션 cast 에러 경험.
- **Server Components 미사용** → 모든 페이지 `'use client'`.
- **Agent 간 직접 import 금지** → DB 상태 관찰로만 소통.
- **Silent model fallback 금지** → `model = model or default` 패턴 금지.
- **프론트에서 직접 DB 접근 금지** → 반드시 NestJS API 경유.
- **API 경로에 /v1/ 금지** → `/api/{domain}` 직접 매핑.
- **도메인 모듈 자기 완결** → Controller + Service가 한 폴더에.
