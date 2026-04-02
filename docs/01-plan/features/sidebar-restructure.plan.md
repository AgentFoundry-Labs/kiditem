# sidebar-restructure Plan

- **Date**: 2026-04-02
- **Author**: yhc125
- **Project**: kiditem
- **Version**: 1.0

---

## Executive Summary

| Perspective | Description |
|---|---|
| **Problem** | 현재 사이드탭(8섹션 23항목)이 수동 운영 메뉴 중심이라 Agent OS 비전과 맞지 않음. 광고 도메인이 1항목으로 과소 대표되고, 에이전트 서브페이지 5개가 숨겨져 있으며, 출고 섹션(1항목)·운영 섹션(잡동사니) 등 구조적 비효율 존재 |
| **Solution** | 비즈니스 플로우(상품→주문→광고→분석) 순서로 재배치하고, 에이전트 섹션을 5개 서브페이지와 함께 독립 승격. 광고 전략 섹션 신설. 미사용 메뉴 6개를 사이드탭에서 제거 |
| **Function/UX Effect** | 6섹션 21항목으로 정리. 일별 업무 흐름과 메뉴 순서가 일치하여 탐색 시간 감소. Agent OS 정체성 명확화 |
| **Core Value** | KidItem을 "셀러 관리 시스템"에서 "Agent OS 기반 이커머스 운영 플랫폼"으로 전환하는 UI 기반 마련 |

---

## Context Anchor

| Dimension | Content |
|---|---|
| **WHY** | Agent OS 비전에 맞는 UI 정체성 확립. 현재 사이드탭은 기능 나열형이라 플랫폼 방향성이 드러나지 않음 |
| **WHO** | KidItem 셀러 (1인 운영자). 소싱→주문→광고→분석 순서로 일일 업무 수행 |
| **RISK** | 기존 북마크/습관적 메뉴 위치 변경으로 단기 혼란 가능. 페이지 코드 삭제 없이 사이드탭만 변경하여 위험 최소화 |
| **SUCCESS** | 사이드탭 6섹션 21항목 구성 완료. 기존 모든 라우트 정상 동작. 에이전트 서브페이지 5개 노출 |
| **SCOPE** | Sidebar.tsx 재구성 + 광고 placeholder 페이지 2개 + 설정 하단 고정. 기존 페이지 코드 변경 없음 |

---

## 1. Overview

### 1.1 Purpose

KidItem 사이드탭을 Agent OS 비전과 비즈니스 플로우에 맞게 재구성한다.

### 1.2 Background

- 현재 8섹션 23항목으로 구성된 사이드탭이 기능 나열형으로 되어 있음
- Agent OS 패턴 적용 완료(Phase 1-2) 후 UI에는 반영되지 않은 상태
- 광고 전략 AI/업계 진단 신규 화면이 기획되었으나 사이드탭에 자리 없음
- 에이전트 서브페이지(activity, costs, org, skills)가 구현되어 있지만 사이드탭에 미노출

### 1.3 Related Documents

- `docs/AGENT_OS_PATTERNS.md` — Agent OS 30개 패턴 분석
- `apps/web/CLAUDE.md` — 프론트엔드 규칙
- `apps/web/src/components/layout/Sidebar.tsx` — 현재 사이드바

---

## 2. Scope

### 2.1 In Scope

| # | Item | Description |
|---|---|---|
| 1 | 사이드탭 재구성 | `Sidebar.tsx`의 `navSections` 배열을 새 구조로 변경 |
| 2 | 섹션 통합 | 8섹션 → 6섹션 (출고·운영 해체, 소싱+상품 통합, 주문+재고+출고 통합) |
| 3 | 에이전트 서브페이지 노출 | activity, costs, skills를 사이드탭에 추가 |
| 4 | 광고 전략 섹션 신설 | 광고 전략 AI, 업계 진단 (placeholder), 광고 대시보드 |
| 5 | 설정 하단 고정 | 설정을 섹션 밖 사이드바 하단에 단독 배치 |
| 6 | 미사용 메뉴 제거 | 6개 항목을 사이드탭에서 제거 (페이지 코드 유지) |
| 7 | 광고 placeholder 페이지 | `/ads/strategy`, `/ads/benchmark` 빈 페이지 생성 |

### 2.2 Out of Scope

| # | Item | Reason |
|---|---|---|
| 1 | 기존 페이지 코드 삭제 | 사이드탭 제거만, 직접 URL 접근은 유지 |
| 2 | 광고 전략 AI 기능 구현 | 별도 PDCA로 진행 |
| 3 | 상품 관리 필터 통합 | 핵심상품/정리대상 필터 추가는 별도 작업 |
| 4 | 재고 현황 탭 통합 | 발주/입출고 탭 통합은 별도 작업 |
| 5 | 사이드바 디자인 변경 | 스타일/레이아웃은 현재 그대로 유지 |

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | 사이드탭을 6섹션 구조로 재구성 | Must |
| FR-02 | 에이전트 서브페이지 3개(activity, costs, skills) 사이드탭 노출 | Must |
| FR-03 | 광고 전략 섹션 신설 (3개 항목) | Must |
| FR-04 | 설정을 사이드바 하단에 섹션 밖 단독 배치 | Must |
| FR-05 | 사이드탭 제거 대상 6개 항목을 navSections에서 삭제 | Must |
| FR-06 | `/ads/strategy`, `/ads/benchmark` placeholder 페이지 생성 | Must |
| FR-07 | 접힌 사이드바(collapsed) 상태에서도 모든 아이콘 정상 표시 | Must |
| FR-08 | 모바일 반응형 동작 유지 | Must |

