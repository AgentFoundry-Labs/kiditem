Before working in this directory, always read this document first rather than relying on memory.

# web/order-collection — Marketplace Collection

This route collects marketplace evidence through the unified extension or
uploads, converts it through NestJS, and manages local generated-file
convenience history.

## Collection Contract

- The mall list and which malls the extension collects live only in the channel
  registry (`@kiditem/shared/channel-registry`); this route reads it instead of
  repeating the list.
- All extension IO goes through the shared extension bridge and route adapter.
  The order screen and dashboard share
  `useAllMarketplaceOrderCollection`; do not create a count-only collector.
- The shared collection loop and the mall cards use only the source adapter
  (`OrderCollectionSourceAdapter`: start, status, stop, `card`) and the owner
  stamped on the run; they never compare a mall key. A source with its own
  owner, login or start screen answers inside its own adapter file.
- Order collection, Sellpia transfer, and tracking upload results are Orders
  facts. Read their owner state; never record them as `MallOperationOutcome`
  rows or duplicate them in a mall observation log.
- Collected files live in one browser store that several surfaces write to (this
  screen, the dashboard department button, the mall agent loop, another tab).
  Writers publish the change through `order-generated-file-store`, and screens
  re-read on that signal and on window focus. Do not keep a mount-only snapshot:
  file actions, previews, and `신규` read that list.
- Reading today's and `신규` counts from that browser store is temporary. One
  browser holds them, so another device or a cleared browser sees none. KID-234
  moves the counts to the Orders reader; until it lands, do not add a new count
  on this store.
- A mall whose auto-login is blocked (`mall-login-block`) is off limits to every
  automatic driver — the agent loop and this screen's 자동감지 both skip it, and
  neither may re-enter it on its own. Only the operator resumes it: by logging
  in themselves (the login check clears the block) or by pressing the card's own
  자동 멈춤 control, which is what the card shows while a mall is blocked.
  A mall that is not blocked still waits out the auto-login retry interval: one
  submit per mall per hour, whatever the result. Our own failures (API throttling,
  extension timeouts, a login we could not confirm) never block a mall.
- 어느 소유자의 시도인지(`run.sourceOwner`)는 수집기 안까지 그대로 들고 간다. 수집기가 run 을
  다시 만들 때 이 칸을 빠뜨리면 쿠팡직배송 시도가 몰 소유자에게 가고, 몰 쪽에는 그 시도가
  없으므로 `ORDER_COLLECTION_ATTEMPT_NOT_FOUND` 로 끝난다 — 진짜 원인은 가려진 채 그 문구만
  뜬다(2026-09-21 라이브).
- 우리 API 가 스스로 막은 요청은 몰의 실패가 아니다. `isApiThrottledMessage` 로 가려
  `ThrottlerException: Too Many Requests` 대신 무슨 일인지 말하고, 로그인 문제로 적지
  않는다 — 그렇게 적으면 멀쩡한 몰에 다시 로그인하러 가게 된다(2026-09-21 라이브).
- 자동 감지는 운영자가 켤 때만 돈다. 간격만 저장하고 켜짐은 저장하지 않는다 — 새로고침 ·
  탭 복원 · 서버 재시작 뒤에는 사람이 다시 켠다(KID-106 Q1). 자동 운전 고리도 같다.
- Discovery distinguishes ready, incompatible, and absent states. Preserve
  versioned failure evidence; only explicit authenticated empty evidence is a
  successful zero.
- Backend conversion uses raw blob responses where appropriate. Server import,
  Order rows, and transmission intents are durable truth.
- Rocket PA collection carries the selected Rocket account, persists complete
  SHIPMENT/MILKRUN evidence, and exports every collected row for the selected
  transport. Workbook linkage is optional and unmatched rows stay visible.
- A mall whose registry `collector` is `upload` (원폴라리스: orders arrive only as a
  mailed Excel) has no collector to start. Its card's control opens the upload
  modal with that mall selected; the conversion fills 전화 · 주소 · 공급단가 from
  the Sellpia template (`주소록` · `단가`) saved on the mall account row, and a
  template uploaded with the order file replaces the saved one.

## Submission Contract

- Prepare the stable source-run/transport intent before irreversible Sellpia
  upload. Preparation failure blocks extension IO.
- Observed accepted/pending evidence finalizes the intent. Explicit confirmed
  non-submission aborts it. Extension failure or tab loss leaves it prepared
  for tested reconciliation/retry; Sellpia remains the order-level duplicate
  authority.
- Local submission markers may recover an already-prepared intent without
  another upload. Privileged retry records audited non-submission before
  reopening the same key.
- Upload never prechecks stock, requests Inventory freshness, invalidates
  Inventory queries, or auto-resubmits. Provider rejection displays the
  provider message.
- File actions lock by file ID, and irreversible sends execute through one
  ordered queue.

Preserve the existing collection shell. The mall cards stand in two areas: the
malls we collect, and below them the malls Sellpia collects itself (`셀피아`).
Which area a card stands in is the registry's `collector`, never a mall key, and
the card itself does not change between them. Both areas share one saved order —
the reorder request carries every mall, because a partial list clears the
`sortOrder` of every mall left out. Enabled extension-session malls remain
collectable without stored credentials.
Transmission actions stay inside generated files; do not add an Inventory
freshness workspace.

Focused specs in this directory own exact layout order, capability schemas,
retry/reconciliation states, personal-data masking, and query invalidation.
