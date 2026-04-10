## 변경 요약


## DB 변경
- [ ] `prisma/schema.prisma` 변경 없음
- [ ] `prisma/schema.prisma` 변경 있음 → pull 후 `npx prisma db push` 필요
- [ ] backfill SQL 있음 → 파일: `prisma/_____.sql`
- [ ] `prisma/init.sql.gz` 갱신함

## pull 후 필요한 작업
```bash
npx prisma db push        # schema 변경 시
npx prisma generate       # schema 변경 시
npm run build -w packages/shared  # shared 타입 변경 시
```

## 테스트
- [ ] `npx vitest run` 통과
- [ ] `npm run dev:server` 부트 확인
- [ ] `npm run build -w apps/web` 빌드 성공
