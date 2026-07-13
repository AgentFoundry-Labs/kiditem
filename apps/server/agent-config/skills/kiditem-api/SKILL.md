---
name: kiditem-api
description: >
  KidItem NestJS 백엔드 API 사용법. curl로 내부 API를 호출하여
  상품, 주문, 재고, 광고, 건강도 데이터를 조회하거나 액션을 실행.
---

# KidItem API Skill

## 기본 정보

- Base URL: `http://localhost:4000/api`
- 모든 요청은 JSON (`Content-Type: application/json`)
- 인증/조직 컨텍스트는 백엔드 세션과 `@CurrentOrganization()` 이 결정한다.

## 주요 엔드포인트

### 상품
```
GET  /api/channels/listings?page=1&limit=20                    — 채널 등록 상품 목록
GET  /api/channels/listings/{listingId}/workspace              — 등록 상품 콘텐츠 작업공간
```

### 주문
```
GET  /api/orders                                      — 주문 목록
GET  /api/orders/stats                                — 주문 통계
```

### 재고
```
GET  /api/inventory/sellpia-skus                               — 셀피아 기준 재고 현황
GET  /api/inventory/sellpia-skus/{masterProductId}             — 셀피아 상품별 재고
GET  /api/inventory/sellpia-sync/import-runs                   — 셀피아 재고 Import 이력
```

### 광고
```
GET  /api/ads                                         — 광고 실적
```

### 건강도
```
GET  /api/rules/summary                              — 건강도 요약
POST /api/rules/evaluate                             — 건강도 평가 실행
GET  /api/rules/evaluate/status/{requestId}          — 평가 상태
```

### 손익
```
GET  /api/profit-loss                                 — 월별 손익
GET  /api/sales-analysis                              — 매출 분석
```

### 대시보드
```
GET  /api/dashboard                                   — 대시보드 요약
GET  /api/dashboard/trend                             — 추이
```

### 쿠팡
```
GET  /api/coupang-dashboard                           — 쿠팡 대시보드
POST /api/coupang-sync/products                       — 상품 동기화
POST /api/coupang-sync/orders                         — 주문 동기화
```

### 알림
```
GET  /api/alerts                                      — 알림 목록
```

### 활동 이력
```
GET  /api/activity-events?objectType=product&objectId={id}  — 객체별 이력
GET  /api/activity-events                              — 조직 활동 이력
```

### 에이전트
```
GET  /api/agent-os/instances                          — Agent OS 인스턴스 목록
POST /api/agent-os/runs                               — AgentRunRequest 생성
GET  /api/agent-os/requests/{requestId}               — 요청/큐 상태
GET  /api/agent-os/runs/{runId}                       — 실행 결과
POST /api/ad-agent/run                                — 광고 전략 실행
```

## 규칙

- organizationId는 쿼리/Body로 보내지 않는다. 백엔드가 인증된 세션의 `@CurrentOrganization()` 으로 결정한다.
- POST 요청 시 Body는 JSON
- 응답은 항상 JSON
