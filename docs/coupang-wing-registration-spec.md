# 쿠팡 WING 상품등록 리버스 스펙

`wing.coupang.com` 상품등록(formV2)·수정(modify) 화면을 라이브로 리버스한 결과와,
현재 서비스가 채우지 못하는 항목을 정리한다. 등록 자동화를 이어서 구현할 때 이 문서를 먼저 읽는다.

수집 방법: playwriter(사용자 로그인 Chrome) + in-page `fetch`.
`claude-in-chrome` 은 coupang.com 을 차단하므로 WING 리버스는 playwriter 로만 가능하다.

## 0. 무엇을 어디에 넣어야 하는가 (요구사항)

먼저 이것부터 확정하고 구현한다. 이 정의 없이 코드를 고치다가 엉뚱한 이미지가
추가이미지에 6장 들어가는 사고가 났다.

| KidItem 쪽 출처 | → | 쿠팡 폼 위치 | 개수 |
|---|:-:|---|---|
| 썸네일 이미지 구성 → **대표 썸네일** | → | **대표이미지** | 1장 |
| 썸네일 이미지 구성 → **썸네일 미리보기 이미지들** | → | **추가이미지** | 최대 9장 |
| **생성된 상세페이지**(KIDITEM DESIGN) | → | **상세설명** | **긴 이미지 1장** |

**핵심 규칙**

- 추가이미지에는 **썸네일 이미지 구성 화면에 있는 이미지만** 넣는다.
  원본 수집 이미지(`sourcing_candidates.image_url`, `role='source'`)나 1688 원본을
  섞어 넣으면 안 된다 — 규격도 안 맞고 사용자가 고른 것도 아니다.
### ★ 상세설명은 "긴 이미지 한 장"이다 — 섹션 이미지 여러 장이 아니다

상세페이지 화면의 `이미지 다운로드`는 **상세페이지 전체를 한 장의 세로로 긴 이미지로
렌더링**한다(예: `860px × 10,084px`, 약 1.9MB). 섹션 이미지(`__heroBanner`,
`__detailImage1..4` …)를 낱장으로 올리는 것이 **아니다**.

다운로드 옵션 모달의 폭 프리셋 — **쿠팡은 780px(쿠팡 권장)** 을 쓴다:

| 폭 | 대상 |
|---|---|
| 760px | 쿠팡 |
| **780px** | **쿠팡 권장** ← 이걸 쓴다 |
| 800px | 11번가 |
| 860px | 네이버/G마켓 |

렌더링은 **서버 캡처**로 한다(클라이언트 `html2canvas` 는 긴 페이지에서 자주 멈춘다):

```
POST /api/render-image
  { html, viewportWidth, outputWidth: 780, baseUrl, format: 'jpeg', quality }
→ 이미지 blob
```

구현 위치 참고: `_shared/components/workspace/DetailPagePreview.tsx` 의 `handleDownloadImage`
가 이 흐름을 이미 구현해 두었다(`buildServerRenderHtml` 로 HTML 을 감싼 뒤 호출).

### ✅ 최종 상세설명은 `HTML 작성` 탭으로 저장한다

상세설명 영역의 탭은 **3개**다: `이미지 업로드` / `에디터 작성` / **`HTML 작성`**.
툴바는 `전체 다운로드` `PC 미리보기` `초기화` `저장`.
WING 최종 상태는 이미지 업로드 모드가 아니라 HTML 타입이어야 한다.

정상 등록 상품의 `HTML 작성` textarea 원문 실측 — **`<center><img>` 한 줄이 전부다**:

```html
<center> <img src="http://image1.coupangcdn.com/image/vendor_inventory/d0d7/46269129d047a9171416e1e1bdd445c354c70ca044de28d666cd876dee0b.png"> </center>
```

- 호스트는 `image1.` 처럼 번호가 붙을 수 있고 스킴이 `http` 일 수 있다.
- 확장자는 **쿠팡이 정한다**(실측은 `.png`, `resize/uploadV2` 실증은 `.jpg`).
  우리가 올린 원본 포맷과 무관하므로 확장자로 검증하지 마라.

단, 렌더 원본은 `localhost:9000` 에 있으므로 그 URL 을 HTML 에 바로 넣으면 구매자 화면에서
깨진다. 확장은 원본 파일을 WING 단일 이미지 업로드 API에 한 번 보내 `vendor_inventory` CDN URL 을
발급받고, **발급된 URL 만** HTML 에 넣는다. 업로드는 CDN 호스팅을 위한 중간 단계일 뿐이며
최종 상세설명 모드가 아니다.

**배선 완료** (VERSION 0.1.21): 상세페이지 HTML 은 클라이언트에서 템플릿으로 조립되지만
(`renderGenerationEntryHtml` / `ensureStyledDetailHtml` + templateCss),
**저장본은 `detail_page_revisions.html` 에 이미 있다.** 서버가 그 HTML 을 읽어
`DetailPageRasterizationService` 로 780px 래스터라이즈하므로 클라이언트 조립을 우회한다.

```
POST /api/ai/detail-page-image/candidate/{candidateId}   { outputWidth?: 780 }
→ { status: 'rendered', imageUrl, outputWidth, contentType, byteLength, revisionId, artifactId }
→ { status: 'missing',  reason: 'no_saved_detail_page' | 'empty_html', message }
```

- 조회 경로: `content_workspaces(source_candidate_id).current_detail_page_revision_id`,
  비어 있으면 워크스페이스 소유 `detail_page_artifacts.current_revision_id`.
  그 밖의 무엇으로도 폴백하지 않는다.
- 레이아웃 폭은 저장 HTML 의 `meta viewport`(현행 템플릿 860)를 따르고 출력만 780 으로 줄인다.
  720 으로 고정하면 860 설계 페이지가 잘못 렌더된다.
- **상세페이지가 없어도 404 가 아니다.** 404 는 호출자가 "그럼 대표이미지로 대신하자"처럼
  조용히 폴백하기 쉬워서, 200 + `status: 'missing'` 으로 사실 자체를 돌려준다.
  웹은 `detailImageUrls` 를 비우고 사용자에게 에러 토스트를 띄운다.
