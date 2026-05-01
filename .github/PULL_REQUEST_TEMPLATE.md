## 변경 요약


## DB / 개발 데이터
- [ ] `prisma/schema.prisma` 변경 없음
- [ ] `prisma/schema.prisma` 변경 있음
- [ ] backfill SQL 있음 → 파일: `prisma/_____.sql`
- [ ] 개발 데이터 profile/bundle 변경 없음
- [ ] 개발 데이터 profile/bundle 변경 있음
  - Profile ID:
  - Domain:
  - Dataset ID:
  - 공유 zip 파일명: `kiditem-____-____-____.zip`
  - Google Drive 경로: `____-____/bundles/____.zip`
  - `latest.json` 갱신 여부:
  - Sync/Replay 명령:
  - Import mode: `upsert` / `scoped-replace` / `pull-only` / `full-reset`
  - 영향 scope(organization/channel/date):
- [ ] `prisma/init.sql.gz` 변경 있음 (예외적인 fresh-volume snapshot 용도만)

> 개발 데이터 표준 경로:
> ```bash
> npm run data:dev:sync -- --profile workspace-demo --yes
> ```
> 공유 파일명 표준: `kiditem-{domain}-{lane}-{datasetId}.zip`

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
