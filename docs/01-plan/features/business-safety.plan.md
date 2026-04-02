# Business Safety Layer Plan

> 모든 KidItem 에이전트에 적용되는 비즈니스 데이터 보호 계층. 프롬프트가 아닌 서버가 강제하는 안전장치.

## Executive Summary

| Perspective | Description |
|-------------|-------------|
| **Problem** | 에이전트 안전장치가 프롬프트에만 존재 (ad_strategy의 "30% 초과 금지"). AI가 무시하면 서버가 차단하지 못함. 에이전트 판단으로 실제 돈이 움직이는데 서버 레벨 보호가 없음 |
| **Solution** | 에이전트 결과를 서버가 수신할 때 비즈니스 규칙으로 검증하는 Business Safety Layer 6개 컴포넌트 구축. 프롬프트 → 서버 강제로 전환 |
| **Function UX Effect** | 에이전트가 상한 초과 변경을 제출하면 서버가 차단 + 기록. 신규 에이전트는 dry-run 졸업 후 실행. 모든 판단에 근거 기록. 잘못된 실행은 스냅샷에서 복원 |
| **Core Value** | "AI가 실수해도 돈을 잃지 않는" 운영 에이전트 플랫폼 |

## Context Anchor

| Anchor | Content |
|--------|---------|
| **WHY** | KidItem 에이전트는 코딩 에이전트가 아닌 운영 에이전트 (READ→THINK→ACT). CC의 파일 보호는 무의미. 가격/광고비/발주 등 비즈니스 데이터 보호가 핵심. 현재는 프롬프트 하드코딩 규칙뿐이라 AI가 무시하면 차단 불가 |
| **WHO** | 모든 에이전트 (활성 4 + 비활성 3 + Python 4 + 미래 신규). 모든 셀러 (에이전트 실행 결과가 실제 매출에 영향) |
| **RISK** | 검증 로직이 에이전트 실행 속도를 저하시킬 수 있음. 스냅샷 데이터 증가. 과도한 제한이 에이전트 유용성을 해칠 수 있음 |
| **SUCCESS** | 모든 에이전트 결과가 ActionCap 검증을 통과해야 실행. DryRunGate로 신규 에이전트 안전 배포. 잘못된 실행 시 스냅샷 복원 가능 |
| **SCOPE** | agent-registry 모듈 + 도메인 콜백 레이어. Frontend 변경 최소 (관리 UI는 별도). Python agents는 결과 형식만 맞추면 자동 적용 |

---

## 1. Background

### 1.1 KidItem Agent Identity

```
READ  → psql로 상품/재고/광고/손익 데이터 수집
THINK → 규칙 파일 + AI 판단 ("이 상품 광고 중단해야 한다")
ACT   → curl로 NestJS API 콜백 → DB UPDATE 또는 외부 시스템 조작
```

| 특성 | 값 |
|------|-----|
| 도구 | Bash(psql), Bash(curl), Read |
| 출력 | JSON 판단 결과 → API 콜백 |
| 위험 | 잘못된 판단 → 금전적 손해 |
| 롤백 | DB 스냅샷 복원 (현재 불가) |
| 환경 | 프로덕션 (실제 거래) |

### 1.2 현재 안전장치 (프롬프트 하드코딩만)

| 에이전트 | 안전장치 | 서버 강제? |
|----------|---------|:---------:|
| ad_strategy | "30% 초과 증가 금지", "일일 상한 초과 금지" | ❌ 프롬프트만 |
| ad_strategy | `dry_run` 플래그 | ⚠️ API 호출 시 사용자 선택 |
| rules_evaluation | 없음 (읽기 전용) | — |
| manager | 없음 | ❌ |
| pricing (비활성) | 없음 | ❌ |
| inventory_alert (비활성) | 없음 | ❌ |
| review_monitor (비활성) | 없음 (읽기 전용) | — |
| Python agents | 없음 | ❌ |

**핵심 문제**: ad_strategy의 "30% 초과 금지"는 프롬프트에만 있고, 에이전트가 35% 증가를 결과에 포함해도 `receiveResults()`가 그대로 실행함.

### 1.3 에이전트 액션 분류

