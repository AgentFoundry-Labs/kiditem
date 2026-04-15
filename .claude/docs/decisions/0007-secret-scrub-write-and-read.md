---
id: 0007
title: Secret scrub — write / read / backfill
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - apps/server/src/agent-registry
  - packages/shared
  - prisma
---

## Context

Phase 0.1 (ADR-0006) 로 companyId 격리는 끝났지만, 그 격리 안쪽에서도 **민감 문자열이 평문으로 DB 에 저장**되는 경로가 열려 있었다. 구체적으로:

- `heartbeat.service.ts` — Claude CLI / Python 어댑터 실행 실패 시 `result.stderr` 를 `heartbeat_runs.error` (L394), `stderr_excerpt` (L441), `rt_last_error` (L457), `wakeup_requests.error` (L508), legacy `agent_tasks.error` (L519) 에 그대로 저장. stdout 도 `stdout_excerpt` (L440) 로 그대로 간다.
- `agent-registry.service.ts:208` — wakeup 실패 시 `err.message` 를 `agent_tasks.error` 에 그대로.
- `action-task.service.ts:220` — 액션 실행 실패 시 `err.message` 를 `action_tasks.result.error` JSON 에 그대로.
- `advertising/services/ad-execution.service.ts:232/241` — Wing/광고센터 스크래핑 실패 시 `body.errorMessage` 를 `execution_tasks.error_message` + `ad_actions.error_message` 로 그대로.

이들 문자열에는 실제로 OpenAI/Gemini API key, Coupang Wing 세션 쿠키, JWT, PEM 블록이 섞여 들어간다 (에이전트가 `psql`/`curl` 실패를 stderr 로 뱉을 때 명령행에 include 된 키가 그대로 노출). security-reviewer §3 가 Phase 0 선결조건으로 지목. Workstream B 트레이스 뷰어가 이 필드를 관리자 UI 에 그대로 렌더하면 내부자에게 평문 키가 유출될 위험.

과거 데이터 역시 동일 경로로 축적돼 있으므로 write-time scrub 만으로는 불충분 — backfill 이 함께 필요.

## Decision

3단 방어:

1. **Write-time** — `packages/shared/src/security/scrub.{ts,spec.ts}` 의 `scrubSecrets(string)` / `scrubDeep(obj)` 를 모든 DB 저장 직전 적용. 이번 PR 범위:
   - `heartbeat.service.ts` 6개 지점 (L394, L440, L441, L457, L508, L519)
   - `lifecycle/transcript.service.ts` 3개 지점 (stdoutExcerpt/stderrExcerpt/usageJson — 방어심층, heartbeat 에서 이미 1차 scrub 됐지만 새 저장 지점 추가 시 누락 대비)
   - `agent-registry.service.ts:208` — wakeup 실패 error
   - `action-task.service.ts:220` — action execution error
   - `advertising/services/ad-execution.service.ts:232/241` — 스크래핑 errorMessage
2. **Read-time** — Workstream B 의 trace service 가 응답 직렬화 직전 `scrubDeep` 추가 (별도 세션, B 담당). write-time 을 뚫고 들어온 신규 저장 지점이 있어도 UI 까지는 도달하지 않음.
3. **Backfill** — `prisma/backfill-secret-scrub.sql` 로 기존 row 10 테이블 / 22 컬럼 에 retroactive regex scrub. PostgreSQL PL/pgSQL `scrub_secrets_text` / `scrub_secrets_jsonb` 함수 + `scrub_progress` 재시도 테이블 구현. psql 수동 실행 + 완료 후 `init.sql.gz` 재생성. prod 실행은 유지보수 창에.

TS ↔ SQL 정규식은 수동 동기화. `patterns.ts` 가 source of truth, SQL 은 주석에 mirror 태깅.

## Consequences

**긍정**:
- Secret leak 경로 폐쇄. Workstream B 트레이스 뷰어가 stderr 덤프를 안전하게 노출 가능.
- 과거 축적 데이터도 정리 — scrub 이 배포된 뒤에도 backfill 전 DB dump 가 유출되면 의미 없음 → backfill 까지 해야 가치 확정.
- heartbeat 와 transcript 의 이중 scrub 으로, 새 저장 지점 추가 시 한쪽을 빠뜨려도 다른 쪽에서 잡힘 (방어심층).

**부정**:
- 이중 scrub 성능 — regex 8개 × slice 2KB/5KB 당 수 μs 수준, 무시 가능.
- TS ↔ SQL 정규식 drift 위험 — `patterns.ts` 변경 시 SQL 을 같이 건드려야 함. 주석으로 강제했지만 PR 리뷰 놓치면 backfill 이 새 패턴 miss.
- 과거 backfill 이 완료되기 전 prod DB dump 는 여전히 위험 — 운영 팀이 backfill 실행과 init.sql.gz 재생성을 같은 유지보수 창에 수행해야 함.

**뒤따르는 제약**:
- 새 저장 지점 추가 시 scrub 누락은 재발 가능. PR 리뷰에서 `result.stderr` / `err.message` 를 DB 저장하는 패턴을 감지해 scrubSecrets 호출 확인. 장기적으로는 Prisma middleware 로 자동화 고려 (별 ADR).
- `packages/shared/src/security/patterns.ts` 는 이제 security-critical. 수정 PR 은 SQL mirror 함께 업데이트 필수 (PR 템플릿에 체크박스 추가 권장).
- Backfill 실행은 운영 활동 — staging 없이 dev→prod 직접 실행. scrub_progress 테이블로 재시도 안전성 확보했으나, 실행 전 pg_dump 스냅샷 권장.

## Related

- [ADR-0006](0006-authenticated-company-scope.md) — companyId 격리. 이 ADR 과 결합해 "scope 격리 + 민감 데이터 scrub" 이중 방어 완성.
- [ADR-0002](0002-class-validator-over-zod-for-dto.md) — DTO 레이어 유효성. scrub 은 DTO 가 아니라 persistence 직전에 적용 (DTO 는 shape 검증, scrub 은 content 위생).
- `packages/shared/src/security/scrub.spec.ts` — P0.a 에서 세운 단위 테스트 스위트 (45 케이스).
- `prisma/backfill-secret-scrub.sql` — 운영 실행 대상 SQL 파일. runbook 포함.
- security-reviewer §3 보고서 — 최초 지목.
- 세션 브랜치: `feat/phase-0-2-scrub` — P0.a scrub 라이브러리 (c3459d6) + P0.2 write-time/backfill/ADR.
- 후속: Workstream B trace viewer 의 read-time `scrubDeep`.