- 렌더 결과는 스토리지에 올리고 URL 을 넘긴다. 데이터 URL 을 chrome runtime 메시지에
  싣지 않는다 — 긴 상세페이지는 base64 로 수 MB 다. 확장은 URL 을 직접 fetch 한다
  (`fetchImageFile`, 실패 시 background 중계 폴백).
- 에디터가 사용하는 단일 업로드 API는 CDN URL 획득에만 쓰고, 최종은 반드시 `HTML 작성`으로 저장한다.

### ★★ `이미지 업로드` 탭은 5,000px 에서 이미지를 잘라버린다 (라이브 실측)

폼 안내문 `이미지 권장 크기 : 780px x 5,000px` 은 **권장이 아니라 `이미지 업로드`
(Dropzone) 탭의 하드 분할 임계값**이다. 드롭 즉시 클라이언트가 5,000px 단위로 잘라
**조각마다 별도 CDN 자산으로 업로드**한다.

| 투입 이미지 | 결과 자산 | 조각 |
|---|:--:|---|
| 780 × 5,000 | **1개** | 5000 |
| 780 × 5,216 | **2개** | 5000 + 216 |
| 780 × 15,760 | **4개** | 5000 + 5000 + 5000 + 760 |

분할은 정확·무손실이고 순서도 보존된다(합이 원본 높이와 일치). 그래도 상세설명이
`<img>` 여러 장으로 쪼개지므로 "긴 이미지 한 장" 요구를 만족하지 못한다.

### ✅ `resize/uploadV2` 는 원본 한 장을 유지한다 — CDN 발급에 이 경로를 쓴다

같은 15,760px 이미지를 에디터가 사용하는 단일 업로드 API로 넣으면
**자르지 않고 한 장 그대로** 올라간다.
라이브 실증(`열쇠고리/키홀더` 카테고리):

```
저장 후 에디터 HTML:
<p><img src="http://image.coupangcdn.com/image/vendor_inventory/6a51/f853…ceef.jpg"></p>
→ 브라우저 밖 curl 검증: HTTP 200, 780 × 15,760, 1.39MB  (단일 파일)
```

즉 **넣은 이미지 1장 = `<img>` 1개**다. 사용자 기존 상품(`vendorInventoryId=16290876620`)의
상세설명이 780×5,216 단일 `<img>` 인 것도 이 경로로 올렸기 때문이다
(5,216 은 Dropzone 이었다면 반드시 2조각이 된다).

**→ 상세페이지 템플릿을 5,000px 이하로 줄일 필요가 없다.** 15,760px 를 그대로 올리고,
발급된 단일 CDN URL 을 HTML 에 사용한다.

#### 자동화 순서 (WING 번들 및 라이브 DOM 검증)

```js
// 1) 로컬 렌더 이미지를 File 로 읽는다.
const form = new FormData();
form.append('multipartFile', file);
// 2) Dropzone 의 auto-split API가 아니라 에디터의 단일 업로드 API를 호출한다.
const response = await fetch('/tenants/seller-web/file/resize/uploadV2', {
  method: 'POST', body: form, credentials: 'same-origin',
}).then(r => r.json());
// 3) response.message 경로를 엄격히 검증하고 CDN URL을 만든다.
const cdnUrl = `https://image.coupangcdn.com/image/${response.message}`;
// 4) 숨은 radio가 아니라 label을 눌러 Vue store까지 HTML 모드로 전환한다.
document.querySelector('#tab-content-2 + label').click();
// 5) 상세설명 영역의 textarea에 중앙 정렬 img HTML 입력
// 6) 상세설명 영역의 a.applyHtml 클릭
```

- ⚠️ 문서 전역의 `등록`, `저장`, `확인` 을 텍스트만으로 찾아 누르지 마라. FAQ 264가 속한
  상세설명 `.form-section` 을 먼저 찾고 그 안의 `.html-area-content textarea`와
  `a.applyHtml`만 사용한다. `#panel-contents`는 이 section의 조상이므로 section-local
  selector 앞에 붙이면 항상 실패한다.
- CDN URL 은 `image.coupangcdn.com` 또는 `imageN.coupangcdn.com` 의
  `/image/vendor_inventory/` 경로만 허용하고 HTTPS 로 정규화한다.
- 단일 업로드 요청은 별도 CSRF 헤더 없이 `multipartFile` 한 필드만 쓰며, 성공 응답의
  `message` 는 `vendor_inventory/…` 상대 경로다. 다른 경로나 절대 URL이면 실패시킨다.
- 성공 판정: 최종 스토어가 `contentTab='HTML'`, `contentHtml=<center>…</center>` 이고
  `contents[0].contentsType='HTML'` 인 것. 로컬 MinIO URL 이 남아 있으면 실패다.
- ✅ **최종 형태는 검증됐다**: 승인·판매중인 자사 상품의 `HTML 작성` textarea 가
  실제로 `<center><img src="…coupangcdn…"></center>` 한 줄로 저장돼 있다(1절).
  즉 이 형태는 제출·검수를 통과해 영속된다.
- 🚧 **미검증**: 그 상품은 사람이 만든 것이고, **우리 자동화가 CDN 업로드 → HTML 저장을
  끝까지 실행한 적은 없다.** 확장은 `판매요청`/`수정 및 검수 요청` 을 누르지 않으므로
  자동화 산출물이 검수를 통과하는지도 아직 모른다.

> 아래 3~4절의 `content_assets.role` 매핑은 **이 요구사항을 만족시키기 위한 수단**이다.
> role 만 보고 구현하다가 "후보에 도달 불가한 리스팅 자산"을 잡는 실수가 있었으니,
> 반드시 이 표를 기준으로 검증하라.

## 1. 폼 구조

**순차 잠금(progressive)** — 카테고리를 선택해야 옵션·이미지 섹션이 열린다.
카테고리 선택 전 `input` 14개 → 선택 후 81개, `input[type=file]` 0개 → 3개.
따라서 자동화 순서는 **반드시 카테고리 먼저**다.

### ★ 기준 상품 실측 (그라운드 트루스)

정상 등록·운영 중인 자사 상품 한 건을 수정 화면에서 전 섹션 실측한 값이다.
**추론이 아니라 이 값이 기준이다.** 우리 코드가 만드는 값이 이와 다르면 코드가 틀린 것이다.

