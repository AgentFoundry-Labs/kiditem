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
- Mall login and session checks go through `mall-session.js` only: `ensureLoggedIn`
  (`ok` · `rejected` · `unknown`) and `checkLogin` (`in` · `out` · `unknown`),
  answering from one shared set of reason codes. Its one-row-per-mall spec
  (`entryUrl` · `loginUrl` · `loggedInSignal` · `fields`) is the only place a
  mall's login address and logged-in signal are written — add a mall there, never
  in a second table. Tabs, frame injection, dialog swallowing, and the one quiet
  read are its driver seam (`worker.js`, `mall-session-probe.js`). Retry spacing
  and blocking a rejected mall stay in the web.
- The check the web sees (`checkMallLogin`) answers one of `signed_in`,
  `verification_required`, or `signed_out` — never "unknown"; a mall the module
  could not tell about is `signed_out` with its reason. It never fills, types,
  clicks, or returns a URL, body, or header, and never runs the login path. Never
  add export, audit-logging, or mutating URLs to a spec.
- Stored-credential login reports what it did, not a verdict: `submitted` for the
  click and `verified` for whether the login form was gone afterwards. A form that
  stays, or a page that stops answering (a dialog), is `verified: false` — not a
  wrong password, because mall screens after a login differ too much to judge from
  the page. The web decides what to do with that and limits how often the same
  mall is tried. The account screen's login test uses `testMallLogin`, which runs
  outside a collection attempt and sends nothing to KidItem. Registration form
  fill logs in only when the form is absent (`noForm`); a form that fails to fill
  is never a login prompt.

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
