# 아이스크림몰 상품등록 리버스 (실측 2026-09-11)

기존에 **실제로 등록된 상품**(`goodsNo=11411122`)을 열어 값을 읽고, 신규 등록 폼과
대조했다. 화면을 상상해서 만들지 않는다 — 이 프로젝트의 다른 몰과 같은 방법이다.

- 관리자: `https://po.i-screammall.co.kr` (아이스크림 PO/BO)
- 등록물 보기: `/goods/goodsCommon.goodsView.do?...&type=R&goodsNo=11411122`
- **신규 등록: `/goods/temporaryGeneralGoods.temporaryGeneralGoodsView.do`**
  (메뉴 `상품 > 상품 정보 관리 > 상품 등록`, `data-link` 에서 확인)

## 1. 신규 ≡ 수정

폼 id 11개와 섹션 13개가 **완전히 같다**. 컨트롤 수만 271(수정) vs 154(신규)로,
차이는 예약가·변경이력 칸이다. 아트공구와 같은 부류라 등록물 값을 그대로 옮기면 된다
(온채널·11번가처럼 신규가 별개 시스템이 아니다).

## 2. 폼이 11개로 쪼개져 있다 ⭐

한 화면인데 `<form>` 이 섹션마다 하나씩이다. 폼 하나를 찾아 채우는 기존 SPEC
(`formSelector` 단일)로는 부족하다.

| form id | 섹션 |
|---|---|
| `basicInfo` | 기본정보 |
| `goodsInfo` | 상품정보 |
| `announcementInfo` | 상품고시정보 |
| `priceInfo` | 가격정보 |
| `deliveryInfo` | 배송정보 |
| `saleInfo` | 판매옵션 |
| `addInsertInfo` | 추가입력옵션 |
| `ctgAttInfo` | 상품 카테고리 속성 |
| `detailInfo` | 상품상세설명 |
| `additionalInfo` | 부가정보 |
| `imageInfo` | 상품이미지/동영상 |

## 3. 실측 등록물 값

### 기본정보 (`basicInfo`)
```
goodsNo           11411122
saleStatCd        10 (판매중)
goodsTypCd        10 (일반상품)      saleMethCd  10 (일반판매)
entrNo/entrNm     1482 / 주식회사 거영I&D
lgcGoodsNo        11403611
stdCtgNo          BC0105010200
stdCtgHierarchy   아이스크림몰>학급운영>학생선물>장난감/완구
mdNm              이수인
```

### 상품정보 (`goodsInfo`)
```
goodsNm           슈가 귤 쫀득 쫀뜩 주물럭 1p 귤주물럭 찐득이
saleStrDtm        2026-08-12      saleEndDtm  2050-12-31
buyrAgeLmtCd      0 (전체)
dispYn Y · schPsbYn Y · milgRsrvPsbYn Y · gvgfPsbYn N · indDvsnPayGoodsYn N
szGdeUseYn N
```
⭐ 상품명에 **`1p`** 가 들어간다 — 티처몰·11번가와 같은 규칙이다.

### 가격정보 (`priceInfo`) ⭐⭐
```
supPcost (공급가)  1,950
norPrc   (정상가)  4,000
salePrc  (판매가)  2,600
mrgnRate (마진율)  25
entpPrcA / entpPrcB  2,340 / 2,470
buyTypCd 20(입점사) · taxGbCd 01(과세) · ctgCmsnRateAplyYn 체크
payWayCd[] 11(신용카드) 12(실시간계좌이체) 32(포인트)
```
**공급가 = 판매가 × 0.75** (마진율 25). 티처몰은 ×0.8 이었다 — 몰마다 다르다.
정상가 4,000 → 판매가 2,600 = 65%.

`entpPrcA/B` 의 산식은 아직 모른다. 2,340 = 2,600×0.9, 2,470 = 2,600×0.95 로 보이나
등록물 한 건으로는 단정할 수 없다.

