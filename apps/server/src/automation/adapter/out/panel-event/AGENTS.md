# panel-event — Live Ops SSE projection adapter

`EventEmitter2` 글로벌 버스를 구독해 workflow / image / alert 도메인
이벤트를 SSE 로 multiplex. **business owner 가 아니라 projection adapter** 다.

## 무엇이 아닌가 (Hard bans)

- ❌ Panel 은 도메인 mutation 을 수행하지 않는다. `WorkflowRun`,
  `ThumbnailGeneration`, `Alert` 의 read-only join 만 허용.
- ❌ 새 도메인 source 를 panel 에 추가해 panel 을 business owner 로 만들지
  않는다. 현재 source 3 개 (`workflowRun`, `thumbnailGeneration`,
  `alert`) 는 owner domain 으로 정해진 surface 들의 projection — 네 번째
  source 추가는 owner-domain 위반이다.
- ❌ Panel 내부에서 `prisma.<model>.update` / `create` / `delete` 금지. 도메인
  서비스가 mutate 하고 panel 이 read-only project 한다.

## Not yet wired

다음 source 는 의도적으로 비어있고, owner 가 panel emit 을 제공할 때까지
panel 에 추가하지 않는다:

- **Agent run projection** — 구버전은 `HeartbeatRun + AgentDefinition.name` 을
  read-only join 해 `agent` source 로 emit 했다. Agent OS 마이그레이션에서
  legacy `HeartbeatRun` / `AgentDefinition` 모델이 폐기되면서 이 source 는
  제거됐다. Live agent run 이벤트는 Agent OS owner (`apps/server/src/agent-os/`)
  가 `AgentRun.status` 전이 지점에서 직접 emit 해야 하며, 그 wiring 이
  들어오면 panel 은 다시 구독자로 합류한다 — `agent.mapper.ts` 와
  panel.service 의 backfill 도 그 시점에 함께 복구한다. 그 전까지는 panel
  에서 agent 도메인을 표면에 두지 않는다.
- **Marketplace 의 agent install 경로** — `Marketplace` row (`type='agent'`)
  의 listing 은 read-only 로 노출하지만, install/uninstall 은
  `MarketplaceController` 에서 `BadRequestException` 으로 막혀 있다. 이유는
  legacy `AgentDefinition` clone path 가 사라졌고 Agent OS 의 shipped
  definitions 는 DB row 가 아니라 code-owned global registry 이기 때문.
  새 카탈로그 wiring 이 들어오면 controller 의 두 `BadRequestException`
  핸들러를 실제 application service 호출로 교체한다.

## Owner domain — Automation / Agent OS

이 폴더는 backend architecture contract 의 `automation` / `agent-os` owner
domain 의 outgoing adapter (`adapter/out/panel-event/`) 역할이다. Phase 3C-4
에서 top-level `src/panel/` 표면은 제거됐고, HTTP entrypoint 는
`automation/adapter/in/http/panel.controller.ts` 로 이동했다. 분류 +
hard-delete 기준은 이 파일과 `apps/server/AGENTS.md` 의 automation /
agent-os topology 에 직접 보존한다.

## Directory

```
automation/
├── adapter/in/http/
│   └── panel.controller.ts         # @Sse('stream') + GET /snapshot + GET /backfill
├── adapter/out/panel-event/
│   ├── panel.service.ts            # snapshot/backfill projection across 3 sources
│   ├── panel-events.ts             # PANEL_EVENTS.{UPSERT,DISMISS} + payload types
│   └── panel-sse.service.ts        # ring buffer + monotonic seq + multiplex
└── mapper/panel-event/
    ├── workflow.mapper.ts          # WorkflowRun → PanelRunItem
    ├── image.mapper.ts             # ThumbnailGeneration → PanelRunItem
    ├── alert.mapper.ts             # Alert → PanelAlertItem
    ├── workflow-run.mapper.ts      # internal upsert payload builder
    └── types.ts
```

