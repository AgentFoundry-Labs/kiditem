Before working in this directory, always read this document first rather than relying on memory.

# channels — Marketplace Identity And SKU Matching

`src/channels/` owns marketplace accounts, listing/option identity, Coupang
catalog publication/import, matching, account-scoped browser registration,
channel capacity projections, shared selling-product authoring and dashboard reads. Coupang Open API product, order, return, and deletion
verification are unsupported; the legacy sync HTTP routes return 501 without
IO. Wing/browser evidence and approved internal sources remain supported.

Login checks and registration form fills return current browser results without
persisting an observation history. Actual submissions and provider outcomes use
the registration execution ledger.

The channel registry (`@kiditem/shared/channel-registry`) owns channel identity,
the registration `delivery` (form · api · sheet · none) and `representativeImage`
support. Use the implemented operation capability when admitting provider work;
Rocket PO is Orders-owned and does not support general listing registration or
stockout. Unsupported operations fail before an execution intent or external IO.

Execution kinds, the fence, evidence and state transitions are mall-neutral
(KID-321). What differs per mall — provider account identity, confirmation
evidence (admin origin, listing id format), prepare-time mall facts frozen as
`adapterPayload`, option availability rules and the representative-image runner —
lives only behind `ChannelAdapterPort` in `adapter/out/channel/<key>/` (Coupang
Wing) or the generic mall adapter. `npm run check:mall-neutral` fails a channel
name in Channels domain/application or the shared lifecycle contracts outside its
reasoned allowlist.

Channels owns all account mutations through its account capability, including
the existing Orders account-editor route. Mall publishing reads the account's
`config.listingProfile`; credentials remain encrypted and server-owned. KC facts
come from the selling product's own certifications; images come from AI's
content capability.

## Identity And Ownership

- `ChannelAccount` is marketplace/store identity; Wing and Rocket are
  separate rows even when they share one vendor identity.
- Prisma `ChannelListing` and `ChannelListingOption` are the channel product
  and sellable-option identities. Listing-level product summaries are computed
  from every option's recipe and have no stored column.
- Channels owns each option's complete `ChannelListingOptionInventoryComponent`
  recipe, keyed by MasterProduct UUID and positive quantity. Products owns
  physical `MasterProduct.currentStock`; Channels never mutates it (ADR-0017).
- Source provenance lives on `SalesProduct.sourceRecordId` and is immutable.
  A listing and a registration target reach their source through that selling product;
  source facts are read through Sourcing's `SourceRecordPort`.

The model authority is
[prisma/models/channels.prisma](../../../../prisma/models/channels.prisma);
sync, registration, matching, and capacity behavior is executable in
[the Channels tests](__tests__/).

## Registration And Provider Contract

- Every submission to a channel account passes the registration execution fence
  (`ProductRegistrationExecution`), which opens the transaction, writes the
  execution row itself. The fence identity is
  `{organizationId, salesProductId, channelAccountId}`: a collected product and a
  directly authored one enter the same door, and `SalesProduct.sourceRecordId`
  is provenance the execution history keeps, never a key (ADR-0022). Channels also owns reusable registration targets:
  successful execution does not close the target, and new intent creates a new
  frozen execution. A form fill without submission returns only the
  current browser result; it is not confirmed registration.
