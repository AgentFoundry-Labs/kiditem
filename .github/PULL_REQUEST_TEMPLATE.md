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
- [ ] 스테이징 DB baseline 변경 없음
- [ ] 스테이징 DB baseline 변경 있음
  - Profile ID:
  - Supabase Storage bucket/prefix:
  - Manifest checksum:
  - Export/Verify/Restore 명령:
  - `deployments/current-db.json` 갱신 여부:
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

## Architecture / Reconstruction Review
- [ ] 관련된 가장 구체적인 `AGENTS.md` 를 읽고 owner domain / boundary 규칙을 확인했음
- [ ] Reconstruction trigger 없음
- [ ] Reconstruction trigger 있음 → 아래에 scope 판정과 반영한 contract/test/gate 기록
  - Trigger:
  - Scope decision:
  - Contract / AGENTS update:
  - Behavior lock tests:
  - Verification gate:

## 새 영구 규칙
- [ ] 해당 없음 (리팩터링/버그픽스/기능 추가/단일 도메인 내부 구현)
- [ ] 신규 영구 규칙을 해당 scope 의 `AGENTS.md` 본문에 추가했음

> Trigger 예시: 10+ files, 500+ line service/component, cross-layer controls,
> LLM/prompt/model/provider/storage/fetch/Agent OS runtime/sink/reconcile,
> 새 cross-domain 규칙, 기존 금지·허용 규칙 전복.

## 리뷰
```bash
gh pr checkout <PR번호>
npm run check:conventions
npm run test:scripts
```

Reviewer must first check AGENTS compliance and reconstruction trigger
classification before approving functional correctness.
