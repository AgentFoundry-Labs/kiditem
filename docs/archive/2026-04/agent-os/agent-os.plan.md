# Agent OS Plan

> Agent Platform에 Claude Code 검증 패턴을 적용하여 운영 안정성, 보안, 확장성을 확보한다.

## Executive Summary

| Perspective | Description |
|-------------|-------------|
| **Problem** | Paperclip 인프라(Adapter, Heartbeat, Wakeup)는 구축되었지만 안전장치, 권한 체계, 최적화 패턴이 부재하여 운영 안정성 갭 존재. 스킬 파일 미작성, RulesScheduler 이중화, Operator 위임 미구현 |
| **Solution** | Claude Code 소스맵에서 검증된 19개 패턴 중 Phase 1-2(11개)를 KidItem NestJS 아이디엄으로 적용. Paperclip 미완성 갭 3건 + 레거시 정리 9건 선행 |
| **Function UX Effect** | 위험 도구 자동 차단, 에이전트 출력 검증 재시도, 스킬 기반 프롬프트 경량화, 병렬 워크플로우 실행, 권한 분리로 에이전트 간 안전한 위임 |
| **Core Value** | spawn→wait→parse 수준에서 안전하고 확장 가능한 에이전트 운영 플랫폼으로 진화 |

## Context Anchor

| Anchor | Content |
|--------|---------|
| **WHY** | 에이전트가 프로덕션에서 자율 실행되려면 안전장치(위험 패턴 감지, 권한 분리, 검증 재시도)가 필수. 현재는 bypassPermissions로 무제한 실행 |
| **WHO** | KidItem 셀러 (에이전트 실행 결과를 신뢰해야 함), 개발팀 (에이전트 추가/운영) |
| **RISK** | 스키마 변경 시 하위 호환 깨짐, RulesScheduler 통합 시 기존 스케줄 유실, 병렬 실행 시 race condition |
| **SUCCESS** | Phase 1-2 전체 14건 구현 완료, agent-registry 핵심 모듈 테스트 커버리지 80%+, Gap Analysis 90%+ |
| **SCOPE** | agent-registry 모듈 중심. Frontend UI 변경 없음. Python agents 변경 없음. Phase 3-4(모델 폴백, 메시지 압축 등) 제외 |

---

## 1. Background

### 1.1 현재 상태

Paperclip 패턴 기반 Agent Platform 인프라가 Phase A~E까지 구축 완료:

| Component | Status | File |
|-----------|--------|------|
| AdapterModule 인터페이스 | ✅ 완료 | `adapters/types.ts` |
| claude_local adapter | ✅ 완료 | `adapters/claude-local/execute.ts` |
| Adapter Registry | ✅ 완료 | `adapters/registry.ts` |
| HeartbeatService | ✅ 완료 | `heartbeat/heartbeat.service.ts` |
| WakeupService | ✅ 완료 | `wakeup/wakeup.service.ts` |
| SkillsService | ✅ 완료 | `skills/skills.service.ts` |
| ExecutionContext (Immutable) | ✅ 완료 | Object.freeze 적용 |
| Error Recovery Cascade | ✅ 완료 | 3-strike auto-pause |
| Budget Warning (3단계) | ✅ 완료 | 80%/95%/100% |
| Feature Gate | ✅ 완료 | DB-based runtime toggle |

### 1.2 미해결 갭

**Paperclip 미완성 (3건)**:
- 스킬 파일 0개 — SkillsService는 구현되었지만 `agent-config/skills/` 비어있음
- RulesSchedulerService 이중화 — heartbeat timer와 별도로 자체 cron 운영
- Operator→Specialist 위임 — `reportsTo` 스키마만 존재, 실제 delegation 로직 없음

**Claude Code 패턴 미적용 (Phase 1: 5건, Phase 2: 6건)**:
- 전부 미착수 상태 (docs/AGENT_OS_PATTERNS.md 참조)

**레거시 기술부채 (TODOS.md 9건)**:
- RenderAgent 삭제, 트랜잭션 래핑, 타임아웃, 순환참조, 에러 패턴, 로깅 통일 등

### 1.3 참조 문서