| 섹션 | 실측값 |
|---|---|
| 판매방식 | 판매자배송 ☑ / 로켓그로스 ☐ (**중복선택 가능한 체크박스**) |
| 노출상품명 | `선인장 딸깍 키링 1p  휴대용 열쇠고리 핸드토이 스트레스해소` (34/100) |
| 등록상품명 | `3000선인장딸깍키링` (11/100) — **노출상품명과 별개 필드** |
| 카테고리 | `생활용품>생활소품>열쇠고리/키홀더` (판매수수료 10.8%, VAT 별도·정률) |
| 브랜드 | 입력칸 **비어 있음** + `브랜드없음 (또는 자체제작)` ☑ |
| 제조사 | **`해피프랜즈`** |
| 인증·신고 | 대상 아님 |
| 병행수입 | 아님 |
| 구매 연령 | 전체 연령 (미성년자 구매 가능) |
| 인당 최대구매수량 / 판매기간 | 설정안함 |
| 부가세 | 과세 |
| 상품 속성 | `바퀴 유무` `접이식 가능여부` `총 수량` `색상계열` `길이` 표시, **입력 가능 36개** |
| 옵션 | 상품 구성 `동일한 상품으로 구성됨` ☑ / 옵션명 `색상`·`수량` / 값 `혼합`·`1` |
| 가격·재고 | 정상가 `3,000` · 판매가 `1,900` · 재고 `999` · 판매중 (아이템위너 최저가 1,800) |
| 상품이미지 | 대표 1 + 추가 **(2/9)** |
| 상세설명 | **`HTML 작성` 탭** textarea 한 줄 (아래 0절) |
| 상품정보제공고시 | **`기타 재화`** |
| 구비서류 | 비어 있음 |
| 배송 | 출고지 `(주)거영아이앤디` / 일반배송 / 묶음배송가능 / 제주·도서산간 가능 / `CJ대한통운` / 30,000 이상 무료배송(기본배송비 `3,000`원) |
| 반품/교환 | 반품지 `(주)거영아이앤디` / 반품배송비 `3,000`원 |

**여기서 반드시 읽어야 할 세 가지**

1. **`해피프랜즈` 는 브랜드가 아니라 제조사다.** 브랜드칸은 비우고
   `브랜드없음(또는 자체제작)` 을 체크하는 것이 이 판매자의 등록 규약이다.
2. **배송·반품은 상품별 값이 아니라 판매자 계정에 이미 설정된 고정값이다.**
   출고지·반품지가 같은 법인이고 택배사·배송비·무료배송기준이 전부 계정 기본값으로 잡혀 있다.
3. **이름 필드가 2개다.** 등록상품명은 판매자 내부 관리용이고 형태가 셀피아 상품명과 같다.

### ★ 검색필터는 폐지됐다 — 상품 속성으로 통합

폼에 남은 문구: `이제, 검색필터는 상품 속성에서 입력하세요!` + `해당 영역으로 이동하기`.
**별도 검색필터 단계는 더 이상 존재하지 않는다.** 쿠팡 2020년 공식 가이드의
"검색필터 설정" 단계를 기준으로 삼은 서술·코드는 전부 현행 UI 와 불일치한다.

상품 속성 영역 안내: `상품 속성 넣고 최대 12% 추가 노출 잡아보세요`,
`입력 가능 상품 속성 열기 (36)`. 즉 이 카테고리에만 속성이 36개 있고 전량 미입력 상태다.

### ⚠️ 제출 버튼 — 우하단 `등록` 은 별점 제출이다

| 화면 | 제출 버튼 |
|---|---|
| 신규 등록(formV2) | `판매요청` |
| 수정 | `수정 및 검수 요청` |

화면 우하단 `페이지 별점주기` 위젯에도 **`등록`** 버튼이 있다. 이것은 별점 제출용이며
**절대 누르면 안 된다.** 5절의 "전역 `확인` 을 누르지 마라" 와 같은 계열의 함정이다.

### 필수 항목 + 입력 방식 (라이브 확인)

| 항목 | 필수 | 입력 방식 |
|---|:--:|---|
| 판매방식 | O | 체크박스 2개(중복선택 가능) |
| 노출상품명 / 등록상품명 | O | **각각 별도 입력칸**, 둘 다 max 100 |
| 카테고리 | O | leaf 검색 → 제안 클릭(2절). 선택 전까지 나머지 섹션 잠김 |
| 옵션 | O | 옵션명 컬럼은 **카테고리가 결정**한다. 값만 넣는다 |
| 브랜드 | O | 입력칸 + `브랜드없음(또는 자체제작)` 체크박스 |
| 제조사 | O | 별도 입력칸 |
| 상품이미지 | O | 드롭존 파일 업로드 또는 `이미지 URL주소로 등록`(4절) |
| 상세설명 | O | `HTML 작성` 탭 textarea(0절) |
| 상품정보제공고시 | O | 고시 카테고리 선택 + 값 N칸 (카테고리마다 필드 구성이 다름) |
| 인증·신고 | O(카테고리별) | 없으면 `인증대상아님` 을 **명시 선택**해야 한다(9절) |
| 배송 / 반품·교환 | O | 계정에 등록된 출고지·반품지 주소록에서 선택. 상품별 값이 아니다 |
| 상품 속성 | X | 노출 최대 +12%. 이 카테고리 36개 |
| 검색어 / 구비서류 | X | — |

> 각 항목을 우리 코드가 얼마나 채우는지(커버리지·갭·우선순위)는 이 문서가 아니라
> [`coupang-wing-registration-replan.md`](./coupang-wing-registration-replan.md) §2 에 있다.

## 2. 카테고리 API

```
GET /tenants/seller-web/vendor-inventory/product-category/getCategories
    ?registrationType=NORMAL&term=<검색어>
→ [{ displayItemCategoryId, displayItemCategoryCode, name, fullPath, leafCategory, prohibitedForHybridRegistration }]
```

- `leafCategory: true` 인 것만 등록에 쓸 수 있다.

### ⚠️ 제안 클릭 함정 — 같은 텍스트 요소가 6개다

