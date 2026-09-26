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
- Malls moved to the operation kind `orders.mall_orders` (the shared
  `MALL_ORDER_OPERATION_MALLS`) use `mall-order-operation-source.ts`: login,
  `operation.start`, the operations reader, and convert by `operationId`. The
  other malls keep the attempt adapter until the remaining malls move (나머지 몰이 옮겨질 때까지).
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
  browser holds them, so another device or a cleared browser sees none. The counts
  move to the Orders reader later; until then, do not add a new count
  on this store.
- A mall whose auto-login is blocked (`mall-login-block`) is off limits to every
  automatic driver — the agent loop and this screen's 자동감지 both skip it, and
  neither may re-enter it on its own. Only the operator resumes it: by logging
  in themselves (the login check clears the block) or by pressing the card's own
  자동 멈춤 control, which is what the card shows while a mall is blocked.
  A mall that is not blocked still waits out the auto-login retry interval: one
  submit per mall per hour, whatever the result. Our own failures (API throttling,
  extension timeouts, a login we could not confirm) never block a mall.
- 쿠팡직배송 입고예정일 달력은 그 계정의 마지막 성공한 수집분을 서버에서 읽기만 한다
  (`GET …/coupang-directship/snapshot`). 여는 것으로는 실행을 시작하지 않고, 운영자가 불러오기를
  누를 때만 시작한다. "선택한 날짜 수집"은 늘 새 실행으로 먼저 다시 받고 그 새 `operationId` 로만
  변환한다 — 보이는 캡처로는 변환하지 않는다.
- 어느 소유자의 시도인지(`run.sourceOwner`)는 수집기 안까지 그대로 들고 간다. 수집기가 run 을
  다시 만들 때 이 칸을 빠뜨리면 쿠팡직배송 시도가 몰 소유자에게 가고, 몰 쪽에는 그 시도가
  없으므로 `ORDER_COLLECTION_ATTEMPT_NOT_FOUND` 로 끝난다 — 진짜 원인은 가려진 채 그 문구만
  뜬다.
- 우리 API 가 스스로 막은 요청은 몰의 실패가 아니다. `isApiThrottledMessage` 로 가려
  `ThrottlerException: Too Many Requests` 대신 무슨 일인지 말하고, 로그인 문제로 적지
  않는다 — 그렇게 적으면 멀쩡한 몰에 다시 로그인하러 가게 된다.
- 자동 감지는 운영자가 켤 때만 돈다. 간격만 저장하고 켜짐은 저장하지 않는다 — 새로고침 ·
  탭 복원 · 서버 재시작 뒤에는 사람이 다시 켠다. 자동 운전 고리도 같다.
- Discovery distinguishes ready, incompatible, and absent states. Preserve
  versioned failure evidence; only explicit authenticated empty evidence is a
  successful zero.
- Backend conversion uses raw blob responses where appropriate. Server import,
  Order rows, and transmission intents are durable truth.
- Rocket PA collection carries the selected Rocket account, persists complete
  SHIPMENT/MILKRUN evidence, and exports every collected row for the selected
  transport. Workbook linkage is optional and unmatched rows stay visible.

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

Preserve the existing collection shell and flat mall-card grid. Enabled
extension-session malls remain collectable without stored credentials.
Transmission actions stay inside generated files; do not add an Inventory
freshness workspace.

Focused specs in this directory own exact layout order, capability schemas,
retry/reconciliation states, personal-data masking, and query invalidation.