### 네이버 최저가 (`saleInfo`) ⭐ 이 몰만 있는 것
```
naverMinPrc        2200
contrRate          118      (= salePrc / naverMinPrc = 2600/2200)
vatAmt             236
paysPointRate      1
naverMinPrcUrl     https://search.shopping.naver.com/search/all?query=...
naverMinPrcIvstgDt 2026-08-12
```
네이버 최저가와 그 조사일·URL 을 요구한다. 다른 몰에는 없던 칸이다.

### 배송정보 (`deliveryInfo`)
```
deliProcTypCd 20(업체배송) · deliWayCd 01(택배배송) · deliDday 2(2일)
deliPsbRgnCd 01(전국) · cmbDeliYn Y · ordCnclPsbYn Y · exchPsbYn Y · rtnPsbYn Y
deliPolcNo 3916  조건부 무료(50,000원 미만 3,000원 / 반품비 3,000원)
```

### 판매옵션 (`saleInfo`)
```
stkMgrYn N(재고관리 안함) · optnYn N(옵션 안 씀) · buyQtyLmtYn N
stkQty/limtQty/safeStkQty 0
```

### 고시 (`announcementInfo`)
```
goodsNotiLisartCd  023 (영유아용품)   ← select 가 disabled, 옵션 41개
safeCertiTgtYn     Y (대상)
```
⭐ **신규 폼에서도 이 select 가 disabled 다.** 고시 유형은 사람이 고르는 값이 아니라
**카테고리에서 파생**되는 것으로 보인다(티처몰 39줄·도매꾹 23번과 다르다). 카테고리를
고른 뒤 무엇이 나타나는지 확인이 필요하다.

### 상세설명 (`detailInfo`) ⭐⭐
네이버 **SmartEditor 2** (`/static/js/libs/smartEditor/SmartEditor2Skin.html` iframe).
값은 `textarea[name=detailHtmlEditor]` 에 들어 있고 실제 내용은:
```html
<center>
<img src="https://kiditem.diskn.com/x80sp01Z4m" width="900">
<img src="https://kiditem.diskn.com/I82lfIRL9B">
</center>
```
**`kiditem.diskn.com` — 키즈노트·도매꾹·티처몰과 같은 호스팅이다.** 상세설명 배선은
새로 만들 것이 없고 `width="900"` 만 붙이면 된다. `yes24DetailHtmlEditor` 는 별도 칸이다.

### 이미지 (`imageInfo`)
```
baseImageFileName  0010000091582.jpg   (대표, 몰이 붙인 이름)
baseImageFile      file
imgInfo[0][img] / imgInfo[1][img]   추가 이미지 file (신규 폼에는 `+` 로 칸을 늘린다)
baseVideoFile      동영상 file
```
버튼: `이미지선택` · `+` · `동영상선택`.

## 4. 제출 버튼 ⚠️

`임시저장` · **`승인요청`** · **`상품등록`** · 미리보기 · 취소

온채널처럼 **승인 개입이 있다**. 온채널은 "승인요청을 안 하면 익일 삭제" 였는데
이 몰도 같은지 확인이 필요하다. 어느 쪽이든 **확장은 누르지 않는다** — 폼만 채우고
사람이 고른다.

## 5. 붙일 때 새로 필요한 것

1. **다중 폼 채우기.** 지금 SPEC 은 `formSelector` 하나를 가정한다. 폼 11개에 값을
   나눠 넣을 수 있어야 한다.
2. **SmartEditor 2 쓰기.** textarea 에 넣고 에디터에 반영시키는 경로가 필요하다
   (도매꾹 팝업 에디터·온채널 CKEditor 와 또 다른 방식).
3. **네이버 최저가 값.** 우리 데이터에 없다 — 사람이 정하는 `override` 칸으로 받는다.
4. **카테고리 선택 UI 확인.** `stdCtgNo`+`stdCtgHierarchy` 를 무엇으로 고르는지
   아직 안 봤다(툴팁만 확인).
5. **고시 파생 확인.** 카테고리를 고른 뒤 고시 칸이 열리는지.

## 6. 계정 키

주문수집에 이미 `icecream-mall` 로 붙어 있다(`ICECREAM_MALL_URL`, 자동 로그인 지원).
상품등록도 같은 계정 키를 쓰면 자동 로그인이 그대로 따라온다.
