---
name: kiditem-api
description: >
  KidItem 내부 API 엔드포인트 목록. Manager 에이전트가 내부 서비스를
  호출하거나 하위 에이전트에게 작업을 위임할 때 사용.
---

# KidItem API Skill

## Base URL

```
http://localhost:4000/api
```

내부 서비스 간 통신이므로 인증 불필요.

## 주요 엔드포인트

### 상품 (Products)
| Method | Path | 용도 |
|--------|------|------|
| GET | `/products?companyId={id}` | 상품 목록 |
| GET | `/products/:id` | 상품 상세 |

### 재고 (Inventory)
| Method | Path | 용도 |
|--------|------|------|
| GET | `/inventory?companyId={id}` | 재고 현황 |

### 광고 (Advertising)
| Method | Path | 용도 |
|--------|------|------|
| GET | `/advertising/stats?companyId={id}` | 광고 통계 |

### 규칙 (Rules)
| Method | Path | 용도 |
|--------|------|------|
| POST | `/rules/evaluate` | 건강도 평가 트리거 |
| GET | `/rules/schedule` | 평가 스케줄 조회 |

### 에이전트 플랫폼
| Method | Path | 용도 |
|--------|------|------|
| GET | `/agent-registry` | 에이전트 목록 |
| POST | `/agent-registry/:id/run` | 에이전트 실행 |
| POST | `/agent-registry/:parentId/delegate` | 하위 에이전트에게 위임 |
| GET | `/agent-registry/:id/runs` | 실행 이력 |
| GET | `/agent-registry/:id/denials` | 거부 이력 |

### 알림 (Alerts)
| Method | Path | 용도 |
|--------|------|------|
| GET | `/rules/alerts?companyId={id}` | 알림 목록 |

## 위임 (Delegation) API

Manager가 Specialist에게 작업을 위임할 때:

```bash
curl -s -X POST http://localhost:4000/api/agent-registry/{parentId}/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "childAgentType": "ad_strategy",
    "reason": "광고 ROAS 분석 필요",
    "payload": { "company_id": "..." }
  }'
```

응답: `{ "ok": true, "wakeupId": "...", "childAgentId": "..." }`

## 주의사항

- 모든 목록 API는 `companyId` 파라미터 필수
- 응답 형식: `{ items: T[], total, page, limit }` (페이지네이션) 또는 `T[]` (소규모)
- 에러 응답: `{ statusCode, error, message, timestamp, path }`
