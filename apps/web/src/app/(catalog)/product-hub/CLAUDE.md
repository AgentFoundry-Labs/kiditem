Before working in this directory, always read this document first rather than relying on memory.

# product-hub — Product Operations Center

This folder owns four surfaces:

- `/product-hub`: canonical product operations;
- `/product-hub/[id]`: product metadata, channel options, recipes, and
  capacity;
- `/product-hub/matching`: channel option recipe review;
- `/product-hub/sales-products`: 판매상품 list, Sabangnet workbook import
  (preview, then commit), and the one-screen editor with the option table,
  per-option source template, and reusable Channels registration targets (ADR-0020). Saving sends only
  changed fields; options follow the basics save with the returned version.
  The shared mall bulk-sheet dialog (`src/components/mall-sheet/`) downloads
  filled mall templates; the operator uploads them to the mall. A sales
  product is a draft from the moment its source is collected (ADR-0022) — there is no candidate-to-sales-product promotion and no demote
  action in this editor. Its code (KID) issues lazily at the first sell
  decision, so a still-undecided draft shows 미발급 instead of a code.

## State Contract

- The list is the operating centre: one row is 상품 · 등급 · 재고 · 월 평균 ·
  매출 · 판매 · 원가 · 매출총이익 · 총이익률 for the current month. Traffic
  fields (방문 · 조회 · 장바구니 · 주문 · 광고비율) stay on the row for the
  product page and are not columns of this table.
- 월 평균 is how many units leave in a month — the Sellpia owner's own
  `depletion.monthlyOutflow`, the same average that decides 가용재고 N개월 and
  발주 필요, so the row cannot disagree with itself. It sits beside 재고 because
  it is that column's denominator. A SKU with no complete month is unknown, not
  0, and one unmeasured SKU blanks the whole product rather than publishing a
  partial sum — 재고 counts every SKU, so a short outflow would make the months
  left read longer than they are. `outflowMonthCount` travels with it and names
  how many complete months the average covered. A product that sold nothing in
  every complete month but is selling this month reads 신상품, not 0 — 0 would
  claim a speed the product has never had; the average starts once a whole month
  exists. The row picks that word from two published facts,
  the way the grade cell picks its own; it computes no number from them.
- A fact appears once in a row. 등급 lives only in the 등급 column — the row
  carries no second badge beside the name; that column is also the way into the
  ABC evidence dialog. 파는 몰 is a count (`몰 N곳`), never a list of mall names.
  A number needs no caption under it: the column header already names it. The
  one meta line under the product name carries 몰 · 옵션 · 가용재고 · 광고, and
  nothing that another cell already says.
- 등급이 없는 칸은 왜 없는지를 한 마디로 말한다 — 미연결 · 수집 전 · 광고 전 ·
  관찰 중, derived by `productAbcDisplayStatus` from the row's own `abc` read
  — a blank beside a large revenue reads as a bug. A graded
  product shows only its letter.
- 카테고리가 없으면 칩을 그리지 않는다. '미분류' 라는 말은 ABC 등급으로 읽혔다.
- 원가 is the cost of what sold — Σ(팔린 개수 × 매입 단가) — never the month's
  `in_amount`, which is 매입금액 and runs tens of times larger in a month with a
  big intake. 팔렸는데 매입 단가를 못 읽었으면 원가는 0원이 아니라 모르는 값
  (`cost: null`) 이고, 이익도 모르는 값이다 — never 100%.
- Sorting (`sort`) is URL-authoritative and defaults to 최신 등록순; the others
  are 매출 · 이익 · 이익률 · 판매수량 · 재고. A row whose value is unknown sorts
  last, so a blank never leads the ranking. The server ranks the whole filtered
  set before slicing the page, so the list's real first place is on page one —
  never re-sort a page in the browser. Changing sort returns to page 1, and the
  command-center summary reads its own unsorted query, so it never moves.
- 줄 세우기 칸은 표 바로 위에 눌러서 고르는 칸으로 그린다 — 브라우저 기본
  `select` 는 머리글 구석에 있어 보이지 않는다. Options come
  from `SORT_OPTIONS`; the chips follow the 광고 상태 group's spec.
- Filters, period, and page are URL-authoritative. Command-center counts use a
  dedicated unfiltered operating-catalog summary and do not change with row
  filters or pagination.
- Render unavailable metrics as uncollected rather than deriving them from
  unrelated aggregates.
- Product ABC/profit and depletion facts come from their owning backend
  projections. Unclassified is not C. The explicit grade-refresh command reads
  the latest `COMPLETE` source snapshots and invokes the Products-owned ABC
  recalculation; source collection never triggers it.
- Missing or stale Sellpia, mapping, or advertising evidence is shown as the
  source status, never as zero cost or C. Revenue/profit contribution, rank,
  and cumulative share are separate reporting metrics and do not affect the
  absolute ABC grade.
- Product detail and matching share the Channels-owned complete
  option-component replacement API. A sole option is displayed as the default
  option; there is no separate listing-level product picker.
- Matching may confirm one clearly separated name candidate only when option
  facts do not conflict and selling quantity is confirmed. Ambiguous evidence
  remains for review. Catalog recollection preserves confirmed option recipes
  and does not create channel-origin MasterProducts.
- Product display uses calculated reference/image projections. Edit forms
  submit only operator-owned product media and never promote channel fallbacks.
Product operations tests under this directory are the executable authority for
layout, filter/count parity, route state, and mutation invalidation. Run:

    npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub
