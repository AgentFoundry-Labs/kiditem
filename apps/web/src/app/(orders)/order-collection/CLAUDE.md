Before working in this directory, always read this document first rather than relying on memory.

# web/order-collection — Marketplace Collection

This route collects marketplace evidence through the unified extension or
uploads, converts it through NestJS, and manages local generated-file
convenience history.

## Collection Contract

- All extension IO goes through the shared extension bridge and route adapter.
  The order screen and dashboard share
  `useAllMarketplaceOrderCollection`; do not create a count-only collector.
- Mall-card `당일` and `신규` both read the server memory
  (`MallOperationOutcome`), so they match on another device or browser. `당일`
  is today's last succeeded `order_collection` run per mall — never a sum, so a
  re-collection does not double count. `신규` is that number minus today's
  succeeded `sellpia_transfer` counts, floored at zero; transfers are summed
  because one day's orders may leave in several files. Record a transfer only
  where Sellpia acceptance is observed, never on send-attempt, and an explicit
  Sellpia reconcile still overrides `신규`.
- The card's status line is the last `order_collection` result, and it says
  `마지막 수집 실패` when today already has a succeeded run, so collected orders
  never read as lost. The failure reason rides along as the line's tooltip.
- Collected files live in one browser store that several surfaces write to (this
  screen, the dashboard department button, the mall agent loop, another tab).
  Writers publish the change through `order-generated-file-store`, and screens
  re-read on that signal and on window focus. Do not keep a mount-only snapshot:
  file actions, previews, and `신규` read that list.
- Browser-collected malls never produce server `Order` rows — only Coupang sync
  writes those. Do not switch these cards to the Orders aggregate; it would read
  as zero for every extension-collected mall.
- A mall whose auto-login is blocked (`mall-login-block`) is off limits to every
  automatic driver — the agent loop and this screen's 자동감지 both skip it, and
  neither may re-enter it on its own. Only the operator resumes it: by logging
  in themselves (the login check clears the block) or by pressing the card's own
  자동 멈춤 control, which is what the card shows while a mall is blocked.
- Do not flatten "실패". An extension that did not answer in time
  (`extension_timeout`, `extension_unavailable`) is not a mall failure; a mall
  that already ran normally today reads 응답 없음 · 다시 확인, not red. A
  collector that could not follow the mall's screen
  (`provider_contract_changed`) is our bug and says 수집 로직 점검 필요 in red.
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