leaf 를 입력하면 제안 목록이 뜨지만, 전체 경로 문자열(`생활용품>생활소품>열쇠고리/키홀더`)과
일치하는 DOM 요소가 **6개**나 된다(중첩된 래퍼들). 문서 순서상 **첫 번째는 바깥 `DIV` 래퍼라
클릭해도 아무 반응이 없다.** 실제 클릭 대상은 **가장 안쪽 `LI`** 다.

```js
// 틀림 — 바깥 DIV 를 집는다
all.find(e => e.textContent.trim() === pathText)

// 맞음 — 보이는 것 중 가장 안쪽
const m = all.filter(e => norm(e.textContent) === norm(pathText) && e.offsetParent !== null);
m[m.length - 1].click();
```

라이브 검증: 구 방식 `DIV`(무반응) vs 신 방식 `LI` → `선택한 카테고리 : 생활용품>생활소품>열쇠고리/키홀더`.
제안이 화면에 떠 있는데 선택이 안 되면 이 문제다.
- **`displayItemCategoryCode` 가 우리 `ChannelListing.category` 의 `[NNNNN]` 과 정확히 일치한다** (검증 3/3).
  - `[77390] 완구/취미>스포츠/야외완구>물총` → code 77390, fullPath 동일, leaf true
  - `[77448] …>기타보드게임` → 77448 / `[79914] …>학용품세트/문구세트` → 79914
- 관측상 `displayItemCategoryId = displayItemCategoryCode - 1000` (3/3). 단정하지 말 것.

### ⚠️ ID 가 두 종류다

카테고리 선택 시 뒤따르는 API 들은 **다른 id 체계**를 쓴다.

```
delivery-charge-constraint?internalCategoryId=77390   ← 우리가 가진 코드
notice/form?categoryId=6827                            ← 별도 내부 id
certification?categoryId=6827
delivery-charge-types?categoryId=6827
featureGroup?categoryId=6827                           ← A/B 플래그(속성 아님)
```

`77390 ↔ 6827` 매핑 규칙은 **아직 모른다**. 고시정보·인증정보를 카테고리별로 정확히 채우려면
이 매핑을 확보해야 한다. 카테고리 선택 응답이나 폼 상태에서 얻는 것으로 추정된다. **미해결.**

## 3. 상품 속성 (구 검색필터, attributeValues)

폼상 명칭은 **상품 속성**이다. 검색필터는 이 영역으로 흡수됐다(1절).
단, **일괄등록 엑셀 양식의 컬럼명은 여전히 `검색옵션유형N`/`검색옵션값N`** 이고
자사 워크북 파서도 그 헤더명을 읽는다(`coupang-wing-workbook.parser.ts`).
**폼 = 상품 속성 / 엑셀 = 검색옵션** 은 같은 것의 다른 이름이므로 리네이밍하지 말 것.

라이브 기준 상품(열쇠고리/키홀더)의 속성 개수는 **36개**이고 우리는 **0개**를 채운다.
쿠팡이 폼에서 명시하는 손실은 **최대 12% 추가 노출**이다.

등록된 실제 상품(`vendorInventoryId=16302076562`, 액체괴물/슬라임)에서 확인:

```json
"attributeValues": [
  { "attributeTypeName": "개당 중량", "attributeTypeId": 7637,
    "attributeValueName": "92g", "attributeUnitGroup": "WEIGHT",
    "attributeDataType": "NUMBER", "exposed": "EXPOSED" },
  { "attributeTypeName": "수량", "attributeTypeId": 7652,
    "attributeValueName": "1개", "attributeUnitGroup": "QUANTITY", ... }
],
"missingRequiredAttributeNames": []
```

- 속성은 **카테고리마다 다르다**. 현재 코드가 쓰는 `색상`·`수량` 리터럴은 다른 카테고리에서 틀린다.
- `missingRequiredAttributeNames` 가 비어야 정상 등록이다 — 등록 후 검증에 쓸 수 있다.
- 속성 정의를 주는 엔드포인트는 **아직 못 찾았다**(`featureGroup` 은 A/B 플래그였음). **미해결.**
- 다만 **속성 "값" 목록 일부는 이미 저장소에 있다.** 일괄등록 양식
  `apps/web/public/coupang-wing-bulk-template-v4.6.xlsm` 의 숨김 시트 `hidden` 이
  드롭다운 원본을 담고 있다 — `색상계열` 17개(`블랙계열`…`멀티(혼합)컬러`, `투명`),
  사이즈·패턴·소재·핏 등. 카테고리↔속성 **매핑**은 여전히 없지만 값 후보는 재리버스 없이 얻는다.

## 4. 대표·추가이미지 — 파일 업로드

등록된 상품의 이미지 구조:

```json
"vendorInventoryItemImageDtos": [
  { "itemImageType": "REPRESENTATION", "imageOrder": 0, "path": "vendor_inventory/761f/….jpg" },
  { "itemImageType": "DETAIL",         "imageOrder": 0, "path": "vendor_inventory/dff8/….jpg" },
  { "itemImageType": "DETAIL",         "imageOrder": 1, "path": "vendor_inventory/f4ad/….jpg" }
]
```

기존 등록상품 응답에는 상세 콘텐츠에서 사용된 이미지도 `DETAIL` 타입으로 나타난다.
자체 제작 상세페이지는 HTML → 긴 이미지 렌더링 → 단일 CDN 업로드 → HTML `<img>` 순서로
처리한다. 최종 상세설명 타입은 위 0절의 계약대로 HTML 이다.

폼의 파일 입력(카테고리 선택 후 등장):

| input | accept | multiple | 용도 |
|---|---|:--:|---|
| `i=1` | `image/png,image/jpg,image/jpeg,image/webp` | false | 대표이미지 |
| `i=2` | 동일 | true | 추가이미지 |

### ★ 어떤 이미지를 어디에 넣어야 하는가

`content_assets.role` 이 용도를 구분한다. **`sourcing_candidates.image_url`(원본 소스)을
쓰면 안 된다** — 규격(1,000×1,000)이 맞지 않는 원본이다.

