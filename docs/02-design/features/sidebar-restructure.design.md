# sidebar-restructure Design

- **Date**: 2026-04-02
- **Author**: yhc125
- **Project**: kiditem
- **Version**: 1.0
- **Architecture**: Option C — Pragmatic Balance

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

Sidebar.tsx를 **Option C (Pragmatic Balance)** 방식으로 재구성한다. 한 파일 내에서 `dashboardItem` + `navSections` + `bottomItem` 3개 변수로 분리하고, 렌더링을 3영역(대시보드/섹션/하단)으로 나눈다.

**선택 근거**: A는 설정 하단 고정 불가(FR-04 미충족). B는 사이드바 하나에 파일 3개로 과설계. C는 한 파일에서 모든 요구사항 충족.

---

## 2. Data Model

해당 없음. DB 변경 없음.

---

## 3. Component Architecture

### 3.1 Sidebar.tsx 구조 변경

**Before**: `navSections: NavSection[]` 1개 배열 → 전체 순회 렌더링

**After**: 3개 변수 + 3영역 렌더링

```typescript
// 1. 대시보드 (단독 항목)
const dashboardItem: NavItem = {
  href: '/', label: '대시보드', icon: LayoutDashboard
};

// 2. 섹션별 네비게이션 (5개 섹션)
const navSections: NavSection[] = [
  { title: '상품 파이프라인', items: [...] },  // 4 items
  { title: '주문·물류', items: [...] },         // 6 items
  { title: '광고 전략', items: [...] },         // 3 items
  { title: '분석', items: [...] },              // 3 items
  { title: '에이전트', items: [...] },          // 5 items
];

// 3. 하단 고정 (설정)
const bottomItem: NavItem = {
  href: '/settings', label: '설정', icon: Settings
};
```

### 3.2 렌더링 레이아웃

```
┌─────────────────────────┐
│ Logo + KidItem           │ ← 기존 유지
├─────────────────────────┤
│ 대시보드                 │ ← dashboardItem (섹션 밖)
├─────────────────────────┤
│ ━━ 상품 파이프라인 ━━    │
│   소싱/수집              │
│   콘텐츠 생성            │
│   상품 관리              │
│   썸네일 AI              │
│                          │ ← navSections (스크롤 영역)
│ ━━ 주문·물류 ━━          │
│   ...                    │
│                          │
│ ━━ 에이전트 ━━           │
│   ...                    │
├─────────────────────────┤ ← border-t
│ ⚙ 설정                  │ ← bottomItem (고정)
│ ● 시스템 정상 운영중      │ ← status (기존 유지)
└─────────────────────────┘
```

**핵심 변경**: 기존 `overflow-y-auto` 스크롤 영역에서 설정과 상태 표시를 빼내어 하단 고정 영역으로 분리.

### 3.3 Flex 레이아웃 구조

```
<aside className="flex flex-col h-screen">
  {/* Logo — 기존 유지 */}
  <div className="h-16 border-b">...</div>

  {/* Dashboard — NEW: 섹션 밖 단독 */}
  <div className="px-3 pt-3 pb-1">
    <Link>{dashboardItem}</Link>
  </div>

  {/* Sections — 스크롤 영역 */}
  <div className="flex-1 overflow-y-auto">
    {navSections.map(section => ...)}
  </div>

  {/* Bottom — NEW: 하단 고정 */}
  <div className="border-t px-3 py-2">
    <Link>{bottomItem}</Link>
    {sidebarOpen && <StatusDot />}
  </div>
</aside>
```

---

## 4. API Design

해당 없음. 백엔드 변경 없음.

---

## 5. Navigation Items Detail

### 5.1 Full Item List

