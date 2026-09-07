# ESM Plus(지마켓·옥션) · 11번가 연동 리버스

조사일 2026-09-01 · 웹 리서치 5개 각도 + **로그인 세션 라이브 프로빙**

---

## 0. 라이브 프로빙 결과 — ESM 현행 XHR API (이 문서의 최신 사실)

아래 §2 의 웹 리서치는 "현행 UI 가 `/Home/v2/{*path}` catch-all SPA 라 XHR 엔드포인트를
하나도 특정할 수 없다"고 결론냈다. **로그인된 세션으로 직접 프로빙해 그 공백을 메웠다.**
§2 의 ASP.NET 경로(`/Excel/Download` 등)는 레거시이고, 현행 화면은 아래를 쓴다.

### 화면 구조

```
www.esmplus.com/Home/v2/new-order        (React 껍데기)
  └─ iframe → post-tx.esmplus.com/shipping/new-order   (Next.js 앱)
                └─ 실제 API 전부 여기
```

### 주문 API 전체 지도 (번들에서 추출, 단계마다 /orders + /stat 쌍)

| 엔드포인트 | 화면 |
|---|---|
| `/api/receipt-check/*` | 입금대기 관리 |
| `/api/new-order/*` | 신규주문 관리 |
| `/api/send-processing/*` | 발송 관리 |
| `/api/shipping-status/*` | 배송현황 |
| `/api/buy-decision/*` | 구매결정완료 |
| `/api/penalty/*` | 배송페널티 |
| **`/api/order-integration/orders`** | 주문통합검색 |
| `/api/seller/ids` | 판매자 ID |
| `/api/grid`, `/api/grid/setup` | 그리드 컬럼 설정 |
| `/api/new-order/order-check` | 주문확인 |

### 주문 조회 (라이브 200, `resultCode: 0`)

```
GET https://post-tx.esmplus.com/api/new-order/orders
  ?page=1&pageSize=20
  &sellerSiteId=0            # 0=전체
  &sellerId=
  &searchDateType=PD         # 주문일 기준
  &statType=ALL
  &searchSDT=YYYY-MM-DD&searchEDT=YYYY-MM-DD
  &searchKey=ON&searchKeyword=
  &searchDistrType=&shopType=0&singleGoodsYn=
  &transDueDateType=&transType=&transPolicyNo=0
  &normal=false&smile=false&star=false&gift=false
  &giftStatusType=&install=false&today=false&firstOrder=false
  &tabSiteId=0

→ { resultCode: 0, message: "", data: { count: {...}, list: [], page, pageSize } }
```

### 지마켓·옥션이 한 계정·한 API로 통합된다

```
GET /api/seller/ids   → [{ siteId, sellerId, sellerCustNo }] × 2, siteId = 1 / 2
GET /api/new-order/stat → { all: {…}, gmkt: {…}, iac: {…} }
      각 항목: firstBuyCount, giftOrderCount, starOrderCount,
               todayNewOrderCount, todaySendCount, totalNewOrderCount, transDueDateCount
```

`gmkt`=G마켓, `iac`=옥션(Internet Auction). **몰 2개가 아니라 어댑터 1개 + 사이트 파라미터**다.
공식 API 의 `siteType`(1=옥션, 2=G마켓)과 값이 반대일 수 있으니 §2-2 와 교차 확인할 것.

### 엑셀 경로도 존재

번들에 `/api/new-order/orders/excel/`, `ExcelDownloadPopup`, `downloadUrl`, `/excel-download`.
다만 JSON 이 더 깨끗해 엑셀을 쓸 이유가 없다.

### ⚠️ 미확인 — 응답 레코드 필드

프로빙 시점에 신규주문이 **0건**이라(`totalNewOrderCount: 0`) `data.list[0]` 의 실제
필드명을 확보하지 못했다. **주문이 들어왔을 때 한 번 더 찍어야 셀피아 변환 매핑을 짤 수
있다.** §2-2 의 공식 API 응답 필드(`OrderNo`/`ReceiverName`/`DelFullAddress` …)와
이름이 다를 가능성이 높다.

### 11번가는 이 브라우저에서 프로빙 못 함

`soffice.11st.co.kr` 은 claude-in-chrome 안전 제한 대상(쿠팡과 동일)이다. 아래 §3 은
전부 웹 리서치·비로그인 프로빙 결과이며, 라이브 확인이 필요하면 playwriter 를 쓴다.

---

## 1. 요약 — 어느 경로로 붙일 것인가

결론부터: **두 몰 다 "확장이 엑셀 다운로드를 재현한다"는 기존 15개 몰 패턴에서 벗어난다.** 방향이 서로 정반대다.

| | 권장 경로 | 실행 주체 | 인증 | 데이터 형식 |
|---|---|---|---|---|
| **ESM(지마켓·옥션)** | 공식 ESM Trading API | **백엔드** | JWT(HS256) 자체 서명 | JSON / UTF-8 |
| **11번가** | 모바일 셀러오피스 JSON API | **크롬 확장**(세션 쿠키) | 기존 로그인 세션 | JSON / **EUC-KR** |

### ESM → 공식 API 권장, 화면 자동화는 폴백