## Inbound entrypoints

- HTTP — `@Sse('stream')`, `GET /api/panel/snapshot`, `GET /api/panel/backfill`.
  `@CurrentOrganization()` + `@CurrentUser()` 항상 사용.
- EventEmitter2 — `PANEL_EVENTS.UPSERT` / `PANEL_EVENTS.DISMISS` 를
  `WorkflowOrchestrationService`, `WorkflowRunnerService`,
  `RulesService`, `AlertsService`,
  `ai/application/service/thumbnail-auto.service.ts` 체인이 emit. Panel 은 구독자.

## Outbound dependencies

- Prisma read-only join: `workflowRun`, `thumbnailGeneration`, `alert`.
  모두 `organizationId` 스코프.
- LLM/provider 없음. 외부 fetch 없음. 파일시스템 없음.

## Alert / Work Visibility

`User-WorkflowRun` 관계 + `Run.actorUserId === currentUserId` 조합으로 panel
스트림 필터링. 같은 회사 안에서도 사용자별로 보이는 run 이 다를 수 있음.
`Alert` 는 사용자용 알림 원장이지만 row 자체는 organization 범위다
(`PanelService.snapshot` 의 마지막 filter 참조). "내 작업" 구분은
`Alert.actionTaskId -> ActionTask.assigneeUserId` 로 승격된 뒤 action-board /
dashboard 작업 큐에서 처리한다. Agent OS 관련 사용자 알림도 별도 agent inbox
나 panel source 를 만들지 말고 `Alert` 로 투영한 뒤 필요 시 `ActionTask` 로
승격한다.

## Alert href contract

`Alert.href` 는 알림이 설명하는 작업의 목적지 deep link 다. Panel 은 href 를
추론하지 않고 그대로 "이동" 링크로 렌더링하므로, 알림 producer 가 작업
owner 로서 명시적으로 정의해야 한다.

- 진행 중 operation: 상태 확인 / 취소 / 재시도 context 로 이동.
- 성공 operation: 생성물 / 처리 결과물 화면으로 이동.
- 실패 operation: 실패 원인 확인과 재시도 시작점으로 이동.
- signal alert: 사용자가 문제를 해결할 수 있는 화면으로 이동.

결과 URL 을 `start()` 시점에 알 수 없으면 status URL 을 임시로 넣고,
`succeed()` / `fail()` 의 patch `href` 로 결과 / 재시도 URL 을 갱신한다.
`targetType` / `targetId` 는 분석용 메타데이터일 뿐 href fallback 으로
자동 변환하지 않는다. 예: 상세페이지 생성은 상품 허브가 아니라
`/sourcing/:productId/editor?boldId=:contentGenerationId` 또는
`?kpId=:contentGenerationId` 로 연결한다.

## Single-instance assumption

`PanelSseService` 의 ring buffer 는 in-process. 멀티 인스턴스 production 으로
가려면 PG `LISTEN/NOTIFY` 또는 Redis pub-sub 도입 필요. 도입 PR 은
`automation/adapter/out/panel-event/sse-bus.ts` 로의 이동과 함께 처리.

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| `panel-events.ts` 의 event payload shape | 모든 emitter (`WorkflowOrchestrationService`, `WorkflowRunnerService`, `RulesService`, `AlertsService`, `thumbnail-auto.service`) + `panel-sse.service` + 클라이언트 store |
| `mapper/panel-event/*.mapper.ts` mapping | `@kiditem/shared/panel` 의 `PanelRunItem` / `PanelAlertItem` schema + 클라이언트 렌더링 |
| Snapshot source 변경 | `panel.service.ts` 의 3-source 백필 + 새 source 가 owner-domain 규칙 위반 아닌지 확인 (위 Hard bans + Not yet wired 참조) |
| Visibility 필터 | `adapter/out/panel-event/panel.service.ts` 마지막 `items.filter(...)` + `adapter/in/http/panel.controller.ts` 의 `@CurrentUser()` 사용 |