| content_assets.role | 개수 | 쿠팡 폼 위치 |
|---|---:|---|
| `primary` | 80 | **대표이미지** (1장만) |
| `thumbnail` | 1 | **추가이미지** (최대 9장) |
| `detail` | 89 | **상세설명** |
| `option` | 211 | 옵션별 이미지(현재 미사용) |
| `source` | 24 | 원본 — **등록에 쓰지 말 것** |

쿠팡 규격: 상품이미지 **1,000×1,000 권장(최소 500)**, 10MB 이하 JPG/PNG.
상세설명 이미지 `780×5,000` 은 **`이미지 업로드` 탭에서만 하드 분할 임계값**이고
`에디터 작성` 탭은 무시한다 — 0절 "★★ 5,000px 분할" 참조.

> `content_assets.width/height` 는 현재 NULL 이라 크기로 거를 수 없다. role 로 골라야 한다.

### ⚠️ 연결 경로 — `ContentGeneration` 을 거치면 전부 놓친다

`content_assets.origin_generation_group_id → ContentGeneration.sourceCandidateId` 로 이으면
**`primary`/`thumbnail`/`detail`/`option` 이 하나도 안 잡힌다.** 이 자산들의 그룹은
`group_type = 'workspace_assets'` 이고 **생성행(`content_generations`)이 0건**이기 때문이다.

맞는 경로는 워크스페이스다.

```sql
content_assets.origin_generation_group_id
  -> content_generation_groups.content_workspace_id
  -> content_workspaces.source_candidate_id   -- 후보 소유
  -> content_workspaces.channel_listing_id    -- 리스팅 소유
```

### 🚧 위 개수표는 "후보가 가진 이미지"가 아니다 (라이브 확인)

role 별 소유자를 실제로 조인해 보면:

| role | 개수 | 소유자 | 호스트 |
|---|---:|---|---|
| `primary` | 80 | **전부 ChannelListing** (후보 0건) | `image1.coupangcdn.com` 80 |
| `detail` | 89 | **전부 ChannelListing** (후보 0건) | `image1.coupangcdn.com` 89 |
| `option` | 211 | **전부 ChannelListing** (후보 0건) | — |
| `thumbnail` | 1 | 후보 1건 | `cbu01.alicdn.com` |
| `source` | 24 | 후보 2건 | `cbu01.alicdn.com` 18 / `localhost:9000` 6 |

즉 `primary`·`detail` 80/89건은 **쿠팡에서 긁어온 기존 리스팅 이미지**이고, 그 리스팅들은
`source_candidate_id` 가 전부 NULL 이라 어떤 수집상품에서도 도달할 수 없다.
워크스페이스 82개 중 후보 소유는 2개, 리스팅 소유가 80개다.

우리가 만든 이미지(`localhost:9000`)는 6건이 `role='source'`, 12건이 `__heroBanner`
`__detailImage1..4` `__usageGuideImage1..3` `__sizeGuideImage` `__colorGuideImage` 같은
**템플릿 슬롯 이름**을 role 로 쓰고 있다.

**결론: 배선은 끝났지만 후보용 `primary`/`detail` 자산을 실제로 적재하는 파이프라인이 없다.**
현재 데이터로는 role 조회가 거의 항상 빈 값이고 기존 폴백으로 떨어진다. 남은 일은
썸네일/상세 생성물이 후보 워크스페이스에 `role='primary'|'thumbnail'|'detail'` 로 저장되게
하는 것(또는 `__*` 슬롯 role 을 정규 role 로 매핑하는 것)이다.

구현: `ContentAssetService.listRegistrationImages` (ai) → `CANDIDATE_CONTENT_ASSET_PORT`
→ sourcing `SOURCING_CANDIDATE_CONTENT_ASSET_PORT` → `ProductBasics.registrationImages`
→ 웹 `candidateToWingProduct`. `source`·`option` 은 서비스 계층에서 잘라낸다.

### ⚠️ `이미지 URL주소로 등록` 버튼은 있다 — 다만 우리 이미지로는 못 쓴다

라이브 확인: 대표이미지 옆에 **`이미지 URL주소로 등록`**, 추가이미지 **(2/9)** 옆에도
**`이미지 URL주소로 등록`** + `전체 삭제` 버튼이 있다. 일괄등록 엑셀 양식도 대표이미지
컬럼 설명에서 "이미지 주소(URL) 기재" 와 "업로드 후 파일명 기재" 두 방법을 모두 안내한다.

즉 **기능이 없어서 파일 업로드를 쓰는 것이 아니다.** 쿠팡 서버가 가져갈 수 있는 공개 URL 이
없어서다. `content_assets` 의 URL 호스트 분포:

```
image1.coupangcdn.com  380   ← 쿠팡에서 긁어온 원본(외부 접근 가능)
cbu01.alicdn.com        19
localhost:9000          17   ← 우리가 만든 썸네일·상세페이지
```

자체 생성물은 **로컬 MinIO(`localhost:9000`)** 에 있다. 쿠팡 서버가 가져갈 수 없으므로
`이미지 URL주소로 등록` 경로로는 **원천적으로 불가능**하다. 반드시 **파일 업로드**로 넣어야 한다.

구현 시 CORS 벽이 하나 더 있다: `wing.coupang.com` 콘텐츠 스크립트는 `localhost:9000` 을
직접 `fetch` 할 수 없다. 그래서

1. `manifest.json` `host_permissions` 에 `http://localhost:9000/*` 추가
2. background 가 `fetchImageAsDataUrl` 로 대신 받아 data URL 로 넘김
3. 콘텐츠 스크립트가 `File` + `DataTransfer` 로 `input[type=file]` 에 주입 후 `change` 디스패치

로 우회한다 — **였으나 라이브에서 확인한 결과 background 중계가 불필요했다.**
`wing.coupang.com` 페이지에서 `localhost:9000` 으로의 `fetch` 가 **직접 성공한다**(777KB, image/png).
확인 없이 CORS 를 지레짐작해 중계 경로를 만들었고, 그 마지막 단계(`fetch(dataUrl)`)가
페이지 CSP 에 막혀 이미지가 조용히 실패했다. **직접 fetch 를 1순위로 두고 중계는 폴백으로만 둔다.**

`accept` 에 `image/` 가 있는 file input 중 **0번=대표(single), 1번=추가(multiple)** 다.

