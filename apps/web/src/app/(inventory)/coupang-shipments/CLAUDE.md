Before working in this directory, always read this document first rather than relying on memory.

# web/coupang-shipments — Shipment Files

This route owns Coupang shipment file helpers, the extension bridge, local file
convenience state, and browser download/print behavior.

Keep parsing and projection pure. Backend persistence uses the shared API
client; browser collection uses the extension bridge. Manual date-summary
lookup and verified persistence share
`@/lib/coupang-shipment-summary-action` with the dashboard, including
deferred browser-session closure after server read-back.

Browser file state is not durable shipment truth and does not directly update
orders or inventory. Focused specs own parsing, shared-action, verification,
and download behavior.
