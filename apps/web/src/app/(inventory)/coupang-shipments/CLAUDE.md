Before working in this directory, always read this document first rather than relying on memory.

# web/coupang-shipments — Shipment Files

This route owns Coupang shipment file helpers, the extension bridge, local file
convenience state, and browser download/print behavior.

Keep parsing and projection pure. Backend persistence uses the shared API
client; browser collection uses the extension bridge. The date-summary lookup
is the operation kind `orders.coupang_shipment_summary`
(`@/lib/coupang-shipment-summary-operation`): the page starts it, polls the
operation only while it runs, and reads the calendar from the owner.

Browser file state is not durable shipment truth and does not directly update
orders or inventory. Focused specs own parsing, shared-action, verification,
and download behavior.
