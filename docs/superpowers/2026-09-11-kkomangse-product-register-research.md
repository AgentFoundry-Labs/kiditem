# 꼬망세몰 상품등록 폼 실측

실측 2026-09-11. EduPre 임대몰 `nstore.edupre.co.kr` ("꼬망세몰 : 입점관리자"),
입점업체 `키드아이템(edu000086)`.
등록물 **`_code=H7984-C3488-G2602`** (`전동 오토 버블건 1p 비눗방울 비누방울`).

화면: 목록 `/subAdmin/_product.list.php` · 수정 `_product.form.php?_mode=modify&_code=…` ·
**신규 `_product.form.php?_mode=add`**. 수정과 신규가 같은 폼이다.

## 1. 폼 — 평범한 PHP, 칸 이름이 다 있다

`form[name=frm]` → `POST _product.pro.php` (`multipart/form-data`), 제출은
jQuery validate 의 `submitHandler: form.submit()`. 등록물 칸 93개, 신규 87개.

⚠️ **신규 화면을 열 때마다 상품코드(`_code`)가 새로 발급된다**(예: `S4388-N9982-X3979`).
분류 추가 AJAX 가 이 코드로 붙는다.

## 2. 실측값 (등록물)

| 라벨 | name | 값 |
|---|---|---|
| 상품 노출 | `_view` | `Y` 판매중 |
| **상품명** | `_name` | `전동 오토 버블건 1p 비눗방울 비누방울` — 수량이 괄호 없는 **`1p`** |
| 해시태그 | `_hashtag` | 쉼표 구분 9개 44자 (상한 200자, 앞 5개만 상세 노출) |
| 정상가 | `_screenPrice` | 8,000 (원본명 앞 숫자) |
| 납품가 | `_supplyPrice` | 4,301 — ⚠️ **저장하지 않는 계산용 칸** |
| **판매가** | `_price` | 5,060 |
| 수수료 | `_sPersent`(`#comSaleTypeTr2`) | 15.00 (disabled, 업체 설정·분류별 자동) |
| 재고관리 | `_stock_control` | `N` 수동 ("재고 1개 이상이면 무제한 판매") · `_stock` 1 |
| 옵션 | `_option_type_chk` | `nooption` |
| 중복구매 | `_duplicate_use` | `Y` |
| 분류 | `pass_cate01~04` | `선물/행사용품 > 선물용품 > 비누방울/물총` (목록 id 289) |
| KC인증 | `_kc_yn` / `_kc_num` | `Y` / `CB065R2807-5003` |
| 브랜드 | `_brand` | (선택 안 함) |
| 제조사 / 원산지 | `_maker` / **`_orgin`** | 해피프랜즈 / 중국 — 칸 이름이 **`_orgin`(몰의 오타)** |
| 이미지 | `_img_list_square` · `_img_list_over` · `_img_b1` | `nfile.edupre.co.kr/nstore/upfiles/product/2026/04/…jpg` 파일 셋, 전부 500×500. **기본과 오버는 같은 사진**(바이트 동일), 상세 1 만 다른 사진 |
| **상세설명** | `_content`(`#ir1`) | `<center><img src="https://kiditem.diskn.com/H87FFlA55N"></center>` |
| 이용안내 | `p_guide_uid_10` | `106` [키드아이템] 배송/교환/반품규정 (신규 기본값도 106) |
| 과세 | `p_vat` | `Y` |
| 배송비 | `_shoppingPay_use` | `N` 업체별 정책 |
| 정보제공고시 | 팝업 `_product_reqinfo.popup.php` | **미등록 — "상품상세정보에 포함되어 있음"** |

## 3. ⭐ 가격 — 저장되는 것은 판매가 하나

화면 스크립트(실측):

```js
// 납품가 ↔ 판매가 연동 (납품가 = 업체 정산금액, 저장하지 않는 계산용 항목)
$('input[name=_supplyPrice]').on('input keyup', calcPriceFromSupply); // 판매가 = round(납품가 / (1 − 수수료율))
$('input[name=_price]').on('input keyup', calcSupplyFromPrice);       // 납품가 = 판매가 − round(판매가 × 수수료율)
```

