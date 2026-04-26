## 변경 요약


## DB 변경
- [ ] `prisma/schema.prisma` 변경 없음
- [ ] `prisma/schema.prisma` 변경 있음
- [ ] backfill SQL 있음 → 파일: `prisma/_____.sql`
- [ ] `prisma/init.sql.gz` 갱신함 (DB 데이터 변경 시 덤프 필수)

> init.sql.gz 갱신 방법:
> ```bash
> docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
> ```

## 테스트
- [ ] `npx vitest run` 통과
- [ ] `npm run dev:server` 부트 확인
- [ ] `npm run build -w apps/web` 빌드 성공

## 새 영구 규칙
- [ ] 해당 없음 (리팩터링/버그픽스/기능 추가/단일 도메인 내부 구현)
- [ ] 신규 영구 규칙을 해당 scope 의 `AGENTS.md` / `CLAUDE.md` 본문에 추가했음

> 트리거(하나라도 해당되면 governance 본문 갱신 필요): 새 cross-domain 규칙 / 기존 금지·허용 규칙 전복 / 런타임·모듈 경계 이동 / 기술 선택 교체 / 기능·모듈 Deprecated 선언 / 인시던트로 새 영구 규칙 생성.

## 리뷰
```bash
gh pr checkout <PR번호>
claude /review
```