- A selling product has at most one active registration target per channel
  account. Nothing chooses among settings; a promotional listing is its own
  selling product. `channels/registration-targets` (resolve, update, archive) is
  the only way to make or change one; `resolve` is the only way one comes to exist
  (it finds or creates it and issues the product's KID),
  and a target with a live execution cannot be archived. A target stores only its
  selected options, mall-only values (`RegistrationMallInputSchema`) and the
  chosen Content asset and revision ids; name, prices and detail HTML are read
  from the selling product and its content at use time (KID-313).
- Selected accounts must exist and be active. `ChannelAccount` stores the Wing
  vendor identity used to fence browser evidence; Open API credentials are not
  accepted or resolved.
- Registration on every mall, Coupang Wing included, is a target `register`
  execution (prepare → start → provider IO → `result`). `report_target_execution`
  with `outcome: confirmed` is the only registration confirmation: the channel
  adapter validates the evidence, a new first listing gets the product's content
  workspace, and a frozen Sellpia match becomes the option recipe in the same
  transaction. The extension presses a form's [등록] only with the execution's
  context (KID-322).
- 등록 상태는 `registration-state.service` 하나가 계정별로 읽는다; 화면·목록·매트릭스가 실행 표를 조합하지 않는다.
  `register` · `update` · `composition_change` 가 등록 상태를, `sold_out` · `resume` 는 품절만 정하고
  `thumbnail_update` 는 상태에 들어가지 않는다(`domain/registration/registration-account-state.ts`).
- New Open API submission is an explicit unsupported path with no external IO
  or database intent. Listing deletion has no ledger or route; a mall delete
  will be a registration execution kind once an adapter can delete (KID-321).
- Catalog publication refreshes channel facts while preserving product links,
  option recipes, and listing content. It never creates `MasterProduct` rows
  or changes stock.

## Matching And Capacity Contract

- Matching reads all persisted listing/option rows for the account workspace.
- A Wing listing absent from the list changes only through the details kind's
  `deletion_confirmation`: `deleted` → `DELETED` and inactive; present or
  unconfirmed stays active and unconfirmed goes into the operation result. No
  Wing path (list, details, workbook) deactivates account-wide (KID-348).
- Candidate rows are transient evidence. Automatic matching may fill an empty
  recipe when a typed identifier or one clearly separated name candidate has
  no identifier/spec/option conflict and the selling quantity is confirmed.
  A name-corroborated Sellpia code in `sellerSku` counts as one unit, and a
  same-title listing in another mall may lend its single recipe (see the
  runbook).
  Ambiguous evidence, conflicting options, unknown quantities, raw aliases,
  and AI output require review. Never rewrite a confirmed recipe automatically.
- Confirmed recipes survive recollection. Matching state derives from recipe
  validity; do not restore a persisted mapping-status authority.
- Capacity is the minimum complete-set count from confirmed option components.
  Missing stock or uncertain composition is unknown, not zero. Actual listing
  options own nonnegative safetyStock (default 0); capacity <= safetyStock is
  stockout. Reads do not reserve stock or synchronize provider quantities.
  Collection completion never starts stockout transmission or automatic resume.
- Use
  [channel-sellpia-matching.md](../../../../docs/runbooks/channel-sellpia-matching.md)
  as the policy and operator-workflow authority.

## Ports And Boundaries

- Refactored capabilities use `adapter/in/web|agent` → `application/port/in`
  implemented by `application/service/<business>` → `application/port/out`
  → `adapter/out`. Application and domain may use NestJS as described in the
  server guide; queries preserve the same owner and IO boundaries.
- 오류는 `Kiditem*Error` + `CHANNELS_*` 등록 코드로 던진다(ADR-0023). 등록 실행 보고 경로의 거절은
  409를 지킨다. Nest 예외 잔여는 수집 계열(`ChannelBusinessError`·`ListingException`, catalog·몰 관리자·
  사방넷·셀피아 수동매칭)·`channel-account.persistence.adapter.ts` claim·`channel-product-matching.controller.ts`
  (KID-338)과 `coupang-channel.adapter.ts` 4곳(웹 `wing-error-message.ts` 분류기, KID-339 파생)뿐이다.
- Listing-day traffic coverage comes from Advertising's succeeded
  `advertising.wing_traffic` operations (read through the operation contract's
  `readSucceededOperationWindows`, KID-362): a date counts only when the
  account's newest run confirmed it, no listing arrived after that run, and no
  Wing row it could not match now belongs to an active listing (KID-217).
- Persistence adapters may query Channels-owned facts without a dedicated
  reader file. Other owners use public capabilities (ADR-0021); preserve
  organization scope, complete-source evidence, and required transactions.
- Keep cross-owner IDs as logical references validated by owner contracts.
  Keep Channels-related organization/user/source-attempt references scalar too;
  validate their required evidence in owner contracts. Retain same-owner FK and
  composite organization constraints.

- Auto-matching, registration, manual replacement and clearing call the
  Channel recipe input port. Its transaction validates organization-scoped
  Products identities, replaces the full composition atomically. Listing summaries are read from
  recipes; empty replacement clears the option recipe. Consumers import the
  published capability, never the concrete service.
- The Wing catalog is three operation kinds (ADR-0025, KID-354·351;
  `adapter/in/operation/wing-catalog-operation-owners.ts`), each locking
  `account:<channelAccountId>` so one runs per account: `channels.wing_catalog_list`
  (whole list → basics publish, then plans details into `result.next`, which the
  extension runner chains), `channels.wing_catalog_details` (planned targets and
  deletion confirmations; also the one-product refetch started directly), and
  `channels.wing_catalog_excel` (workbook bytes as `workbook` chunks, from the web
  upload or the extension's Wing download; `fileHash` is per account; the
  extension run holds the account lock while Wing builds the file, about seven
  minutes, so a sync start meanwhile gets `OPERATION_IN_PROGRESS`). They
  publish only inside the finish transaction, mark rows `lastOperationId`, and
  never touch `source_import_runs` or `channel_scrape_*`. Each path writes only
  its own `raw_json` section (`domain/collection/channel-listing-raw-sections.ts`).
- Detail targets compare the listed `modifiedOn` with `detail.modifiedOn`, the
  list value the last details finalize applied (`domain/collection/catalog-detail-targets.ts`).
  Only the details finalize advances it, unchanged details included, so a
  failed or partial details run is retried by the next list with no bookkeeping.
  Rows detailed before this key existed have none, so the first sync after
  deploy fetches every detail once.
- Readers treat a `lastOperationId` row as published (`completed-catalog-run.ts`);
  readiness reads catalog freshness through `CHANNEL_CATALOG_FRESHNESS_PORT`
  (latest succeeded details operation).
- New sync/matching paths carry `channelAccountId` and preserve
  parent/child/account consistency atomically.
- Wing and Rocket account rows remain distinct. Shared vendor identity may be
  claimed only from complete authenticated evidence under the publication
  lock; a mismatch conflicts.
- The Sabangnet listing import is one organization attempt whose
  plan freezes the mall account rows the hub picks
  (`adapter/out/repository/mall-account-rows.ts`, any status). Completion publishes each mall's
  send records as listings with one option (`sellerSku` = Sabangnet model =
  Sellpia SKU code) and turns off only listings this source created that left
  the list. Its statuses carry the `사방넷 ` prefix and fold with a
  Sabangnet-basis warning.
- The mall admin listing import is one attempt per mall
  account for malls Sabangnet does not carry (`mall_admin_listings`, readers in
  `@kiditem/shared/mall-admin-listings`). Completion publishes that mall's
  products as listings with one option whose `itemName` is the Sellpia name the
  mall keeps, and turns off only listings this source created that left the
  list (shared `deactivateCatalogAbsence` with source scope). Its `sellerSku`
  is the mall's own seller code when the mall shows one, so matching may also
  link by the option name. Its list carries no barcode or model number column.
  Statuses come from the mall itself and fold without a Sabangnet warning.
- Orders owns Rocket PO collection (operation kind `orders.coupang_rocket_po`),
  snapshots and lines. It publishes observed
  listing identity through Channels' catalog capability in its transaction;
  preserve the issued owner transaction handle rather than casting a DB client.
  Supply owns purchase judgment; Channels never applies mall stockout policy to
  Rocket purchase quantities.

## Selling Catalog

- Channels owns common selling products, their KID options and registration templates. Templates may initialize an empty confirmed recipe only on explicit application; they never supply operational capacity.
- Source products remain Products-owned. Catalog storage references MasterProduct UUIDs without a cross-owner foreign key; names and barcodes do not establish source identity.
- Marketplace transport preserves its existing per-provider stock behavior. Internal capacity does not replace the submitted stock value or mutate source stock.
- 몰 대량등록 엑셀은 상품 × 몰 계정의 하나뿐인 등록 설정으로 확인 · 파일 · 분류 저장을 한다.
  설정이 없으면 공통값으로 계산한다.
- 판매상품 상태는 `draft` · `active` · `archived` 셋이고 `draft ⇔ code IS NULL` 이다
  (`domain/sales-product/sales-product-status.ts`, KID-313). `draft → active` 는 KID 발급
  (`sales-product-code-rows.ts`)만 하고 되돌아가지 않으며, 사람은 `archived` 로만 바꾼다. 모든 상태
  쓰기는 `assertStatusInvariant` 를 지난다. 가격은 상태가 아니라 등록 동결 · 몰 엑셀 파일 · 품절
  송신이 함께 쓰는 게이트(`requireConfirmedPrice`)가 묻는다.
- 몰 시트가 몰별로 다시 보는 `salePrice <= 0` 검사는 그대로 둔다. 같은 게이트를 두 번 보는 것이
  아니라, 몰마다 다른 최소가 · 배수 규칙을 그 몰 어댑터가 말해 주는 자리다.

## 쿠팡 윙 엑셀

- 윙 엑셀은 두 갈래다. `coupang-wing.sheet.ts` 는 **없는 상품을 새로 올리는** 일괄등록 양식이고,
  `coupang-catalog-edit.ts` 는 **이미 올라간 상품의 쿠팡상품정보를 고쳐 달라고 제안하는** 수정요청
  양식이다. 둘 다 쓴다.
- 윙 파일의 시트 범위(`!ref`)를 믿지 않는다. 윙은 `A1:HW4` 라고 적어 놓고 그 아래에 줄을 쌓는다
  (적힌 네 줄 아래에 수천 줄이 있을 수 있다). 실제 칸으로 다시 세야 한다.
- 수정요청은 **빈 칸만** 채우고, 회색 칸(등록상품ID · 카테고리 · 승인상태 · 옵션 ID)은 건드리지
  않는다. 한 줄은 상품이 아니라 옵션 하나다. 양식 판이 `Catalog Template_Ver.1.2` 가 아니면
  칸 자리를 믿을 수 없어 거절한다.
- 수정요청은 **제안이지 반영이 아니다**. 쿠팡이 여러 판매자의 제안 중 골라 쓰므로, 파일을 만든
  것은 몰에 값이 들어갔다는 뜻이 아니다. 가격 · 재고 · 사진은 이 양식에 없다.
- `브랜드` 칸은 판매상품의 `brand` 로 채우지 않는다 — 774 건 중 770 건이 상호(`kiditem`)이지
  상품의 브랜드가 아니다. `바코드` 는 단품에서만 온다(상품 하나에 옵션이 여럿이면 다르다).
