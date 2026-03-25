# Feature Research

**Domain:** 쿠팡 셀러 운영 데이터 통합 (Order/Return/Product Operations Dashboard)
**Researched:** 2026-03-25
**Confidence:** HIGH — based on actual Coupang API data files in `data/`, existing codebase inspection, and verified against current e-commerce OMS patterns

---

## Context: What Already Exists

The following features are ALREADY built and must not be rebuilt:

| Existing Feature | Location |
|------------------|----------|
| Order list by status tab (ACCEPT/INSTRUCT/DEPARTURE/DELIVERING/FINAL_DELIVERY) | `apps/web/src/app/orders/page.tsx` |
| Confirm order (shipmentBoxId bulk confirm) | `apps/server/src/orders/orders.service.ts` |
| Invoice upload (택배사 + 송장번호) | `apps/server/src/orders/orders.service.ts` |
| Return list (offline JSON fallback) | `apps/web/src/app/returns/page.tsx` |
| Return approve action | `apps/server/src/returns/returns.service.ts` |
| Product CRUD + sourcing pipeline | `apps/server/src/products/` |
| ActivityEvent system (Object View) | `apps/server/src/activity-events/` |
| Workflow engine with AI analysis | `apps/server/src/workflows/` |

The current Order/Return pages pull from the Coupang live API with JSON fallback. They do NOT persist to PostgreSQL. The task is to redesign the schema to persist Coupang data and build dashboards on top of the persisted data.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that make the dashboard feel like a real operations tool. Missing any of these = feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Order list with status tabs | Standard seller center UX (Coupang WING pattern) | LOW | Already exists in UI layer; needs DB-backed version |
| Order count summary per status | Sellers need at-a-glance "how many to process" | LOW | Simple COUNT query per status group |
| Order detail view (orderer + receiver + items + pricing) | Sellers need to verify what was ordered before shipping | MEDIUM | Data exists in `coupang_orders_raw.json`: `orderer`, `receiver`, `orderItems[]` |
| Delivery tracking info (택배사 + 송장번호) | Sellers check this for customer inquiries | LOW | Already stored: `deliveryCompanyName`, `invoiceNumber` |
| Return list with reason display | Sellers must process returns; reason determines fault | LOW | Data exists in `coupang_returns_all.json` |
| Return fault attribution display (VENDOR vs CUSTOMER) | Direct financial impact — VENDOR fault = seller pays shipping | LOW | `faultByType` field in return data: VENDOR (90%) vs CUSTOMER (10%) |
| Return reason code display (Korean text) | Sellers need to understand why returns happen | LOW | `reasonCodeText` field: "오배송", "단순변심", "상품불량" etc. |
| Return category display (cancelReasonCategory1) | Groups reasons into actionable buckets | LOW | `cancelReasonCategory1`: 오류(45%), 고객변심(20%), 상품불량(20%), 배송불만(10%) |
| Product option list (items[]) | Sellers manage inventory per option | MEDIUM | Each product has `items[]` array with `itemName`, `salePrice`, `originalPrice` |
| Product image display | Sellers verify listing images | LOW | `images[]` per item with `cdnPath` — needs CDN URL prefix |
| Product delivery policy display | Sellers need to communicate shipping terms | LOW | `deliveryChargeType`, `deliveryCharge`, `freeShipOverAmount`, `returnCharge` |
| Date range filter for orders | Sellers work on specific day's backlog | MEDIUM | Current UI uses 14-day window; needs configurable range |
| Data import from JSON files | No API access — static data is the only source for this milestone | MEDIUM | Seed scripts: `coupang_orders_raw.json` (298 orders), `coupang_returns_all.json` (20 returns) |

### Differentiators (Competitive Advantage)