| 액션 유형 | 예시 | 위험도 | 관련 에이전트 |
|----------|------|:------:|-------------|
| **금액 변경** | 광고 예산 증가/감소, 가격 변경 | HIGH | ad_strategy, pricing |
| **상태 변경** | 광고 중단, 상품 비활성화 | HIGH | ad_strategy, inventory_alert |
| **발주 생성** | 구매 주문 생성 | HIGH | reorder_agent (미래) |
| **알림 생성** | alert 레코드 생성 | LOW | rules_evaluation, review_monitor |
| **분석 보고** | 건강도 점수, 추천 | LOW | rules_evaluation, rules_suggest, manager |

---

## 2. Requirements

### BS-1: ActionCap (서버 강제 상한)

**문제**: 프롬프트 규칙은 AI가 무시 가능. 서버가 결과를 수신할 때 강제 검증 필요.

**해결**: `AgentDefinition`에 `actionCap` JSON 필드 추가. `receiveResults()` 에서 결과 JSON의 각 action을 cap과 대비 검증.

```typescript
actionCap: {
  maxBudgetChangePct: 30,      // 단일 상품 예산 변경 최대 %
  maxPriceChangePct: 20,       // 단일 상품 가격 변경 최대 %
  maxAffectedProducts: 50,     // 한 번에 변경 가능 상품 수
  dailySpendLimit: 500000,     // 일일 총 광고비 상한 (원)
  maxOrderAmount: 1000000,     // 단일 발주 금액 상한 (원)
}
```

**검증 흐름**:
```
에이전트 결과 수신 (receiveResults)
  → actionCap 검증
    → 통과: 정상 처리
    → 위반: 차단 + DenialTracker 기록 + 에이전트에 피드백
    → 부분 위반: 위반 항목만 제거, 나머지 실행 (configurable)
```

**대상**: 금액 변경 + 상태 변경 액션을 가진 모든 에이전트

### BS-2: BlastRadius (영향 범위 제한)

**문제**: 에이전트가 한 번에 100개+ 상품을 변경하면 문제 발생 시 피해 범위가 큼.

**해결**: `actionCap.maxAffectedProducts`로 제한. 초과 시 배치 분할 권고.

**대상**: 결과에 `actions[]` 배열이 있는 에이전트 (ad_strategy, pricing, inventory_alert)

### BS-3: Snapshot (실행 전 비즈니스 데이터 백업)

**문제**: 에이전트가 가격을 잘못 변경하면 이전 값을 모름. 복원 불가.

**해결**: `receiveResults()`에서 실제 DB UPDATE 전에 영향 받는 레코드의 현재 값을 스냅샷으로 저장.

```typescript
// 새 테이블: AgentActionSnapshot
{
  runId: "heartbeat-run-id",
  agentId: "agent-id",
  tableName: "products",
  recordId: "product-uuid",
  fieldName: "ad_budget_limit",
  valueBefore: 10000,        // 변경 전 값
  valueAfter: 13000,         // 변경 후 값
  restoredAt: null,          // 복원 시 타임스탬프
}
```

**복원 API**: `POST /api/agent-registry/runs/:runId/rollback` → 해당 run의 모든 스냅샷을 역순 적용

**대상**: DB UPDATE를 수행하는 모든 도메인 콜백 (ad-strategy, rules, pricing)

### BS-4: DryRunGate (졸업 제도)

**문제**: 에이전트 활성화 시 첫날부터 `dryRun: false`로 실행 가능. 검증 없이.

**해결**: `AgentDefinition`에 `trustLevel` 필드 추가. trustLevel에 따라 서버가 dry_run을 강제.

```
trustLevel 0 (신규): dry-run 강제. 사용자가 false로 해도 서버가 true로 오버라이드
trustLevel 1 (검증됨): dry-run 해제 가능. 사용자 선택 존중
trustLevel 2 (신뢰됨): 스케줄 자동 실행에서도 dry-run 없이 실행 가능
```

**승격 조건**:
- 0→1: dry-run 성공 5회 누적 (validation 통과 + actionCap 준수)
- 1→2: 실행 모드 성공 20회 누적

**강등 조건**:
- 연속 2회 실패 (validation_failed 또는 actionCap 위반) → trustLevel -1
- 수동 강등: `PATCH /api/agent-registry/:id` → `{ trustLevel: 0 }`

**기존 에이전트 마이그레이션**: 이미 활성 운영 중인 에이전트는 trustLevel 2로 시작

### BS-5: ReasoningLog (판단 근거 구조화)