### ✅ 해결 — React 가 아니라 Dropzone.js 다. 드롭존에 `drop` 을 쏴야 한다

`change` 가 무시되는 이유가 밝혀졌다. 업로더는 React 가 아니라 **Dropzone.js**(Vue 래퍼)다.

```html
<div id="image-uploader-492" class="customdropzone dz-clickable">
  <div class="dz-message"><div class="dropzone-custom-content">…
```

**핵심: file input 은 드롭존의 자손이 아니다.** Dropzone 은 `clickable` 모드에서
hiddenFileInput 을 `document.body` **직속 자식**으로 만든다. 라이브 확인 — `image/` accept 를
가진 file input 두 개의 `parentElement` 가 전부 `BODY` 였다.

```
input[i=1] chain: BODY.hide-zendesk-widget|files=3 → HTML|files=3
input[i=2] chain: BODY.hide-zendesk-widget|files=3 → HTML|files=3
```

따라서 **input 의 조상을 타고 올라가 드롭존을 찾는 방식은 원리적으로 실패한다**(스코프가 즉시
`BODY` 로 튄다). 드롭존은 클래스로 직접 찾아야 한다.

```js
const zones = [...document.querySelectorAll('.customdropzone, .dropzone')]
  .filter((z) => z.offsetParent !== null);
// 문서 순서 = 0: 대표이미지 / 1: 추가이미지  (라이브 확인, ctx 텍스트로 검증)
for (const t of ['dragenter', 'dragover', 'drop'])
  zones[i].dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
```

라이브 실증(`열쇠고리/키홀더` 카테고리, 로컬 1000×1000 PNG):
`추가이미지 (0/9)` → **(2/9)**, 대표이미지 `+` 플레이스홀더 → 이미지로 교체.

#### ⚠️ 성공 판정에 `blob:` 을 쓰면 안 된다

Dropzone 은 미리보기를 `blob:`/`data:` 로 만들지 않는다. 드롭 즉시 쿠팡 CDN 으로 업로드하고
`//image.coupangcdn.com/image/vendor_inventory/…` 를 `src` 로 넣는다. `blob:` 만 세면
대표이미지는 영영 실패로 잡힌다. **src 가 비어 있지 않은 `img` 수**로 판정한다.
(추가이미지는 `추가이미지 (n/9)` 카운터가 더 강한 신호다.)

드롭 = 즉시 CDN 업로드이므로 판정 대기는 장당 넉넉히(현재 `8s + 4s×장수`).

#### ⚠️ 인덱스가 안 맞으면 차라리 실패시켜라

대표이미지를 추가이미지 칸에 넣는 것은 조용한 오등록이라 실패보다 나쁘다.
다른 인덱스의 드롭존으로 재시도하지 않는다.

구현: `uploadImagesToInput()` — 드롭 1순위, 기존 `change` 방식은 업로더 교체 대비 폴백으로 유지.

> 운영 환경에서 이미지가 외부 접근 가능한 CDN 으로 올라가면 URL 방식도 쓸 수 있다.
> 그때까지는 파일 업로드가 유일한 경로다.

## 5. 판매가·재고 — 일괄입력 버튼

### ⚠️ '확인'을 누르지 마라 — "별점을 선택해주세요" 모달의 진짜 원인

일괄입력은 **버튼 클릭 → 뜬 number 인풋에 값 입력** 이 끝이다. **확인 버튼이 없다.**
라이브 확인: 일괄입력 후 `보이는 확인 버튼 = 0개`.

그런데 페이지에는 **화면에 보이지 않는 '확인' 버튼**이 있다 — 하단 "페이지 별점을 주세요!"
만족도 설문의 확인이다. `btnByText('확인')` 처럼 문서 전역에서 찾으면 **이 버튼이 잡히고**,
누르는 순간 **"별점을 선택해주세요" 모달**이 떠서 오버레이가 이후 작업을 전부 막는다.

```js
// 틀림 — 전역 검색이 별점 설문의 숨은 확인을 누른다 → 모달 무한 반복
setReactValue(input, value); btnByText('확인').click();

// 맞음 — 값만 넣으면 적용된다
setReactValue(input, value);
```

단계별 실행으로 검증한 결과: 브랜드없음·상품명·카테고리·옵션(색상/수량)·일괄입력 버튼 클릭까지
전부 모달이 뜨지 않고, **오직 전역 '확인' 클릭에서만** 발생했다.

> 검증 시 주의: 입력값은 `document.body.innerText` 에 나타나지 않는다(input value).
> `input.value` 로 확인해야 한다. innerText 로 보고 "반영 안 됨"으로 오판한 적이 있다.

행마다 입력칸을 찾지 말고 WING 의 일괄입력 UI 를 쓴다(DOM 변화에 덜 민감).

```
'판매가 일괄입력' 버튼 클릭 → input[type=number] 1개 생성 → 값 입력 → '확인' 클릭
'재고수량 일괄입력' 도 동일
```

구현: `extensions/coupang-ads-scraper/content/wing-registration-fill.js` 의 `bulkFillByButton()`.

## 6. SKU(옵션) 레벨 필드

`GET /tenants/seller-web/v2/vendor-inventory/vendor-inventory-items-with-vendorItems/{vendorInventoryId}`

주요 필드: `itemName`(예 `"혼합 1개 92g"` — 옵션값 조합), `salePrice`, `originalPrice`,
`stockQuantity`, `barcode`, `externalSkuCode`, `outboundShippingHours`, `shippingFee`,
`quantityValueWithUnit`(`"1개"`), `unitPrice{unitPriceAmount, unitPriceUnit}`,
`attributeValues`, `missingRequiredAttributeNames`, `vendorInventoryItemImageDtos`.

참고: 이 상품은 `barcode`·`externalSkuCode` 가 빈 문자열이어도 `status: "APPROVED"` 다.

## 7. 서비스에 없어서 채울 수 없는 것 (TODO)

