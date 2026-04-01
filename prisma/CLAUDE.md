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
