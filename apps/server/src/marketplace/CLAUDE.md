# marketplace — Workflow/Agent 카탈로그 + Parametrized Install

6 파일. **read-only 카탈로그 + per-company 설치 추적 + configurable param override**.

## Directory

```
marketplace/
├── marketplace.controller.ts
├── marketplace.service.ts
├── marketplace.module.ts
└── dto/                     # list, install
```

## Routes

| Route | 책임 |
|---|---|
| `GET /api/marketplace/workflows` | published 워크플로우 리스트 (module/category 필터, installed 상태 포함) |
| `GET /api/marketplace/workflows/:id` | 워크플로우 detail |
| `POST /api/marketplace/workflows/:id/install` | catalog → workflowTemplate 클론 + installCount++ |
| `POST /api/marketplace/workflows/:id/uninstall` | 회사의 workflowTemplate 삭제 |
| 동일한 패턴 for `/agents/...` | agent template 도 동일 |

## 핵심 패턴

### 1. Catalog + Installation Tracking

- `marketplace` 테이블 = **read-only catalog** (절대 직접 수정 금지)
- `workflowTemplate` / `agentTemplate` 테이블 = per-company 설치 인스턴스
- `installed` 상태는 cross-reference 로 계산 (marketplace.service.ts:44-60)

### 2. Parametrized Install — Param Override

`POST /install` 시 `params` dict 를 받음:
- `configurableParams` 정의에 매칭되면 → `nodesJson` 의 해당 노드 config 업데이트 (marketplace.service.ts:78-89)
- 매칭 안 되면 → 무시
- 결과: 카탈로그 원본은 그대로, 회사별 설치본만 커스터마이즈

### 3. installCount 증감

설치 시 `installCount++`, 제거 시 `--` (marketplace.service.ts:106-109). 텔레메트리 + 인기도 sort 용도.

### 4. Trigger Type 자동 감지

- `params.schedule` 있으면 → `triggerType: 'scheduled'`
- 없으면 → `triggerType: 'manual'`

사용자가 직접 trigger type 못 지정.

## Rules

- 카탈로그는 read-only (DB 직접 update 금지)
- Module default `'order'` if not in catalog
- Trigger type 은 `params.schedule` 유무로 결정
- 회사 스코프 필수 (`@CurrentCompany()`)

## Prohibits

- ❌ Marketplace 테이블 직접 update (admin tool 따로)
- ❌ 사용자가 trigger type 직접 지정
- ❌ Install 시 nodesJson 전체 override (configurableParams 만 허용)

## Cross-domain deps

- **prisma** — Marketplace, WorkflowTemplate, AgentTemplate

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Configurable param 종류 추가 | `marketplace.service.ts:78-89` 매핑 로직 + catalog seed (marketplace 테이블) + 프론트 install modal |
| Trigger type 추가 | `marketplace.service.ts` (감지 로직) + `workflowTemplate.triggerType` enum |
| Install count metric 변경 | `marketplace.service.ts:106-109` + 정렬 로직 |
| 새 catalog item type | `prisma/schema.prisma` (Marketplace.type enum) + 신규 install 메서드 |
