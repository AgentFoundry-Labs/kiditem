# Sellpia Manual-Match Alias Automation

## Goal

Use the authenticated Sellpia **수동상품매칭** page as historical, deterministic
product evidence for KidItem recipe matching. Product identity and recipe
quantity are separate decisions:

- one exact normalized manual-match alias resolving to one active Sellpia SKU
  means the product match is complete;
- one positive quantity for that alias may create an empty one-component recipe;
- conflicting quantities keep the product match and enter a dedicated quantity
  review queue instead of the generic unmatched/operator-review queue.

The workflow never calls Sellpia's matching write action. It only reads
`product_manual_match.html` using `get_product_search_matched` followed by
`get_match_data` and stores an allowlisted snapshot.

## Collection Contract

The order-collector extension receives the complete, sorted active Sellpia SKU
code set from KidItem. In an inactive authenticated tab at
`/product_manual_match.html`, it searches each code with
`search_type=product_code`, verifies the returned match state, and emits only:

- Sellpia product code;
- manual-match title;
- positive item count;
- matched type (`M`, `P`, or `E`);
- duplicate evidence count.

An exact-code search row without an explicit manual-match title is ignored. It
is not a usable alias, and the Sellpia product title is never substituted for it.

Cookies, headers, provider identifiers, `match_md5`, customer/order data, and
raw responses are never returned or persisted. The snapshot is bounded,
sorted, duplicate-free, versioned, and must cover exactly the current active
SKU target set before publication.

## Publication And Matching

Channels owns one current organization-scoped alias snapshot. The collected
history is compared in memory with current matching-screen listing/item names;
only exact normalized aliases that can affect a current channel match are
published. Unreferenced historical aliases are discarded rather than stored.
Publication is an atomic replace. Alias rows reference active
`SellpiaInventorySku` rows with a composite organization fence.

The recipe suggestion service compares exact normalized channel listing/item
names with the current alias snapshot:

1. multiple active SKU identities for one alias are blocked as a product
   conflict;
2. one SKU and one quantity is `auto_apply` when no stronger evidence conflicts;
   when the exact title contains one explicit pack expression such as `18개입`
   or `5개 묶음`, that number must equal Sellpia `item_count`;
3. one SKU and several quantities is `quantity_review`, preserving the matched
   SKU proposal with no recommended quantity;
4. an explicit title quantity that disagrees with Sellpia `item_count` is also
   `quantity_review`; product identity remains confirmed;
5. existing recipes always win and are never replaced.

The existing explicit proposal-version fence and Products-owned
create-if-empty writer remain the only automatic recipe mutation path.

## Operator Workflow

`/product-hub/matching` exposes one `상품 매칭 실행` action. That action
internally collects and publishes the Sellpia manual-match snapshot, recomputes
the latest version-fenced recipe preview, and applies only safe proposals for
every selected account. Alias collection is not a separate operator action.
Operator-facing status is:

- `매칭 완료`: quantity is resolved or already configured;
- `매칭 수량 검토`: product is matched and only quantity is unresolved;
- `미매칭 상품`: product identity/linking is unresolved.

Detailed internal reasons still control automation but are not separate UI states.

Quantity-review rows link to `/order-collection`, where Sellpia's stock-match
view exposes the marketplace name, Sellpia product code, order quantity, and
matching result for operational verification.

## Safety And Failure Semantics

- A partial target scan is rejected; it never replaces the current snapshot.
- Active inventory changing between target issuance and import is a conflict
  requiring recollection.
- Login, contract drift, timeout, oversized response, malformed rows, and
  unmatched response codes fail the whole collection.
- Timeout applies to individual Sellpia requests and page readiness, not to the
  total bounded scan. A progressing full scan is allowed to finish.
- The exact-code search response's explicit `item_count` is used directly and
  matching states are fetched in bounded concurrent batches; per-alias detail
  requests are not repeated. A dedicated external port sends keep-alive
  messages while the scan is running so Manifest V3 worker suspension cannot
  orphan it.
- Product identity may remain resolved while quantity remains unconfirmed.
- Bare title numbers are not quantities. Unit-bearing expressions are strong
  candidates, but only agreement with the explicit Sellpia matching quantity
  permits automatic confirmation.
- No collection or preview path writes physical stock, identity links, orders,
  or an existing component recipe.

## Change Classification

This is a declared cross-layer matching control: shared contracts, Channels,
Prisma, the order-collector extension, catalog matching UI, and Rocket order
collection all change together to preserve one product-versus-quantity policy.
Unrelated catalog, inventory, order, and sourcing behavior is out of scope.
