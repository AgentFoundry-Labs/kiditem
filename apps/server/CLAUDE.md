# apps/server — NestJS Backend

백엔드 API. Docker로 실행. 포트 4000.

## 실행

```bash
npm run start:dev       # 로컬 개발 (watch mode)
npm run build           # 프로덕션 빌드
docker compose up -d    # Docker로 실행 (루트에서)
```

환경변수: `.env` → `DATABASE_URL`, `COUPANG_*`

## 도메인 모듈 패턴

```
src/{domain}/
├── {domain}.module.ts       # @Module — Controller + Service 등록
├── {domain}.controller.ts   # @Controller — HTTP 라우트
└── {domain}.service.ts      # @Injectable — 비즈니스 로직 + Prisma
```

새 도메인 추가 시: 3개 파일 생성 → `app.module.ts`에 import 등록.

## 라우팅

`app.setGlobalPrefix('api')` → `@Controller('products')` = `GET /api/products`

| 도메인 | Route | Method |
|---|---|---|
| dashboard | `/api/dashboard` | GET |
| products | `/api/products` | GET, POST, GET /:id, DELETE /:id, GET /:id/preview |
| sourcing | `/api/sourcing/extension/product-data` | POST |
| sourcing | `/api/sourcing/extension/products` | GET |
| sourcing | `/api/sourcing/scrape-url` | POST |
| agent-tasks | `/api/agent-tasks` | GET, POST, GET /:id |
| orders | `/api/orders` | GET, POST |
| returns | `/api/returns` | GET, POST |
| inventory | `/api/inventory` | GET |
| profit-loss | `/api/profit-loss` | GET |
| ads | `/api/ads` | GET |
| reviews | `/api/reviews` | GET |
| thumbnails | `/api/thumbnails` | GET |
| companies | `/api/companies` | GET |
| alerts | `/api/alerts` | GET |
| workflows | `/api/workflows` | GET, POST, GET /:id, PUT /:id, DELETE /:id |
| workflows | `/api/workflows/:id/run` | POST (body: { context? }) |
| workflows | `/api/workflows/batch-run` | POST (body: { workflowIds, context? }) |
| workflows | `/api/workflows/:id/runs` | GET |
| workflow-runs | `/api/workflow-runs/:runId` | GET |
| activity-events | `/api/activity-events` | GET (query: objectType, objectId, companyId, eventType) |
| rules | `/api/rules` | GET, PATCH /:id |
| rules | `/api/rules/evaluate` | POST |
| rules | `/api/rules/summary` | GET |
| rules | `/api/rules/schedule` | GET, PATCH |
| rules | `/api/rules/reload` | POST |

## PrismaService

`@Global()` 모듈. 모든 Service에서 주입:

```typescript
constructor(private readonly prisma: PrismaService) {}

await this.prisma.product.findMany({ where: { status: 'active' } });
```

## CORS

`main.ts`에서 `localhost:*` 패턴 허용 (정규식).

## Coupang API

`src/coupang/client.ts` — HMAC-SHA256 인증.
orders, returns 도메인에서 사용.

## 규칙

- API 경로에 `/v1/` 금지 → `/api/{domain}` 직접 매핑
- 도메인 모듈 자기 완결 — 다른 도메인 Service 직접 import 금지
- PrismaService만 공유 의존성
- Agent 트리거: `agent_tasks` 테이블에 INSERT → Python runner가 감지