| Section | Label | Route | Icon | Status |
|---|---|---|---|---|
| (단독) | 대시보드 | `/` | LayoutDashboard | 기존 |
| 상품 파이프라인 | 소싱/수집 | `/sourcing` | Search | 기존 |
| 상품 파이프라인 | 콘텐츠 생성 | `/generate` | Sparkles | 기존 |
| 상품 파이프라인 | 상품 관리 | `/products` | Package | 기존 |
| 상품 파이프라인 | 썸네일 AI | `/thumbnails` | Image | 이동 (운영→상품) |
| 주문·물류 | 주문 조회 | `/orders` | ShoppingCart | 기존 |
| 주문·물류 | CS 관리 | `/cs-management` | Headphones | 기존 |
| 주문·물류 | 미배송 조회 | `/unshipped-items` | AlertTriangle | 기존 |
| 주문·물류 | 반품 관리 | `/returns` | RotateCcw | 이동 (출고→주문) |
| 주문·물류 | 재고 현황 | `/inventory` | Warehouse | 이동 (재고→주문) |
| 주문·물류 | 리뷰 관리 | `/reviews` | MessageSquare | 이동 (운영→주문) |
| 광고 전략 | 광고 전략 AI | `/ads/strategy` | Target | **신규** |
| 광고 전략 | 업계 진단 | `/ads/benchmark` | BarChart3 | **신규** |
| 광고 전략 | 광고 대시보드 | `/ads-hub` | Megaphone | 이동 (분석→광고) |
| 분석 | 손익 분석 | `/profit-loss` | TrendingUp | 아이콘 변경 (BarChart3→TrendingUp) |
| 분석 | 통합매출분석 | `/sales-analysis` | LineChart | 아이콘 변경 (TrendingUp→LineChart) |
| 분석 | 리포트 | `/reports` | FileSpreadsheet | 이동 (운영→분석) |
| 에이전트 | 에이전트 관리 | `/agents` | Bot | 이동 (자동화→에이전트) |
| 에이전트 | 워크플로우 | `/workflows` | GitBranch | 이동 (자동화→에이전트) |
| 에이전트 | 활동 로그 | `/agents/activity` | Activity | **신규 노출** |
| 에이전트 | 비용 분석 | `/agents/costs` | Coins | **신규 노출** |
| 에이전트 | 스킬 카탈로그 | `/agents/skills` | BookOpen | **신규 노출** |
| (하단) | 설정 | `/settings` | Settings | 하단 이동 |

### 5.2 Removed Items

| Route | Icon (removed) |
|---|---|
| `/core-products` | Star |
| `/cleanup` | Trash2 |
| `/purchase-orders` | ClipboardList |
| `/stock-movement` | ArrowUpDown |
| `/ontology` | Network |
| `/logs` | FileText |

### 5.3 New Icons (lucide-react)

| Icon | Import Name | Used For |
|---|---|---|
| Target | `Target` | 광고 전략 AI |
| BarChart3 | `BarChart3` | 업계 진단 (기존 import 재사용) |
| TrendingUp | `TrendingUp` | 손익 분석 (기존 import 재사용) |
| LineChart | `LineChart` | 통합매출분석 |
| Activity | `Activity` | 활동 로그 |
| Coins | `Coins` | 비용 분석 |
| BookOpen | `BookOpen` | 스킬 카탈로그 |

### 5.4 Removed Icons (import 정리)

| Icon | Reason |
|---|---|
| Star | core-products 제거 |
| Trash2 | cleanup 제거 |
| ClipboardList | purchase-orders 제거 |
| ArrowUpDown | stock-movement 제거 |
| Network | ontology 제거 |
| FileText | logs 제거 |

---

## 6. isActive Logic

기존 `isActive` 함수를 유지하되, 에이전트 서브페이지 활성 표시를 위한 확인:

```typescript
const isActive = (href: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);
```

- `/agents` → `/agents`, `/agents/123`, `/agents/activity` 모두 활성 — **문제**: 에이전트 관리와 활동 로그가 동시 활성
- **해결**: 서브페이지를 먼저 매칭하도록 navSections에서 서브페이지(`/agents/activity`, `/agents/costs`, `/agents/skills`)를 에이전트 관리(`/agents`) 앞에 배치하거나, `isActive` 로직을 정확 매칭으로 변경

**선택: isActive 로직 수정**