→ **판매가(`_price`)를 넣으면 화면이 납품가를 채운다.** 5,060 − round(759) = 4,301 ✓.
납품가 칸에 넣을 이유가 없다. 수수료율은 분류를 붙이면 `applyCategoryCommission` 이
분류별 값으로 바꿀 수 있다 — 저장값이 판매가라 우리 가격은 변하지 않는다.

## 4. ⭐⭐ 분류 — 고른 뒤 버튼을 눌러야 붙는다

- 1·2·3단 `onchange="category_select2(n)"` → `POST /program/categorysearch.pro.php` 가
  다음 단 목록을 채운다(계단식 AJAX).
- 고르기만 해서는 붙지 않는다. **`<a onclick="category_add()">선택 카테고리 추가</a>`** 가
  `POST _product.inc_category_pro.php` (`_cmode=add&_code=…&pass_parent01~04`) 로 이 상품
  코드에 분류를 붙이고 목록을 다시 그린다. 붙으면 **`삭제` 줄(`category_delete('id')`)이
  생긴다** — 반영의 증거. 상품 저장이 아니라 분류 연결 AJAX 다.

실측 트리(일부):

- `278 선물/행사용품` → `279 선물용품` → `288 장난감/완구` · `289 비누방울/물총` ·
  `281 학용품` · `850 캐릭터완구` · `287 젠가/퍼즐/큐브/보드게임` · `297 블럭/레고` …
- `219 문구/사무용품` → `475 스티커류` · `221 미술용품` · `454 필기류` …
- `78 만들기/환경구성` → `79 주제별 만들기/패키지` · `608 놀이재료/만들기재료` …

기본값은 **`278 > 279 > 288`**(장난감/완구). 등록물의 289 는 그 상품 전용 자리다.

## 5. KC — 번호 칸은 `인증` 을 누르기 전까지 잠겨 있다

신규 화면 실측: `_kc_yn` 기본 `N`, `_kc_num`·`_kc_date`·`_kc_age`·`_kc_caution[]` 전부
`disabled`. 라디오를 먼저 눌러야 풀린다 → 확장이 `preRadios` 로 칸보다 먼저 누른다.

## 6. 이미지 — 칸 셋, 파일 칸과 텍스트 칸이 같은 이름

신규는 `_img_auto_resize_use=direct` 라 칸이 따로 있다.

| 칸 | 비고 |
|---|---|
| `_img_list_square` | 목록 기본 이미지(**필수**) — "메인과 상품목록에 노출" |
| `_img_list_over` | 오버 이미지(선택) — 목록에서 마우스를 올리면 나온다 |
| `_img_b1` | 상세 이미지 1 (최대 5, 스와이프) — **상품 페이지의 큰 사진** |

⚠️ 각 칸에 **같은 이름의 텍스트 칸**(외부 주소, `_use_hyperlink[]` 체크 시)이 따로 있다.
반드시 `input[type=file][name=…]` 을 집는다.

매장 화면 실측(`/?pn=product.view&pcode=H7984-C3488-G2602`): 상품 페이지의 큰 사진(553×553
롤링)이 `_img_b1` 파일(`3231113085.jpg`)이다. 등록물은 기본과 오버에 **같은 사진**을 넣었다
(바이트 동일). 권장 크기는 안내문에 비어 있고(`x (pixel)`) 등록물 사진은 전부 500×500 이다.

파일을 붙이면 칸 옆 글자칸에 `C:\fakepath\파일명` 이 보인다 — 브라우저가 실제 경로를 숨기고
사이트가 `input.value` 를 그대로 옮겨 적는 것이라 정상이다. 파일은 저장할 때 올라간다.

추가 썸네일이 없는 상품은 오버를 비우고 상세 1 에 대표를 넣는다. 그 상품의 다른 사진(등록 때
올린 원본)은 1000×670 처럼 정사각이 아니어서 일부러 섞지 않는다.

## 7. ⭐ 상세설명 — SmartEditor 2, 사진 업로더가 몰에 있다

