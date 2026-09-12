# ESM Plus(지마켓·옥션) 상품등록 리버스 (실측 2026-09-11)

기존 등록물 `goodsNo=6548340498`(`할로윈 LED 거미줄 1p 불빛 장식`)을 읽고 신규 폼과
대조했다. 화면을 상상해서 만들지 않는다.

## 1. 주소 구조 — 껍데기와 폼이 다른 도메인

| | 껍데기(메뉴·레이아웃) | 실제 폼 |
|---|---|---|
| 상품 조회/수정 | `www.esmplus.com/Home/v2/goods-edit?seq={goodsNo}` | `item.esmplus.com/goods/{goodsNo}` |
| **상품 등록** | **`www.esmplus.com/Home/v2/goods-register`** | **`item.esmplus.com/goods/new`** |

껍데기가 `iframe#innerIFrame` 으로 `//item.esmplus.com/...` 를 물고 있고 **교차 출처라
바깥에서 안을 못 만진다.** 11번가와 같은 사정이지만, 여기서는 폼 주소를 **직접 열 수 있다**
(로그인 세션 공유). 확장은 `item.esmplus.com/goods/new` 를 직접 열면 된다.

내부 라우트 그룹이 `app/goods/(syi_ryi)/...` 다 — SYI(Sell Your Item, 등록)와
RYI(Revise Your Item, 수정)가 한 화면을 공유한다. **신규 ≡ 수정**(섹션 24개 동일,
값만 비어 있음). 아트공구·아이스크림몰과 같은 부류다.

## 2. ⭐⭐ 지마켓과 옥션이 한 상품이다

모든 값이 `{gmkt, iac}` 쌍으로 들어 있다(`iac` = Internet Auction Co. = 옥션).

```json
"siteGoodsNo": {"gmkt":"4844623254","iac":null}
"price":       {"gmkt":2590,"iac":null}
"stock":       {"inputType":2,"gmkt":999,"iac":null}
"sellEndDate": {"gmkt":"2026-11-30T23:59:59+09:00","iac":null}
```
실측 등록물은 **G마켓에만** 올라가 있다(`iac` 전부 null). 옥션까지 함께 올리려면
`판매사이트` 에서 둘 다 고르고 각 값을 채워야 한다 — **몰 하나가 아니라 둘이다.**

## 3. ⭐ 상품 데이터는 문서 HTML 안에 있다

Next.js App Router 라 별도 `GET /api/ea/goods/{no}` 가 없다. 페이지 HTML 의 RSC
페이로드(`self.__next_f.push([1,"…"])`)에 `goodsResponse.data` 가 통째로 들어 있다.

읽는 법(라이브 검증):
```js
const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\s*\]\)/g;
// 각 리터럴을 JSON.parse 로 디코드 → 이어붙임 → "goodsResponse" 찾아 괄호 균형으로 잘라 파싱
```
⚠️ `\"` 를 한꺼번에 치환하면 상세설명 HTML 안의 이스케이프가 깨져 파싱에 실패한다.
반드시 리터럴 단위로 `JSON.parse` 할 것.

`data.itemBasicInfo`(11키) + `data.itemAdditionalInfo`(40키).

## 4. 실측 값

### itemBasicInfo
```
goodsName.kor   할로윈 LED 거미줄 1p 불빛 장식     ← `1p` 규칙이 여기도 같다
category.esm    00310002000200000000              (ESM 표준 카테고리)
category.site   [{siteId:2, catCode:"100000042200001328300029584"}]   siteId 2 = G마켓
goodsType       1        sellStatusCode.gmkt 11
siteSellerId    kiditem  sellerCustNo 104416177
catalog         {brandNo:0, makerNo:0, productBrandNo:0, epinCode:null, attributeMatching:[]}
```