| Document | Path | Role |
|----------|------|------|
| Paperclip 계획 | `.claude/plans/agent-platform-architecture.md` | 인프라 설계 원본 |
| Claude Code 패턴 | `docs/AGENT_OS_PATTERNS.md` | 30개 패턴 분석 + 4-Phase 로드맵 |
| TODOS | `docs/TODOS.md` | 레거시 정리 9건 |
| Agent Registry CLAUDE.md | `apps/server/src/agent-registry/CLAUDE.md` | 현재 아키텍처 규칙 |

---

## 2. Requirements

### 2.1 Step 0 — Prerequisites (레거시 정리 + Paperclip 갭)

#### 2.1.1 TODOS.md 즉시 수정 9건

| # | 작업 | 파일 | 예상 시간 |
|---|------|------|-----------|
| T1 | RenderAgent 삭제 | `agents/src/agents/render/` | 30초 |
| T2 | Agent-level 트랜잭션 래핑 | `inventory.py`, `sourcing/agent.py`, `content/agent.py` | 5분 |
| T3 | Agent-level 타임아웃 (per-agent override) | `BaseAgent.timeout_seconds` | 5분 |
| T4 | 순환참조 해결 (callback injection) | `content/agent.py`, `runner.py` | 3분 |
| T5 | SourcingAgent 에러 패턴 통일 | `sourcing/agent.py` | 2분 |
| T6 | structlog 통일 | `runner.py`, `sourcing/agent.py`, `inventory.py` | 5분 |
| T7 | Matcher1688 pool 파라미터화 | `matcher_1688.py` | 2분 |
| T8 | NestJS pg_notify 수정 | `sourcing/sourcing.service.ts` | 30초 |
| T9 | InventoryAgent N+1 쿼리 최적화 | `inventory.py` | 3분 |

#### 2.1.2 스킬 파일 작성 (Paperclip Phase D 완료)

| Skill | 용도 | 사용 에이전트 |
|-------|------|---------------|
| `db-query` | psql 사용법, 스키마 요약, 테이블 관계 | ad_strategy, rules_evaluation, manager |
| `result-callback` | NestJS API 콜백 규칙, JSON 형식, 에러 처리 | 전체 |
| `kiditem-api` | KidItem 내부 API 엔드포인트 목록, 인증 방식 | manager |

**Path**: `agent-config/skills/{name}/SKILL.md`

**효과**: seed-agents.ts의 프롬프트에서 하드코딩된 SQL/API 규칙을 스킬 파일로 분리 → 프롬프트 경량화 + 재사용성

#### 2.1.3 RulesSchedulerService → Heartbeat 통합

**현재**: `rules-scheduler.service.ts`가 자체 cron으로 `rulesService.evaluateAll()` 직접 호출
**목표**: `rules_evaluation` 에이전트의 `schedule` 필드 + HeartbeatService.syncTimers()로 통합

**마이그레이션**:
1. `rules_evaluation` seed에 `schedule: '0 9,18 * * *'` 설정 (기존 twice_daily 기본값)
2. `RulesSchedulerService`의 스케줄 변경 API를 `AgentDefinition.schedule` 업데이트로 전환
3. `RulesSchedulerService` 파일 삭제
4. `rules.module.ts`에서 provider 제거

---

### 2.2 Step 1 — Claude Code Patterns Phase 1 (기존 코드 개선)

#### P1-1: #11 Skill Pool Ordering (캐시 안정성)

**문제**: 스킬 목록 순서가 비결정적 → Claude 프롬프트 캐시 미스
**해결**: `skills.service.ts`에서 스킬을 알파벳 정렬 후 마운트
**파일**: `skills/skills.service.ts`
**변경량**: ~5줄

#### P1-2: #24 Prefetch + Harvest (병렬 준비)

**문제**: heartbeat에서 skills 빌드, feature gate 체크 등이 순차 실행
**해결**: `Promise.all([buildSkillsDir(), featureGateService.isEnabled(), loadRuntimeState()])` 병렬화
**파일**: `heartbeat/heartbeat.service.ts`
**변경량**: ~20줄

#### P1-3: #13 Dangerous Pattern Detection (도구 안전장치)

