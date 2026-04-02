# apps/server — NestJS Backend

Backend API. Runs in Docker. Port 4000.

## Run

```bash
npm run start:dev       # Local dev (watch mode)
npm run build           # Production build
docker compose up -d    # Run via Docker (from root)
```

Env: `.env` → `DATABASE_URL`, `COUPANG_*`, `GEMINI_API_KEY`

## Domain Module Pattern

```
src/{domain}/
├── {domain}.module.ts       # @Module — register Controller + Service
├── {domain}.controller.ts   # @Controller — use class-validator DTOs
├── {domain}.service.ts      # @Injectable — business logic + Prisma
└── dto/                     # Request/Response DTOs (class-validator decorators)
    ├── {operation}.dto.ts
    └── index.ts
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

## Rules

- No `/v1/` in API paths → `/api/{domain}` direct mapping
- Self-contained domain modules — no direct imports of other domain Services
- Only shared dependency: PrismaService
- New endpoints → class-validator DTO required (no manual if + BadRequestException)
- Errors → throw HttpException (no `ok: false` in 200 responses)
- Types → import from `@kiditem/shared`, use `satisfies` pattern in services
- Agent trigger: `AgentRegistryService.runByType()` → HeartbeatService → adapter execution (Claude CLI or Python HTTP)

## Domain Guides

- **Workflows**: see `src/workflows/CLAUDE.md`
- **Agent Platform**: see `src/agent-registry/CLAUDE.md`

## Tests

```bash
npx vitest run
```

- Location: `src/**/__tests__/*.spec.ts`
- Behavior verification only — no implementation detail (wiring) tests