### itemAdditionalInfo (주요)
```
price        {gmkt:2590}          stock {inputType:2, gmkt:999}
sellEndDate  2026-11-30T23:59:59+09:00
goodsStatus  "1"      weight 0     isVatFree false    isAdultProduct false
origin       {goodsType:4, type:0, code:null, isMultipleOrigin:false}
managedCode  ""       maxBuyLimitQuantity null       skuInfo null
```

### 배송 (shipping)
```
type 1 · companyNo 10013
policy.placeNo 580749 · feeType 1 · bundle.deliveryTmplId "33173429"
returnAndExchange { addrNo:"966781", fee:3000 }
dispatchPolicyNo { gmkt:-13, iac:0 }
```
⚠️ `placeNo`·`deliveryTmplId`·`addrNo` 는 **우리 계정에 저장된 템플릿 번호**다.
관련 API: `/api/ea/shipping/places/default`, `/api/ea/delivery/dispatchPolicies`,
`/api/ea/delivery/deliveryFeePolicy?placeNo=580749`.

### 고시 (officialNotice) ⭐
```json
{"officialNoticeNo":35,
 "details":[{"officialNoticeItemElementCode":"35-1","value":"상세설명참조"},
            {"officialNoticeItemElementCode":"35-2","value":"상세설명참조"},
            {"officialNoticeItemElementCode":"35-3","value":"중국"},
            {"officialNoticeItemElementCode":"35-4","value":"KY I D/KY I D"},
            {"officialNoticeItemElementCode":"35-5","value":"고객센터 031-908-5401"},
            {"officialNoticeItemElementCode":"35-6","value":"2~3일"},
            {"officialNoticeItemElementCode":"999-5","value":"내용없음"}]}
```
고시 항목 정의는 `/api/ea/officialNotice/groups/codes?officialNoticeGroupNo=35` 가 준다.
`35-5` 가 우리 A/S 번호(`031-908-5401`)와 일치한다 — `KIDITEM_AS_PHONE` 과 같은 값이다.

### 상세설명 (descriptions) ⭐⭐
```json
"kor": {"descriptionRegType":0, "contentId":"",
        "html":"<center><img src=\"https://kiditem.diskn.com/2mzzbLYEQe\"></center>",
        "imageUrl":null}
```
**또 `kiditem.diskn.com`** — 키즈노트·도매꾹·티처몰·아이스크림몰에 이어 다섯 번째다.
상세설명 호스팅은 그대로 재사용된다(`detailHost: "kidsnote"`). 폭 지정이 없다.

### 이미지
```
images.basicImgURL     http://gdimg.gmarket.co.kr/4844623254/STILL/600?ver=…
images.additionalImg1URL … additionalImg9URL   (전부 null)
```
대표 1 + 추가 9칸. 등록물은 대표만 쓴다. 올리면 G마켓 CDN 주소로 바뀐다.

### 인증 (certInfo)
`gmktCert.type 1`(해당없음) · `gmktLicense` · `iacCert`(의료기기·방송기기·식품 …)
G마켓과 옥션이 인증 모델을 따로 갖는다. 카테고리별 인증 목록은
`/api/ea/certifications/gmkt/certs?gmktCategoryLCode=100000042`.

## 5. ⚠️ 붙일 때 가장 어려운 점 — 칸에 이름이 없다

폼이 **Next.js + React** 이고 `<form>` 이 없다. 컨트롤 53개 중 `name` 이 있는 것은 3개뿐,
`id` 는 React `useId` 가 만든 `:r0:` `:r1:` 이라 **렌더마다 바뀔 수 있다.**

지금까지 쓰던 손잡이가 전부 통하지 않는다:
- `formSelector` + `name` → 없음
- 폼 id 분할(아이스크림몰) → `<form>` 자체가 없음
- 행 제목(11번가 `rowFields`) → **이 방법만 가능성이 있다.** 섹션 제목(`상품명`,
  `판매가`, `재고수량` …)으로 블록을 찾고 그 안의 `input.form__input` 을 집는 식.