**문제**: `allowedTools`에 위험 패턴(`python:*`, `Bash(rm:*)`, `sudo:*`)이 설정 가능
**해결**: `validateAllowedTools(tools: string)` 함수. seed 등록 + API create/update 시 검증
**파일**: 새 `validators/dangerous-patterns.ts`, `agent-registry.service.ts`
**블랙리스트**: `python:*`, `Bash(rm:*)`, `Bash(sudo:*)`, `Bash(kill:*)`, interpreter 와일드카드
**변경량**: ~60줄

#### P1-4: #17 Async Transcript Recording (비동기 기록 분리)

**문제**: HeartbeatRun 업데이트가 전부 동기 → 에이전트 완료-응답 지연
**해결**: blocking(status, exitCode, resultJson) vs fire-and-forget(stdoutExcerpt, stderrExcerpt, usageJson) 분리. `setImmediate()` + EventEmitter로 비차단 저장
**파일**: `heartbeat/heartbeat.service.ts`
**변경량**: ~30줄
**원칙**: "Asymmetric persistence — Results blocking, logs fire-and-forget"

#### P1-5: #2 WorkflowContext Immutable Snapshots

**문제**: `WorkflowContext` step 데이터가 mutable Map → step 간 의도치 않은 상태 오염
**해결**: 각 step에 이전 상태의 `Object.freeze()` 스냅샷 전달. step은 새 객체로만 결과 반환
**파일**: `apps/server/src/workflows/context.ts` (또는 해당 워크플로우 실행 파일)
**변경량**: ~25줄

---

### 2.3 Step 2 — Claude Code Patterns Phase 2 (새 기능)

#### P2-1: #19 Validation Retry (검증 재시도)

**문제**: Zod 검증 실패 시 로그만 남기고 `validation_failed` 처리
**해결**: 실패 시 에러 피드백 프롬프트(`"your output was invalid, fix: {errors}"`)로 1회 재시도. 예산 범위 내에서만
**파일**: `heartbeat/heartbeat.service.ts`, `schemas/validate-output.ts`
**변경량**: ~40줄
**제약**: 최대 1회 재시도, 재시도도 budget 차감

#### P2-2: #28 Skill Safety Filtering (Deny Rules)

**문제**: 스킬이 필터링 없이 마운트 → 위험 스킬 주입 가능
**해결**: `AgentDefinition`에 `deniedSkills: String[]` 필드 추가. `SkillsService.buildSkillsDir()`에서 필터링
**파일**: `skills/skills.service.ts`, `prisma/schema.prisma`, `seed-agents.ts`
**변경량**: 스키마 1줄 + 서비스 ~10줄

#### P2-3: #14 Coordinator Privilege Separation + Operator Delegation

**문제**: Manager와 Specialist가 동일한 도구 접근 권한. Operator→Specialist wakeup 위임 로직 없음
**해결 (2파트)**:

**Part A — 권한 분리**:
- Manager/Operator: `allowedTools = 'Read Bash(curl:*)'` (오케스트레이션 전용)
- Specialist: `allowedTools = 'Bash(psql:*) Bash(curl:*) Read'` (도메인 전용)
- 권한 매트릭스를 `seed-agents.ts`에 role별로 정의

**Part B — Operator Delegation**:
- Manager 프롬프트에 "하위 에이전트를 wakeup API로 트리거" 지시 추가
- `HeartbeatService`에 `delegateToChild(parentRunId, childAgentType, payload)` 메서드 추가
- 또는 Manager가 직접 `curl POST /api/agent-registry/{childId}/wakeup` 호출
- `reportsTo` 관계를 활용한 계층 검증

**파일**: `seed-agents.ts`, `heartbeat/heartbeat.service.ts`, `agent-registry.controller.ts`
**변경량**: ~80줄

#### P2-4: #5 Concurrent-Safe Parallel Workflow Execution

**문제**: 워크플로우 DAG의 독립 브랜치가 순차 실행
**해결**: executor에 `isConcurrencySafe: boolean` 태그. DAG 엔진이 독립 노드(공유 입력 없음) 감지 → `Promise.all()`. Read-only executor(fetch, filter, sort)는 safe, Write executor(update, create)는 serial
**파일**: `apps/server/src/workflows/` 관련 파일
**변경량**: ~60줄
**제약**: 기존 순차 실행은 기본값으로 유지 (backward compatible)

