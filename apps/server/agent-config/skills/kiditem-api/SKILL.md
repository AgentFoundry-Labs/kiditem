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
- 인증 없음 (내부 API)

## 주요 엔드포인트

### 상품
```
GET  /api/products?organizationId={id}&page=1&limit=20    — 상품 목록
GET  /api/products/{id}                               — 상품 상세
```

### 주문
```
GET  /api/orders?organizationId={id}                       — 주문 목록
GET  /api/orders/stats?organizationId={id}                 — 주문 통계
```

### 재고
```
GET  /api/inventory?organizationId={id}                    — 재고 현황
GET  /api/inventory/by-product/{productId}            — 상품별 재고
```

### 광고
```
GET  /api/ads?organizationId={id}                          — 광고 실적
```

### 건강도
```
GET  /api/rules/summary?organizationId={id}                — 건강도 요약
POST /api/rules/evaluate?organizationId={id}               — 건강도 평가 실행
GET  /api/rules/evaluate/status/{taskId}              — 평가 상태
```

### 손익
```
GET  /api/profit-loss?organizationId={id}                  — 월별 손익
GET  /api/sales-analysis?organizationId={id}               — 매출 분석
```

### 대시보드
```
GET  /api/dashboard?organizationId={id}                    — 대시보드 요약
GET  /api/dashboard/trend?organizationId={id}              — 추이
```

### 쿠팡
```
GET  /api/coupang-dashboard?organizationId={id}            — 쿠팡 대시보드
POST /api/coupang-sync/products                       — 상품 동기화
POST /api/coupang-sync/orders                         — 주문 동기화
```

### 알림
```
GET  /api/alerts?organizationId={id}                       — 알림 목록
```

### 활동 이력
```
GET  /api/activity-events?objectType=product&objectId={id}  — 객체별 이력
GET  /api/activity-events?organizationId={id}                     — 회사별 이력
```

### 에이전트
```
POST /api/agent-registry/{id}/run                     — 에이전트 실행
GET  /api/agent-registry/{id}/runs                    — 실행 이력
POST /api/ad-agent/run                                — 광고 전략 실행
```

## 규칙

- organizationId는 항상 쿼리 파라미터로 전달
- POST 요청 시 Body는 JSON
- 응답은 항상 JSON