또 `Open` 이라는 버튼이 21개 있는데 접힌 섹션이 아니라 **커스텀 드롭다운 트리거**다
(눌러도 컨트롤 수가 그대로였다). 선택값은 네이티브 `<select>` 가 아니라 커스텀 목록이라
클릭으로 골라야 한다.

## 6. 계정 키

서버 매니페스트에 `esmplus` 가 있는지 확인 필요. 주문수집에는 붙어 있지 않다
(자동 로그인 대상 URL 목록에 없음) — 세션은 사람이 직접 만들어야 한다.

## 7. 남은 확인거리

1. 옵션(`recommendedOpts`·`skuInfo`)을 쓰는 상품의 모양 — 실측물은 단일상품이다.
2. 옥션(`iac`)까지 채운 상품의 값 — 실측물은 G마켓 전용이다.
3. 이미지 업로드 엔드포인트(아이스크림몰처럼 몰 서버에 올리는 길이 있는지).
4. 커스텀 드롭다운을 코드로 고르는 방법(클릭 순서).

---

## 8. 실증 — 붙이는 법 (라이브 2026-09-11, 빈 폼 `item.esmplus.com/goods/new`)

7절의 "남은 확인거리"를 **전부 빈 폼에서 직접 해 봤다.** 5절이 걱정하던 것과 달리
**손잡이는 있다** — `name` 도 `id` 도 아닌 **섹션 제목**이다.

### 페이지 골격

```
div.box.box__panel                      패널(접히는 큰 덩어리)
 └ div.box__panel-content
    └ div.box__filter
       └ div.box__filter-item           ← 칸 하나 = 이것 하나
          ├ div.box__filter-head        제목 ("상품명필수", "판매가필수도움말")
          └ div.box__filter-content     값 넣는 곳
```

제목에 `필수`·`도움말` 이 꼬리로 붙는다. 공백과 그 꼬리를 떼고 앞부분만 맞춘다
(11번가 `findRowInput` 과 같은 사정이다).

### ⭐ 다섯 가지 채우는 법 — 전부 실증됨

| 종류 | 찾는 법 | 넣는 법 |
|---|---|---|
| 글·숫자 | 제목 → `.box__filter-content` → `input.form__input`/`textarea` | 네이티브 setter + `input`/`change` |
| 라디오 | 같은 곳 → `input.form__radio` + `label.form__label[for]` 글자 | 라벨 글자로 찾아 **클릭** |
| 드롭다운 | 같은 곳 → `div.box__dropdown` | `button.button__opener` 클릭 → `button.button__option` **글자로** 클릭 |
| 카테고리 | 검색칸에 이름 → `button.button__search` | 결과 `button.button__option` 의 **전체경로 글자** 클릭 |
| 상세설명 | `ul.list__tab-board button.button__tab` 중 `HTML 작성` | `textarea.box__board-textarea` 네이티브 setter |
| 이미지 | `input.form__file` (`multiple`) | `DataTransfer` 주입 + `change` |

**React 가 진짜로 받는다는 증거**: 판매가에 `2590` 을 넣었더니 화면이 `2,590` 으로
스스로 바꿨다. DOM 에 글자만 박힌 게 아니라 상태에 들어갔다는 뜻이다. 8초 뒤에도 그대로.

⚠️ 드롭다운·카테고리 결과는 **`li` 가 아니라 그 안의 `button.button__option`** 을
눌러야 한다. `li` 를 누르면 아무 일도 안 일어난다(실측).

### ⭐⭐ 고시가 일반 칸과 똑같다

`상품군` 드롭다운에서 **`어린이제품`** 을 고르면 고시 **15줄이 `div.box__filter-item`
으로** 그려진다 — 아이스크림몰처럼 몰 함수를 부르거나 표를 뒤질 필요가 없다.
**같은 `sectionFields` 로 채워진다.** 다만 **순서**가 있다: 상품군을 먼저 고른다.

