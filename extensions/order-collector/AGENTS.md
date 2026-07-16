Consult this document first instead of relying on memorized knowledge.

# order-collector — Marketplace Order Collection Extension

`extensions/order-collector/` automates supported marketplace order collection
from admin pages that are already open in the user's Chrome profile. It may
read visible order tables, trigger marketplace export UI, or call supported
marketplace export APIs from the user's active page session, then sends
structured rows or export files back to the KidItem web app for NestJS
conversion.

## Owned Surfaces

- Icecream Mall PO delivery inquiry grid capture.
- Coupang supplier ASN visible-row Label/statement download triggers.
- Supported marketplace order export capture, including Kakao Shopping Seller.
- Sellpia delivery-tracking lookup and order-file upload.
- Sellpia 판매현황(sale_summary) 몰별·일별 매출 조회(읽기 전용) + `chrome.alarms`
  매일 자동수집 캐시(웹앱이 백엔드로 flush).
- Sellpia 상품별 이익현황(stat_prd_profit) 상품×월별 소진(판매수량) 조회(읽기 전용).
- Sellpia 통합 재고현황(stock_list_total, modekey=list) 상품별 현재고(c_stosum)
  조회(읽기 전용) — 재고 분석 현재고/발주 알림 소스.
- Domeggook and Onchannel tracking registration initiated from the KidItem
  order-collection page.
- KidItem localhost extension-id discovery for order operations only.

## Browser Boundary

- Host permissions stay exact to the supported marketplace origins.
- Do not persist, log, return, forward, commit, or store marketplace session
  tokens, cookies, passwords, or browser credential-store values.
- A supported marketplace collector may read a marketplace session token only
  transiently when that marketplace's export API requires it. Use the token only
  for same-marketplace origin requests, keep it in function scope, and never
  include it in extension responses to KidItem.
- Extension responses to the web app and backend carry only export artifacts,
  structured order data, and non-secret metadata such as `xlsxBase64`,
  `csvBase64`, file names, counts, and rows. Backend conversion, analysis, and
  auth remain owned by the KidItem web app and NestJS API; marketplace tokens
  must never be sent to KidItem.
- Destructive marketplace actions such as tracking registration require an
  explicit confirmation in the KidItem web page before the allowlisted action
  is sent to the extension.
- Do not send `organizationId`; backend auth/session scope owns organization
  context.

## Verification

```bash
node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
git diff --check -- extensions/order-collector
```
