# panel — Live Ops SSE projection

`EventEmitter2` 글로벌 버스를 구독해 workflow / agent / image / alert 도메인
이벤트를 SSE 로 multiplex. **business owner 가 아니라 projection adapter** 다.

## 무엇이 아닌가 (Hard bans)

- ❌ Panel 은 도메인 mutation 을 수행하지 않는다. `WorkflowRun`, `HeartbeatRun`,
  `ThumbnailGeneration`, `Alert` 의 read-only join 만 허용.
- ❌ 새 도메인 source 를 panel 에 추가해 panel 을 business owner 로 만들지
  않는다. 현재 source 4 개 (`workflowRun`, `heartbeatRun`, `thumbnailGeneration`,
  `alert`) 는 owner domain 으로 정해진 surface 들의 projection — 다섯 번째
  source 추가는 owner-domain 위반이다.
- ❌ Panel 내부에서 `prisma.<model>.update` / `create` / `delete` 금지. 도메인
  서비스가 mutate 하고 panel 이 read-only project 한다.

## Owner domain — Automation / Agent OS

이 폴더는 backend architecture contract 의 `automation` / `agent-os` owner
domain 의 outgoing adapter (`adapter/out/panel-event/`) 역할이다 (Phase 3C-4
에서 위치 이동). 분류 + hard-delete 기준은
[`docs/superpowers/plans/2026-04-29-automation-agent-os-hard-delete.md`](../../../../docs/superpowers/plans/2026-04-29-automation-agent-os-hard-delete.md)
참조.

## Directory

```
panel/
├── panel.controller.ts        # @Sse('stream') + GET /snapshot + GET /backfill
├── panel.service.ts           # snapshot/backfill projection across 4 sources
├── panel.module.ts
├── adapters/
│   ├── workflow.adapter.ts    # WorkflowRun → PanelRunItem
│   ├── agent.adapter.ts       # HeartbeatRun + AgentDefinition → PanelRunItem
│   ├── image.adapter.ts       # ThumbnailGeneration → PanelRunItem
│   ├── alert.adapter.ts       # Alert → PanelAlertItem
│   ├── workflow-run-mapper.ts # internal upsert payload builder
│   └── types.ts
└── events/
    ├── panel-events.ts        # PANEL_EVENTS.{UPSERT,DISMISS} + payload types
    └── panel-sse.service.ts   # ring buffer + monotonic seq + multiplex
```

## Inbound entrypoints

- HTTP — `@Sse('stream')`, `GET /api/panel/snapshot`, `GET /api/panel/backfill`.
  `@CurrentCompany()` + `@CurrentUser()` 항상 사용.
- EventEmitter2 — `PANEL_EVENTS.UPSERT` / `PANEL_EVENTS.DISMISS` 를
  `WorkflowsService`, `WorkflowRunnerService`, `HeartbeatService`,
  `RulesService`, `AlertsService`, `ai/services/thumbnail-auto.service.ts`
  체인이 emit. Panel 은 구독자.

## Outbound dependencies

- Prisma read-only join: `workflowRun`, `heartbeatRun`, `thumbnailGeneration`,
  `alert`. 모두 `companyId` 스코프.
- LLM/provider 없음. 외부 fetch 없음. 파일시스템 없음.

## Visibility

`User-WorkflowRun` 관계 + `Run.actorUserId === currentUserId` 조합으로 panel
스트림 필터링. 같은 회사 안에서도 사용자별로 보이는 run 이 다를 수 있음.
`alert` 는 visibility 필드 없이 항상 회사 단위로 보인다 (`PanelService.snapshot`
의 마지막 filter 참조).

## Single-instance assumption

`PanelSseService` 의 ring buffer 는 in-process. 멀티 인스턴스 production 으로
가려면 PG `LISTEN/NOTIFY` 또는 Redis pub-sub 도입 필요. 도입 PR 은
`automation/adapter/out/panel-event/sse-bus.ts` 로의 이동과 함께 처리.

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| `panel-events.ts` 의 event payload shape | 모든 emitter (`WorkflowsService`, `WorkflowRunnerService`, `HeartbeatService`, `RulesService`, `AlertsService`, `thumbnail-auto.service`) + `panel-sse.service` + 클라이언트 store |
| `adapters/*.adapter.ts` mapping | `@kiditem/shared/panel` 의 `PanelRunItem` / `PanelAlertItem` schema + 클라이언트 렌더링 |
| Snapshot source 변경 | `panel.service.ts` 의 4-source 백필 + 새 source 가 owner-domain 규칙 위반 아닌지 확인 (위 Hard bans 참조) |
| Visibility 필터 | `panel.service.ts` 마지막 `items.filter(...)` + `panel.controller.ts` 의 `@CurrentUser()` 사용 |
