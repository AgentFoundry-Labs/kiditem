## 변경 요약


## DB 변경
- [ ] `prisma/schema.prisma` 변경 없음
- [ ] `prisma/schema.prisma` 변경 있음
- [ ] backfill SQL 있음 → 파일: `prisma/_____.sql`
- [ ] `prisma/init.sql.gz` 갱신함 (DB 데이터 변경 시 덤프 필수)

> init.sql.gz 갱신 방법:
> ```bash
> docker exec kiditem-postgres pg_dump -U kiditem --data-only --inserts --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
> ```

## 테스트
- [ ] `npx vitest run` 통과
- [ ] `npm run dev:server` 부트 확인
- [ ] `npm run build -w apps/web` 빌드 성공

## 리뷰
```bash
gh pr checkout <PR번호>
claude /review
```
