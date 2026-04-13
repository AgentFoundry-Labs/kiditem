# prisma — Shared Schema

DB schema source of truth for the entire system. Prisma v7.

## Commands

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Dev — apply directly to DB
npm run db:migrate    # Production — create migration files
npm run db:studio     # DB browser (localhost:5555)
```

`DATABASE_URL` env required: `postgresql://kiditem:kiditem@localhost:5433/kiditem`

## Prisma v7 Config

`prisma.config.ts` (root) sets datasource URL. No `url` in `schema.prisma` (v7 pattern).

## Rules

- No native PG enums → `String` fields + app-level validation
- PascalCase model names → `@@map("snake_case")` for table names
- camelCase field names → `@map("snake_case")` for column names
- UUID PK: `@default(uuid()) @db.Uuid`
- Timestamps: `@db.Timestamptz`
- Currency: `Int` (KRW) or `Decimal(12,2)` (CNY)
- Python accesses snake_case DB column names directly (asyncpg raw SQL)
- After schema changes: always run `npm run db:push` + `npx prisma generate`
- Keep Zod schemas in sync: use `satisfies z.infer<typeof Schema>` pattern in services
- Json 흡수 패턴: 부모의 `items Json @default("[]")` 사용 (CoupangReturn, BundleProduct, WorkflowRun). 서비스에서 `as unknown as T[]` 캐스트.

## 통합 모델 규칙

- `AgentDefinition.rt_*` 필드: 런타임 상태 (sessionId, lastRunStatus, 토큰 사용량 등). 별도 테이블 없음.
- `AgentEvent`: eventType(`permission_denied`|`action_snapshot`)으로 구분. snapshot 필드는 해당 타입만 사용.
- `AdSnapshot`: level(`campaign`|`product`|null)로 구분. null은 raw 스냅샷.
- `Marketplace`: type(`agent`|`workflow`)으로 구분.

## Phase 3+4 스키마 필드 (2026-04-13)

AgentDefinition 추가 필드:
- `maxOutputTokens Int @default(16000)` — #21 Token Escalation. 출력 잘림 시 자동 확장.
- `fallbackChain String[] @default(["claude_local"])` — #6 Model Fallback. 어댑터 실패 시 체인 실행.
- `resultRetentionDays Int @default(30)` — #10 Selective Clearing. 오래된 결과 요약 기한.
- `contextStrategy String @default("single-shot")` — #3 Message Compression. 미래 멀티턴 전환용.

HeartbeatRun 추가 필드:
- `nextSchedule String?` — #30 Dynamic Cron. 에이전트가 설정한 다음 스케줄.
- `isSummarized Boolean @default(false)` — #10 요약 완료 여부.
- `summary String? @db.Text` — #10 규칙 기반 실행 요약.

## User Types

`User.type` 필드로 사람과 AI를 통합 관리:
- `human` — 사람 직원
- `agent` — AI 에이전트 (`agentDefinitionId` 연결)
- `system` — 챗봇 (`company_id = null`, 전체 공유)

## RLS (Row Level Security)

`chatbot_readonly` DB 유저에 `company_id` 기반 행 필터 적용 (11개 테이블).
- NestJS 서버 (`kiditem` 유저): 테이블 오너 → RLS 미적용 (코드에서 필터)
- 챗봇/에이전트 (`chatbot_readonly`): RLS 적용 → 세션변수 `app.company_id`로 자동 필터
