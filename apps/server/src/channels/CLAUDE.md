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

The channel registry (`@kiditem/shared/channel-registry`) owns channel identity.
Use the implemented operation capability when admitting provider work: Wing
supports its explicit registration and option availability paths; Rocket PO is
Orders-owned and does not support general listing registration or stockout.
Unsupported operations fail before an execution intent or external IO.

Channels owns all account mutations through its account capability, including
the existing Orders account-editor route. Mall publishing reads the account's
`config.listingProfile`; credentials remain encrypted and server-owned. Read
candidate KC facts through Sourcing and images through AI's content capability.

## Identity And Ownership

- `ChannelAccount` is marketplace/store identity; Wing and Rocket are
  separate rows even when they share one vendor identity.
- Prisma `ChannelListing` and `ChannelListingOption` are the channel product
  and sellable-option identities. Listing-level product summaries are computed
  from every option's recipe and have no stored column.
- Channels owns each option's complete `ChannelListingOptionInventoryComponent`
  recipe, keyed by MasterProduct UUID and positive quantity. Products owns
  physical `MasterProduct.currentStock`; Channels never mutates it (ADR-0017).
- Registration provenance lives on `SalesProduct.sourceCandidateId` and is immutable.
  A listing and a registration target reach their source through that selling product.

The model authority is
[prisma/models/channels.prisma](../../../../prisma/models/channels.prisma);
sync, registration, matching, and capacity behavior is executable in
[the Channels tests](__tests__/).

## Registration And Provider Contract

- Every submission to a channel account passes the registration execution fence
  (`ProductRegistrationExecution`), which opens the transaction, writes the
  execution row itself. Channels also owns reusable registration targets:
  successful execution does not close the target, and new intent creates a new
  frozen execution. A form fill without submission returns only the
  current browser result; it is not confirmed registration.
- A selling product has at most one active registration target per channel
  account. Nothing chooses among settings; a promotional listing is its own
  selling product.
- Selected accounts must exist and be active. `ChannelAccount` stores the Wing
  vendor identity used to fence browser evidence; Open API credentials are not
  accepted or resolved.
- `register_confirmed_listing` is the supported registration mutation. It
  validates server-frozen provenance and Wing confirmation evidence before the
  final listing resolution transaction.
- New Open API submission and deletion authorization/claim/reconciliation are
  explicit unsupported paths with no external IO or database intent. Existing
  deletion status reads, unresolved records, and succeeded receipt replays
  remain readable.
- Catalog publication refreshes channel facts while preserving product links,
  option recipes, and listing content. It never creates `MasterProduct` rows
  or changes stock.

## Matching And Capacity Contract

- Matching reads all persisted listing/option rows for the account workspace.
  Only a complete full snapshot may reconcile absence.
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
  → `adapter/out`. Application and domain are plain TypeScript; Nest DI lives
  in module composition and adapters. Queries follow the same direction.
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
- Catalog imports use a fenced `SourceImportRun` attempt and publish only a
  complete source snapshot; stale or post-terminal submissions are rejected.
- One catalog import runs per account: a browser import from its basics root
  through its details child, or a workbook import. A new begin or workbook claim
  returns `ATTEMPT_IN_PROGRESS` naming that import's root, and an operator stop
  of the root ends the whole import. The source read returns the latest root
  and its child.
- New sync/matching paths carry `channelAccountId` and preserve
  parent/child/account consistency atomically.
- Wing and Rocket account rows remain distinct. Shared vendor identity may be
  claimed only from complete authenticated evidence under the publication
  lock; a mismatch conflicts.
- The Sabangnet listing import (KID-246) is one organization attempt whose
  plan freezes the mall account rows the hub picks
  (`read/mall-account-rows.ts`, any status). Completion publishes each mall's
  send records as listings with one option (`sellerSku` = Sabangnet model =
  Sellpia SKU code) and turns off only listings this source created that left
  the list. Its statuses carry the `사방넷 ` prefix and fold with a
  Sabangnet-basis warning.
- The mall admin listing import (KID-246 step 2) is one attempt per mall
  account for malls Sabangnet does not carry (`mall_admin_listings`, readers in
  `@kiditem/shared/mall-admin-listings`). Completion publishes that mall's
  products as listings with one option whose `itemName` is the Sellpia name the
  mall keeps, and turns off only listings this source created that left the
  list (shared `deactivateCatalogAbsence` with source scope). Its `sellerSku`
  is the mall's own seller code when the mall shows one, so matching may also
  link by the option name. Its list carries no barcode or model number column.
  Statuses come from the mall itself and fold without a Sabangnet warning.
- Orders owns Rocket PO attempts, snapshots and lines. It publishes observed
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
- 수집과 직접 작성 모두 판매상품 초안(`status='draft'`) 하나를 만든다. 저장할 때마다 팔 옵션의
  판매가로 상태를 다시 판정하고(`domain/sales-product/sales-product-draft.ts`), 등록 동결 · 몰
  엑셀 파일 · 품절 송신은 같은 게이트(`requireConfirmedPrice`)로 초안을 거절한다.

## 쿠팡 윙 엑셀

- 윙 엑셀은 두 갈래다. `coupang-wing.sheet.ts` 는 **없는 상품을 새로 올리는** 일괄등록 양식이고,
  `coupang-catalog-edit.ts` 는 **이미 올라간 상품의 쿠팡상품정보를 고쳐 달라고 제안하는** 수정요청
  양식이다. 둘 다 쓴다(사장님 2026-09-22).
- 윙 파일의 시트 범위(`!ref`)를 믿지 않는다. 윙은 `A1:HW4` 라고 적어 놓고 그 아래에 줄을 쌓는다
  (실측 2026-09-22: 적힌 네 줄, 실제 2,274 줄). 실제 칸으로 다시 세야 한다.
- 수정요청은 **빈 칸만** 채우고, 회색 칸(등록상품ID · 카테고리 · 승인상태 · 옵션 ID)은 건드리지
  않는다. 한 줄은 상품이 아니라 옵션 하나다. 양식 판이 `Catalog Template_Ver.1.2` 가 아니면
  칸 자리를 믿을 수 없어 거절한다.
- 수정요청은 **제안이지 반영이 아니다**. 쿠팡이 여러 판매자의 제안 중 골라 쓰므로, 파일을 만든
  것은 몰에 값이 들어갔다는 뜻이 아니다. 가격 · 재고 · 사진은 이 양식에 없다.
- `브랜드` 칸은 판매상품의 `brand` 로 채우지 않는다 — 774 건 중 770 건이 상호(`kiditem`)이지
  상품의 브랜드가 아니다. `바코드` 는 단품에서만 온다(상품 하나에 옵션이 여럿이면 다르다).
