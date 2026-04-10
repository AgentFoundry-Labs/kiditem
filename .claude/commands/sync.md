Pull latest code and sync local environment (DB schema + Prisma client + shared types).

Run these commands in sequence and report results:

1. `git pull --rebase`
2. `npx prisma db push` — apply schema changes to local DB
3. `npx prisma generate` — regenerate Prisma client
4. `npm run build -w packages/shared` — rebuild shared types

If prisma/init.sql.gz was updated in the pull, ask the user if they want to load seed data:
```bash
gunzip -k prisma/init.sql.gz
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/init.sql
```

Report a summary of what changed and what was applied.