Features beyond Coupang WING basic functionality that make this internal tool worth using.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Return reason analytics (reason code distribution chart) | WING shows list only; aggregated view surfaces actionable patterns | MEDIUM | Bar/donut chart: OOSSELLER(45%), CHANGEMIND(10%), DEFECT(15%) etc. |
| Fault attribution summary (VENDOR vs CUSTOMER split) | Immediate financial clarity — 90% VENDOR fault in real data is alarming | LOW | Single metric card: "이번 달 반품 18/20건이 셀러 귀책" |
| Return cost estimation | Each VENDOR fault return costs 3,000-6,000 won in shipping | MEDIUM | Sum returnShippingCharge per fault type |
| Order volume trend (daily/weekly sparkline) | Helps sellers spot seasonality and plan inventory | MEDIUM | Group by `orderedAt` date, count orders |
| Status funnel visualization | ACCEPT → INSTRUCT → DEPARTURE → DELIVERING → FINAL_DELIVERY pipeline view | MEDIUM | Shows where orders are stuck; useful for bottleneck identification |
| Product category attribute display | Shows which category attributes are filled vs missing | MEDIUM | From `coupang_categories.json`: `attributes[]` with `required: "MANDATORY"` |
| Integration with existing ActivityEvent system | Links order/return events to product Object View | MEDIUM | `objectType: "product"`, `objectId: sellerProductId` → surfaces in product detail |
| Linked product view from order | Click order item → jump to product detail page | LOW | Link `sellerProductId` → existing `/products/[id]` route |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time Coupang API polling | "I want live data" | API key unavailable; even if available, polling is expensive and violates rate limits | Static JSON import now; API integration as future milestone |
| Return auto-approval | "Reduce manual work" | Each return requires seller judgment on fault attribution and logistics; auto-approval on VENDOR fault returns costs money | Show fault type prominently so manual approval is 1-click informed decision |
| Settlement (정산) dashboard | Appears in `data/` folder | `coupang_settlements_raw.json` is structurally empty; no data to build on | Explicitly defer — PROJECT.md marks as Out of Scope |
| Exchange (교환) dashboard | Exchange tab exists in current UI | `coupang_exchanges.json` is empty; exchange flow differs from return flow | Defer with placeholder — show "데이터 없음" in exchange tab |
| Inventory sync on return receipt | Natural follow-up feature | Return may be rejected or item may be damaged; inventory update should be manual or post-inspection | Show return status; let seller manually update inventory |
| Complex data visualizations (heatmaps, cohort analysis) | Analytics product instinct | 20 returns and 298 orders is too small a dataset for statistically meaningful patterns | Simple counts and reason distributions are sufficient |
| Multi-vendor support | Architecture supports companyId | Single vendor (A00057379 "거영") is the only user; premature abstraction | CompanyId is already in schema; no UI changes needed |

---

## Feature Dependencies

```
[DB Schema Redesign]
    └──required by──> [JSON Data Import]
                          └──required by──> [Order List Dashboard]
                          └──required by──> [Order Detail View]
                          └──required by──> [Return List Dashboard]
                          └──required by──> [Return Reason Analytics]

[Order Detail View]
    └──enhances──> [Product Detail Page] (via sellerProductId link)

[Return Fault Attribution Display]
    └──enhances──> [Return Reason Analytics] (combined view)

[Product Options Display]
    └──required by──> [Product Detail Enhancement]
    └──required by──> [Category Attributes Display]
```

### Dependency Notes

- **DB Schema Redesign required before everything:** Current `orders` table is too simple (1 row per item, no shipmentBoxId/receiver/orderItems structure). Must redesign before any dashboard can read from DB.
- **JSON Import required before dashboards:** Without seeded data, dashboards show empty state. Import unblocks all UI work.
- **Order Detail depends on Order List:** Detail page is linked from list; list must work first.
- **Return Analytics depends on Return List:** Aggregation only makes sense once list is working.
- **Product Detail Enhancement is independent:** Can be done in parallel with order/return work since it reads from existing `products` table.

---

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] DB schema redesign: new `CoupangOrder`, `CoupangOrderItem`, `CoupangReturn`, `CoupangReturnItem` models that map 1:1 to API response fields — why essential: foundation for all other features
- [ ] JSON seed script: import `coupang_orders_raw.json` (298 orders) and `coupang_returns_all.json` (20 returns) into new tables — why essential: provides data for all dashboards
- [ ] Order dashboard: list by status tabs, order count summary, date range filter — why essential: core daily workflow for seller
- [ ] Order detail page: show orderer, receiver, items, pricing, discount breakdown, delivery info — why essential: needed for customer service queries
- [ ] Return dashboard: list with reason, fault type, status; reason distribution summary cards — why essential: financial impact of VENDOR fault returns is significant
- [ ] Return fault attribution metric: VENDOR vs CUSTOMER split count and cost — why essential: immediate actionable insight from real data (90% VENDOR fault)
- [ ] Product options display: show `items[]` with price, option name on product detail page — why essential: sellers manage products at option level
- [ ] Product images display: show `images[]` gallery on product detail page — why essential: visual confirmation of listing
- [ ] Product delivery policy: show shipping charge type, free ship threshold, return charge — why essential: sellers get customer service questions about shipping

### Add After Validation (v1.x)

- [ ] Return reason trend chart — add when: more months of data are imported
- [ ] Order volume trend sparkline — add when: date range extends to 30+ days
- [ ] ActivityEvent integration: link return/order events to product Object View — add when: core dashboards are stable
- [ ] Category attributes display — add when: product editing feature is prioritized
- [ ] Linked product navigation from order item — add when: product pages are enhanced

### Future Consideration (v2+)