| 필요한 것 | 왜 필요한가 | 어떻게 채울까 |
|---|---|---|
| **카테고리별 속성 정의 API** | 상품 속성 36개 정확도 | 엔드포인트 미발견. 재리버스 필요(3절) |
| **`categoryId ↔ displayCategoryCode` 매핑** | 고시·인증을 카테고리별로 부르려면 필요 | 매핑 규칙 미확보(2절) |
| **수집상품 ↔ 셀피아 가격 연결** | 가격 정확도 | 가격 데이터 자체는 **이미 있다**(아래 참조). 수집상품과 잇는 키만 확정하면 된다 |

**배송·반품은 이 표에서 빠졌다.** 1절 실측대로 값이 판매자 계정에 이미 설정돼 있고,
9절대로 일괄등록 엑셀 양식에는 해당 컬럼 자체가 없다. 서비스가 보관해야 할 데이터가
아니라 **폼 기본값이 기대값과 같은지 확인만 하면 되는 항목**이다.

**상세페이지 렌더링도 빠졌다.** 0절에서 배선 완료됐다
(`/api/ai/detail-page-image/candidate/{id}` → `resize/uploadV2` → `HTML 작성` 탭).
"대표이미지로 임시 대체" 는 더 이상 사실이 아니다.

### 가격 데이터는 이미 적재돼 있다

`sellpia_inventory_skus` 에 `sale_price`(판매가) · `purchase_price`(원가) 가 채워져 있다.

```
code     name                          sale_price  purchase_price  barcode
10273-1  4000 6구무한클릭딸깍이키링          2200            1090  8806384808087
9866-1   1500원터치딸깍이지우개               830             420  8806384801583
10350-1  3000 2구스핀딸깍이키링              1650             830  8806384809039
```

즉 등록 시 판매가가 0으로 나가는 것은 **데이터가 없어서가 아니라 배선이 없어서**다.

#### 원인 사슬 (전 구간 추적 완료)

1. `apps/server/src/sourcing/application/service/product-basics.presenter.ts:110-111`
   `salePrice`·`originalPrice` 를 **오직 `ProductPreparation.registrationInput` JSON 에서만** 읽는다.
   다른 필드(target·ageGroup·productSize …)는 전부 `str(input.X) ?? str(raw.X)` 로 `candidate.rawData`
   폴백을 갖는데 **가격 두 필드만 폴백이 없다.**
2. 예시 상품은 `product_preparations` 행이 **0건** → `registrationInput = {}` → `salePrice = 0`.
3. `apps/web/.../collected-products/lib/sourcing-api.ts:521` 이 폴백으로 `p.sellPrice` 를 읽지만
   **`SourcingCandidate` 에 `sellPrice` 컬럼이 없다**(`prisma/models/sourcing.prisma:5-57`).
   서버 `getProduct` 는 row 를 스프레드할 뿐이라 항상 `undefined` — **죽은 폴백**이다.
4. `wing-registration-flow.ts:45-46` `b.salePrice || detail.price_krw || 0` → **0** 확정.

#### 고치는 법 — 새 테이블도 새 수집도 필요 없다

`SELLPIA_INVENTORY_SKU_READ_PORT` 가 **이미** 존재하고, 그 read model 이 `purchasePrice`·`salePrice`
를 싣고 있다(`inventory/application/port/in/stock/sellpia-inventory-sku-read.port.ts:12-13,18-40`).
조회 수단도 `findByCodes` / `findByBarcodes` / `findByNormalizedNames` / `search` 4종이 준비돼 있고,
이름 정규화 매칭은 SQL 로 구현돼 있다
(`sellpia-inventory-sku-read.repository.adapter.ts:52-78`, NFKC + 공백 제거 후 매칭).

**sourcing 도메인이 이 포트를 구독하지 않을 뿐이다.** 세션 앞부분에서 advertising 이 analytics 의
ABC 등급을 쓰려고 만든 `SELLPIA_ABC_GRADE_PORT` (cross-domain port + `useExisting` 바인딩)와
**동일한 패턴**을 그대로 적용하면 된다.

작업 순서:
1. sourcing 에 아웃바운드 포트 추가 → 모듈에서 inventory 읽기 어댑터에 `useExisting` 바인딩
2. `product-basics.presenter.ts:110-111` 에 셀피아 폴백 추가
   (preparation 값이 있으면 그것 우선, 없으면 셀피아 SKU 가격)
3. 조인 키는 **바코드 우선, 없으면 정규화 이름**. 예시 상품은 이름이 완전 일치한다
4. `sourcing-api.ts:521` 의 죽은 `p.sellPrice` 폴백 제거

#### 곁다리로 알아낸 것

- 이름 접두 숫자(`4000`과일바구니…)는 판매가가 아니라 **소비자가(정가)** 로 보인다.
  1969행 중 1202행(61%)이 3~5자리 숫자로 시작하고, `4000…` → 판매가 2200 / 원가 1260 이다.
  `originalPrice`(정가) 후보로 쓸 수 있으나 **파싱 규칙이 코드에 없고 39%는 접두 숫자가 없다.**
- 2차 소스 `SellpiaProductMonthlySales`(`salePrice`/`buyPrice`, 19,712행)도 값이 1차와 일치한다.
  `providerName`(매입처)까지 있어 메타는 더 풍부하다.
- `ChannelListingOption.salePrice` 는 2241행 중 88행(3.9%)만 채워져 있어 **가격 소스로 쓰면 안 된다.**
- `MasterProduct` 는 셀피아 코드 체계를 그대로 쓰지만 **가격 컬럼이 아예 없다.**

## 8. 이미 구현된 것

- 카테고리 추론: `apps/server/src/products/domain/coupang-category-inference.ts`
  기존 리스팅 코퍼스 기반 **k-NN 투표**(상위 10 이웃, 점수 가중). leave-one-out 실측 n=300:
  판정 정확도 59.9% / high 74.7%.

  **표기 차이가 핵심 함정이다.** 셀피아 상품명은 붙여쓰기(`4000과일바구니딸깍이키링`),
  쿠팡 노출상품명은 띄어쓰기 + 수식어(`4구 스핀 딸깍이 키링 1p 휴대용 열쇠고리 …`)다.
  토큰 겹침이 **0** 이 되므로 bigram 겹침이 단독으로 판정할 수 있어야 하고,
  길이 차이 벌점을 피하려면 Dice 가 아니라 **겹침 계수(shared / min)** 를 써야 한다.
  (Dice 로는 같은 품목도 0.06 까지 뭉개졌다.)

  **어떤 임계값도 무인 자동등록에는 부족하다.** 대신 확장이 폼만 채우고 제출은 사람이
  하므로, high·medium 은 초안으로 채우고 low/추론실패만 막는다.