열리는 줄: 품명 및 모델명 · KC 인증정보 · 크기/중량 · 색상 · 재질 ·
사용연령 또는 권장사용연령 · 크기ㆍ체중의 한계 · 동일모델의 출시년월 · 제조자/수입자 ·
제조국 · 취급방법 및 취급시 주의사항,안전표시 · 품질보증기준 · A/S 책임자와 전화번호 ·
주문후 예상 배송기간 · 기타 특이사항

### ⭐ 배송은 손댈 게 없다

빈 폼이 열릴 때 **이미 우리 계정 템플릿으로 차 있다**(실측 기본값):

- 택배사 `CJ택배` · 발송정책 `순차발송` · 발송 마감시간 `주문 후 2일 내 발송 (내일발송)`
- 출고지 `판매자 묶음배송비(1)` · 배송비 `조건부무료 9,900원 이상 무료 / 미만 3,000원`
- 반품 교환지 `(주)거영아이앤디`

→ 건드리지 않는다. **단, `반품/교환 배송비(편도)` 만 `0` 으로 열린다** — 실측 등록물은
3,000 이라 이 칸은 채워야 한다.

### ⭐⭐ 분류가 인증 칸의 방아쇠다 — 순서를 틀리면 조용히 지워진다

**이게 이 몰에서 제일 위험한 함정이다.**

분류를 고르기 **전**의 `인증정보` 패널은 `어린이제품 인증`·`생활용품 인증`·
`전기용품 인증` 셋이다(뒤의 둘은 이미 `인증대상이 아님`). 그런데 **분류를 고르면 이
패널이 통째로 다시 그려진다**:

| 분류 전 | 분류 후 |
|---|---|
| 어린이제품 인증 · 생활용품 인증 · 전기용품 인증 | **어린이제품 인증 · G마켓 인증정보 · G마켓 영업허가증** |

그리고 **기본값이 `인증대상`/`허가 대상` 으로 되돌아간다.** 즉 인증 라디오를 분류보다
먼저 누르면 **눌러 둔 값이 지워진다** — 화면은 채워진 것처럼 보이는데 등록을 누르면
`인증 유형`·`업종` 이 비어서 막힌다. 라이브에서 실제로 이렇게 당했다.

→ **분류를 먼저, 인증을 나중에.** 확장이 그 순서를 지킨다(테스트로 잠가 뒀다).

`인증대상`/`허가 대상` 으로 두면 따라 열리는 필수 칸:
- `인증 유형` — 드롭다운(안전인증 · 안전확인 · 공급자적합성확인) + 인증번호 칸
- `업종` — 건강기능식품판매업 · 식품제조가공업 · 의료기기판매업 … · 기타

그래서 인증번호가 있으면 `인증대상` 유지 + 유형·번호를 채우고, 없으면
`상세설명에 별도표기` 로 닫는다. 영업허가증은 완구가 허가 업종이 아니라 늘
`허가 대상이 아님`.

⚠️ 어느 인증 블록이 그려질지는 **분류가 정한다.** 없는 칸을 못 찾았다고 경고하면
매번 거짓 경보가 뜨므로, 인증 칸은 `optionalSections` 로 두고 조용히 넘어간다.

### 판매사이트

맨 위 `판매사이트` 에 `Gmarket`·`Auction` 체크박스 **둘 다 기본 켜짐**. 한 번 채우면
두 몰이다 — 어댑터 하나로 간다.

### 라이브 실증 결과 (2026-09-11)

빈 폼에서 확장과 같은 순서로 돌린 결과 — **25칸 채움, 경고 0, 빈 필수칸 0.**
분류 → 인증 셋 → 상품군 → 기본칸 5 + 고시 14 → 상세설명(HTML). 사장님이 등록 버튼만
누르면 되는 상태까지 갔다.

### 아직 안 본 것

옵션(`recommendedOpts`) 있는 상품 · 이미지가 실제로 G마켓 CDN 으로 올라가는지(저장 후).