1. **화면 리버스 난이도가 기존 15개 몰보다 확실히 높다.** 엑셀 컬럼이 몰 고정 스펙이 아니라 **판매자 계정별 설정값**이다(매뉴얼 p.65 "선택하신 컬럼 순서대로 엑셀에 출력"). 도매꾹·티처몰처럼 컬럼 순서를 고정 가정하는 passthrough 변환기를 쓸 수 없고, 계정마다 다른 엑셀이 나온다.
2. **현행 UI가 `/Home/v2/{*path}` catch-all SPA**라 미로그인 프로빙으로 XHR 엔드포인트를 하나도 특정할 수 없다. `api.`/`gw.`/`order.` 서브도메인은 NXDOMAIN이다.
3. 반면 공식 API는 **주문수집 → 발주확인 → 발송처리 → 배송완료 전 구간이 닫힌다.** JSON + UTF-8이라 도매꾹/11번가식 EUC-KR 함정도 없다.
4. **리스크: 키가 이메일 심사 승인제이고 거절될 수 있다.** "신청 승인은 사이트 검색성능 및 서비스 안정성을 저해하지 않는 수준 내"([API 가이드](https://etapi.gmarket.com/pages/API-%EA%B0%80%EC%9D%B4%EB%93%9C)). 최근 3개월 매출 규모를 제출받아 심사한다.

→ **신청 리드타임이 크리티컬 패스이므로 신청을 먼저 넣고, 대기 중에 로그인 세션으로 화면 경로 폴백 스펙(§5)을 확보한다.**

### 11번가 → 확장 JSON API 권장, 공식 API는 보완

1. `msoffice.11st.co.kr/cx/api/11ed/*` 가 **세션 쿠키 기반 순수 JSON API**다. KidItem 확장 패턴과 정확히 일치하고, 이미 라이브로 경로·응답 형식이 검증됐다(HTTP 200).
2. **엑셀 리버스가 아예 불필요하다.** 데스크톱 SPA·모바일 번들 전체에 `excel` 문자열이 0건 — 엑셀 로직은 레거시 iframe 안에만 있는데, JSON 응답 필드가 엑셀 컬럼의 상위호환이라 갈 이유가 없다.
3. **공식 API는 IP 화이트리스트가 키 승인 조건**이라 사용자 PC의 확장에서 호출할 수 없다. 백엔드 고정 IP가 필요하고, XML + EUC-KR + 180일 키 만료가 따라온다.
4. 다만 공식 API 쪽은 **주문 필드 50개 ↔ 셀러오피스 엑셀 헤더 50개 1:1 매핑표**가 오픈소스로 확보돼 있어(§3-2) 셀피아 양식 매핑 설계의 참조표로 쓸 값어치가 있다.

**단점 하나:** 확장 경로는 목록 API에 **주소·연락처가 없어** 주문 건마다 상세 API를 한 번 더 호출해야 한다(N+1).

---

## 2. ESM Plus (지마켓·옥션)

### 2-1. 주문수집 경로

**사이트 구조 (직접 프로빙으로 확인)**

`www.esmplus.com` 은 ASP.NET MVC다. 없는 라우트는 `302 → /Error/ErrorPage?Message=404:PageNotFound`, 있는 인증 라우트는 `200` + 로그인 리다이렉트 스크립트를 준다. 이 차이가 라우트 존재 오라클로 작동한다.

- **실존 확인**: `/Order/Index`, `/Order/NewOrder`, `/Delivery/Index`, `/Goods/Index`, `/Home/Home`, `/CommonPopup/Faq`
- **404**: `/Escrow/*`, `/Claim/Index`, `/OrderManage/Index`, `/Statistics/Index`, `/Order/List`, `/Order/ExcelDownload`, `/Delivery/ExcelDownload`
- **로그인**: `/Member/SignIn/LogOn` → `302 https://signin.esmplus.com/login` (Next.js 별도 앱)
- **현행 UI**: `/Home/v2/{*path}` — `/Home/v2/goods-manage`, `/Home/v2/order-manage`, `/Home/v2/zzz-nonsense-9182` 가 전부 동일하게 200. **catch-all이라 URL로 화면을 특정할 수 없다.**
- **서브도메인**: 살아있는 것은 `www` / `m` / `signin` / `cs` / `pics` / `sa` / `sa2` 뿐. `sa`·`sa2` 는 Spring Boot(루트 404가 `{"timestamp","status","error","message","path"}` JSON) = 공식 API 게이트웨이.

**엑셀 다운로드 엔드포인트**

```
GET https://www.esmplus.com/Excel/Download
→ HTTP 500, "사유 : 없는 fileType 입니다 / 코드 : A999999"
```
[출처](https://www.esmplus.com/Excel/Download)

미로그인 상태에서도 이 검증이 먼저 돈다(파라미터 검증이 인증 체크보다 앞선다). `fileType` 후보로 `1/2/3/0/99/Order/order/ORDER/Delivery/Goods/Item/Claim/OrderList/NewOrder/Excel/A/B` 를 시도했으나 전부 동일 에러 → **enum 어휘 미상**. 로그인 세션에서 값 1개만 확보하면 즉시 재현 가능하다.

**⭐ 엑셀 컬럼은 판매자 설정값이다 (이게 핵심 제약)**

[ESM 매뉴얼](http://doc.gmarket.co.kr/esm/esm_manual.pdf) p.65 '발송주문서 엑셀관리 설정':
- "조회된 신규 주문 건에 한하여 발송주문서를 다운로드 시 엑셀로 출력을 원하는 항목을 설정할 수 있는 메뉴"
- "선택하신 컬럼 순서대로 엑셀에 출력"
- 주소 옵션: **'주소1,주소2로 출력'(분리) vs '주소1로 통합 출력'(한 셀)** 도 판매자가 고른다

→ **헤더명 기반 매핑 필수. 컬럼 인덱스 고정 금지.**

[ESM PLUS 주문관리 매뉴얼](https://image.gmarket.co.kr/UpLoadIImage/ECenter/ESM%20PLUS_Manual_%EC%A3%BC%EB%AC%B8%EA%B4%80%EB%A6%AC.pdf) 원문:
> "[선택주문 엑셀다운로드]선택 시에는 선택한 주문 리스트만 엑셀로, [전체주문 엑셀다운로드] 선택 시에는 현재 있는 모든 주문 건을 엑셀로 다운받을 수 있습니다."
> "[발송처리]의 [노출설정하기]를 클릭 시, [발송정보 일괄등록]에 필요한 [엑셀 다운로드관리] 팝업이 뜹니다."

계정 선택자: 계정전체 / 옥션전체 / G마켓전체 / 옥션ID1·2 / G마켓ID1·2. 페이지당 20·30·40·50·100건.

**주문 상태 5단계** ([Quick 매뉴얼](http://doc.gmarket.co.kr/esmplus/ESMPlus_Manual_Quick.pdf))

`1 입금확인중 → 2 신규주문 → 3 발송처리 → 4 배송중 → 5 구매결정`. API의 `orderStatus` 와 대응된다. 보리보리 때처럼 수집 대상 상태를 잘못 잡으면 늘 빈 목록이 나오므로, **수집 기준은 신규주문 = `orderStatus=1`(결제완료)** 이 맞다.

### 2-2. 공식 API

**문서**: [etapi.gmarket.com](https://etapi.gmarket.com/) (구 `etapi.ebaykorea.com` 은 현재 ECONNREFUSED)
**호출 호스트**: `https://sa2.esmplus.com`
**카테고리**: 상품 / 주문·배송 / 클레임 / 정산조회 / CS / 서비스 / 스타배송

#### 인증 (JWT HS256, 자체 서명)

```
Authorization: Bearer {b64url(header)}.{b64url(payload)}.{signature}

header  = {"alg":"HS256","typ":"JWT","kid":"<ESM+ 마스터ID>"}
payload = {"iss":"www.cafe24.com","sub":"sell","aud":"sa.esmplus.com",
           "iat":"1503294000","ssi":"A:auction_seller_id,G:gmarket_seller_id"}
signature = HMACSHA256(b64(header)+'.'+b64(payload), SecretKey)
```
[출처](https://etapi.gmarket.com/pages/API-%EA%B0%80%EC%9D%B4%EB%93%9C)

- `kid` = ESM+ 마스터ID, `ssi` = 사이트별 판매자ID (`A`=옥션, `G`=G마켓)
- **`aud` 가 `sa.esmplus.com` 인데 실제 호출 호스트는 `sa2.esmplus.com`** → aud는 호스트와 무관한 상수로 취급할 것
- OAuth 토큰 발급 엔드포인트 없음. 클라이언트가 Secret Key로 직접 서명한다
- ⚠️ 조사 각도 간 표기 불일치: payload 두 번째 키가 `sub:"sell"`(공식 예시) vs `dom:"sell"`(미러 요약)로 엇갈린다. 실호출 전 원문 재확인 필요

#### 주문·배송 API 8종 (전부 `POST`, `sa2.esmplus.com/shipping/v1` 하위)

| 기능 | 엔드포인트 |
|---|---|
| 입금확인중 주문조회 | `/Order/PreRequestOrders` |
| **주문조회** | `/Order/RequestOrders` |
| 주문확인(발주확인) | `/Order/OrderCheck/{OrderNo}` |
| 발송예정일 등록 | `/Order/ShippingExpectedDate` |
| **발송처리(송장등록)** | `/Delivery/ShippingInfo` |
| 배송완료 | `/Delivery/AddShippingCompleteInfo/{OrderNo}` |
| 주문상태조회 | `/Delivery/GetDeliveryStatus` |
| 배송진행정보 | `/Delivery/Progress` |

[출처](https://etapi.gmarket.com/category/%EC%A3%BC%EB%AC%B8%20%7C%20%EB%B0%B0%EC%86%A1%20API)

#### 주문조회 요청 파라미터 전체 ([원문](https://etapi.gmarket.com/67))

```
siteType         (Y, int)  1=옥션, 2=G마켓
orderStatus      (Y, int)  0=주문번호조회 / 1=결제완료(주문확인전) / 2=배송준비중
                           / 3=배송중 / 4=배송완료 / 5=구매결정완료
                           / 6=장바구니번호조회(G마켓만)
orderNo          (N, long) orderStatus=0일 때 필수
payNo            (N, long) G마켓 전용
requestDateType  (Y, int)  1=주문일 / 2=결제완료일 / 3=발송마감일(orderStatus=2 한정)
                           / 4=선물수락일 / 5=일반주문은 결제완료일·선물주문은 선물수락일
orderType        (N, int)  1=일반 / 2=풀필먼트 스타배송 / 3=판매자 스타배송 (미입력=전체)
requestDateFrom  (Y, date) "YYYY-MM-DD hh:mm" 분단위 가능
requestDateTo    (Y, date) requestDateFrom 과 31일 이내
isGiftOrder      (N, string) Y/N
giftOrderStatus  (N, int)  1/2
branchCode       (N, long)
pageIndex, pageSize
```

#### 주문 응답 필드 (= 엑셀 컬럼 대체본)

- **식별**: `OrderNo`(bigint), `PayNo`, `GroupNo`(묶음배송비정책번호), `SellerId`, `SiteGoodsNo`, `OutGoodsNo`(판매자관리코드), `GoodsName`, `SKUNo`
- **상태/일자**: `OrderStatus`, `OrderDate`, `PayDate`, `OrderConfirmDate`, `TransDate`, `TransDueDate`(발송마감일), `ArrivalScheduledDate`, `TransCompleteDate`, `BuyDecisionDate`
- **수량/금액**: `ContrAmount`(주문수량), `SalePrice`(판매단가), `OrderAmount`, `AcntMoney`(결제금액, 배송비포함), `OptSelPrice`, `OptAddPrice`, `SellerDiscountPrice1/2`, `DirectDiscountPrice`, `CostPrice`, `SettlementPrice`, `ServiceFee`, `SellerCashBackMoney`
- **배송비**: `ShippingFee`, `DeliveryFeeCondition`(`M`조건부/`R`선결제/`F`고정선결제/`D`착불/`X`무료/`W`방문수령/`Q`퀵 — **옥션은 F,D,Q,W,X만**), `BackwoodsAddDeliveryFee`(도서산간), `JejuAddDeliveryFee`
- **사람/주소**: `BuyerName`, `BuyerID`, `BuyerMobileTel`, `BuyerTel`, `ReceiverName`, `HpNo`, `TelNo`, `ZipCode`, `DelFrontAddress`, `DelBackAddress`, `DelFullAddress`, `DelMemo`
- **송장**: `TakbaeName`, `NoSongjang`
- **기타**: `TransType`(A당일~F발송일미정, G~Z 스타배송), `DistrType`(`NL`일반/`TL`풀필먼트스타배송/`SL`판매자스타배송), `OverseaTransYn`, `InfoCin`(개인통관번호), `OutOrderNo`(101 G마켓국문/102 글로벌/301 SSG/401 Lazada), `FreeGift`, `FreeGiftCode`, `Bonus`, `BonusCode`, `ItemOptionSelectList`, `ItemOptionAdditionList`

⚠️ `BuyerID` / `BuyerId` 대소문자가 출처마다 엇갈린다. 실응답으로 확정할 것.

#### 발송처리 ([원문](https://etapi.gmarket.com/70))

```
POST https://sa2.esmplus.com/shipping/v1/Delivery/ShippingInfo
  OrderNo             (Y, long)
  ShippingDate        (Y, date)   YYYY-MM-DDThh:mm:ss, 호출 시점 2일 이내
  DeliveryCompanyCode (Y, int)
  InvoiceNo           (Y, string)
  SellerOrderNo       (N, string) 최대 30byte
  SellerItemNo        (N, string) 최대 30byte
→ {"ResultCode":0,"Message":"Success","Data":{"OrderNo":...}}
```

**택배사 코드 조회** ([원문](https://etapi.gmarket.com/142)) — Request Body 없이 URL만 호출
```
GET https://sa2.esmplus.com/item/v1/shipping/delivery-company
→ deliveryCompanies[].deliveryCompCode / .deliveryCompName
```
확인된 코드: `10003` 로젠 / `10005` 우체국 / `10007` 한진 / `10008` 롯데 / `10013` CJ대한통운 / `10022` DHL / `10031` (G마켓)직접배송 / `10039` 우리택배 / `10143` 농협. 전체 180여 개.

#### 주문상태조회 ([원문](https://etapi.gmarket.com/72)) — **기간 상한이 다르다**

```
POST /shipping/v1/Delivery/GetDeliveryStatus
  OrderNo(기간 조회 시 0), SearchDateConditionType(1결제일/2주문확인일/3최초발송일/4배송완료일),
  FromDate / ToDate (YYYY-MM-DD, 7일 이내), Page(1 이상)
```
주문조회는 31일, 이건 **7일**이다.

#### 호출 제한

| 대상 | 제한 | 시행 |
|---|---|---|
| `/Order/RequestOrders`, `/Order/PreRequestOrders` | **5초당 1회**, 초과 시 `ResultCode 3000` | 2025-04-23 08:00 |
| `POST /item/v1/goods/search` (상품목록) | **분당 20회** | 2026-08-10 08:00 |

제한 단위는 "인증토큰 내 입력된 지마켓·옥션 사이트 판매자 ID 별"([공지](https://etapi.gmarket.com/198)). **주문번호 단건 조회(`orderStatus=0`)는 제한 없음.**

#### 그 외 API군

- **상품**: `POST/PUT/GET https://sa2.esmplus.com/item/v1/goods`, `/goods/{goodsNo}`, `/goods/{goodsNo}/status`, `/goods/search`, `/site-goods/{siteGoodsNo}/goods-no`, `/origin/codes`, `/official-notice/groups`, 카테고리 `https://sa2.esmplus.com/item/v1/categories/sd-cats/`. 전문은 **application/json UTF-8**. 가격·재고는 `price.Gmkt`/`price.Iac`, `stock.Gmkt`/`stock.Iac` 로 사이트별 분리 ([원문](https://etapi.gmarket.com/140))
- **정산**: `POST /account/v1/settle/getsettleorder`, `/getsettledeliveryfee`, `/GetGlobalSellerTransfer`
- **클레임**: `POST /claim/v1/sa/Return/{orderNo}/Request`, `POST /claim/v1/sa/return/{orderNo}/pickup` (경로 패턴만 확인, 상세 미조사)

#### 키 발급 (심사 승인제)

`etapihelp@gmail.com` 으로 신청, 접수 순 처리. 제출 항목: **ESM 마스터ID / 서비스 도메인 URL / 최근 3개월 매출 규모 / 개발 시작·종료 일정 / 사용할 API 범위**(상품관리·주문클레임·CS·정산조회). 셀링툴 업체는 회사 소개자료와 사이트별 판매자 수 추가.

### 2-3. 지마켓/옥션 분리 이슈

**API 레벨에서 갈린다. 한 번의 호출로 통합 조회 불가.**

- `siteType` **1=옥션 / 2=G마켓** → 수집 시 **주문 1회가 아니라 2회 호출**
- JWT `ssi` 에는 `A:`, `G:` 가 **둘 다** 들어간다 → **토큰은 1개, 호출은 2회**
- 호출 제한이 "사이트 판매자 ID 별"이므로 옥션/지마켓은 **별도 5초 버킷으로 동작할 것으로 추정**(문서에 명시적 확인 문구 없음)
- **G마켓 전용 파라미터**: `payNo`, `orderStatus=6`, `isGiftOrder`, `giftOrderStatus`, `requestDateType=4·5`
- **옥션 제약**: `DeliveryFeeCondition` 이 `F,D,Q,W,X` 만
- 응답 `Data.SiteType` 으로도 구분되어 내려온다

**화면도 마찬가지다.** 통합주문 탭은 보기만 통합이고, 매뉴얼 p.64~65:
> "통합주문 탭에서 G마켓, 옥션의 주문을 동시 처리가능합니다."
> "통합주문 탭에서 엑셀 일괄발송 처리를 할 경우, **'마켓ID구분'항목을 맨 앞에 넣은 후**, 기능을 이용하시기 바랍니다."

연동사 기록도 같다 — 플레이오토: ["주문은 기존처럼 지마켓/옥션 각각 구분되어 수집됩니다"](https://www.plto.com/customer/HelpDesc/gmp/14658/).

**설정 단위와 호출 단위가 다르다는 점이 혼란의 원인이다:**
- 설정: 마스터ID 단위 — 이지어드민 "ESM Master ID와 연동된 모든 판매자 계정(ID)는 동일한 API 설정이 됨"
- 호출·제한: 사이트 판매자ID 단위 — 플레이오토 "ESM마스터 계정이 아닌, 옥션/지마켓 각 판매자 아이디로 연동이 진행"

**→ KidItem 권고: 몰 카탈로그에 'ESM' 1개가 아니라 '지마켓' / '옥션' 2개 엔트리를 두거나, 최소한 마켓 구분 필드를 수집~셀피아 변환 전 구간에서 필수 보존할 것.** 셀피아 판매처 매핑도 2개가 된다. (역방향 송장등록은 주문번호+송장번호 2개 컬럼만으로 통합 일괄처리가 되므로 이쪽은 유리하다.)

---

## 3. 11번가

### 3-1. 주문수집 경로

#### 데스크톱은 "React 껍데기 + 레거시 iframe" 하이브리드

`https://soffice.11st.co.kr/view/35930` HTML은 `<div id="app">` + webpack 3개뿐인데 동시에 `ext-all_new.js`(ExtJS 4.1.1)와 `jquery-1.9.1.js` 를 로드한다. main 청크에 `<iframe className="content_iframe" id={"Content_ifrm_"+menuNo}>` 와 `var e=c?o+"?"+c:o; d.current.src=e` 가 있다 — **SPA 쿼리스트링이 그대로 레거시 iframe URL로 전달된다.**

메뉴번호 매핑 (main 청크에 하드코딩):
```
WAITING_PAID       6201  ?uncomfirmedYn=Y&orgMenuNo=6201
PAID              35930  ?preViewCode=GOOD202&orgMenuNo=35930
PACKING_PROGRESS  35930  ?preViewCode=GOOD301
DELIVERY_PROGRESS 35930  ?preViewCode=GOOD401
DELIVERY_COMPLETE 35930  ?preViewCode=GOOD501
TODAY_DELIVERY_REQUEST   ?preViewCode=TODAY
취소 6209 (preViewCode=cn_04|D) / 반품 6511 (method=getClaimList&clm=01&searchVer=02) / 교환 6520 (clm=02)
```

레거시 실경로 (200 = 실재, 없는 경로는 404):
- `https://soffice.11st.co.kr/escrow/DeliveryList.tmall`
- `https://soffice.11st.co.kr/escrow/OrderDetail.tmall?method=getOrderDetail&ordNo=201309038372114&ordPrdSeq=1&dlvNo=287713394&searchVer=02` (Wayback 실물)
- 형제: `/escrow/ClaimDetail.tmall`, `/escrow/OrderCancelRequestRefuse.tmall`, `/escrow/SaleCancelPopup.tmall`, `/escrow/shipping/getShippingInfoDetailInfo.tmall`

→ "한 `.tmall` 파일 + `method=` 파라미터" Struts형 액션 구조. 파일 분리형(`/escrow/*Excel*.tmall` 17종)은 전부 404.

#### ⭐ 핵심: 모바일 셀러오피스는 순수 JSON API

SPA의 `ht()` 가 menuNo 35930일 때 `https://msoffice.11st.co.kr/cx/delivery` 로 리다이렉트한다. 그 Vue 번들의 엔드포인트 상수표 (**모든 URL에 `/cx` 프리픽스가 붙는다** — `url:"/cx"+e`):

```
Auth                     /api/11ed/seller/isAuth
FetchShippingData        /api/11ed/escrow/shippingManager2      ← 주문목록
FetchShippingSummary     /api/11ed/escrow/shippingSummary
DetailOrderData          /api/11ed/escrow/getOrderDetail2       ← 주소·연락처
FetchCancelData          /api/11ed/claimCancelApi/getCancelClaimList2
FetchClaimData           /api/11ed/claimReturnApi/getClaimAjaxList2
InsertSendFinishProcess  /api/11ed/escrow/insertSendFinishProcess2
InsertSendFinishLogistics/api/11ed/escrow/insertSendFinishLogistics2
FetchDataBeforeSendFinish/api/11ed/escrow/fetchDataBeforeSendFinish
SetDelaySendProcess      /api/11ed/escrow/setDelaySendProcess
GetCode                  /api/11ed/escrow/getCode
```
[출처](https://msoffice.11st.co.kr/cx/js/msocx.app.7040bb6ed6c3c15e.js)

**라이브 검증 완료:**
```bash
curl -X POST https://msoffice.11st.co.kr/cx/api/11ed/escrow/shippingManager2 \
  -H 'Content-Type: application/x-www-form-urlencoded;charset=UTF-8' \
  --data 'shBuyerType=01&shProductStat=202&statusFilter=202&shDateFrom=20260801&shDateTo=20260901&start=0&limit=20&listType=orderingLogistics&shDateType=01&isPaging=Y'
```
→ `HTTP 200`, `content-type: text/html;charset=euc-kr`, 본문 `{"msg":"로그인 상태가 아닙니다.","success":false}` (**EUC-KR 바이트**). 없는 경로(`/cx/api/11ed/escrow/zzzNotReal`)는 404 HTML → 경로 오라클 유효.

#### 주문목록 요청 파라미터 (form-urlencoded, POST)

```
shBuyerType "01"          shBuyerText ""           shBuyerTextInput ""
shProductStat "202"       statusFilter "202"
shDateFrom (YYYYMMDD)     shDateTo (YYYYMMDD)      shDateType "01"
start 0                   limit 20                 isPaging "Y"
listType                  shDelayReport ""         shPurchaseConfirm ""
searchFilter              shToday                  shDelay
```

`listType` 을 바꿔 같은 엔드포인트를 3번 호출한다: `orderingLogistics`(목록) / `orderingTotal`(건수) / `orderingConfirm`(요약).

**주문상태 코드** (`statusFilter` / `shProductStat`)
```
ALL 전체 | 202 결제완료 | 301 배송준비중 | 401 배송중 | 501 배송완료
오늘발송요청  statusFilter:ALL, shToday:Y, shBuyerText:today
발송기한경과  statusFilter:ALL, shDelay:Y, shBuyerText:delay
장기미발송    statusFilter:ALL, shBuyerText:longBad
클레임: 01 취소신청 / 02 취소완료 / 03 취소거부 / 105 반품신청 / 104 반품보류
       106 반품완료 / 108 반품신청취소 / 109 반품완료보류 / SRFND_APPEAL 반품이의제기가능
       ad_105 자동반품완료예정 / 201 교환신청 / 212 교환승인 / 214 교환보류
       221 교환발송완료 / 232 교환거부 / 233 교환신청취소 / ad_201 자동교환승인예정
자동취소예정  statusFilter:01 + shBuyerType:autoCancel
```
데스크톱 `preViewCode`(GOOD202/301/401/501)와 숫자가 1:1 대응한다.

**검색조건 코드** (`shBuyerType` / `searchFilter`)
```
"" 전체 | 01 구매자명 | 02 구매자ID | 10 구매자휴대폰번호 | 03 수취인명
04 주문번호 | 06 상품번호 | SELLER_PRD_CD 판매자상품코드 | INVC_NO 송장번호
```

#### 주문목록 응답 필드 (원본 UPPER_SNAKE → 프론트 camelCase)

```
ORD_NO, ORD_PRD_SEQ, ORD_PRD_STAT / ORD_PRD_STAT_NM, ORD_PRD_SUB_STAT_CD,
PRD_NO, PRD_NM, PRD_OPT_NM / OPT_NM, SEL_PRC, ORD_QTY, ORDER_AMT, ORD_OPT_WON_STL,
ORD_NM, MEM_ID, RCVR_NM / RCVR_NM2, RCVR_MAIL_NO,
DLV_NO, INVC_NO, DLV_ETPRS_NM, DLV_MTHD_CD / DLV_MTHD_CD_NM, DLV_QTY,
LST_DLV_CST / BM_LST_DLV_CST, SND_PLN_DD / SND_PLN_DD_RENTAL, SNDPLNDDDAY,
ORD_STL_END_DT, SEL_FEE_AMT / SEL_FIXED_FEE, DELVPLACE_SEQ,
SEND_CLF_CD / SEND_CLF_CD_NM, PRD_CLF_CD_NM, PART_DLV_YN / PART_DLV_NO,
APPMT_DD_DLV_DY, VISIT_DLV_YN, GIFT_ORD_YN, ADD_PRD_YN / ADD_PRD_NO,
BAR_CD_EXP_YN / BAR_CD_OUT_CNT, INVC_ADD_YN / INVC_ADD_DATA, DLV_CLF_CD,
BSN_DEAL_CLF, ORD_TYP_CD, PRD_TYP_CD, ORD_CN_STEP_CD, GBL_ITG_MEM_NO, PLAY_DT, buttonList
```

**⚠️ 주소·전화번호가 목록에 없다.** `getOrderDetail2`(파라미터 `ordNo`, `ordPrdSeq`, `dlvNo`)를 별도 호출해야 한다:
```
dlvList: rcvrTlphn←"strRcvrTlphn", rcvrPrtblNo←"strRcvrPrtblNo", addr, rcvrNm,
         dlvNo, invcNo, invcAddCnt/invcAddYn/invcAddData, dlvCst/bmDlvCst/dlvAddFee,
         dlvCstStlTypName, dlvMthdCdName, dlvEtprsCdName, prdList←"prdListMap"
dlvPrdList: optNm, ordDlvReqCont(배송요청사항), sndEndDt
ORD_PRD_BO: ordDt, ordNm, ordId, ordTlphnNo, ordPrtblTel, sndPlnDd
```

#### 발송처리 역방향 (같은 API군)

`insertSendFinishProcess2`(발송처리) / `insertSendFinishLogistics2`(송장등록) / `fetchDataBeforeSendFinish`(사전조회 — 응답에 `TrsnpEtprsExtrAllBO` = 택배사 목록) / `setDelaySendProcess` / `setSaleCancel` / `setOrderConfirmProcess`(발주확인). 택배사 코드는 `getCode?grpCd=PD016`, 프론트는 '우편등기'를 제외하고 `sellerMemTypCd=='03'` 으로 한 번 더 필터링한다.

#### 요약 API (전체수집 트리거·건수 검증용)

`POST /cx/api/11ed/escrow/shippingSummary` (`listType=orderingConfirm`):
`order202`←`order_good_202` / `order301` / `order401` / `orderDlvToday`←`order_dlv_today` / `orderDlvDelay`←`order_dlv_delay` / `orderLongBad`←`order_long_bad`

#### 인증

```
GET https://msoffice.11st.co.kr/cx/api/11ed/seller/isAuth?pageUrl=<encoded>
→ {"result":false,"required2fa":false}   (application/json;charset=UTF-8)
```
403이면 `https://login.11st.co.kr/auth/front/selleroffice/login.tmall?returnURL=...`, 데스크톱 레거시는 `https://login.11st.co.kr/login/Login.page?returnURL=...`. **세션 쿠키 방식이라 KidItem 확장 패턴과 호환**되지만 `required2fa` 플래그가 API 레벨에 실재한다.

#### 엑셀은 필요 없다

데스크톱 SPA main 청크와 모바일 msocx 번들 전체에 `excel` 문자열이 **0건**. 엑셀 로직은 로그인 뒤 `/escrow/DeliveryList.tmall` 응답 HTML의 인라인 JS 안에만 있다. 반대로 말하면 shippingManager2 JSON이 상위호환이므로 엑셀 경유가 불필요하다.

`robots.txt` 는 `User-agent: * / Disallow: /` 이므로 크롤러성 대량요청은 피하고 **사용자 세션 기반 단건 호출로 제한**할 것.

### 3-2. 공식 API

**베이스는 `openapi.11st.co.kr` 이 아니라 `api.11st.co.kr/rest` 다.** 인증은 헤더 1개:
```
openapikey: {발급키}
Content-Type: text/xml;charset=EUC-KR
```
OAuth·서명·토큰 없음. 요청·응답 모두 XML, EUC-KR.

공식 원문 ([운영가이드](https://openapi.11st.co.kr/openapi/OpenApiOperationGuide.tmall?operationType=SERVICE_METHOD)):
> "일반 Open API는 상품과 카테고리 조화(조회)만 가능합니다. 셀러는 셀러 API를 사용 하셔야 상품 등록부터 주문/배송 관리까지 모든 기능을 사용 하실 수 있습니다."

#### 주문 조회 — 상태별 4개 엔드포인트, 기간이 path 파라미터

```
GET /rest/ordservices/complete/{startTime}/{endTime}      결제완료(신규주문)
GET /rest/ordservices/packaging/{startTime}/{endTime}     배송준비중(발송대상)
GET /rest/ordservices/shipping/{startTime}/{endTime}      배송중
GET /rest/ordservices/dlvcompleted/{startTime}/{endTime}  배송완료
```
날짜 포맷 **`yyyyMMddHHmm` 12자리**. 쿼리스트링·페이징 파라미터 없음(전량 반환).

응답 XML은 `xmlns:ns2="http://skt.tmall.business.openapi.spring.service.client.domain/"` 네임스페이스에 반복 요소가 `ns2:order`, 결과코드는 `result_code`(0=성공) / `result_text`. **주문 1건이면 객체, N건이면 배열로 오므로 분기 필요.**

#### ⭐ 주문 XML 필드 50개 ↔ 셀러오피스 엑셀 헤더 50개 1:1 매핑

셀피아 양식 매핑 설계에 그대로 쓸 수 있는 표다 ([출처](https://github.com/ctrlv290/Dyflux/blob/master/_CLASS/API_11st.php)):

| API 필드 | 엑셀 헤더 |
|---|---|
| `ordNo` / `ordPrdSeq` | 주문번호 / 주문순번 |
| `ordStlEndDt` / `ordDt` | 결제일시 / 주문일시 |
| `dlvNo` | 배송번호 |
| `prdNm` / `slctPrdOptNm` | 상품명 / 옵션 |
| `ordQty` / `ordAmt` / `selPrc` | 수량 / 주문금액 / 판매단가 |
| `rcvrNm` | 수취인 |
| `rcvrPrtblNo` / `rcvrTlphn` | 휴대폰번호 / 전화번호 |
| `rcvrMailNo` / `rcvrBaseAddr` (+`rcvrDtlsAddr`) | 우편번호 / 주소 |
| `ordDlvReqCont` | 배송메시지 |
| `ordNm` / `memID` | 구매자 / 구매자ID |
| `ordMailNo` / `ordBaseAddr` / `ordDtlsAddr` | 구매자우편번호 / 주문자기본주소 / 구매자상세주소 |
| `ordPrtblTel` / `ordTlphnNo` | 구매자휴대폰번호 / 주문자전화번호 |
| `dlvCstType` / `dlvCst` / `bmDlvCst` | 배송비결제방식 / 배송비 / 도서산간 배송비 |
| `bndlDlvSeq` / `bndlDlvYN` | 묶음배송일련번호 / 묶음배송유무 |
| `sellerPrdCd` / `sellerStockCd` / `prdNo` | 판매자상품번호 / 판매자재고번호 / 상품번호 |
| `sellerDscPrc` / `tmallDscPrc` | 판매자할인금액 / 11번가할인금액 |
| `ordPayAmt` / `ordOptWonStl` | 결제금액 / 주문상품옵션결제금액 |
| `plcodrCnfDt` | 발주확인일시 |
| 그 외 | `addPrdYn`, `addPrdNo`, `appmtDdDlvDy`, `appmtEltRefuseYn`, `appmtselStockCd`, `custGrdNm`, `gblDlvYn`, `lstSellerDscPrc`, `lstTmallDscPrc`, `prdStckNo`, `rcvrMailNoSeq`, `referSeq`, `typeAdd`, `typeBilNo` |

`dlvCstType`: **01=선불 / 02=착불 / 03=무료**

#### 발주확인 — 주문이 아니라 **상품(순번) 단위**

```
GET /rest/ordservices/reqpackaging/{ordNo}/{ordPrdSeq}/{addPrdYn}/{addPrdNo}/{dlvNo}
예: /rest/ordservices/reqpackaging/20260612076034242/1/N/0/20260612076034242
→ <?xml version="1.0" encoding="euc-kr"?><result><result_code>0</result_code>
   <result_text>발주확인완료</result_text></result>
```
한 주문에 상품 N개면 **N번 호출**. `ordPrdSeq`/`addPrdYn`/`addPrdNo`/`dlvNo` 는 주문조회 XML에서 뽑아 저장해 둬야 한다.

#### 발송처리 — **GET(!) 방식, path-only**

```
전체발송: /rest/ordservices/reqdelivery/{sendDt}/{dlvMthdCd}/{dlvEtprsCd}/{invcNo}/{dlvNo}
부분발송: /rest/ordservices/reqdelivery/{sendDt}/{dlvMthdCd}/{dlvEtprsCd}/{invcNo}/{dlvNo}/{partDlvYn}/{ordNo}/{ordPrdSeq}
sendDt=yyyyMMddHHmm, dlvMthdCd=01(택배), partDlvYn='Y', ordPrdSeq는 '1,2' 복수 가능
```

`dlvEtprsCd` 확인된 값: `00034` CJ대한통운 / `00011` 한진 / `00007` 우체국 / `00012` 롯데(현대) / `00002`(로젠 **추정** — enum명이 ROCKET이라 불확실)

#### 취소 계열 (`claimservice`)

```
GET /rest/claimservice/cancelorders/{startDt}/{endDt}                  취소신청목록
GET /rest/claimservice/cancelreqconf/{ordPrdCnSeq}/{ordNo}/{ordPrdSeq} 취소승인
GET /rest/claimservice/cancelreqreject/{ordNo}/{ordPrdSeq}/{ordPrdCnSeq}/{dlvMthdCd}/{sendDt}/{dlvEtprsCd}/{invcNo}   취소거부(강제출고, sendDt는 여기선 yyyyMMdd 8자리)
GET /rest/claimservice/reqrejectorder/{ordNo}/{ordPrdSeq}/{사유코드}/{사유문구}  판매자 주문취소
GET /rest/claimservice/orderlistalladdr/{ordNo}    주소 포함 주문상세
GET /rest/claimservice/orderlistall/{ordNos}       상태 일괄조회(콤마 구분 최대 100건)
```
취소사유코드: `06` 배송지연예상 / `07` 상품·가격정보 오입력 / `08` 상품품절(전체옵션) / `09` 옵션품절 / `10` 고객변심 / `99` 기타

#### 상품 API

```
POST   /rest/prodservices/product                      등록(body=<Product> XML)
PUT    /rest/prodservices/product/{prdNo}              수정
DELETE /rest/prodservices/product/{prdNo}              삭제
GET    /rest/prodservices/productinfo/{prdNo}
GET    /rest/prodservices/product/details/{prdNo}
GET    /rest/prodmarketservice/prodmarket/{prdNo}      등록 XML 원형 회수
GET    /rest/prodmarketservice/sellerprodcode/{판매자상품코드}
GET    /rest/prodservices/product/price/{prdNo}/{price} 가격변경
POST   /rest/prodservices/updateProductOption/{prdNo}
POST   /rest/prodservices/updateProductDetailCont/{prdNo}
PUT    /rest/prodstatservice/stat/stopdisplay/{prdNo}    판매중지
PUT    /rest/prodstatservice/stat/restartdisplay/{prdNo} 판매재개
GET    /rest/areaservice/outboundarea                  출고지 → addrSeqOut
GET    /rest/areaservice/inboundarea                   반품/교환지 → addrSeqIn
GET    /rest/cateservice/category                      전량(약 15,000개)
```
**11번가에는 재고수량 개념이 사실상 없어 품절은 판매중지로 처리한다.** 상품등록 `<Product>` 필드 세트: `selMthdCd`(01 고정가), `dispCtgrNo`, `prdTypCd`, `prdNm`(최대100자), `brand`, `orgnTypCd`/`orgnNmVal`, `sellerPrdCd`, `prdStatCd`, `prdImage01~05`, `ProductTag>tagName`, `htmlDetail`(CDATA), `selPrc`, `dlvCnAreaCd`, `dlvWyCd`, `dlvCstInstBasiCd`(01무료/02고정/03조건부), `PrdFrDlvBasiAmt`, `dlvCst4`, `jejuDlvCst`/`islandDlvCst`, `addrSeqOut`/`addrSeqIn`, `rtngdDlvCst`/`exchDlvCst`, `prdSelQty`, `ProductNotification`(상품정보제공고시), `ProductCertGroup`(인증), `ProductOption`.

#### 셀러 API 카탈로그 (공식 분류 7군)

상품 / 주문 / 취소·교환·반품 / 전시공간 / 셀러기획전 / 사은품 / 긴급알리미. `introduceType=PRODUCT|ORDER|CLAIM|EXHIBIT|PLAN|FREEBIE|NOTIFY` ([출처](https://openapi.11st.co.kr/openapi/OpenApiServiceIntroduce.tmall))

---

## 4. 구현 시 함정

### 인코딩

| | 함정 |
|---|---|
| **ESM** | 없음. JSON + UTF-8 |
| **11번가 확장 경로** | ⚠️ 응답 헤더가 `text/html;charset=euc-kr` 인데 **본문은 JSON**. `TextDecoder('euc-kr')` 강제 적용 필수(도매꾹 패턴 재사용). 요청은 반대로 `Content-Type: application/x-www-form-urlencoded;charset=UTF-8` 로 보낸다 |
| **11번가 공식 API** | 요청·응답 EUC-KR. 파싱 전 `encoding="EUC-KR"` → `encoding="UTF-8"` 치환 후 DOM 파싱이 공통 패턴. ⚠️ **출처 충돌**: 최근 구현 다수는 EUC-KR로 보내는데, 2016년 블로그는 "매뉴얼은 euc-kr인데 실제론 utf-8이어야 통했다"고 반대 증언 → 실호출 1회로 판정 |
| **ESM 웹 엑셀** | 인코딩·파일형식(xls/xlsx/csv) 근거 **전무**. 롯데ON(xlsx→xls 변환 필요) 같은 함정 가능. 실파일 확보 전 가정 금지 |

### 마스킹 / 개인정보

**ESM (문서로 확인됨)**
- `BuyerID` = "앞 3자리외 마스킹 처리"
- ⭐ **안심번호 채번 지연이 실제 함정이다.** 전화번호 4개 필드(`BuyerMobileTel`, `BuyerTel`, `HpNo`, `TelNo`) 공통 주석: 고객 미입력 시 안 내려감 / 안심번호 설정 시 "부과될 때까지 내려가지 않음" / **"약 5분 정도 소요되며 5분 후 재조회 시 안심번호 받을 수 있음"** / G마켓은 **결제 후** 안심번호가 채번되므로 무통장입금 주문은 연락처가 null
  → **결제 직후 수집하면 연락처 빈 주문이 정상적으로 발생한다. 셀피아 전송 전 재조회(5분 후) 로직 필요.**
- 선물하기 주문이 `giftOrderStatus=1`(수락대기)이면 `ZipCode`·주소·`DelMemo` 전부 null

**11번가 (미검증, 개연성만)**
- 상세 API 필드가 `strRcvrTlphn` / `strRcvrPrtblNo` 처럼 **`str*` 접두어 = 서버 가공 문자열**이라 마스킹 개연성 있음 (**추정**)
- `isAuth` 응답에 `required2fa` 플래그 실재 → 개인정보 2차인증 게이트 존재
- 11번가는 0504 안심번호 정책이 있어 수취인 연락처가 가상번호일 가능성 (**추정**)

### 세션 / 권한

- ⚠️ **확장 `manifest host_permissions` 에 `msoffice.11st.co.kr` 추가 필요할 가능성 높음** — 카카오 톡스토어 때와 동일 함정
- `soffice` 세션 쿠키가 `msoffice` 서브도메인에서도 유효한지(도메인 스코프가 `.11st.co.kr` 인지) **미검증**
- 11번가 `robots.txt` = `Disallow: /` → 대량 크롤 금지, 사용자 세션 단건 호출로 제한
- 일부 ESM 제휴사는 API 연동인데도 셀러에게 **보안관리 > 동시접속 '허용함' + 2단계 인증 '적용안함'** 을 요구한다([올라핀테크](https://allra.co.kr/notices/197)) → 확장 세션을 병행할 계획이면 필요할 수 있음

### 요청 제한 / 기간 상한

| 대상 | 제한 |
|---|---|
| ESM 주문조회 | **5초당 1회** (단건 조회는 무제한), 초과 `ResultCode 3000` |
| ESM 상품목록조회 | **분당 20회** |
| ESM 주문조회 기간 | **31일 이내** |
| ESM `GetDeliveryStatus` 기간 | **7일 이내** ← 다르다 |
| ESM `ShippingDate` | 호출 시점 **2일 이내** |
| 11번가 셀러 API | **미확인** (일반 오픈API의 `004 overedTraffic` 만 문서 확인) |

⚠️ **KidItem 전체수집 동시성 풀(`COLLECT_ALL_CONCURRENCY=4`)과 정면 충돌한다.** ESM은 몰별 throttle이 반드시 필요하다. 옥션/지마켓 2회 호출 × 5초 → 몰 하나 수집에 최소 10초.

### 발송처리(송장등록) 함정

- ⚠️⚠️ **11번가 묶음배송**: `dlvNo` 는 묶음 단위다. 11번가 에러코드 -3308 설명 원문 — "11번가는 묶음 배송번호 기준으로, 묶음배송번호가 같은 주문번호는 배송번호(dlv_no)를 한 번만 호출하여도 나머지 주문번호에 해당하는 주문상태가 모두 발송처리됩니다." **다품목이면 `partDlvYn=Y` 부분발송 분기 필수.** 부분발송은 '업체배송' 주문만 가능하고, 추가구성상품만 부분발송은 불가. 묶음 식별은 `bndlDlvSeq` / `bndlDlvYN`
- **11번가 발주확인은 상품 단위 N회 호출** — 주문 단위가 아니다
- **ESM 클레임(취소·반품·교환·미수령신고) 주문은 `RequestOrders` 로 조회되지 않는다** — 별도 클레임 API 필요
- ESM 배송완료 API는 '송장 추적이 안 되는 택배사' 주문용. 추적 가능한 건은 시스템이 자동 완료

### 데이터 구조

- ⭐ **ESM 엑셀은 헤더명 기반 매핑 필수.** 컬럼 순서·구성이 판매자 설정값이고 주소 분리/통합까지 고른다. passthrough 변환기 금지
- **11번가 확장 경로는 N+1.** 목록(`shippingManager2`)에 주소·연락처가 없어 건마다 `getOrderDetail2` 호출 필요
- **ESM 마켓 구분 필수 보존.** 통합주문 화면에서도 '마켓ID구분' 컬럼이 맨 앞에 있어야 일괄발송이 된다
- 11번가 `ordNo` 앞 8자리가 `yyyyMMdd` 라 `ordDt` 파싱 대안으로 쓸 수 있다 (예: `20260612076034242` → 2026-06-12)

### 키 수명

- **11번가 OpenAPI 인증키 180일 유효기간 정책**(2026-06-30 시행, [공지](https://openapi.11st.co.kr/openapi/OpenApiNoticeBoard.tmall?method=getNoticeBoardList&noticeYn=Y&unityBrdNo=18) brdInfoNo=204447033) → **장기 무인 자동화라면 키 만료 감지·알람이 필요**. 갱신 절차·만료 시 응답코드는 로그인 게이트 뒤라 미확인
- ESM JWT는 payload 예시에 `exp` 가 없다. 토큰 재사용 가능 여부 **미확인**

---

## 5. 착수 전 필요한 것 (사람이 먼저 해야 하는 일)

### ESM

1. **ESM+ 마스터ID + 옥션 판매자ID + 지마켓 판매자ID 확인** (JWT `kid` / `ssi` 에 그대로 들어간다)
2. **API 신청 메일 발송 → `etapihelp@gmail.com`** — 제출: ESM 마스터ID / 서비스 도메인 URL / **최근 3개월 매출 규모** / 개발 시작·종료 일정 / 사용할 API 범위. **승인까지 리드타임이 크리티컬 패스이므로 가장 먼저.** 거절 가능성 있음
3. 승인 후 **Secret Key 수령**
4. **ESM PLUS > 판매자정보 > ESM+ 계정(ID)관리 > ESM API 관리 / 셀링툴 관리** → '사용함' 설정. 상품/주문 각각 최대 5개 업체 등록 가능. 마스터ID에 묶인 모든 판매자 계정에 동일 설정이 적용된다
5. **⭐ (신청 대기 중 병행) 로그인 세션에서 DevTools 캡처 1회** — 이게 화면 폴백 경로의 유일한 남은 블로커다:
   - 배송관리에서 **[전체주문 엑셀다운로드]** 클릭 → `/Excel/Download` 로 나가는 요청의 `fileType` 값, 나머지 파라미터, GET/POST 확인
   - 받은 **실파일 1개** → 확장자·인코딩·헤더 문자열 확정
   - **[발송처리] > [노출설정하기] → [엑셀 다운로드관리]** 팝업 캡처 → '전체 칼럼목록' 후보 전체와 기본 선택 컬럼 확보
6. (필요 시) 보안관리에서 동시접속 허용 / 2단계 인증 설정 확인

### 11번가

**A. 확장 경로 (권장, 선행)**
1. **셀러 계정 로그인 상태에서 `shippingManager2` 실응답 1건 캡처** → `totalCount` 위치, `list` 중첩 깊이, `limit` 상한, 조회기간 상한, 마스킹 여부 확정. (프론트는 `{data:{list:[]}, totalCount}` 를 가정)
2. **확장 `manifest host_permissions` 에 `msoffice.11st.co.kr` 추가** + `soffice` 쿠키가 `msoffice` 에서 유효한지 확인
3. `getOrderDetail2` 실응답으로 주소·연락처가 원본인지 마스킹/안심번호인지 확정

**B. 공식 API 경로 (백엔드)**
1. **호출 IP 확정.** 11번가 API 서버는 외부 접근을 차단하므로 **IP 등록이 키 승인 조건**이다. 공식 원문:
   > "3. IP 등록하기(셀러API 사용시 꼭 필요함!) … '서비스 등록/확인 > Seller API 정보 수정' 에서 꼭 IP 주소를 입력해 주셔야 합니다. … IP주소 정보를 입력해야 셀러 API Key 승인이 가능 합니다."
   - 개발서버IP / 개발자PC / 상용서버IP 3칸, **세미콜론 `;` 구분 복수 등록** 가능
   - ⭐ **KidItem과 가장 유사한 선례는 이지어드민**: 셀링툴 업체=이지어드민 + IP 직접입력=사용으로 두고 **"이지오토 사용하는 자리 PC의 IP"** 를 등록시킨다 ([출처](https://help.ezadmin.co.kr/index.php?title=11%EB%B2%88%EA%B0%80_API_%EB%B0%9C%EA%B8%89_%EB%B0%A9%EB%B2%95)). 로컬 실행형도 공식 경로가 열려 있다 — 단 **유동 IP면 불가**
2. **셀러오피스 > Open API 관리 > 서비스등록·확인** → 약관동의 → 접속권한 설정 → 추가인증 → **API KEY 발급** (1시간 이내 안내)
3. **계정이 여러 개면 계정마다 별도 발급**
4. **로그인 후 `openapi.11st.co.kr` 개발가이드 > 주문 API 원문 크롤** → 정식 파라미터 표·에러코드·전체 택배사 코드표 확보 (현재 확보한 스펙은 전부 오픈소스 코드 기반이지 공식 문서가 아니다)
5. **180일 키 갱신 담당자·알람 지정**

---

## 6. 확인 안 된 것

정직하게 — 아래는 근거를 확보하지 못했거나 로그인 게이트 뒤에 있는 항목이다.

### ESM

| 항목 | 상태 |
|---|---|
| `/Excel/Download` 의 `fileType` 유효값, 나머지 파라미터(조회기간·상태·주문번호 목록·컬럼셋 ID), GET/POST | **미상**. 후보 17종 시도 전부 동일 에러. 로그인 세션 캡처 외 방법 없음 |
| 웹 엑셀의 인코딩·파일형식 | **근거 전무**. 검색·매뉴얼·연동사 문서 어디에도 없음 |
| '전체 칼럼목록' 실제 헤더 문자열 전체, 기본 선택 컬럼 | 미확보 |
| 웹 엑셀 다운로드 시 '다운로드 사유 입력' / 수취인 마스킹 여부 | **미검증**. 확인된 마스킹은 API 기준 `BuyerID` + 안심번호뿐 |
| "엑셀다운 500건 이상이면 현재 페이지만 조회" 서술 | **원문 출처 특정 실패**. 검색 요약에 반복 등장했으나 `esm_manual.pdf` grep에 '500' 없음. 대량 주문 시 수집 누락 위험이라 검증 필요 |
| `/Home/v2` SPA 의 XHR 엔드포인트 | **0건 특정**. catch-all 라우팅 + `api.`/`gw.` 서브도메인 부재로 미로그인 프로빙 불가 |
| API 승인 난이도·소요기간·매출 컷오프 | 문서에 심사 기준·기간 없음. **거절 가능이 명시돼 있어 실제 신청 전까지 리스크** |
| 호출 IP 화이트리스트 필요 여부 | 검색 요약에 '호출 IP 주소 제출' 언급이 나왔으나 **원문 페이지에서 재확인 실패** |
| JWT `exp` 정책 / 토큰 재사용 가능 여부 | 미확인 |
| JWT payload 두 번째 키 `sub` vs `dom` | **출처 간 불일치** |
| 발송처리 벌크(다건 배열) 지원 여부 | 미확인. 단건 시그니처로 보임 → 수백 건 발송 시 호출 수 문제 |
| 응답의 `ReceiverName`/`HpNo`/`DelFullAddress` 가 원본인지 | 마스킹 정책 문서 없음. 실호출 전 미확정 |
| 클레임(취소·반품·교환·미수령) API 개별 경로·파라미터 | 카테고리 존재만 확인 (`etapi.gmarket.com/66·69·70·72` 미열람) |
| Swagger / OpenAPI 스펙 | **찾지 못함**. 티스토리형 문서(글 번호 5~221)가 전부로 보이며 기계가독 스펙은 없을 가능성이 높음 — 단 *부재*를 URL로 증명할 수 없어 gap 처리 |
| 샌드박스 / 테스트 서버 | 별도 stage 도메인 명시 없음. 실서버 `sa2.esmplus.com` 단일일 가능성 (**추정**) |
| 문의 이메일 | `etapihelp@gmail.com` 은 문서에서 직접 확인. `et_api@ebay.co.kr` 은 검색 요약에만 등장, 재확인 실패 |
| 사방넷·샵링커의 ESM 엑셀 스펙 | 공개 문서가 로그인 뒤. GitHub 공개 리버스 코드도 **발견하지 못함** |

### 11번가

| 항목 | 상태 |
|---|---|
| `/escrow/DeliveryList.tmall` 의 엑셀 `method=` 값·파라미터 | **미상**. 파일 분리형 17종은 전부 404라 "같은 파일 + 다른 method" 구조가 거의 확실하지만 값 자체는 로그인 필요 |
| 셀러오피스 엑셀 컬럼 목록 | 미확보. 공식 매뉴얼(`i.011st.com/ui_img/seller/pdf/escrow.pdf`)은 스크린샷 위주. **단 §3-2의 API 필드↔엑셀 헤더 50개 매핑표로 대체 가능** |
| `shippingManager2` **정상 응답 실물** | **못 봄.** `totalCount` 위치, `list` 중첩 깊이, `limit` 상한, 조회기간 상한(다른 몰의 92일 함정 같은 것) 전부 미확인 |
| `shDateType` 코드값 | `"01"` 하나만 확인. 나머지 값과 의미 불명 |
| 마스킹 / 2FA 정책, 0504 안심번호 | **전부 미검증.** 목록·상세·엑셀 중 어디가 마스킹되는지, '다운로드 사유 입력'을 요구하는지 모름 |
| `soffice` ↔ `msoffice` 쿠키 스코프 | 미검증 |
| 셀러 오픈API 주문 엔드포인트의 **공식 문서** | 확보 실패. `OpenApiGuide.tmall` 은 비로그인 시 `categoryNo` 1~63 / `apiSpecType` 1~3 전수 시도해도 일반 오픈API 4종(상품검색·카테고리·상품상세·이미지검색)만 반환. **현재 스펙은 전부 오픈소스 코드 기반 역추적이다** |
| 반품·교환 처리 엔드포인트 | **0건.** 공식 카탈로그엔 '교환처리/반품처리'가 명시돼 있으나 GitHub code search `claimservice/returnorders` / `claimservice/exchangeorders` 각각 0건 |
| 셀러 API rate limit / 조회기간 상한 / 일일 호출 상한 | **미확인.** 구현체들이 4일·7일 청크로 도는 건 관행일 뿐 근거 문서 없음 |
| `dlvEtprsCd` 전체 택배사 코드표 | 5개만 확보, 그중 `00002` 는 enum명이 ROCKET이라 매칭 불확실. 로젠·경동·대신·편의점택배 등 불명 |
| 재고수량 전용 수정 엔드포인트 | 공식 카탈로그엔 '재고처리'가 있는데 공개 코드엔 판매중지/재개 + 옵션수정만. `stockservice` 류 경로 후보 못 찾음 |
| 상품 '목록' 조회 API 존재 여부 | **출처 충돌.** 2차 문서는 "목록 API 없음, 단건만", 공식 카탈로그는 "목록을 가져올 수 있습니다" |
| 요청 인코딩 EUC-KR vs UTF-8 | **출처 충돌** (§4) |
| https 강제 여부 / `-400`·`-500` 에러 문구 | 2차 문서 1곳 기록뿐. 다른 구현체들은 여전히 `http://` 로 호출 중이라 현재 정책 미확정 |
| 180일 키 정책 본문(갱신 방법·만료 시 반환 코드·사전 알림) | 공지 **제목과 게시일(2026/06/24)만** 확보. 본문은 로그인 뒤 |
| JSON 응답 지원 / v2 셀러 API 존재 | 미확인. 확인된 모든 실호출은 XML. 플레이오토 UI에 '11번가(신규)' 계정 타입이 있다는 정황만 |

### 공통

- **사방넷·플레이오토·샵링커가 각 몰에 실제로 던지는 내부 HTTP 요청**(어느 몰이 API고 어느 몰이 스크래핑인지, 호출 주기 수치)은 공개 문서 없음. 샵링커는 [자사 블로그](https://blog.shoplinker.co.kr/shopping-mall-integration-solution-stability-comparison-2026)에서 두 방식 존재만 인정하고 몰별 매핑은 비공개
- **11번가 '셀링툴 업체' 목록에 신규 업체가 등재되는 절차**(제휴 요건, 자체 개발사가 등재 없이 IP 방식만으로 운영 가능한지)의 공식 기준 미확인