`_content`(`#ir1`) + SmartEditor 2 스킨 iframe 하나가 **같은 `td`** 안에 있다. 같은 화면에
이용안내용 에디터가 하나 더 있어 **`ir1` 의 부모 칸으로 좁혀야** 한다. 스킨에
`button.se2_to_html` · `textarea.se2_input_htmlsrc` · `button.se2_to_editor` ·
`iframe#se2_iframe` 가 다 있다(아이스크림몰과 같은 HTML 탭 경로).

사진 업로더(실측 `plugin/photo_uploader/attach_photo.js`, NHN 표준 샘플):

```
POST /include/smarteditor2/plugin/photo_uploader/file_uploader_html5.php
headers: file-name: encodeURIComponent(name) / file-size / file-Type (+ contentType)
body: 파일 바이트 그대로 (FormData 아님)
응답: sFileInfo=…&sFileName=…&sFileURL=…   (거절 시 NOTALLOW_<이름>)
```

**라이브 실증(2026-09-11):** 업로드 성공 — 응답 747자 중 **앞은 PHP Notice 경고문**
(`Only variables should be passed by reference … line 15/21`)이고 뒤에
`&bNewLine=true&sFileName=…&sFileURL=https://nfile.edupre.co.kr/nstore/upfiles/smarteditor/2026/09/….jpg&sUploadFile=…`
가 붙는다. **주소는 등록물 이미지와 같은 꼬망세 CDN(`nfile.edupre.co.kr`), 절대주소.**
⚠️ 응답을 앞에서 잘라 보면 주소가 없다 — 전체를 `&` 로 쪼갠다(처음에 검증 스크립트가
300자로 잘라 "실패" 로 오판했다). HTML 탭으로 넣은 `<center><img …></center>` 가 **5초 뒤에도**
에디터와 `_content` 에 남는다.

→ 등록물은 diskn 주소였지만 **몰 업로더로 올린다**. 남의 몰(키즈노트) 로그인에 기대지
않는다 — ESM 에서 그 의존 때문에 등록이 통째로 막혔다.

## 8. 붙인 방법

- 빌더 `kkomangse-registration-form.ts` — `fields`(이름) · `radios` · `selectorFields`(분류)
  · `imageGroups`(square/over/swipe/gallery) · `detailUploads`.
- 확장 SPEC `kkomangse` + 범용 장치 넷: `preRadios`, `afterSelectorClicks`
  (`requireFilled`·`expectSelector`), 계단식 `waitForOption`, SE2 `anchorId` +
  `upload.mode: "html5"`. 상세 2~5 는 아이스크림몰의 `imageRepeat` 를 넓혀 쓴다
  (`anchorSelector`·`sectionClosest`·`addSelector`·`slotSelector`·`firstIndex`).
- 주문수집에 이미 붙어 있어 계정 키 `kkomangse` 로 자동 로그인이 붙는다.

## 9. 남은 확인거리

1. ~~분류 추가 반영·에디터 업로드 응답 모양~~ — 라이브 실증 완료(분류 0→1 반영, 업로드 절대주소).
   ~~실제 확장으로 실제 상품 한 번~~ — 1.0.82 로 `4000과일바구니딸깍이키링3` 채움, 경고 0.
2. ~~`_img_b2~5`(상세 이미지 추가)~~ — `추가` 로 칸을 늘려 넣는다(1.0.83, §6).
3. 브랜드(`_brand`) — 등록물은 비워 뒀다. 목록에 `거영아이앤디` 가 있으니 필요하면 고른다.

## 10. 라이브 실증 (확장과 같은 순서, 빈 신규 폼)

```
KC 인증 → 번호칸 열림 · _name · _hashtag · _screenPrice · _price · _maker · _orgin · _kc_num
분류1·2·3 (옵션 대기) · 선택 카테고리 추가 반영 0→1 ("선물/행사용품>선물용품>장난감/완구 삭제")
_view · _option_type_chk · _stock_control · p_vat · _shoppingPay_use
이미지 3칸 files=1 · 에디터 업로드 성공(nfile.edupre.co.kr) · 상세설명 5초 유지
경고 0 · 납품가 자동 4,301(판매가 5,060, 등록물과 일치)
```

저장은 누르지 않았다. 검증하느라 **저장 안 한 임시 상품코드에 분류 연결 1건**, 에디터 저장소에
**테스트 이미지 3장**이 남았다(상품으로는 올라가지 않는다).