#### P2-5: #15 Shared Scratch Workspace

**문제**: 다중 에이전트 워크플로우에서 중간 결과 공유 수단 없음
**해결**: `/tmp/kiditem-scratch/{workflowId}/` 디렉토리. Manager가 생성, Specialist에게 env var로 전달. 워크플로우 완료 시 cleanup
**파일**: `manager-workflow.service.ts`, `adapters/types.ts`, `heartbeat/heartbeat.service.ts`
**변경량**: ~40줄

#### P2-6: #22 Permission Denial Tracking

**문제**: 에이전트 권한 거부에 대한 감사 추적 없음
**해결**: 새 `agent_permission_denials` 테이블 (agentId, toolName, reason, timestamp, runId). Feature gate 블록, budget 초과, dangerous pattern 감지 시 기록. 대시보드 조회 API
**파일**: `prisma/schema.prisma`, 새 서비스, `agent-registry.controller.ts`
**변경량**: 스키마 ~15줄 + 서비스 ~50줄

---

## 3. Non-Requirements (명시적 제외)

| 항목 | 제외 이유 |
|------|-----------|
| Phase 3: #4 Diminishing returns, #6 Model fallback, #8 Permission hierarchy, #12 Smart classifier, #21 Token escalation, #30 Dynamic cron | 멀티턴 전환 이전에는 불필요 |
| Phase 4: #3 Message compression, #10 Selective clearing | 멀티턴 전환 이후 |
| Frontend UI 변경 | Agent 관리 페이지는 별도 피처로 분리 |
| Python agents 변경 | Step 0 TODOS만 해당, 아키텍처 변경 없음 |
| `process` adapter 구현 | 구체적 use case 없음 (YAGNI) |

---

## 4. Success Criteria

| # | Criteria | Measurement |
|---|----------|-------------|
| SC-1 | Step 0 완료: 스킬 파일 3개 존재하고 실제 주입됨 | `agent-config/skills/` 에 3개 디렉토리 + SKILL.md |
| SC-2 | Step 0 완료: RulesSchedulerService 삭제됨 | 파일 삭제 + heartbeat timer로 동일 스케줄 동작 확인 |
| SC-3 | Step 0 완료: TODOS 9건 해결 | 각 항목 코드 반영 확인 |
| SC-4 | Step 1 완료: 5개 패턴 구현 + happy path 테스트 통과 | `vitest run` 전체 통과 |
| SC-5 | Step 2 완료: 6개 패턴 + Operator 위임 구현 | 코드 + 테스트 존재 |
| SC-6 | 위험 도구 차단 동작 | `validateAllowedTools('Bash(rm:*)')` → throw |
| SC-7 | 검증 재시도 동작 | Zod 실패 → 1회 재시도 → 성공 또는 최종 실패 |
| SC-8 | Gap Analysis 90%+ | `/pdca analyze agent-os` 결과 |

---

## 5. Implementation Strategy

### 5.1 구현 순서

```
Step 0: Prerequisites (~30분)
├── T1~T9: TODOS 즉시 수정 (Python agents + NestJS)
├── S0-1: 스킬 파일 3개 작성 (agent-config/skills/)
├── S0-2: RulesScheduler → Heartbeat 통합
└── 테스트: 기존 테스트 통과 확인

Step 1: Phase 1 — 기존 코드 개선 (~2시간)
├── P1-1: Skill ordering (.sort() 추가)
├── P1-2: Prefetch + Harvest (Promise.all)
├── P1-3: Dangerous pattern detection (새 validator)
├── P1-4: Async transcript recording (비동기 분리)
├── P1-5: WorkflowContext immutable
└── 테스트: 각 패턴별 happy path 테스트

Step 2: Phase 2 — 새 기능 (~4시간)
├── P2-1: Validation retry
├── P2-2: Skill deny rules (스키마 + 서비스)
├── P2-3: Coordinator privilege + Operator delegation
├── P2-4: Parallel workflow execution
├── P2-5: Scratch workspace
├── P2-6: Permission denial tracking (스키마 + 서비스)
└── 테스트: 각 기능별 happy path 테스트
```