```typescript
const isActive = (href: string) => {
  if (href === '/') return pathname === '/';
  // /agents 는 정확히 /agents 또는 /agents/[id] 만 매칭 (서브탭 제외)
  if (href === '/agents') {
    return pathname === '/agents' || 
      (pathname.startsWith('/agents/') && 
       !pathname.startsWith('/agents/activity') &&
       !pathname.startsWith('/agents/costs') &&
       !pathname.startsWith('/agents/skills'));
  }
  return pathname.startsWith(href);
};
```

---

## 7. Placeholder Pages

### 7.1 `/ads/strategy/page.tsx`

```typescript
'use client';

import { Target } from 'lucide-react';

export default function AdsStrategyPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <Target className="w-12 h-12 mb-4" />
      <h1 className="text-lg font-semibold text-gray-600">광고 전략 AI</h1>
      <p className="text-sm mt-1">실시간 데이터 기반 ABC 등급 분석 · 자동 전략 제안</p>
    </div>
  );
}
```

### 7.2 `/ads/benchmark/page.tsx`

```typescript
'use client';

import { BarChart3 } from 'lucide-react';

export default function AdsBenchmarkPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <BarChart3 className="w-12 h-12 mb-4" />
      <h1 className="text-lg font-semibold text-gray-600">업계 평균 대비 진단</h1>
      <p className="text-sm mt-1">쿠팡 셀러 업계 평균과 비교한 내 광고 효율</p>
    </div>
  );
}
```

---

## 8. Test Plan

| # | Test Case | Method | Expected |
|---|---|---|---|
| T-01 | 사이드탭 6섹션 렌더링 | 시각적 확인 | 상품 파이프라인/주문·물류/광고 전략/분석/에이전트 5섹션 + 대시보드 단독 |
| T-02 | 설정 하단 고정 | 스크롤 테스트 | 메뉴 스크롤해도 설정이 항상 보임 |
| T-03 | 접힌 사이드바 아이콘 | 사이드바 접기 | 모든 아이콘 정상 표시, tooltip 동작 |
| T-04 | 모바일 오버레이 | 768px 이하 | 오버레이 클릭 시 닫힘 |
| T-05 | 에이전트 서브페이지 활성 | /agents/activity 접속 | 활동 로그만 활성, 에이전트 관리는 비활성 |
| T-06 | 광고 placeholder | /ads/strategy 접속 | placeholder 페이지 정상 렌더링 |
| T-07 | 제거된 메뉴 직접 접근 | /core-products URL | 기존 페이지 정상 동작 |
| T-08 | 빌드 성공 | `npm run build` | 에러 없음 |

---

## 9. Migration Notes

- 기존 페이지 코드 변경 없음
- 사이드탭에서 제거된 6개 라우트는 URL 직접 접근 가능 (라우트 삭제 아님)
- 아이콘 import 정리: 6개 제거, 4개 추가 (Target, LineChart, Activity, Coins, BookOpen)

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| isActive 로직 변경으로 다른 라우트 영향 | /agents 관련만 특수 처리. 나머지는 기존 startsWith 유지 |
| lucide-react에 Target/Coins 아이콘 없을 수 있음 | 구현 시 import 확인. 없으면 유사 아이콘 대체 |

---

## 11. Implementation Guide

### 11.1 Implementation Order

| Step | File | Action | Description |
|---|---|---|---|
| 1 | `apps/web/src/app/ads/strategy/page.tsx` | Create | 광고 전략 AI placeholder |
| 2 | `apps/web/src/app/ads/benchmark/page.tsx` | Create | 업계 진단 placeholder |
| 3 | `apps/web/src/components/layout/Sidebar.tsx` | Modify | icon import 정리 + 3변수 분리 + 렌더링 3영역 |

### 11.2 Estimated Changes

- Files to create: 2 (placeholder pages)
- Files to modify: 1 (Sidebar.tsx)
- Estimated lines changed: ~120 lines (Sidebar.tsx 대부분)

### 11.3 Session Guide

단일 세션으로 완료 가능. 모듈 분리 불필요.

| Module | Files | Description |
|---|---|---|
| module-1 | placeholder pages + Sidebar.tsx | 전체 구현 (1세션) |

---

## Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-04-02 | yhc125 | Initial design — Option C selected |
