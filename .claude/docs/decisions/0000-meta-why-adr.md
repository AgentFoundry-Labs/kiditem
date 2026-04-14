---
id: 0000
title: "Meta: 왜 ADR 을 쓰는가"
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects: []
---

## Context

KidItem 은 Agent OS Phase 1→2→3, 런타임 통합 iter 1→2→3, 에이전트 아키텍처 리팩터(매니저→이벤트 기반), Ad Ops 4 Cycle 등 **앞 결정을 뒤집는 연쇄 의사결정**으로 진행된다. 현재 프로젝트의 문서 레이어는 모두 "지금" 만 기록한다:

- `CLAUDE.md` = 현재 규칙
- `.claude/docs/{erd,architecture,workflow,commands}.md` = 현재 스냅샷
- `.claude/docs/lessons.md` = 교훈 ("하지 말자")
- `docs/{REFACTOR_PLAN,AGENT_OS_PATTERNS,TODOS}.md` = 작업 중 mutable 문서 — 완료 시 덮어써지며 "왜" 가 증발
- git log / PR 본문 = 코드 변경 단위 (비-코드 결정은 누락)
- `~/.claude/.../memory/` = LLM 사적 메모리 (git 미추적, 팀 비가시, 자유 편집) — 팀 공유 불변 기록 불가

6개월 뒤 "왜 PG enum 버렸지 / 왜 매니저 패턴 접었지 / 왜 Zod DTO 뒤집었지" 가 사라진 PR 본문과 memory 조각에만 남는 구조.

## Decision

`.claude/docs/decisions/` 에 **불변 append-only ADR 레이어** 를 도입한다. Nygard-style ADR 포맷 + 프로젝트 특성에 맞춘 운영 규칙(`affects` 역방향 인덱스, `lessons.md` 정본 분리, `@Query('companyId')` 같은 팀 내 컨벤션 번복을 포착하는 트리거 체크리스트).

세부 규칙은 `README.md` 에 명문화 — 트리거 체크리스트, 파일 포맷, 번호 규칙, 상태 전이(Superseded/Deprecated), lessons.md 와의 관계.

## Consequences

**긍정**:
- 결정 이력이 시간축으로 복원 가능해진다. 6개월 뒤 신규 멤버·에이전트가 `.claude/docs/decisions/` 만 훑어도 "왜 여기까지 왔는가" 를 재구성할 수 있다.
- PR 템플릿 체크박스가 아키텍처 결정을 강제로 가시화 — "해당 없음" 선택조차 의식적 판단.
- `affects` 프론트매터가 단방향 단일 정본. `grep` 으로 도메인별 ADR 역추출 가능 — 10개 도메인 CLAUDE.md 에 목록을 미러링하지 않아 동기화 부채 없음.
- `lessons.md` 와 역할 분리(결정=ADR, 교훈=lessons) — 양쪽에 동일 사건 기록하는 이중 출처 문제 제거.

**부정**:
- 작성 비용 + 리뷰 시간 — PR 당 ADR 트리거 판단 1회(5초), 해당 시 ADR 작성 ~30분.
- 트리거 체크리스트가 느슨하면 ADR 이 폭증하거나 0건으로 사문화. 3개월 단위로 작성 빈도·품질 관찰 필요.

**뒤따르는 제약**:
- ADR 본문 수정 금지. 뒤집을 땐 새 ADR + Supersedes.
- 시드 ADR(0001~0005)은 역사적 결정의 역-채움 — `lessons.md` / root CLAUDE.md / memory 에 이미 확정된 것만. 새 결정 날조 금지.
- `evolution/` · `entities/` 디렉터리 도입은 보류(memory / erd.md 와 역할 중복). 3개월 운영 후 재평가.

## Related

- `README.md` — 운영 세부 규칙
- 시드 ADR: 0001 / 0002 / 0003 / 0004 / 0005
- `.claude/docs/lessons.md` — 프로세스 교훈(ADR 과 역할 분리)
- [플랜 Workstream A](../../../../.claude/plans/atomic-enchanting-willow.md) — 도입 과정