### 3.2 Non-Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| NFR-01 | 기존 라우트 전체 정상 동작 (URL 직접 접근 포함) | Must |
| NFR-02 | `'use client'` 규칙 유지 | Must |
| NFR-03 | lucide-react 아이콘만 사용 | Should |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Sidebar.tsx navSections가 새 구조(6섹션)로 변경됨
- [ ] 에이전트 서브페이지 3개가 사이드탭에 노출됨
- [ ] 광고 전략 섹션이 3개 항목으로 구성됨
- [ ] 설정이 사이드바 하단에 단독 배치됨
- [ ] 사이드탭 제거 대상 6개가 navSections에서 삭제됨
- [ ] `/ads/strategy`, `/ads/benchmark` placeholder 페이지 존재
- [ ] 접힌 사이드바에서 아이콘 정상 표시
- [ ] 모바일 오버레이 동작 정상
- [ ] 기존 모든 라우트 URL 직접 접근 가능

### 4.2 Quality Criteria

- Match Rate ≥ 90%
- 빌드 에러 없음 (`npm run build`)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| 사용자 메뉴 위치 혼란 | Medium | High | 섹션명을 직관적으로 유지. 기존 URL 접근 보장 |
| 에이전트 5개 서브메뉴로 섹션 비대화 | Low | Medium | org 페이지는 사이드탭 제외 (에이전트 관리 내 접근) |
| 광고 placeholder 페이지 방치 | Low | Medium | 별도 PDCA로 광고 기능 구현 추적 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Change Type | Description |
|---|---|---|
| `apps/web/src/components/layout/Sidebar.tsx` | Modify | navSections 재구성 + 설정 하단 분리 |
| `apps/web/src/app/ads/strategy/page.tsx` | Create | 광고 전략 AI placeholder 페이지 |
| `apps/web/src/app/ads/benchmark/page.tsx` | Create | 업계 진단 placeholder 페이지 |

### 6.2 Current Consumers

| Consumer | Impact | Notes |
|---|---|---|
| Sidebar.tsx navSections | Direct | 배열 전체 교체 |
| 기존 page.tsx 파일들 | None | 변경 없음. 사이드탭 제거만 |
| Header.tsx | None | 사이드바 토글만 사용, 메뉴 구조 무관 |

---

## 7. Architecture Considerations

### 7.1 Project Level

**Starter** — UI 컴포넌트 변경 + placeholder 페이지 2개. 인프라 변경 없음.

### 7.2 Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| 에이전트 위치 | 분석 아래 (하단) | 비즈니스 플로우 순서 우선. 상품→주문→광고→분석→에이전트 |
| 설정 배치 | 사이드바 하단 단독 | 섹션에 속하지 않는 유틸리티. 접근성 유지하면서 섹션 수 감소 |
| 광고 신규 페이지 | placeholder만 | 기능 구현은 별도 PDCA. 사이드탭 자리만 확보 |
| org 페이지 | 사이드탭 미노출 | 에이전트 관리 내에서 접근 가능. 일상 메뉴 아님 |
| /logs 통합 | /agents/activity로 대체 | 워크플로우 로그도 에이전트 활동의 일부 |

---

## 8. Target Structure

### 8.1 New Sidebar Layout

```
대시보드                  /                        LayoutDashboard

━━ 상품 파이프라인 ━━
  소싱/수집               /sourcing                Search
  콘텐츠 생성             /generate                Sparkles
  상품 관리               /products                Package
  썸네일 AI               /thumbnails              Image

━━ 주문·물류 ━━
  주문 조회               /orders                  ShoppingCart
  CS 관리                 /cs-management           Headphones
  미배송 조회             /unshipped-items         AlertTriangle
  반품 관리               /returns                 RotateCcw
  재고 현황               /inventory               Warehouse
  리뷰 관리               /reviews                 MessageSquare

━━ 광고 전략 ━━
  광고 전략 AI            /ads/strategy            Target (NEW)
  업계 진단               /ads/benchmark           BarChart3 (NEW)
  광고 대시보드           /ads-hub                 Megaphone

━━ 분석 ━━
  손익 분석               /profit-loss             TrendingUp
  통합매출분석            /sales-analysis          LineChart (NEW)
  리포트                  /reports                 FileSpreadsheet

━━ 에이전트 ━━
  에이전트 관리           /agents                  Bot
  워크플로우              /workflows               GitBranch
  활동 로그               /agents/activity         Activity (NEW)
  비용 분석               /agents/costs            Coins (NEW)
  스킬 카탈로그           /agents/skills           BookOpen (NEW)

──────────────
⚙ 설정                   /settings                Settings
● 시스템 정상 운영중
```

### 8.2 Removed from Sidebar (pages preserved)

| Route | Reason | Alternative Access |
|---|---|---|
| `/core-products` | 상품 관리의 A등급 필터 뷰 | 상품 관리 → 등급 필터 |
| `/cleanup` | 상품 관리의 정리대상 필터 뷰 | 상품 관리 → 등급 필터 |
| `/purchase-orders` | 재고 현황 하위 기능 | 재고 현황 → 탭 |
| `/stock-movement` | 재고 현황 하위 기능 | 재고 현황 → 탭 |
| `/ontology` | 일상 업무 아닌 지원 도구 | URL 직접 접근 |
| `/logs` | 에이전트 활동 로그로 통합 | /agents/activity |

---

## 9. Next Steps

1. `/pdca design sidebar-restructure` — Design 문서 작성
2. `/pdca do sidebar-restructure` — 구현
3. 광고 전략 AI 기능 구현은 별도 `/pdca plan ads-strategy`로 분리

---

## Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-04-02 | yhc125 | Initial plan |