- [ ] Real-time Coupang API integration — defer until API key is available
- [ ] Settlement dashboard — defer until settlement data is populated
- [ ] Exchange management — defer until exchange data exists
- [ ] Inventory auto-update on return receipt — defer; requires policy decision on how damages are handled

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| DB schema redesign (Order + Return) | HIGH | MEDIUM | P1 |
| JSON import seed script | HIGH | MEDIUM | P1 |
| Order list dashboard (DB-backed) | HIGH | LOW | P1 |
| Order detail view | HIGH | MEDIUM | P1 |
| Return list + fault attribution | HIGH | LOW | P1 |
| Return reason distribution cards | HIGH | LOW | P1 |
| Product options display | MEDIUM | MEDIUM | P1 |
| Product images display | MEDIUM | LOW | P1 |
| Product delivery policy display | MEDIUM | LOW | P1 |
| Return cost estimation | MEDIUM | LOW | P2 |
| Order volume trend chart | MEDIUM | MEDIUM | P2 |
| ActivityEvent integration | MEDIUM | MEDIUM | P2 |
| Category attributes display | LOW | HIGH | P3 |
| Return reason trend chart | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when core is done
- P3: Nice to have, future milestone

---

## Coupang Data Fields Available (Confirmed from `data/` files)

### Order (`coupang_orders_raw.json` — 298 records)

Key fields for dashboard:
- `shipmentBoxId` — unique identifier for this shipment box (not orderId)
- `orderId` — Coupang's order number
- `orderedAt`, `paidAt` — timestamps
- `status` — ACCEPT | INSTRUCT | DEPARTURE | DELIVERING | FINAL_DELIVERY
- `orderer.name` — who placed the order
- `receiver.name`, `receiver.addr1`, `receiver.addr2`, `receiver.postCode` — delivery address
- `orderItems[].vendorItemName` — product name as listed
- `orderItems[].sellerProductId`, `sellerProductName` — seller's product reference
- `orderItems[].shippingCount` — quantity
- `orderItems[].salesPrice`, `orderPrice` — price before/after discount
- `orderItems[].discountPrice`, `coupangDiscount` — discount breakdown
- `orderItems[].estimatedShippingDate` — promised ship date
- `deliveryCompanyName`, `invoiceNumber` — tracking info
- `inTrasitDateTime`, `deliveredDate` — delivery timeline
- `shippingPrice` — shipping fee
- `parcelPrintMessage` — delivery notes

### Return (`coupang_returns_all.json` — 20 records)

Key fields for dashboard:
- `receiptId` — unique return ID
- `orderId` — linked order
- `receiptStatus` — RETURNS_COMPLETED (all 20 in data)
- `createdAt`, `modifiedAt` — request timeline
- `faultByType` — VENDOR (18/20) or CUSTOMER (2/20) — critical financial field
- `reasonCode` — OOSSELLER | CHANGEMIND | DEFECT | WRONGDELIVERY | LIKELYDELAY | etc.
- `reasonCodeText` — human-readable Korean reason
- `cancelReasonCategory1` — 오류 | 고객변심 | 상품불량 | 배송불만
- `cancelReasonCategory2` — sub-category
- `returnShippingCharge` — cost of return shipping (positive = customer pays, negative = seller pays)
- `returnItems[].vendorItemName`, `sellerProductId` — what was returned
- `returnItems[].cancelCount` — how many units
- `returnDeliveryDtos[].deliveryInvoiceNo` — return tracking number
- `requesterName`, `requesterAddress` — return requester info
- `preRefund` — whether refund was issued before item received

### Product (`coupang_products_detail_50.json` — 50 records, `coupang_products_detail_150more.json`)

Key fields for enhanced product detail:
- `sellerProductId`, `sellerProductName` — seller's own product ID/name
- `displayProductName` — name shown to customers
- `statusName` — 승인완료 | 판매중지 | etc.
- `deliveryMethod`, `deliveryCompanyCode`
- `deliveryChargeType` — FREE_DELIVERY_OVER_30000 | PAID | etc.
- `deliveryCharge`, `freeShipOverAmount`, `returnCharge` — shipping cost rules
- `items[]` — option variants, each with: `itemName`, `salePrice`, `originalPrice`, `vendorItemId`, `images[]`
- `images[].cdnPath`, `imageType` — REPRESENTATION (main) | DETAIL (description)
- `displayCategoryCode`, `categoryId` — for category lookup

---

## Sources

- Actual data files inspected: `/data/coupang_orders_raw.json` (298 orders), `/data/coupang_returns_all.json` (20 returns), `/data/coupang_products_detail_50.json` (50 products)
- Existing codebase: `apps/web/src/app/orders/page.tsx`, `apps/web/src/app/returns/page.tsx`, `apps/server/src/orders/`, `apps/server/src/returns/`
- Coupang WING seller center features: [쿠팡 WING 판매자센터 가이드](https://oscsnm.com/coupang-wing-seller-guide/)
- E-commerce OMS feature patterns: [Shopify OMS Features 2026](https://www.shopify.com/enterprise/blog/order-management-system-oms), [Returns Management Software](https://www.lateshipment.com/blog/returns-management-software/)

---
*Feature research for: 쿠팡 운영 데이터 통합 (KidItem v1.0)*
*Researched: 2026-03-25*