### 5.2 의존성 관계

```
T1~T9 (독립) ─────────────────────────┐
                                        ├─→ Step 1 시작
S0-1 스킬 파일 ──→ P1-1 스킬 정렬 ────┤
S0-2 RulesScheduler 통합 (독립) ───────┘

P1-1 스킬 정렬 ──→ P2-2 스킬 deny rules
P1-3 위험 패턴 ──→ P2-6 거부 추적
P2-3 권한 분리 ──→ P2-5 Scratch workspace (Manager→Specialist 전달)
```

### 5.3 Do 단계 Team 모드 추천

Step 1과 Step 2의 항목들이 대부분 독립적이므로 **Swarm 모드** 적합:
- Agent 1: P1-1 + P1-2 (스킬/성능)
- Agent 2: P1-3 + P2-6 (안전장치/추적)
- Agent 3: P1-4 + P1-5 (비동기/immutable)
- Agent 4: P2-1 + P2-2 (검증/스킬)
- Agent 5: P2-3 + P2-5 (위임/워크스페이스)
- Agent 6: P2-4 (병렬 워크플로우 — 독립)

---

## 6. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| RulesScheduler 통합 시 기존 스케줄 유실 | High | 통합 전 현재 스케줄 값을 seed-agents에 명시적 기록 |
| 스키마 변경 (deniedSkills, permission_denials) | Medium | nullable/default로 점진 적용, `db:push` 전 백업 |
| 병렬 워크플로우 race condition | High | `isConcurrencySafe` 플래그 기본값 false (opt-in), read-only만 safe |
| Validation retry 무한 루프 | Medium | 최대 1회, budget 차감, retry 카운트 기록 |
| Claude CLI --session-id 호환성 | Low | 이미 session conflict retry 로직 존재 |
| Operator delegation 시 권한 에스컬레이션 | High | `reportsTo` 관계 검증 + 하위 에이전트만 wakeup 가능 |

---

## 7. Design Principles (from Claude Code)

구현 시 반드시 준수할 원칙:

| # | Principle | Application |
|---|-----------|-------------|
| 1 | Free recovery → low-cost → give up | 세션 retry(무료) → validation retry(저비용) → auto-pause(포기) |
| 2 | Validate only at system boundaries | 에이전트 출력만 Zod 검증. 내부 서비스 간은 타입 신뢰 |
| 3 | Code that doesn't exist can't be exploited | 미사용 에이전트/스킬 삭제 (RenderAgent 등) |
| 4 | Asymmetric persistence | Results blocking, logs fire-and-forget |
| 5 | Graduated cost warnings | 80% → 95% → 100% 단계별 대응 |
| 6 | Never mutate — create new | ExecutionContext 불변. WorkflowContext도 불변화 |

---

## 8. File Change Map

| Area | Files | Change Type |
|------|-------|-------------|
| `agent-config/skills/` | db-query/SKILL.md, result-callback/SKILL.md, kiditem-api/SKILL.md | Create |
| `apps/server/src/agent-registry/skills/` | skills.service.ts | Modify (sort, deny filter) |
| `apps/server/src/agent-registry/heartbeat/` | heartbeat.service.ts | Modify (prefetch, async, retry, delegation) |
| `apps/server/src/agent-registry/validators/` | dangerous-patterns.ts | Create |
| `apps/server/src/agent-registry/wakeup/` | wakeup.service.ts | Minor modify |
| `apps/server/src/agent-registry/` | agent-registry.service.ts, seed-agents.ts | Modify |
| `apps/server/src/workflows/` | context.ts 또는 runner | Modify (immutable) |
| `apps/server/src/rules/` | rules-scheduler.service.ts | Delete |
| `apps/server/src/rules/` | rules.module.ts | Modify (provider 제거) |
| `prisma/schema.prisma` | AgentDefinition, new table | Modify |
| `agents/` | 9건 레거시 정리 | Modify/Delete |
| `__tests__/` | 각 패턴별 happy path 테스트 | Create |