- 추론 API: `POST /api/categories/coupang-suggestions`
- 물총 프리셋 고정 제거: `wing-registration-flow.ts` 가 상품별 카테고리를 주입하고,
  확신이 낮으면 등록을 **차단**한다(임의 카테고리로 대체하지 않음)
- 판매가·재고 일괄입력 + 브랜드 모순 수정: 확장 1.2.39

## 9. 일괄등록 엑셀 양식 (V4.6) — 실측 레이아웃

원본: `apps/web/public/coupang-wing-bulk-template-v4.6.xlsm`.
아래는 그 파일을 직접 파싱한 결과다. **추정하지 말고 이 표를 기준으로 컬럼을 다뤄라.**

시트 6개: `기본`(117컬럼, 실제 등록 대상) / `1. 패션잡화` `2. 식품` `3. 가전`(예시) /
`hidden`(드롭다운 원본) / `env`.
`기본` 시트는 헤더 4행 구조다 — 1행 그룹명, 2행 컬럼명, 3행 필수·선택, 4행 설명.
**데이터행은 0건**이므로 예제행 기본값이 지워질 걱정은 없다.

### ★★ 배송·반품 컬럼은 아예 없다

117컬럼 전수 확인 결과 **출고지·반품지·택배사·배송비·무료배송기준·반품배송비 컬럼이 하나도 없다.**
`구성 정보` 그룹에서 배송과 관련된 유일한 컬럼은 `출고리드타임`(65) 하나뿐이다.

→ `wing-registration-excel.ts:6` 의 "출고지/반품지/택배사는 업로드 폼에서 1회 설정하므로
엑셀 행에는 넣지 않는다" 는 **가정이 아니라 양식이 강제하는 사실**이다. 이 전제를 의심하거나
배송/반품용 컬럼을 찾으려 하지 마라 — 없다.

### 주요 컬럼 (0-based)

| idx | 컬럼명 | 구분 | 비고 |
|---:|---|---|---|
| 1 | 등록상품명 | 필수 | 설명 원문: "판매자가 자유롭게 입력… **발주서에서만 사용**. 쿠팡은 쿠팡 기준에 맞춰 변경한 노출상품명으로 표시" → 노출상품명 컬럼은 **양식에 없다** |
| 6 | 브랜드 | 필수 | 한글20/영문25. 예시 `제조사≠브랜드: 글라스락(브랜드)/삼광유리(제조사) > 글라스락 입력` |
| 7 | 제조사 | 필수 | 한글20/영문25. `※ 제조사를 알 수 없으면 브랜드를 입력하세요` |
| 8 | 검색어 | 선택 | **`"/" 구분`**, 개당 한글20/영문25, 최대 20개. 예시 `가을/UV차단/생활방수/…` |
| 9~20 | 옵션유형·값 1~6 | 선택/필수 | 구매옵션 6쌍 |
| 21~60 | 검색옵션유형·값 1~20 | 선택/필수 | = 폼의 **상품 속성**(3절) |
| 61 | 판매가격 | 필수 | |
| 63 | 할인율기준가 | 필수 | = 폼의 **정상가**. 최소 10원 단위 |
| 64 | 재고수량 | 필수 | |
| **65** | **출고리드타임** | **필수** | 1~99. "익일 출고면 1" |
| 68·69·70·71 | 성인상품·과세여부·병행수입·해외구매대행 | 선택(기본값) | 미기입 시 기본값 자동 적용 |
| 74 | 바코드 | 선택/필수 | 없으면 `hidden` 시트의 사유 5종 중 하나 |
| **75~86** | **인증∙신고 등 정보** | **선택/필수** | 유형·값·사전승낙서·인증마크 **4칸 × 3블록**. 반품 컬럼이 아니다 |
| 87 | 주문 추가메시지 | 선택 | |
| 88 | 상품고시정보 카테고리 | 필수 | 양식 예시가 **`기타 재화`** |
| 89~102 | 상품고시정보값 1~14 | 선택/필수 | |
| 103·104·105 | 대표(옵션)이미지·대표(직사각형)·추가이미지 | 필수·선택·선택 | 103 설명이 **URL 기재 / 업로드 후 파일명 기재 2가지**를 안내 |
| 106·107·108 | 상태이미지(중고)·중복 이미지·이미지 퀄리티 | 선택 | |
| **109** | **상세 설명** | **필수** | 설명은 **파일명 기재 방식만** 안내한다(103 과 달리 URL 방식 언급 없음) |
| 110~116 | 구비서류값 1~7 | 선택/필수 | |

### `hidden` 시트 = 드롭다운 허용값 원본

카테고리 그룹별로 같은 열거가 반복된다. 자동화가 쓸 수 있는 것:

- **인증∙신고 등 정보유형** 13종(일부 그룹은 23~25종).
  첫 값이 `인증대상아님`(그룹에 따라 `인증∙신고 등 대상아님`).
  나머지는 `상세정보별도표기`, `KC인증 어린이제품 안전인증/안전확인/공급자적합성확인`,
  `KC인증 생활용품 …`, `방송통신기자재 적합성 평가 대상` 등.
- **바코드없음 사유** 5종 — `[바코드없음]온라인 판매를 위한 소규모 제작 상품임`,
  `…주문 제작으로 유통하는 상품임`, `…색상이 다르지만 바코드가 동일한 상품임`,
  `…국내외 표준 바코드가 아닌 상품임`, `…제조사에서 바코드를 제공 받지 못함`.
  ⚠️ 코드의 `DEFAULT_NO_BARCODE_REASON`
  (`[바코드없음]온라인 판매를 위한 소규모 상품(자가제작 등)이며, 향후에도 대량 유통 계획이 없습니다.`)
  는 **이 5종 어디에도 없는 문자열**이다.
- **색상계열** 17종, 사이즈·패턴·소재·핏·스타일 열거(3절).
- `Y`/`N` 열거 — 성인상품·과세·병행수입 컬럼용.
