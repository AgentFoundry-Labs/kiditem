# apps/server — NestJS Backend

Backend API. Runs in Docker. Port 4000.

## Run

```bash
npm run start:dev       # Local dev (watch mode)
npm run build           # Production build
docker compose up -d    # Run via Docker (from root)
```

Env: `.env` → `DATABASE_URL`, `CHATBOT_DATABASE_URL`, `COUPANG_*`, `GEMINI_API_KEY`

## Domain Module Pattern

```
src/{domain}/
├── {domain}.module.ts       # @Module — register Controller + Service
├── {domain}.controller.ts   # @Controller — use class-validator DTOs
├── {domain}.service.ts      # @Injectable — business logic + Prisma
├── dto/                     # Request/Response DTOs (class-validator decorators)
│   ├── {operation}.dto.ts
│   └── index.ts
└── services/
    └── types.ts             # Service-internal interfaces (no decorators, not in shared)
```

Adding a new domain: create module + controller + service + dto/ → register in `app.module.ts`.

## Global Infrastructure (main.ts)

- `app.setGlobalPrefix('api')` → `@Controller('products')` = `GET /api/products`
- `ValidationPipe({ whitelist: true, transform: true })` — automatic DTO validation
- `GlobalExceptionFilter` — unified error response `{ statusCode, error, message, timestamp, path }`
- `ErrorCodes` from `@kiditem/shared` — domain-specific error codes
- `PrismaModule` is `@Global()` → `PrismaService` injectable in all services
- CORS: allows `localhost:*` pattern

## API Response Conventions

| Pattern | Shape | When |
|---|---|---|
| Paginated list | `{ items: T[], total, page, limit }` | Large datasets |
| Small list (under 100) | `T[]` | Bare array |
| Single resource GET | `T` | Direct object return |
| Create/Update | `T` | Return created/updated object |
| Delete/Command | `{ ok: true }` | — |
| Analytics/Dashboard | Domain-specific | Must define shared type |
| Error (unified) | `{ statusCode, error, message, timestamp, path }` | GlobalExceptionFilter |

**null 응답 금지**: 서비스에서 단일 리소스 GET 시 null 대신 기본값 객체를 반환. 프론트 `apiClient`가 빈 body를 `{}`로 처리.

## Rules

- No `/v1/` in API paths → `/api/{domain}` direct mapping
- Self-contained domain modules — no direct imports of other domain Services
- Global infrastructure: PrismaService, AgentRegistryService (both `@Global()`, injectable everywhere)
- New endpoints → class-validator DTO required (no manual if + BadRequestException)
- Errors → throw HttpException (no `ok: false` in 200 responses)
- Types → import from `@kiditem/shared`, use `satisfies` pattern in services
- Service-internal types → `services/types.ts` (interface, not class). API DTOs(`dto/`)와 분리. `@kiditem/shared`에 넣지 않음.
- Agent trigger: `AgentRegistryService.runByType()` → HeartbeatService → adapter execution (Claude CLI or Python HTTP)
- Agent data access: `AGENT_DATABASE_URL` (read-only PostgreSQL). Agents query DB directly via psql.
- Agent prompts: stored in `agent-config/prompts/`, NOT in DB. DB `prompt_template` field holds file path.
- No data injection in prompts — agents fetch what they need via db-query skill.

## Domain Guides

- **Workflows**: see `src/workflows/CLAUDE.md`
- **Agent Platform**: see `src/agent-registry/CLAUDE.md`
- **Advertising**: see `src/advertising/CLAUDE.md`
- **Thumbnails**: `src/products/services/thumbnail-*.ts` — 썸네일 AI 분석/편집. 3단계: 사전 검수(이미지 스펙) → AI 분류(품질+가이드라인) → AI 편집(가이드라인 수정/품질 개선). Gemini API 사용. 모델명은 `ThumbnailAiService.GEMINI_MODEL` 상수.
- **Chat**: `src/chat/` — CopilotKit 런타임 + ClaudeCliAdapter
- **Action Tasks**: `src/action-task/` — 액션 보드 CRUD API

## Tests

```bash
npx vitest run
```

- Location: `src/**/__tests__/*.spec.ts`
- Behavior verification only — no implementation detail (wiring) tests