**문제**: 에이전트가 "이 상품 광고 중단"이라고 결정했는데 왜 그런 결정을 했는지 추적 불가.

**해결**: 에이전트 결과 JSON에 `reasoning` 필드를 표준화. 각 action에 판단 근거 포함.

```json
{
  "actions": [
    {
      "product_id": "uuid",
      "action": "stop_ad",
      "reason": "재고 0 + 광고 진행 중",
      "reasoning": {
        "rule": "재고 0 + 광고 진행 중 → 즉시 중단 (P0)",
        "data": { "current_stock": 0, "active_ad_days": 5 },
        "confidence": 0.95
      }
    }
  ]
}
```

**저장**: HeartbeatRun.resultJson에 이미 저장됨. 추가 스키마 불필요.
**조회 API**: `GET /api/agent-registry/runs/:runId/reasoning` → actions별 reasoning 추출

**대상**: 결과에 `actions[]`가 있는 모든 에이전트. 프롬프트에 reasoning 형식 지시 추가.

### BS-6: PostVerification (사후 검증)

**문제**: 에이전트가 "광고비 30% 증가"를 실행했는데, 실제로 ROAS가 개선되었는지 확인 안 함.

**해결**: 실행 후 설정 시간(기본 24시간) 뒤에 자동으로 결과를 재평가.

```
에이전트 실행 (ACT)
  → 24시간 후 PostVerification 트리거
    → 동일 데이터 재조회 (READ)
    → 변경 전후 비교 (COMPARE)
    → 결과 기록 (verification_status: improved/unchanged/worsened)
    → worsened인 경우: 알림 생성 + 자동 롤백 옵션 제시
```

**구현**: Heartbeat timer 활용. 실행 완료 시 `AgentWakeupRequest`에 24시간 후 verification wakeup 예약.

**대상**: 실행 모드(dry_run=false)로 수행된 모든 액션

---

## 3. Non-Requirements

| 항목 | 제외 이유 |
|------|-----------|
| 파일 시스템 보호 | 에이전트가 파일 수정 안 함. CC가 처리 |
| git 관련 안전장치 | 에이전트가 git 사용 안 함 |
| 프론트엔드 보호 UI | 별도 피처로 분리 |
| Python agent 코드 변경 | 결과 JSON 형식만 맞추면 서버에서 통합 검증 |
| 쿠팡 API rate limit | 외부 API 제한은 에이전트 프롬프트에서 관리 |
| 멀티테넌트 격리 | 이미 companyId 필터로 처리됨 |

---

## 4. Success Criteria

| # | Criteria | Measurement |
|---|----------|-------------|
| SC-1 | ad_strategy가 35% 예산 증가를 제출하면 서버가 차단 | actionCap 검증 테스트 |
| SC-2 | 한 번에 50개 초과 상품 변경 시도 시 차단 | blastRadius 검증 테스트 |
| SC-3 | 에이전트 실행 전 영향 레코드의 valueBefore 저장됨 | snapshot 테이블 데이터 확인 |
| SC-4 | 신규 에이전트(trustLevel=0)가 dry_run=false 시도 시 서버가 true로 강제 | DryRunGate 테스트 |
| SC-5 | trustLevel 0→1 승격이 5회 성공 후 자동 수행 | 자동 승격 테스트 |
| SC-6 | 잘못된 실행을 스냅샷에서 복원 가능 | rollback API 테스트 |
| SC-7 | 에이전트 결과에 reasoning 포함 시 구조화 조회 가능 | reasoning API 테스트 |
| SC-8 | 실행 24시간 후 자동 verification 트리거 | PostVerification wakeup 테스트 |
| SC-9 | 기존 테스트 100/100 유지 | vitest 회귀 없음 |
| SC-10 | Gap Analysis 90%+ | /pdca analyze 결과 |

---

## 5. Implementation Strategy

### 5.1 적용 대상 매트릭스

| 에이전트 | ActionCap | BlastRadius | Snapshot | DryRunGate | Reasoning | PostVerify |
|----------|:---------:|:-----------:|:--------:|:----------:|:---------:|:----------:|
| ad_strategy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| rules_evaluation | — | — | ✅ (healthScore) | — | ✅ | — |
| rules_suggest | — | — | — | — | — | — |
| manager | — | — | — | ✅ | ✅ | — |
| pricing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| inventory_alert | ✅ | ✅ | — | ✅ | ✅ | — |
| review_monitor | — | — | — | — | ✅ | — |
| Python agents | — | — | — | — | — | — |

