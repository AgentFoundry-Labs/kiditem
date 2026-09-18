Before working in this directory, always read this document first rather than relying on memory.

# extension/orders — Marketplace Order Collection

`background/orders/` collects approved marketplace order/export evidence from
the operator's authenticated Chrome session, then returns non-secret rows or
files to the KidItem web app for NestJS processing. It also owns Rocket PO
evidence, Sellpia snapshot/profit collection, order-file upload, tracking
registration, and Coupang cookie-overflow recovery.

## Security And Environment

- Bind every run, status lookup, callback, tab, alarm, and cancellation to the
  verified external sender environment. Local and Office may run concurrently.
- Session tokens are transient, same-marketplace request inputs kept in function
  scope. Never return, log, persist, or forward them to KidItem.
- Responses contain only bounded export artifacts, normalized rows, counts, file
  names, and non-secret evidence.
- Destructive marketplace actions require explicit web-page confirmation.
  Coupang cookie recovery is limited to named/path cookies for the supplier
  origin and must warn that shared Coupang sessions will be signed out; never
  read or return cookie values.
- A login check (`checkMallLogin`) answers one of `signed_in`,
  `verification_required`, or `signed_out` — never "unknown". It first uses
  `mall-session-probe.js` (one fixed, read-only GET per mall with the operator's
  cookies; `signed_in` needs a positive admin marker and `signed_out` a login
  signal). When that cannot tell, it opens the mall's admin screen (the probe
  URL, a fixed check URL, or the operator's saved site address inside
  `host_permissions`) in an inactive tab, looks for a login form or a
  verification-code screen until an answer or a 20-second window closes, and
  closes the tab. A look that cannot see the page never erases an admin screen
  seen before; a frozen page counts as signed in only by a per-mall signed-in
  tab title (never returned). No credentials, no typing, no clicks, and no URL,
  body, title, or header in the answer; a screen it cannot reach is `signed_out`
  with its reason. Never add export, audit-logging, or mutating
  URLs, and never reuse `ensureMallLogin` for checks.
- Stored-credential login (`ensureMallLogin`) reports what it did, not a verdict:
  `submitted` for the click and `verified` for whether the login form was gone
  afterwards. A form that stays, or a page that stops answering (a dialog), is
  `verified: false` — not a wrong password, because mall screens after a login
  differ too much to judge from the page. The web decides what to do with that
  and limits how often the same mall is tried. The account screen's login test
  uses `testMallLogin`, which runs outside a collection attempt and sends nothing
  to KidItem. Registration form fill logs in only when the form is absent
  (`noForm`); a form that fails to fill is never a login prompt.

## Collection Contract

- Success with zero rows requires authenticated evidence. Missing/unloaded
  content is provider-contract change; auth and verification screens are
  explicit login/operator-action outcomes.
- Every advertised capability must satisfy its versioned evidence schema. A
  stale extension is incompatible, not absent, and the web app must show its
  loaded version and missing capabilities.
- Managed collectors use inactive tabs, attach created tabs to the run before
  work, and leave a tab open only for explicit operator attention. Close the tab
  you created on every other path, including failure; a collector that runs
  each round and never closes leaves one tab per round until the service worker
  misses its deadlines and healthy malls time out.
- Normalize, bound, deduplicate, validate, and deterministically sort provider
  rows. Never return raw responses, headers, DOM dumps, redirects, or secrets.
- The detailed failure-code, capability, evidence-field, tab-lifecycle, and
  range-completeness matrices are executable in
  [the extension order tests](../../../tests/).

## Sabangnet Listing Import

- `orders.sabangnet_mall_listings` (Channels owner) reads Sabangnet's send
  records — one row per mall × product with the mall product code — from the
  fixed list API on the frozen plan's origin, all pages, in a fresh inactive
  tab. It never opens send, save, or delete screens.
- That list response also carries mall login IDs and passwords. Copy only the
  schema's whitelisted fields; never return, log, or forward the rest. The
  Sabangnet session token stays inside the injected function.
- A total that moves between pages, a short page, or an unknown response code
  stops the run; the owner publishes only a complete list.

## Mall Admin Listing Import

- `orders.mall_admin_listings` (Channels owner) reads registered products
  directly from a mall admin for malls Sabangnet does not carry (KID-246 step
  2). One import is one attempt for one mall account; the frozen plan names the
  mall, its origin, and its page-size cap. It opens only list and read-only
  product-view screens, never save, approval, or delete.
- The reader lives in `mall-admin-listings.js`, keyed by mall in `READERS`.
  Adding a mall is one reader plus one key there and one contract entry in
  `@kiditem/shared/mall-admin-listings`; the reader's origin and page size must
  match that contract, which the owner re-validates.
- Kidkids paginates its list by modification date with many ties, so paging
  drops rows; the reader instead replays the seller's own "상품리스트 다운받기"
  link (a complete EUC-KR HTML table) and cross-checks its row count against
  the list counter. i-Scream reads its JSON list API in one page. Both carry
  the Sellpia product name the mall keeps (Kidkids 송장용 상품명, i-Scream the
  goods-notice 품명), and only whitelisted columns are returned.

## Sellpia And Rocket Boundaries

- Inventory collection uses the fixed authenticated full-snapshot JSON contract.
  Full-scope runs additionally collect validated product-profit evidence before
  backend publication; inventory scope does not.
- Rocket summary/detail collection shares the managed Supplier Hub PO session,
  reads every requested page and detail with bounded concurrency, and publishes
  no rows when evidence is incomplete or vendor identity is missing/mixed.
- Rocket capability is evidence-only: it never confirms a PO, submits quantity,
  reserves stock, or mutates Sellpia Inventory.
- Order-file submission is irreversible. A click is not success: wait for
  accepted/pending evidence. If the result is uncertain, perform the tested
  read-only Sellpia lookup; all targets found is submitted, none is safe
  non-submission, and partial evidence remains unknown.
- Read-only reconciliation may search pending/stockmatch pages but never
  registers, merges, matches stock, or numbers invoices. A successful response
  reports bounded evidence and does not claim later Sellpia processing.
- Read
  [sellpia-rocket-inventory-sync.md](../../../../docs/runbooks/sellpia-rocket-inventory-sync.md)
  before changing Rocket, order-file, or Inventory interaction.

This guide inherits the extension verification gate; run the focused
`order-collector-*.test.mjs` files first for Orders changes.
