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
- **Workflow catalog 는 slim-core executor 만 참조** — 허용 노드 타입은
  `marketplace.service.ts` 의 `ALLOWED_WORKFLOW_NODE_TYPES` 와 동일하며,
  `apps/server/src/workflows/executors/builtin.ts` 의 등록 목록과 일치한다
  (`trigger.manual`, `trigger.schedule`, `condition.evaluate`,
  `notification.alert`, `agent_task.create`).
  - `listWorkflows` 는 허용 외 노드 타입을 가진 catalog 를 응답에서 숨기고
    warn 로그를 남긴다. `getWorkflow` 도 같은 정책으로 404 처리.
  - `installWorkflow` 는 catalog `nodesJson` 을 다시 검사하여 허용 외
    타입이 있으면 `BadRequestException` 으로 거부한다 (defense in depth).
  - 새 도메인 executor 가 등록된 후에만 그 타입을 catalog 에 추가한다.
    catalog 가 먼저 등장하면 install 이 거부되거나 list 에서 사라진다.
- **AI/LLM 진입점은 `agent_task.create` 한 가지뿐** — workflow catalog 가
  AI/LLM 작업을 표현할 때는 `agent_type` 으로 `AgentRegistry` 에 위임한다.
  generic `ai_process` / `data_transform` / `internal.db_query` / `api_call`
  같은 노드는 catalog 에 두지 않는다.
- **Client 가 보낸 `companyId` 신뢰 금지** — install/uninstall 모두
  `@CurrentCompany()` 가 주입한 값만 사용한다. DTO 에 `companyId` 필드를
  넣지 말 것 (root `AGENTS.md` 의 Multi-tenant scope rule). Workflow runner
  도 template 의 ownership companyId 로 노드 config 를 덮어쓰므로 catalog
  node config 의 `company_id` 는 의미 없는 값이다.

## Prohibits

- ❌ Marketplace 테이블 직접 update (admin tool 따로)
- ❌ 사용자가 trigger type 직접 지정
- ❌ Install 시 nodesJson 전체 override (configurableParams 만 허용)
- ❌ Generic DB/HTTP/transform executor 노드를 catalog 에 추가
  (`internal.db_query`, `api_call`, `data.filter`, `data_transform`,
  `ai_process`)
- ❌ 미등록 도메인 executor 를 catalog 에 미리 추가 — `builtin.ts` 등록이
  먼저, catalog 추가가 그 다음
- ❌ DTO 또는 install body 에 `companyId` 수신

## Cross-domain deps

- **prisma** — Marketplace, WorkflowTemplate, AgentTemplate

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Configurable param 종류 추가 | `marketplace.service.ts:78-89` 매핑 로직 + catalog seed (marketplace 테이블) + 프론트 install modal |
| Trigger type 추가 | `marketplace.service.ts` (감지 로직) + `workflowTemplate.triggerType` enum |
| Install count metric 변경 | `marketplace.service.ts:106-109` + 정렬 로직 |
| 새 catalog item type | `prisma/schema.prisma` (Marketplace.type enum) + 신규 install 메서드 |