→ **읽기 전용 에이전트는 가벼운 보호**, **실행 에이전트는 전체 보호**

### 5.2 구현 순서

```
Step 1: Schema + 핵심 서비스 (~2시간)
├── AgentDefinition: actionCap, trustLevel 필드 추가
├── AgentActionSnapshot 테이블 생성
├── business-safety/ 모듈 생성
│   ├── action-cap.service.ts
│   ├── dry-run-gate.service.ts
│   └── snapshot.service.ts
└── 테스트

Step 2: Heartbeat + 도메인 통합 (~2시간)
├── receiveResults() 흐름에 ActionCap 검증 삽입
├── DryRunGate를 heartbeat.buildPrompt()에 통합
├── Snapshot을 도메인 콜백 (ad-strategy, rules) 앞에 삽입
├── seed-agents에 actionCap + trustLevel 설정
└── 테스트

Step 3: ReasoningLog + PostVerification (~2시간)
├── 프롬프트에 reasoning 형식 지시 추가
├── reasoning 조회 API
├── PostVerification wakeup 스케줄링
├── verification 결과 비교 로직
└── 테스트
```

### 5.3 의존성

```
Schema 변경 ──→ business-safety 모듈 ──→ Heartbeat 통합 ──→ 도메인 콜백 수정
                                         ↓
                                    DryRunGate ──→ PostVerification (timer)
```

---

## 6. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ActionCap이 너무 보수적이면 에이전트가 유용한 변경도 차단 | High | 에이전트별 configurable cap + 쉬운 조정 API |
| Snapshot 데이터 증가 | Medium | 30일 이후 자동 정리 + 요약만 보존 |
| PostVerification이 false positive 알림 생성 | Medium | worsened 판단 시 자동 롤백이 아닌 알림만 (사람 확인) |
| DryRunGate가 에이전트 실전 투입을 지연 | Low | 수동 승격 API로 즉시 trustLevel 변경 가능 |
| 기존 에이전트 마이그레이션 시 동작 변경 | High | 기존 활성 에이전트는 trustLevel=2로 시작, actionCap은 현재 프롬프트 규칙에서 추출 |

---

## 7. Design Principles

| # | Principle | Application |
|---|-----------|-------------|
| 1 | 프롬프트 규칙 → 서버 강제 | 프롬프트의 "30% 초과 금지"를 actionCap으로 이전. 프롬프트에도 유지(가이드), 서버가 최종 검증 |
| 2 | 읽기는 자유, 쓰기는 검증 | READ(psql SELECT)는 제한 없음. ACT(결과 실행)만 검증 |
| 3 | 점진적 신뢰 (Progressive Trust) | trustLevel 0→1→2로 에이전트가 신뢰를 획득 |
| 4 | 복원 가능성 (Reversibility) | 모든 쓰기 작업에 스냅샷. 원클릭 롤백 |
| 5 | 관찰 가능성 (Observability) | 모든 판단에 reasoning. 모든 차단에 denial 기록 |
| 6 | 방어적 기본값 (Safe Defaults) | 신규 에이전트: dry-run 강제, actionCap 보수적 기본값 |

---

## 8. File Change Map

| Area | Files | Change Type |
|------|-------|-------------|
| `prisma/schema.prisma` | actionCap, trustLevel 필드 + AgentActionSnapshot 테이블 | Modify |
| `agent-registry/business-safety/` | action-cap.service, dry-run-gate.service, snapshot.service, reasoning.service, post-verification.service + 모듈 + 테스트 | Create |
| `agent-registry/heartbeat/heartbeat.service.ts` | DryRunGate 통합 (buildPrompt) | Modify |
| `agent-registry/agent-registry.service.ts` | receiveResults에 ActionCap 검증 삽입 | Modify |
| `agent-registry/agent-registry.controller.ts` | rollback, reasoning 엔드포인트 | Modify |
| `agent-registry/domains/ad-strategy/ad-strategy.service.ts` | Snapshot 삽입 | Modify |
| `agent-registry/seed-agents.ts` | actionCap + trustLevel 설정 | Modify |
| `agent-registry/events/agent-events.ts` | ACTION_CAP_VIOLATED, TRUST_LEVEL_CHANGED 이벤트 | Modify |
