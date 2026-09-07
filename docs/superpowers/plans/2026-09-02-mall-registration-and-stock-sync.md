# 사방넷 상품등록·품절 로직 → KidItem 이식 설계서

작성일 2026-09-02 · 대상 브랜치 `develop` · 근거: 사방넷 공식 매뉴얼 원문 + 몰별 개발자 문서 실측 + KidItem 코드베이스 실사

---

## 1. 사방넷 상품등록 로직 — 전체 흐름

### 1-0. 한 장 요약

```
[A. 선행조건 — 4개 전부 없으면 송신 화면 자체가 안 뜬다]
  ① 쇼핑몰 판매자 계정 등록      [계정관리 > 쇼핑몰관리(국내/해외)] Set-Up
  ② 사방넷 상품(품번) 등록        [상품관리 > 사방넷상품신규등록]
  ③ 쇼핑몰 부가정보(필수)+카테고리(선택)  [쇼핑몰관리 > 쇼핑몰부가정보 / 쇼핑몰카테고리]
  ④ 사방넷 클라이언트 설치 + 팝업 차단 해제   (Windows 전용 로컬 프로그램)
        │
        ├─ ②' 속성정보(상품정보고시)는 ②가 끝난 뒤에만 입력 가능 ← 신규 등록 최대 함정
        │
        ▼
[B. 등록송신 — 1회 = 상품 N × 쇼핑몰 1 × 쇼핑몰ID 1]
  1 상품 검색 (기본 필터: 상품상태 '공급중')
  2 상품 선택 (인라인으로 상품명·브랜드명·판매가 수정 가능)
  3 쇼핑몰 선택
  4 [상품등록송신]  ← 실행 아님. 설정 팝업을 여는 버튼
  5 쇼핑몰 ID 선택
  6 부가정보(필수) / 카테고리(선택: 쇼핑몰·표준·마이) / 부가정보Ⅱ / 쇼핑몰별 정보 선택
  7 [즉시송신]  ─────► 로컬 클라이언트 + 팝업창 경유로 몰 SCM 에 전송
     또는 [예약송신저장] ─► [쇼핑몰예약등록관리] 에서 사람이 [상품등록송신] 을 눌러야 발사
        │
        ▼
[C. 결과 확인 — 성공 판정의 단일 진실은 '처리완료' 가 아니다]
  성공: [쇼핑몰관리 > 쇼핑몰상품수정] 에서 생성구분 '연동생성' 으로 조회
  실패: [쇼핑몰관리 > 쇼핑몰상품등록(실패)] 에 Message(자유 텍스트) 와 함께 적재
  무음: 팝업을 닫거나 클라이언트 오류로 중단 → 실패로도 안 잡힘
        │
        ▼
[D. 실패 처리]
  실패 큐에서 사유 확인 → 상품 수정 → 선택 → [실패상품등록송신]
  단, 송신구분이 '실패' / '대기' 두 종류 (대기 = 그냥 미발송, 고칠 것 없음)
```

### 1-1. A. 선행조건 (원문)

> "사방넷을 통해 쇼핑몰 연동 작업을 하기 전 반드시 해당 쇼핑몰의 판매자 계정 정보를 세팅 및 클라이언트를 설치 해주셔야 합니다.
> 1 [계정관리>쇼핑몰관리(국내/해외)] 메뉴에서 쇼핑몰 계정 정보 등록
> 2 [상품관리 > 사방넷상품신규등록] 메뉴에서 사방넷 상품 등록
> 3 [쇼핑몰관리 > 쇼핑몰 부가정보, 카테고리 등록] 메뉴에서 쇼핑몰 별로 부가정보 및 카테고리 등록
> 4 사방넷 클라이언트 설치"
> — HASH 22ef084ce42a59d5

부가정보는 필수, 쇼핑몰카테고리코드는 선택이다(교차검증 CONFIRMED).

> "⚠️ 사방넷 상품이 등록되어 있어야 하며, 쇼핑몰 부가정보도 필수로 있어야 합니다."
> "📌 쇼핑몰 카테고리코드는 필수항목이 아닙니다"
> "📌 쇼핑몰 부가정보와 쇼핑몰 카테고리를 모두 사용하는 경우 상품 등록 및 수정 송신 시 쇼핑몰 카테고리코드의 카테고리 정보가 우선 적용됩니다."

부가정보의 운영 제약 세 가지가 그대로 사방넷의 병목이다.

> "📌 부가정보는 대량 등록이 불가하며, 일부 항목에 한하여 대량 수정이 가능합니다. 부가정보는 삭제가 불가하며, 사용하지 않는 부가정보는 사용여부를 '미사용' 처리합니다."
> "💡 쇼핑몰 ID 별로 등록을 진행합니다."

그리고 품번(상품) 안에 넣은 배송비·카테고리는 몰로 안 나간다.

> "사방넷 상품(품번) 내 배송비, 배송구분은 사방넷 내부 관리용으로 등록하는 정보이며, 쇼핑몰에 연동되지 않습니다."

환경 선행조건은 순수 서버-투-서버가 아니다.

> "쇼핑몰에 상품을 등록하거나 주문 수집을 하기 전 설치해야 하는 프로그램이 있나요? → 사방넷 클라이언트를 설치해주셔야 합니다."
> "쇼핑몰 상품 등록, 수정 또는 주문 수집 작업 시 실행 창이 열리지 않습니다. → 사용 중인 브라우저의 팝업 차단 해제 여부를 확인해주셔야 합니다."

설치 안내가 전부 Windows Defender / SmartScreen / Chrome·Edge·Whale 기준이고 macOS 언급이 문서 전체에 없다.

### 1-2. A'. 상품정보고시 — 신규 등록의 구조적 함정

> "📌 속성정보(상품정보고시)는 상품 등록 후 입력할 수 있습니다. 미등록 시 쇼핑몰에 상품 전송이 실패될 수 있습니다"
> "속성정보(상품정보고시)는 상품 신규등록 시 설정이 불가합니다. 상품등록 후 [상품관리 > 사방넷상품조회수정] 메뉴에서 설정이 가능합니다."
> "■ 자사몰을 제외한 일반 쇼핑몰은 속성 정보 입력이 필수입니다."

즉 "필수인데 등록 화면에서 못 넣는다". 몰별로 다른 고시가 필요하면 조건이 하나 더 붙는다: **속성정보가 2개 이상 등록된 상품**에서만 [쇼핑몰별 속성설정] 이 열린다. 대량은 [쇼핑몰관리 > 쇼핑몰별별도정보관리] 의 [샘플파일] → [대량등록] 이며 "쇼핑몰별로 샘플파일을 업로드합니다".

### 1-3. B. 등록송신 (원문 7단계, 교차검증 CONFIRMED)

> "1 쇼핑몰로 등록할 상품을 검색합니다. / 2 송신할 상품을 선택합니다. / 3 상품을 등록할 쇼핑몰을 선택합니다. / 4 상품등록송신 버튼을 클릭합니다. / 5 쇼핑몰 ID를 선택해 상품이 등록될 쇼핑몰 계정을 선택합니다. / 6 부가정보, 카테고리(선택) 코드를 선택합니다. / 7 즉시송신 버튼을 클릭합니다."

핵심 제약 5가지.

| 제약 | 원문 |
|---|---|
| 기본 검색이 '공급중'만 | "💡 상품상태가 '공급중'인 상품이 검색되며, 공급중 외 상품의 경우 선택사항Ⅰ의 상품상태를 선택하여 검색합니다." |
| 다중 몰 동시 송신 불가 | 공식 우회로가 "쇼핑몰별로 1 ~ 3 작업 반복 → [쇼핑몰예약등록관리] 에서 일괄 실행" |
| 예약은 스케줄러가 아니라 수동 큐 | "💡 예약작업은 [쇼핑몰관리>쇼핑몰상품등록] 메뉴에서 생성합니다." + 실행은 사람이 [상품등록송신] 클릭 |
| 예약 저장 시점 값이 박제됨 | "📌 … [예약송신저장] 후, 상품명, 판매가, 브랜드 등의 정보를 변경한 경우, 이미 저장된 예약 작업 내역에는 변경한 내용이 적용되지 않으므로 주의합니다." |
| 신규 등록송신은 자동화 대상 아님 | 자동화서비스Ⅱ 정의에 "상품판매상태(품절) 자동 송신, 옵션정보(재고) 자동 송신, 상품정보 자동 수정" 만 있고 등록송신 없음 |

중복 방지 가드는 '미등록 상품 검색' 모드 안에서만 동작한다.

> "💡 쇼핑몰 미등록 상품 검색 시, 쇼핑몰에 상품 등록된 기록이 있거나 매핑된 정보가 있는 상품은 선택 체크박스 선택이 불가합니다"

### 1-4. C. 결과 확인 — '처리완료'는 성공이 아니다

> "◾등록 송신 성공 : [쇼핑몰관리 > 쇼핑몰상품수정] 메뉴에서 '연동생성'으로 조회됩니다.
> ◾등록 송신 실패 : [쇼핑몰관리 > 쇼핑몰상품등록(실패)] 메뉴에서 실패 내역으로 조회됩니다."

> "📌 상품등록송신시 실제 등록 성공 여부와 상관없이 '처리완료'로 변경됩니다."

그리고 실패로도 안 잡히는 무음 실패가 존재한다(원문은 수정송신 절에 4회 반복, 등록송신 동일 적용 여부는 미확인).

> "💡 수정 전송 중에 팝업 창을 닫거나 클라이언트 오류로 인해 전송이 중단된 경우 실패로 확인되지 않으며, 마지막으로 전송 시도한 상품명과 판매가가 화면에 저장됩니다."

### 1-5. D. 실패 처리 — 함정 3종

에러 코드 체계는 **없다**. 실패 사유는 `Message` 자유 텍스트 한 칸 + 색상 3단계뿐이다.

> "Message 상품 연동 실패에 대한 메세지 - 회색: 등록 송신 이후 수정 송신된 이력이 없는 상품 - 파란색: 수정 송신된 이력이 있으며 송신 성공된 상품 - 빨간색: 수정 송신된 이력이 있으며 송신 실패된 상품으로, 실패 사유 노출"

| 함정 | 원문 | 결과 |
|---|---|---|
| 재전송이 멱등하지 않음 | "📌 같은 상품을 여러 번 재송신하는 경우 상품이 중복으로 등록될 수 있습니다." | 몰에 쌍둥이 상품 |
| 실패 목록이 '송신값' 기준 | "기본적으로 마지막으로 송신한 '상품명(송신)'과 '판매가(송신)' 항목으로 설정되어 있어 … 검색조건을 설정 하여 검색해야 합니다." | 고쳤는데 옛 값으로 재송신 → 같은 사유로 재실패 |
| 유령 실패 | "[GS Shop,] [패션플러스]와 같은 특정 쇼핑몰의 경우, 쇼핑몰 SCM 속도가 느려서 쇼핑몰에는 상품이 등록이 되었지만 발급된 쇼핑몰 상품코드를 조회하지 못해 사방넷에는 실패되는 경우가 발생합니다." / 복구는 "온라인 문의로 상품코드 매칭을 요청합니다." | 재송신하면 진짜 중복. 셀프 복구 경로 없음 |

즉 사방넷의 실패 판정 기준은 "몰이 등록 성공 응답을 줬는가"가 아니라 **"발급된 쇼핑몰 상품코드를 회수했는가"** 다.

기타 조용한 실패 요인: 옵션제목/옵션상세명칭에 문자열 `단품` 이 들어가면 옵션 없는 상품으로 인식되고, "한국어, 영어를 제외한 다국적어(ex. 중국어, 한자, 일본어 등) 또는 일부 특수기호는 인코딩 문제로 인해 정보 등록, 수정, 수집에 오류가 발생할 수 있습니다".

---

## 2. 사방넷 품절·재고 로직

메뉴가 3개로 쪼개져 있고, 각각 다루는 단위와 되돌릴 수 있는 정도가 다르다.

| 메뉴 | 단위 | 방향 | 되돌리기 |
|---|---|---|---|
| [쇼핑몰상품품절] | 상품 전체 | 내리기만 | 해제 버튼 없음 |
| [쇼핑몰상품수정] > 상품상태 | 상품 | 양방향(공급중/일시중지/완전품절) | 수동만 |
| [쇼핑몰옵션송신] / [쇼핑몰상품수정] > 옵션재고 | 옵션 | 재고 수량 | 부작용 있음 |

### 2-1. 품절 송신 (내리기)

버튼은 [완전품절송신] / [일시중지송신] 둘뿐이고 문서상 설명 문구는 같다.

> "-일시중지송신 : 쇼핑몰에 등록된 상품이 품절 상태로 변경됩니다."
> "-완전품절송신 : 쇼핑몰에 등록된 상품이 품절 상태로 변경됩니다. ESM옥션, ESM지마켓, 11번가, 인터파크, 고도몰 쇼핑몰은 상품이 영구 삭제될 수 있으므로 주의합니다."

**⚠️ 파괴적 #1 — 완전품절송신은 5개 몰에서 상품 영구삭제다.**

> "💡 상품의 영구 삭제기능이 있는 ESM옥션, ESM지마켓, 11번가, 인터파크, 고도몰의 경우 사방넷 [완전품절] 상태로 전송 시에 쇼핑몰에서 영구삭제 됩니다"
> "※ 단, 11번가가 '단일상품'인 경우 완전품절로 전송하더라도 쇼핑몰에서 상품이 삭제되지 않습니다."

대상 검색 조건도 함정이다.

> "- 상품품절일 기준 : 사방넷 상품 상태를 일시중지, 완전품절, 삭제, 자료없음, 미사용으로 변경한 상품이 검색됩니다. 단, 상품상태(송신)이 '대기중'인 상품은 검색이 불가합니다."
> "📌 쇼핑몰에 상품 상태를 품절로만 전송할 수 있으며, 옵션의 공급 상태는 수정이 불가합니다."

처리상태는 처리대기 / 품절성공 / 품절실패 3값.

### 2-2. 품절 해제 (되살리기) — 전용 메뉴가 없다

해제 경로는 [쇼핑몰관리 > 쇼핑몰상품수정] > 상품수정송신 팝업에서 판매상태를 '공급중'으로 골라 [즉시송신] 하는 것 하나뿐이다. 문서 전체를 '재판매/판매재개/품절해제'로 검색해도 절차 문서가 없다.

**⚠️ 파괴적 #2(비대칭) — 자동화서비스Ⅱ는 품절 해제를 아예 못 한다.**

> "판매상태(품절) 전송 - 판매상태(품절) 전송 가능 조건 : 최종 상품송신 상태(상품상태(송신))이 '공급중'인 경우만 가능 - [ 일시중지, 완전품절 → 공급중]은 자동화로 송신 불가"

다만 신형 [스케줄러] 도해에는 `공급중 → 공급중` 이 송신 가능으로 표기돼 두 문서가 어긋난다(confidence: medium, 라이브 검증 필요).

### 2-3. 옵션재고 송신

경로 2개: [쇼핑몰옵션송신] > [옵션정보송신], [쇼핑몰상품수정] > 상품수정송신 팝업의 '3. 옵션재고'(드롭다운 기본값 `기본옵션+추가상품`).

**⚠️ 파괴적 #3 — 옵션재고만 보내려 해도 판매가가 덮어써진다.**

> "📌 옵션정보송신 시 판매가(송신)의 판매가가 사방넷 품번 내 판매가로 변경됩니다. 단, 쇼핑몰별 판매가가 있는 상품의 경우 입력된 쇼핑몰 판매가로 변경됩니다."

**⚠️ 파괴적 #4 — 옵션 전용 메뉴가 없는 몰에서는 일반항목 전체가 함께 전송된다.**

> "5. 옵션정보를 별도로 관리하는 메뉴가 없는 쇼핑몰의 경우 옵션정보 외 일반항목 정보가 모두 전송됩니다."

그 외 팝업 명시 제약: 종합몰은 옵션정보 불일치 시 미반영 / 옵션 추가등록 가능 몰은 다르게 인식된 옵션이 **신규 옵션으로 추가 등록** / [기본옵션]·[추가상품] 분리 전송은 11번가·ESM옥션·ESM지마켓·스마트스토어만 / API 몰은 상태만 또는 수량만 반영.

또한 "일부 옵션만 선택하여 전송 시 해당 품번코드의 전체 옵션이 전송됩니다", 옵션 없는 단품은 옵션송신 메뉴 자체를 못 쓴다.

### 2-4. 어떤 재고가 나가는가

기본은 가상재고다.

> "사방넷에서 쇼핑몰로 상품 송신 시 단품(옵션)의 가상재고 수량을 송신하는 것이 기본으로 설정 되어 있으나 [기본정보 > 운영환경설정관리] 메뉴에서 쇼핑몰에 반영되는 재고 설정할 수 있습니다."

현재고 자동 차감은 조건이 둘이고, 차감 시점은 송장송신이 아니라 출고 확정이다.

> "재고 관리하는 상품의 재고 차감은 운송장 송신 단계가 아닌 출고 확정 단계(출고 완료)에서 재고 차감이 됩니다."

또한 "쇼핑몰별 재고분할 기능은 쇼핑몰 상품 등록 송신 시 적용되지 않으며, 옵션 재고 수정 송신시 반영 됩니다."

### 2-5. 되돌릴 수 없는 동작 총목록

| # | 동작 | 결과 |
|---|---|---|
| **1** | **완전품절송신 (ESM옥션·ESM지마켓·11번가·인터파크·고도몰)** | **몰에서 상품 영구삭제** |
| **2** | **사방넷 상품 삭제 후 7일 경과** | **영구삭제, 연동내역 전부 소멸, 복구 불가** |
| **3** | **[쇼핑몰상품수정] 연동/매핑 이력 [선택삭제]** | **"삭제한 내역은 복구가 불가"** — 몰의 실제 상품은 남아 중복 유발 |
| **4** | **재고 초기화** | **"부분 초기화는 불가" / "초기화된 재고는 복구가 불가능합니다"** |
| **5** | **출고 확정 / 입·출고 전표 확정** | **"한 번 '출고확정'된 주문건은 상태 변경이 불가능"** |
| **6** | **옵션 전체 삭제 체크 후 저장** | **세트Ⅱ·모음전 연결, EA·가상재고·옵션별칭·Location 전부 삭제** |

---

## 3. 몰별 등록·품절 방식 매트릭스

난이도 기준 — **하**: 공식 API + 품절/해제 대칭 명문 / **중**: API 있으나 함정 또는 스펙 비공개 / **상**: 어드민 폼·엑셀 리버스 / **?**: 계정 없어 판정 불가.

### 3-A. 공식 API 가 있는 몰 (문서로 엔드포인트 확인됨)

| 몰 | 인증정보 | 상품등록 | 품절·재고 | 품절해제 | 난이도 |
|---|---|---|---|---|---|
| **토스쇼핑** | clientId/Secret → OAuth2 Bearer(scope `toss-shopping-fep:write`) | `POST /api/v3/shopping-fep/products/v2` (옵션 최대 300) | `PUT /product-items/{id}/stocks/normal-stock/remaining-count` | **동일 엔드포인트 완전 대칭.** 원문: "재고 수량을 0으로 설정하면 품절 처리됩니다. 품절 상태의 상품의 재고 수량을 1 이상으로 설정하면 품절 취소됩니다." 초당 30건 | 하 |
| **롯데온** | OpenAPI 키(스토어센터 발급, 1년) + IP 화이트리스트 + 거래처그룹코드 | `POST /v1/openapi/product/v1/product/registration/request` (`spdLst` 배열 = 대량) | `POST .../item/stock/change` (`itmStkLst` 배열) | **`POST .../product/status/change` 의 `slStatCd` = SALE/SOUT/END. 공식 샘플이 한 요청에 SOUT+SALE 동시** → 완전 대칭. 단품 단위 `item/status/change` 도 동일 | 하 |
| **쿠팡** | vendorId + Access/Secret(HMAC) | `POST /v2/.../marketplace/seller-products` (1콜 1상품, items 최대 200옵션) | 승인완료 후 재고는 `PUT .../vendor-items/{vendorItemId}/quantities/{quantity}` (옵션당 1콜) | **`PUT .../sales/stop` ↔ `PUT .../sales/resume` 완전 대칭(둘 다 body 없음).** 예외: 쿠팡 모니터링으로 내려간 상품은 재개 실패 | 하 |
| **카카오 톡스토어** | 2키 동시 — `Authorization: KakaoAK {대행사 ADMIN}` + `Target-Authorization: KakaoAK {판매자 REST}` + `channel-ids: 101` | `POST /v1/store/product/register` | 옵션 `POST /v1/store/product/option/update` (조합형 `Combinations.stockQuantity` 0~9999) | **재고 0=품절 / 1이상=해제. 별도로 `POST /v1/store/product/update?saleStatus=on\|off` 명시 대칭.** ⚠️ 수정 시 전체 필드 재전송 필수(누락=삭제) | 중 |
| **SSG(신세계)** | 업체 인증키 → `Authorization` 헤더 + IP 등록 | `POST /item/{version}/online` (1콜 1상품) | `POST /item/{version}/online/{itemId}/sales-status` — `usablInvQty` + `optionInventories[].sellStatCd` | 같은 API 에 `sellStatCd=20`(판매중) + 재고>0 으로 복귀 = 대칭. 제약: 85(판매금지)로는 변경 불가, 승인전 상품은 20 불가. ⚠️ 구버전 API 2026-03-31 종료 | 중 |
| **지마켓·옥션(ESM)** | ESM 마스터 계정 발급 토큰(승인제, etapihelp@gmail.com) | `POST https://sa2.esmplus.com/item/v1/goods` — **1콜로 G마켓+옥션 동시 등록** | `PUT .../goods/{goodsNo}/stock` (⚠️ **옵션 상품 재고 수정 불가, 범위 1~99,999 로 0 입력 불가**) | 상품 `PUT .../sell-status` 의 `isSell.gmkt/.iac` boolean 대칭. 옵션은 `recommended-options` 의 `isSoldOut` boolean(true=품절/false=판매) 대칭 | 중 |
| **스마트스토어** | 커머스API 앱 ID/시크릿 → OAuth2 | `POST /v2/products` | ⚠️ **재고 전용 API 없음**(네이버 공식: "현재 재고 수량(stockQuantity)만 수정하는 API는 제공되고 있지 않습니다"). `PUT /v2/products/channel-products/{no}` 전체 재전송 | 경로는 대칭이나 양방향 모두 전체 페이로드. ⚠️ 상태 변경 시에도 현행 규격 검증 → 과거 상품이 400 으로 막힘. **2 RPS 고정, 상향 불가** | 중 |
| **떠리몰(샵바이)** | 파트너 어드민 ID/PW + `systemKey` + Bearer(또는 레거시 mallKey) | `POST /products` / 벌크 `PATCH /products/partial/quick`(최대 100) | `PUT /products/options/stock-with-management-code` 등(요청당 100건) | `PUT /products/partial` — `soldout` 은 "TRUE일 경우만 품절처리"(단방향)지만 **옵션 `forcedSoldOut` 이 true/false 양방향**, `saleStatusType` READY↔STOP 대칭. **⚠️ PROHIBITION 은 비가역 — 자동화에서 절대 금지** | 중 |
| **11번가** | `openapikey` 헤더 + **호출 IP 사전 등록 필수** | 셀러 API 존재 확정("판매자의 경우 셀러 API를 등록 하셔야 상품 등록부터 … 모든 기능을 사용"), **엔드포인트는 로그인 후 개발가이드에서만 확인 가능 → 미확정** | 화면 대안: 셀러오피스 상품정보 대량 수정 엑셀(판매가·옵션가·**옵션 재고수량** 포함, 1회 500건) | 상품 > 쇼핑몰 상품관리에 [재판매] 버튼 존재(셀링툴 벤더 문서 기준, 11번가 1차 문서 미확인). 자동 품절 상품은 판매수량 수정이 선행되어야 함 | 중 |
| **보리보리·하프클럽(TRICYCLE)** | SCM ID/PW + **휴대폰 2단계 인증** + 협력사코드 + API 인증키(담당 MD 발급) | 협력사 API 존재(키 발급 경로 확인), **엔드포인트·스펙 비공개** | "상품 수정시 재고수량 0개인 경우 품절상품으로 등록됩니다" | 재고 양수 재전송으로 복귀 추정, **명시 근거 없음 — 확인 안 됨** | 중 |
| *아트공구(카페24)* | 공급사 ID/PW. **API 는 몰 운영자의 앱 OAuth 발급 필요 → 공급사 단독 불가** | 실질은 상품 엑셀(CSV 필수) | 상품 엑셀 관리 > '재고 정보 수정' 엑셀 | **`quantity`/`display`/`selling` 이 독립 필드라 수량 한 축으로 양방향.** ⚠️ '품절표시 사용' 체크 안 하면 재고 0 이어도 품절 처리 안 됨 | 중 |

### 3-B. 공식 API 가 없는 몰 (어드민 폼 / 엑셀 리버스)

| 몰 | 인증정보 | 상품등록 | 품절·재고 | 품절해제 | 난이도 |
|---|---|---|---|---|---|
| **키즈노트(WISA 스마트윙)** | 입점사 관리자 ID/PW (`site_code=20210701-c36e19486f`) | 상품일괄등록 엑셀(**upsert**: 고유번호 있으면 수정) — 상품 엑셀에 재고 컬럼 없음 | 재고관리 > 재고 조정 / **일괄재고 조정(재고조사표.xls, 조정사유 필수)**. 품절방식 3종: 무제한/한정/강제품절 | **가장 깨끗한 대칭.** 상품조회 목록에서 상태(정상/품절/숨김)를 직접 고쳐 [가격/적립금/상태 수정] 버튼으로 일괄 적용 = 동일 폼·동일 버튼 양방향 | 상(낮음) |
| **해법몰 지니마켓** | 입점업체 관리자 ID/PW (`/mall/admin_login.php`) | `prd_input2.php?mode=insert` → `prd_save.php` / **엑셀 `prd_excel_up.php`** — 양식에 "상품진열 : 진열함 = Y, 진열안함 = N", "품절여부 : 품절상품 = Y, 무제한 = N, 수량 = S" → **등록·재고·품절 한 장으로** | `prd_shortage.php` (재고상태 전체/품절/부족/여유, 안전재고) | ⚠️ **`prd_change_status.php` 셀렉트가 P(일시품절)/B(보류) 뿐 — 되돌리는 값 없음(비대칭).** 실무 대칭 스위치는 `prd_change_exposure.php` 의 Y↔N + 엑셀 품절여부 N/S | 상(낮음) |
| **티처몰(퍼스트몰)** | selleradmin ID/PW | `/selleradmin/goods/regist`(307), `/goods/excel_upload`(307) 실재 — 용도(신규/수정) 미확정 | 재고·품절 전용 라우트 없음 → 등록·수정 폼 내 처리 | 판매상태 정상/품절/판매중지/재고확보중. ⚠️ **'정보수정'으로 처리하면 "미승인 + 판매중지 + 미노출"로 역행** → 판매상태 단독 변경 경로여야 함 | 상 |
| **온채널(공급사)** | 공급사 승인 계정 ID/PW | [마이페이지 > 공급사정보 > 상품 대량 등록] 엑셀(재고 컬럼, 옵션 2개↑는 `;` 구분) | "상품 전체 옵션 품절, 일시품절, 단종은 해당상품의 [판매설정] 버튼 클릭 후 요청" | 같은 [판매설정]에서 되돌리는 UI 대칭. ⚠️ **관리자 승인 개입 → 즉시 반영 보장 없음.** ⚠️ "재고 자동 차감 시스템은 아니다"(공식) | 상 |
| **꼬망세(EduPre)** | 입점 관리자 ID/PW (`userType=com`) | `_product.form.php` 단일 폼(502=핸들러 존재) — **엑셀 핸들러 404** | **재고/품절 전용 핸들러 전부 404** → 등록 폼 또는 목록 내 처리 | 전용 상태 전이 엔드포인트 없음 → 등록 폼 역방향 추정, 미검증 | 상 |
| **올웨이즈** | 판매자센터 ID/PW | 공식 대량 경로가 **사방넷 / 플레이오토 두 솔루션뿐**("올웨이즈는 사방넷과 플레이오토 두가지 상품 대량 등록을 지원합니다") | 사방넷 기능표상 품절처리 O (비공개 파트너 채널 존재 정황) | 근거 없음 — 확인 안 됨 | 상 |
| **GS샵** | 파트너스 ID/PW | 파트너스 SPA — 화면 `/product/products/create/`, BFF `/bff/product/products` | 화면 `/product/prd-bulk-modify/`, BFF `/bff/product/query/sale-state-and-quantities/init` | 미확인 | 상 |
| **베네피아** | 벤더 어드민 ID/PW | 미확인. ⚠️ 등록 단계에서 국표원·환경부·식약처 **위해상품 정보 검증** → 어린이제품 KC 미비 시 반려 가능성 최대 | 미확인 | 미확인 | ? |
| **아이스크림몰(X2BEE PO)** | PO 판매자 ID/PW | 미확인(전 경로 302, istio-envoy) | 미확인 | 미확인 | ? |
| **키드키즈** | 파트너 ID/PW | 미확인(전 경로 302, euc-kr) | 미확인 | 미확인 | ? |
| **웅진클래스몰 / 윤선생 / 원폴라리스** | 미확인 | **몰 실체·도메인 자체가 미확정** | — | — | ? |

### 3-C. 이 매트릭스가 설계에 강제하는 것

1. **품절 명령이 몰마다 다른 축을 탄다.** 재고 수량축(토스·쿠팡·카카오·SSG·카페24), boolean 상태축(ESM·롯데온·떠리몰), 승인 요청축(온채널), 엑셀 컬럼축(해법몰·키즈노트). 하나의 "품절" 명령을 어댑터가 자기 축으로 번역해야 한다.
2. **해제가 대칭인 몰과 아닌 몰이 명확히 갈린다.** 해법몰 상태 팝업(P/B 만), 티처몰(정보수정=역행), 온채널(승인 대기), 떠리몰 `soldout`(단방향)은 해제를 다른 경로로 태워야 한다.
3. **파괴적 몰이 실재한다.** 사방넷 기준 완전품절=영구삭제 5개 몰, 떠리몰 PROHIBITION, ESM 판매중지 1개월 자동삭제.
4. **쿠팡은 병행 불가일 수 있다.** "OpenAPI용도의 키는 판매자ID(업체코드) 별로 1개만 발급 가능하며 2개 이상의 연동업체 추가가 불가합니다" → 사방넷이 그 키를 쓰고 있으면 절단 전환이 강제된다(§6 최우선 확인 항목).

---

## 4. KidItem 에 이식할 설계

### 4-0. 이미 가진 것 / 없는 것 (코드 실사)

| 사방넷 개념 | KidItem 현황 | 파일 |
|---|---|---|
| 쇼핑몰 계정 등록 | **있음.** `ChannelAccount(channel='order_collection').config.orderCollection` 에 27개 몰 key + 암호화 자격증명 | `apps/server/src/orders/services/order-collection-mall-account.service.ts` |
| 사방넷 상품(품번) | **있음.** `MasterProduct` (org-scoped canonical) | `prisma/models/core.prisma:428` |
| 쇼핑몰 상품(연동생성) | **있음.** `ChannelListing` / `ChannelListingOption` (`@@unique([organizationId, channelAccountId, externalId])`) | `prisma/models/core.prisma:601, 690` |
| 등록송신 실행 | **쿠팡 전용으로 있음.** `ProductPreparation` → `ProductRegistrationExecution`(idempotencyKey / requestHash / lease / providerOutcome / 활성 unique) → `CoupangProviderPort.createSellerProduct` | `prisma/models/ai.prisma:560`, `sourcing.prisma:1004`, `channels/application/port/out/provider/coupang-provider.port.ts` |
| 파괴적 동작 게이트 | **있음(삭제용).** `ChannelListingDeletionOperation` — `authorizationExpiresAt`, `expectedProviderAccountId`, `leaseToken`, 활성 unique | `prisma/models/channels.prisma:790` |
| 재고→판매가능 판정 | **있음.** `ChannelSkuAvailability` — 옵션 레시피(`ChannelListingOptionInventoryComponent`)로 `sellableStock`·`componentCapacity`·`isBottleneck`·`recipeStatus` 계산, `status` 필터에 `out_of_stock` 포함 | `channels/application/service/channel-sku-availability.service.ts`, `packages/shared/src/schemas/channel-sku-availability.ts` |
| 부가정보(배송/반품/출고지) | **없음.** `ChannelListing.deliveryInfo Json` 은 수집 결과 저장용, 송신 프로필 아님 | — |
| 상품정보고시 / KC 인증 | **없음(DB에 필드 자체가 없음)** | — |
| 품절·재고 **송신** | **없음** | — |
| 몰별 등록 어댑터 | **없음.** 확장은 주문수집만, 8,149줄 flat switch (`msg.action === "collectXOrders"`) | `extensions/kiditem-os/background/orders/worker.js` |

**결론: 판정은 이미 있고 의도·송신·확인이 없다.** 설계의 무게중심은 "재고를 어떻게 계산하나"가 아니라 "계산 결과를 어떻게 안전하게 몰에 밀고 확인하나"다.

---

### 4-1. 데이터 모델 (무엇을 추가해야 하는가)

> 규약: Prisma 는 native enum 대신 `String` + Zod(`packages/shared/src/schemas/*`), 조직 스코프는 `organizationId`, 단일 조회는 `{ id, organizationId }`, 신규 파일은 `prisma/models/channels.prisma` (Channels 소유).

#### (0) 선결 — 몰 계정을 `ChannelAccount` row 로 승격

현재 27개 몰은 `ChannelAccount` **한 row 의 config JSON** 안에 있다. 그런데 `ChannelListing.channelAccountId` 는 실제 FK 다. 등록 대상 몰은 반드시 자기 `ChannelAccount` row 가 필요하다.

**권고안:** `order_collection` config 를 자격증명의 단일 원천으로 유지하고, "등록 활성화" 한 몰만 `ChannelAccount(channel = '<mallKey>', externalAccountId = loginId, config.listing = {...})` 로 승격하는 단방향 sync 를 둔다. 자격증명은 승격 row 에 복제하지 않고 `order_collection` 을 참조한다(비밀 이중 보관 금지).

```
config.orderCollection[mallKey]  ── 자격증명 원천(암호화, 기존 화면 그대로)
        │ promote (등록/품절 활성화 시 1회)
        ▼
ChannelAccount(channel='kidsnote')  ── ChannelListing FK 앵커
```

#### (1) `MallListingProfile` — 사방넷 '쇼핑몰 부가정보' 대체

```prisma
/// @namespace Channels
/// @describe 몰 계정별 송신 프로필(배송/반품/출고지/판매정책). 사방넷 부가정보와 달리 삭제·복제·대량 적용이 가능하다.
model MallListingProfile {
  id               String  @id @default(uuid()) @db.Uuid
  organizationId   String  @map("organization_id") @db.Uuid
  channelAccountId String  @map("channel_account_id") @db.Uuid

  name        String
  isDefault   Boolean @default(false) @map("is_default")
  isActive    Boolean @default(true)  @map("is_active")

  shippingJson   Json?  @map("shipping_json")        // 배송비/배송구분/묶음배송/도서산간
  returnJson     Json?  @map("return_json")          // 반품비/교환비
  addressJson    Json?  @map("address_json")         // 출고지/반품지
  categoryCode   String? @map("category_code")       // 몰 카테고리 직접 지정(우선순위 1)
  namePrefix     String? @map("name_prefix")
  nameSuffix     String? @map("name_suffix")
  descriptionHeaderHtml String? @map("description_header_html")
  descriptionFooterHtml String? @map("description_footer_html")
  extraJson      Json?  @map("extra_json")           // 몰 고유 필드(어댑터 스키마로 검증)

  deletedAt DateTime? @map("deleted_at") @db.Timestamptz  // soft delete — 사방넷은 삭제 불가였다
  @@unique([organizationId, channelAccountId, name])
  @@map("mall_listing_profiles")
}
```

#### (2) `ProductNoticeAttribute` / `ProductCertification` — 고시·KC (신규, 현재 DB 전무)

```prisma
/// @describe 상품정보고시. 미충족이면 송신을 시작하지 않는다(사방넷은 실패 후에야 알려줬다).
model ProductNoticeAttribute {
  id              String @id @default(uuid()) @db.Uuid
  organizationId  String @map("organization_id") @db.Uuid
  masterProductId String @map("master_product_id") @db.Uuid
  noticeCategory  String @map("notice_category")   // '어린이제품' | '기타재화' ... String + Zod
  attributesJson  Json   @map("attributes_json")   // {제조자, 크기, 색상, 사용연령, KC인증필유무, A/S책임자, ...}
  channel         String?                          // null = 기본, 값 = 해당 몰 override (사방넷 '쇼핑몰별 속성설정')
  @@unique([organizationId, masterProductId, noticeCategory, channel])
  @@map("product_notice_attributes")
}

/// @describe KC/어린이제품 인증. 유효기간이 지난 인증은 송신 게이트에서 차단한다.
model ProductCertification {
  id              String    @id @default(uuid()) @db.Uuid
  organizationId  String    @map("organization_id") @db.Uuid
  masterProductId String    @map("master_product_id") @db.Uuid
  certType        String    @map("cert_type")      // 'safety_confirm'|'safety_certify'|'supplier_conformity'|'none'
  certNumber      String?   @map("cert_number")
  certAgency      String?   @map("cert_agency")
  targetAgeMonths Int?      @map("target_age_months")
  validFrom       DateTime? @map("valid_from") @db.Date
  validTo         DateTime? @map("valid_to")   @db.Date
  documentUrl     String?   @map("document_url")
  @@index([organizationId, masterProductId])
  @@map("product_certifications")
}
```

#### (3) `MallCategoryLink` — 표준 ↔ 몰 카테고리

`CategoryMapping`(`core.prisma:409`) 이 이미 있으므로 **먼저 재사용 가능성을 확인**하고, 부족하면 확장한다. 필요한 형태는 `(organizationId, standardCategoryCode, channel, channelAccountId?) → mallCategoryCode + mallCategoryPath + source('manual'|'collected'|'ai')`. 사방넷의 "1순위 AI 매칭 / 2순위 수집 매칭" 우선순위를 `source` + `priority` 로 표현한다.

#### (4) `ChannelPublishPlan` / `ChannelPublishTask` — 다몰 fan-out 등록

사방넷의 "1회 = 상품 N × 몰 1 × ID 1" 을 정면으로 뒤집는 지점이다.

```prisma
/// @describe 상품 N × 몰 M 동시 송신 계획. Task 가 실제 실행 단위.
model ChannelPublishPlan {
  id             String @id @default(uuid()) @db.Uuid
  organizationId String @map("organization_id") @db.Uuid
  createdByUserId String? @map("created_by_user_id") @db.Uuid
  status         String @default("draft")   // draft|validated|dispatching|completed|aborted
  targetCount    Int    @default(0) @map("target_count")
  dryRun         Boolean @default(true) @map("dry_run")
  @@map("channel_publish_plans")
}

/// @describe 한 상품을 한 몰 계정에 등록/수정하는 단일 실행. ProductRegistrationExecution 과 동일한 안전 규약을 따른다.
model ChannelPublishTask {
  id               String @id @default(uuid()) @db.Uuid
  organizationId   String @map("organization_id") @db.Uuid
  planId           String @map("plan_id") @db.Uuid
  channelAccountId String @map("channel_account_id") @db.Uuid
  masterProductId  String @map("master_product_id") @db.Uuid
  channelListingId String? @map("channel_listing_id") @db.Uuid   // 성공 후 resolve

  mallKey          String @map("mall_key")
  adapterKind      String @map("adapter_kind")   // 'api'|'extension_form'|'extension_excel'
  executionKind    String @default("create") @map("execution_kind")  // create|update
  profileId        String? @map("profile_id") @db.Uuid

  idempotencyKey        String  @map("idempotency_key")
  requestHash           String  @map("request_hash")
  submissionPayloadJson Json?   @map("submission_payload_json") @db.JsonB
  submissionPayloadHash String? @map("submission_payload_hash")

  status          String @default("prepared")
  // prepared|validating|blocked|dispatching|submitted|verifying|published|failed|unknown_needs_reconcile|skipped_duplicate
  providerOutcome String @default("not_attempted") @map("provider_outcome")
  externalListingId String? @map("external_listing_id")
  verifiedAt      DateTime? @map("verified_at") @db.Timestamptz   // 몰 재조회로 확인한 시각
  blockedReasons  String[]  @default([]) @map("blocked_reasons")
  lastErrorCode   String?   @map("last_error_code")
  lastErrorMessage String?  @map("last_error_message")
  resultJson      Json?     @map("result_json") @db.JsonB

  leaseToken     String?   @map("lease_token") @db.Uuid
  leaseClaimedAt DateTime? @map("lease_claimed_at") @db.Timestamptz
  attemptCount   Int       @default(0) @map("attempt_count")

  @@unique([organizationId, idempotencyKey])
  @@unique([organizationId, channelAccountId, masterProductId], map: "channel_publish_tasks_active_target_key",
           where: raw("status = ANY (ARRAY['prepared','validating','dispatching','submitted','verifying','unknown_needs_reconcile'])"))
  @@index([organizationId, status, createdAt])
  @@map("channel_publish_tasks")
}
```

> 기존 `ProductRegistrationExecution` 과의 관계: 그쪽은 `productPreparationId` FK 가 NOT NULL 이고 소싱 후보 → 쿠팡 경로에 강하게 묶여 있다. **Phase 1~4 는 신규 `ChannelPublishTask` 로 진행하고, 쿠팡 preparation 경로는 Phase 5 에서 `adapterKind='api'` 어댑터 하나로 흡수**한다. 지금 통합하면 마이그레이션 리스크가 이득보다 크다.

#### (5) `ChannelAvailabilityIntent` — "이 옵션은 지금 어떤 상태여야 하는가"

```prisma
/// @describe 옵션/리스팅의 목표 판매상태. 계산 결과(desired)와 마지막으로 몰에서 확인한 실제(observed)를 분리 보관한다.
model ChannelAvailabilityIntent {
  id                     String @id @default(uuid()) @db.Uuid
  organizationId         String @map("organization_id") @db.Uuid
  channelAccountId       String @map("channel_account_id") @db.Uuid
  channelListingId       String @map("channel_listing_id") @db.Uuid
  channelListingOptionId String? @map("channel_listing_option_id") @db.Uuid  // null = 리스팅 단위

  desiredState String @map("desired_state")   // 'on_sale'|'sold_out'|'suspended'
  desiredQty   Int?   @map("desired_qty")
  reasonCode   String @map("reason_code")     // 'stock_zero'|'bottleneck'|'manual'|'restock'|'policy'
  sourceJson   Json?  @map("source_json")     // sellableStock, bottleneck SKU, policy version

  observedState String?   @map("observed_state")
  observedQty   Int?      @map("observed_qty")
  observedAt    DateTime? @map("observed_at") @db.Timestamptz

  isDrifted  Boolean  @default(false) @map("is_drifted")  // desired ≠ observed
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([organizationId, channelListingId, channelListingOptionId])
  @@index([organizationId, isDrifted])
  @@map("channel_availability_intents")
}
```

#### (6) `ChannelAvailabilitySyncTask` — 품절/해제 송신 (롤백 가능)

```prisma
model ChannelAvailabilitySyncTask {
  id               String @id @default(uuid()) @db.Uuid
  organizationId   String @map("organization_id") @db.Uuid
  batchId          String @map("batch_id") @db.Uuid
  channelAccountId String @map("channel_account_id") @db.Uuid
  intentId         String @map("intent_id") @db.Uuid

  mallKey       String @map("mall_key")
  commandKind   String @map("command_kind")   // 'set_stock'|'set_sale_status'|'set_soldout_flag'|'excel_bulk'
  fromStateJson Json   @map("from_state_json") // 롤백용 이전 상태 — 사방넷에는 없던 것
  toStateJson   Json   @map("to_state_json")

  isDestructive Boolean @default(false) @map("is_destructive")
  approvedByUserId String?   @map("approved_by_user_id") @db.Uuid
  approvalExpiresAt DateTime? @map("approval_expires_at") @db.Timestamptz

  idempotencyKey String @map("idempotency_key")
  status         String @default("prepared")
  // prepared|blocked|awaiting_approval|dispatching|submitted|verifying|applied|failed|unknown_needs_reconcile|rolled_back
  verifiedAt     DateTime? @map("verified_at") @db.Timestamptz
  lastErrorCode  String? @map("last_error_code")
  leaseToken     String? @map("lease_token") @db.Uuid

  @@unique([organizationId, idempotencyKey])
  @@map("channel_availability_sync_tasks")
}
```

#### (7) 어댑터 매니페스트 — **DB 가 아니라 코드**

사방넷이 [쇼핑몰특이사항] 팝업 안에만 숨겨둔 몰별 제약을, 우리는 타입으로 선언하고 UI 가 읽는다. 그래야 "완전품절이 어느 몰에서 삭제인지"를 사람이 기억할 필요가 없다.

```ts
// apps/server/src/channels/domain/mall/mall-adapter-manifest.ts
export interface MallAdapterManifest {
  key: string;                       // order-collection mall key 와 동일 (kidsnote, haebub-mall, ...)
  kind: 'api' | 'extension_form' | 'extension_excel';
  supports: {
    createListing: boolean;
    updateListing: boolean;
    setStock: 'option' | 'listing' | false;
    setSaleStatus: 'option' | 'listing' | false;
    soldOut: boolean;
    resume: boolean;                 // ← 해제 대칭 여부. 사방넷이 문서화하지 않은 축
  };
  hazards: {
    soldOutDeletesListing: boolean;  // ESM/11번가/인터파크/고도몰 계열
    suspendAutoDeletesAfterDays: number | null;  // ESM = 30
    irreversibleStates: string[];    // 떠리몰 'PROHIBITION'
    updateResetsApproval: boolean;   // 티처몰: 정보수정 → 미승인+판매중지+미노출
    stockWriteOverwritesPrice: boolean;
    requiresOperatorApproval: boolean; // 온채널: 판매설정 = 요청
  };
  limits: { maxPerRequest: number | null; ratePerSecond: number | null };
  requiredProfileFields: readonly string[];   // 프로필 Zod 스키마 키
  requiredProductFields: readonly string[];   // 'kcCertification' | 'noticeAttributes' | 'category' | ...
}
```

---

### 4-2. 몰별 어댑터 인터페이스

#### 서버 포트 (`apps/server/src/channels/application/port/out/provider/mall-listing.port.ts`)

```ts
export const MALL_LISTING_PORT = Symbol('MALL_LISTING_PORT');

export type AvailabilityDesiredState = 'on_sale' | 'sold_out' | 'suspended';

export interface MallListingPublishInput {
  organizationId: string;
  channelAccountId: string;
  taskId: string;
  idempotencyKey: string;
  payload: unknown;              // 어댑터 스키마로 검증된 몰 전용 페이로드
  profile: MallListingProfileSnapshot;
}

export interface MallListingPublishResult {
  outcome: 'created' | 'updated' | 'rejected' | 'unknown';
  externalListingId: string | null;
  providerMessage: string | null;
  /** 어댑터가 재조회로 확인했는지. false 면 서버가 verify 단계를 강제한다. */
  selfVerified: boolean;
  raw: unknown;
}

export interface MallAvailabilityCommand {
  organizationId: string;
  channelAccountId: string;
  taskId: string;
  idempotencyKey: string;
  scope: 'listing' | 'option';
  externalListingId: string;
  externalOptionId: string | null;
  desired: AvailabilityDesiredState;
  quantity: number | null;
}

export interface MallAvailabilityResult {
  outcome: 'applied' | 'rejected' | 'unknown';
  appliedState: AvailabilityDesiredState | null;
  appliedQuantity: number | null;
  selfVerified: boolean;
  raw: unknown;
}

export interface MallListingAdapter {
  readonly manifest: MallAdapterManifest;

  /** 송신 전 게이트. 몰 필수 필드 미충족을 코드로 반환(사방넷은 실패 후에야 알려줬다). */
  validate(input: MallListingPublishInput): Promise<{ ok: boolean; blockedReasons: string[] }>;

  publish(input: MallListingPublishInput): Promise<MallListingPublishResult>;

  setAvailability(cmd: MallAvailabilityCommand): Promise<MallAvailabilityResult>;

  /** 성공/실패 판정의 단일 진실. 모든 mutation 뒤에 반드시 호출된다. */
  readState(input: {
    organizationId: string;
    channelAccountId: string;
    externalListingId: string;
    externalOptionIds?: string[];
  }): Promise<{
    exists: boolean;
    listingState: string | null;
    options: Array<{ externalOptionId: string; state: string | null; stock: number | null }>;
  }>;
}
```

레지스트리는 `MALL_ADAPTERS: Record<string, MallListingAdapter>` 이며 key 는 **주문수집 몰 key 와 동일**하게 맞춘다(`kidsnote`, `haebub-mall`, `onch`, `coupang-direct`, ...). 이미 27개 키가 `order-collection-mall-account.service.ts` 에 있으므로 새 이름 체계를 만들지 않는다.

#### 확장 쪽 구조 — worker.js 를 더 키우지 않는다

현재 `extensions/kiditem-os/background/orders/worker.js` 는 8,149줄이고 `msg?.action === "collectKidsnoteOrders"` 형태의 flat switch 다. AGENTS.md 규칙("700+ 줄 서비스/컴포넌트에 실질 동작을 더하지 말 것")상 여기에 몰 20개 × 동사 3개를 더 붙이면 안 된다.

```
extensions/kiditem-os/background/listings/
  registry.js              // { [mallKey]: { publish, setAvailability, readState } }
  command-router.js        // action: "listingCommand" 단일 진입점
  malls/
    kidsnote.js            // WISA 엑셀 upsert + 재고조사표 + 상태 일괄수정
    haebub-mall.js         // prd_excel_up / prd_change_exposure / prd_shortage
    teacher-mall.js
    onch.js
    ...
```

메시지 계약도 몰마다 다른 action 이 아니라 하나로:

```js
// { action: "listingCommand", mallKey, verb: "publish"|"setAvailability"|"readState",
//   runId, environmentId, payload, confirmToken }
```

`confirmToken` 은 확장 AGENTS.md 의 기존 규칙 — "Destructive marketplace actions require explicit web-page confirmation" — 을 그대로 재사용한다. 파괴적 verb 는 웹에서 발급한 토큰 없이는 실행되지 않는다.

---

### 4-3. 등록 파이프라인

```
[0] 몰 계정 승격 + 프로필 + 카테고리 매핑
      MallListingProfile (기본 프로필 1개 필수) / MallCategoryLink
      ※ 사방넷과 달리 대량등록·복제·삭제 전부 허용
        │
[1] PREFLIGHT  (송신 전 게이트 — 여기서 막는 게 이 설계의 절반이다)
      adapter.validate() + 공통 검증기:
        · KC 인증 유효(만료 포함) / 상품정보고시 필수항목
        · 몰 카테고리 매핑 존재
        · 이미지 개수·크기, 상세 HTML 외부 리소스
        · 옵션명에 '단품' 문자열 금지        ← 사방넷 원문 함정 그대로 룰화
        · 한글/영문 외 문자·특수기호 탐지     ← 인코딩 오류 사전 차단
        · 프로필 필수 필드(출고지/반품지/배송비)
      → 미충족은 task.status='blocked' + blockedReasons[] (송신 시도조차 안 함)
        │
[2] PLAN FAN-OUT
      상품 N × 몰 M → Task N*M 생성 (사방넷은 몰 1개씩 반복해야 했다)
      idempotencyKey = sha256(orgId | mallKey | channelAccountId | masterProductId | payloadHash)
        │
[3] DUPLICATE GUARD  (3중)
      ① 로컬: ChannelListing(orgId, channelAccountId, externalId) 존재?
      ② 활성 task partial unique 로 동시 실행 차단
      ③ 원격: adapter.readState() 로 몰에 실제 존재하는지 재조회
      → 하나라도 걸리면 status='skipped_duplicate' (강제하려면 명시적 force + 사유 기록)
        │
[4] DISPATCH  (operations 도메인이 소유)
      OperationDefinition { key:'channels.publish_listings', engineType:'api'|'browser',
        resourceClass:'extension_<mall>'|'api_<mall>', maxAttempts:1, scheduleSupported:false }
      · lease + heartbeat. heartbeat 끊기면 실패가 아니라 unknown_needs_reconcile
        │
[5] VERIFY  ★ 성공 판정의 단일 진실
      submitted → adapter.readState() → exists && externalId 회수 → published(verifiedAt 기록)
      · 어댑터가 selfVerified=false 면 서버가 무조건 재조회
      · 회수 실패 시 즉시 failed 로 떨어뜨리지 않고 verifying 유지 후 백오프 재조회(최대 N회)
        │
[6] RECONCILE  (유령 실패 자동 복구)
      outcome=rejected/unknown 인데 readState().exists === true
        → externalListingId 를 회수해 ChannelListing 생성 + status='published'
        → 사방넷은 여기서 "온라인 문의로 상품코드 매칭을 요청"이었다. 우리는 자동화한다.
        │
[7] RETRY
      · 자동 재시도는 반드시 [5] 재조회 후에만. 미조회 상태 재시도 금지(중복 등록의 원인)
      · 재시도 시 payload 는 저장본이 아니라 **현재 상품값으로 재빌드**하고 hash 비교
        · hash 변경 → 새 requestHash 로 신규 시도 (사방넷 예약 큐 '박제' 회피)
```

성공/실패 화면은 사방넷처럼 두 메뉴로 쪼개지 않는다. `ChannelPublishTask` 하나를 status 필터로 본다(blocked / failed / unknown_needs_reconcile / published).

---

### 4-4. 일괄 품절관리 파이프라인

```
[판정]  이미 있는 것을 그대로 쓴다
   ChannelSkuAvailability: sellableStock, componentCapacity, isBottleneck,
   recipeStatus(unmatched|configuration_required|review_required|matched)
   · recipeStatus !== 'matched' 인 옵션은 판정 불가 → 절대 자동 품절시키지 않는다
        │
[정책]  AvailabilityPolicy (org / mall / 상품 등급별) — 히스테리시스 필수
   soldOutBelow  = 0        (sellableStock <= 0 → sold_out)
   resumeAbove   = 3        (sellableStock >= 3 → on_sale)   ← 0/1 경계 플래핑 방지
   graceMinutes  = 30       (연속 관측 유지 시에만 전이)
        │
[의도]  ChannelAvailabilityIntent upsert (desired ≠ observed → isDrifted=true)
        │
[DIFF]  drift 목록 = 실제로 보낼 것. 여기서 화면에 dry-run 표를 먼저 보여준다
        │
[안전장치]  ── 여기가 사방넷 대비 가장 큰 차이 ──
   · manifest.hazards.soldOutDeletesListing === true 인 몰
       → sold_out 명령 자체를 금지. suspended 또는 재고 0 으로 강등 (다운그레이드 사유 기록)
   · irreversibleStates 에 걸리는 값은 어댑터가 거부
   · resume === false 인 몰(해법몰 상태 팝업 등) → 해제는 다른 commandKind 로 라우팅
   · 배치 상한(기본 200건/회), 몰별 kill switch, 조직별 일일 상한
   · isDestructive === true task 는 approvedByUserId + approvalExpiresAt 없이는 dispatch 불가
     (기존 ChannelListingDeletionOperation 의 authorizationExpiresAt 패턴 그대로)
        │
[송신]  adapter.setAvailability() — from_state_json 을 반드시 먼저 저장
        │
[확인]  adapter.readState() 로 observedState 갱신 → applied
        · 불일치면 unknown_needs_reconcile (성공 아님, 실패도 아님)
        │
[롤백]  from_state_json 으로 역명령 생성 → status='rolled_back'
        · 사방넷은 이 개념이 없었다(자동화서비스Ⅱ는 해제 자체가 불가)
```

**해제(재판매)는 품절과 완전히 동일한 1급 명령이다.** `desiredState='on_sale'` 일 뿐 별도 코드 경로가 아니다. 사방넷이 만든 가장 큰 구멍이 여기라서, 이 대칭을 인터페이스 레벨에서 강제한다(`supports.resume` 이 false 인 몰은 매니페스트에 명시되고 UI 가 "수동 해제 필요"로 표시).

트리거 3종:
1. 스케줄 — `channels.sync_availability` operation, `scheduleSupported: true`
2. 재고 이벤트 — Sellpia 재고 스냅샷 갱신 직후 drift 재계산
3. 수동 — 재고관리 화면에서 선택 후 [몰 반영]

---

### 4-5. 사방넷과 반대로 만들 것

| # | 사방넷 결함 (원문/근거) | KidItem 규칙 |
|---|---|---|
| 1 | "상품등록송신시 실제 등록 성공 여부와 상관없이 '처리완료'로 변경됩니다." | **`published` 는 `readState()` 재조회로 `verifiedAt` 이 찍혀야만 부여**. 전송 완료는 `submitted` 까지다. |
| 2 | "팝업 창을 닫거나 클라이언트 오류로 인해 전송이 중단된 경우 실패로 확인되지 않으며" | 무음 실패를 성공/실패 어디에도 넣지 않고 **`unknown_needs_reconcile` 이라는 1급 상태**로 남긴다. lease heartbeat 만료 = 자동 전이. |
| 3 | 실패 큐 기본 검색이 '상품명(송신)/판매가(송신)' | **송신값은 스냅샷(`submissionPayloadJson`)으로만 보관, 화면·재시도는 항상 현재 상품값 기준.** |
| 4 | "같은 상품을 여러 번 재송신하는 경우 상품이 중복으로 등록될 수 있습니다." | **idempotencyKey + 활성 partial unique + 재시도 전 원격 재조회 3중 가드.** 미조회 재시도는 코드 경로 자체가 없다. |
| 5 | 유령 실패 → "온라인 문의로 상품코드 매칭을 요청합니다." | **자동 reconcile.** 실패 응답 + 몰에 존재 = externalId 회수해 로컬 resolve. |
| 6 | "부가정보는 대량 등록이 불가하며 … 삭제가 불가하며" | `MallListingProfile` 은 **CRUD + soft delete + 복제 + 여러 계정 대량 적용** 지원. |
| 7 | "[예약송신저장] 후, 상품명, 판매가, 브랜드 등의 정보를 변경한 경우 … 변경한 내용이 적용되지 않으므로" | **실행 시점에 payload 재빌드 후 `requestHash` 비교.** 불일치면 조용히 옛 값을 보내지 않고 중단·재확인. |
| 8 | "[일시중지, 완전품절 → 공급중]은 자동화로 송신 불가" | **해제가 품절과 동일 명령·동일 파이프라인.** 대칭 불가 몰은 매니페스트에 표시. |
| 9 | 몰별 제약이 [쇼핑몰특이사항] 팝업 안에만 존재 | **`MallAdapterManifest` 로 코드화**, UI·검증기·디스패처가 같은 소스를 읽는다. |
| 10 | 완전품절 = 5개 몰 영구삭제인데 경고문만 | **`soldOutDeletesListing` 몰은 sold_out 명령을 기술적으로 차단**하고 suspend 로 강등. |
| 11 | Windows 전용 클라이언트 + 팝업 차단 해제 필수 | **기존 확장(백그라운드 탭·keepalive) 재사용.** OS 종속 없음, 팝업 없음. |
| 12 | 옵션명 '단품' / 다국어·특수기호 → 조용한 실패 | **preflight 검증 룰**로 승격, 송신 전에 `blocked`. |
| 13 | 1회 = 상품 N × 몰 1 × ID 1 | **Plan fan-out — 상품 N × 몰 M 을 한 번에.** |
| 14 | "삭제한 내역은 복구가 불가하며" | 연동 이력은 **soft delete + 감사 로그**. 하드 삭제 경로 없음. |
| 15 | 옵션재고 송신이 판매가를 덮어씀 | 어댑터가 `stockWriteOverwritesPrice` 를 선언하고, 참이면 **현재 판매가를 함께 읽어 보존 전송**. |
| 16 | 에러 코드 체계 없음(Message 자유 텍스트 + 색상) | **`lastErrorCode` 를 정규화 코드로 매핑**(`missing_kc`, `category_unmapped`, `duplicate_listing`, `auth_expired`, `provider_rate_limited`, `unknown`) 후 원문은 `resultJson` 에 보존. |
| 17 | 자동화 실행 중 상품 삭제 금지가 '주의사항' | 실행 중 대상은 **lease 로 잠금**, 삭제·수정은 거부. |

---

## 5. 구현 순서

### Phase 0 — 뼈대 (몰 송신 없음, 1~2주)
- 몰 계정 승격 sync (`order_collection` config → `ChannelAccount` row)
- `MallAdapterManifest` 27개 몰 선언 (미확인 몰은 `supports` 전부 false + `unknown: true`)
- `MallListingProfile` + `ProductNoticeAttribute` + `ProductCertification` 스키마와 CRUD 화면
- preflight 검증기 (송신 없이 "이 상품은 어느 몰에 올릴 수 있는가" 만 판정)
- 게이트: `npm run db:push` + `npx prisma generate` + shared 빌드, `npm run dev:server` 부팅 확인

**왜 먼저**: KC·고시가 DB에 없는 상태에서는 어느 몰 어댑터를 만들어도 preflight 를 통과시킬 데이터가 없다. 그리고 이 단계는 몰에 아무것도 쓰지 않아 위험이 0이다.

### Phase 1 — 품절 파이프라인 1개 몰 (등록보다 품절이 먼저)

**분기 조건이 있다.** 쿠팡 OpenAPI 키를 현재 사방넷이 점유 중인지에 따라 갈린다("OpenAPI용도의 키는 판매자ID 별로 1개만 발급 가능하며 2개 이상의 연동업체 추가가 불가").

- **키가 KidItem 전용이면 → 쿠팡.** 이유: (a) 상품 마스터 원천이 쿠팡 리스팅 1,228건이라 실데이터가 유일하게 충분하고, (b) `stop`/`resume` 가 body 없는 완전 대칭이라 롤백 검증이 쉽고, (c) `CoupangProviderPort` 와 인증이 이미 있어 어댑터가 얇고, (d) 파괴적 동작이 없다.
- **사방넷이 키를 쓰고 있으면 → 키즈노트.** 쿠팡은 절단 전환이라 마지막으로 미룬다.

어느 쪽이든 산출물은 동일: `ChannelAvailabilityIntent` + `SyncTask` + verify + rollback 의 end-to-end 1건.

### Phase 2 — 폐쇄몰 2곳: 키즈노트, 해법몰
- **키즈노트**: 품절/해제가 동일 폼·동일 버튼 양방향으로 가장 깨끗하고, 재고 일괄 업로드(SKU코드+재고)와 재고조사표 엑셀이 따로 있다. 주문수집에서 WISA CFB 메타 트릭·세션 규약을 이미 확보했다.
- **해법몰**: 엑셀 한 장(`prd_excel_up.php`)이 등록·재고·품절을 동시에 밀고, 미인증 HTML 이 노출돼 필드가 이미 파악됐다. 다만 상태 팝업이 비대칭(P/B만)이라 **"대칭 아닌 몰"의 첫 레퍼런스**로 쓴다 — 해제를 `prd_change_exposure.php`(Y↔N) + 엑셀 품절여부 N/S 로 라우팅하는 패턴을 여기서 확립한다.

**왜 이 둘**: 확장 어댑터 2종(엑셀형·폼형)의 원형을 만들고, 폐쇄몰은 사방넷이 못 하거나(해법몰=사방넷 미지원) 우리가 더 잘할 수 있는(키즈노트=해제 자동화) 구간이다.

### Phase 3 — API 어댑터 3종: 토스, 롯데온, 카카오
문서가 좋고 품절/해제 대칭이 명문화돼 있어 어댑터가 얇다. 여기서 `kind: 'api'` 경로가 완성되고, 이후 몰은 이 틀에 끼우기만 하면 된다.

### Phase 4 — 등록 파이프라인 개시: 키즈노트 + 롯데온
품절이 안정된 뒤에야 등록을 연다. 롯데온은 등록 요청이 배열(`spdLst`)이라 fan-out 을 실증하기 좋고, 키즈노트는 엑셀 upsert 라 create/update 통합 케이스를 검증한다.

### Phase 5 — 함정 많은 대형몰: ESM, SSG, 스마트스토어, 11번가
전부 개별 함정이 크다(ESM 옵션재고 불가·판매중지 30일 자동삭제, 스마트스토어 전체 재전송·2 RPS, SSG 구버전 종료, 11번가 엔드포인트 미확정 + IP 등록). 앞 단계에서 verify/rollback 이 검증된 뒤에 붙인다. 이 시점에 쿠팡 preparation 경로도 신규 어댑터로 흡수한다.

### Phase 6 — 나머지 + 미확인 몰
티처몰(정보수정 역행 검증 선행), 온채널(승인 대기 상태 모델링), 떠리몰, 보리보리, 아트공구(권한 3종 확인 선행). 원폴라리스·윤선생·아이스크림몰·키드키즈·GS샵·베네피아는 **계정/도메인 확보 전까지 착수 금지**.

---

## 6. 확인 안 된 것

### 6-1. 착수 순서를 바꿀 수 있는 것 (최우선)

1. **쿠팡 OpenAPI 키를 현재 사방넷이 점유하고 있는가.** 판매자ID당 키 1개·연동업체 2개 이상 불가가 문서로 확인됐다. 점유 중이면 쿠팡은 병행 불가이고 Phase 1 이 통째로 뒤집힌다. — **확인 안 됨**
2. **원폴라리스의 실제 판매자 어드민 URL.** 내부 DB 기준 최근 120일 매출 비중 6.2%로 폐쇄몰 1위인데 도메인·계정 모두 미상이다. `officeone.co.kr` / `onepolaris.co.kr` 은 DNS 실패. — **확인 안 됨**
3. **웅진클래스몰·윤선생의 실체.** 윤선생 SCM 으로 지목됐던 `qbscm.qubridge.com` 은 실측 결과 아름넷닷컴/큐브릿지 계열이었고 윤선생과의 연결 근거가 없다. 웅진클래스몰은 샵바이 기반이라는 근거를 찾지 못했다. — **확인 안 됨**
4. **다몰 등록의 소스 상품이 무엇인가.** 수집상품은 4건뿐이고 상품 마스터 원천은 쿠팡 리스팅 1,228건이다. 쿠팡 리스팅을 역이식하는지, 신규 소싱만 다몰로 보내는지가 정해지지 않으면 Phase 4 범위가 안 잡힌다. — **확인 안 됨**

### 6-2. 몰 스펙 공백

5. **11번가 셀러 API 엔드포인트/필드.** 셀러오피스 로그인 후 개발가이드에서만 확인 가능. 공개 HTML 에서 `/rest/` 계열 탐색 0건.
6. **보리보리·하프클럽 협력사 API 스펙.** 키 발급 경로만 확인, 엔드포인트 비공개(담당 MD 경유).
7. **GS샵 파트너스 BFF 의 mutation 엔드포인트.** 라우트와 조회성 BFF 만 번들에서 확인, 실제 저장 호출은 lazy chunk 라 로그인 후 리버스 필요.
8. **아이스크림몰(X2BEE PO)·키드키즈의 상품/재고 메뉴 존재 여부.** 전 경로 302 라 메뉴 이름조차 미확인.
9. **베네피아 벤더 어드민의 상품 엑셀·재고 필드.** 사방넷은 7개 기능 전부 O 로 커버 → 자체 어댑터 ROI 재계산 필요.
10. **아트공구(카페24) 공급사 계정의 권한 3종**(상품 등록 시 분류 선택 / 상품 수정 / 상품 진열) 부여 상태. 미부여면 등록·재고 반영이 0이다.
11. **티처몰 `goods/excel_upload` 의 용도**(신규등록인지 수정 전용인지), 그리고 **판매상태 단독 변경이 재승인을 트리거하는지**. 후자가 참이면 품절 해제가 판매중지로 역행한다.
12. **몰별 '일시중지/완전품절'이 각 SCM 에서 실제 어떤 판매상태로 매핑되는지 대응표.** 사방넷 원문은 "쇼핑몰 판매상태와 가장 적합한 판매상태로 전송됩니다" 뿐이고, 실제 표는 [쇼핑몰특이사항] 팝업(비공개)에만 있다.
13. **완전품절=영구삭제 몰 목록(ESM옥션·ESM지마켓·11번가·인터파크·고도몰)이 현재도 유효한지**, 그리고 목록 밖 몰(쿠팡·스마트스토어·롯데온)에서 완전품절이 어떤 결과를 내는지.

### 6-4. 사방넷 자체의 미확정 (참고용)

14. **API 3.0 으로 '사방넷 → 몰 송신'을 대체할 수 있는가.** 확인된 21개 주문관리 엔드포인트는 외부시스템 ↔ 사방넷 구간이고, `POST /v3/sb/product/upsert`(5,000건)·`/v3/sb/channels-product` 는 있으나 **SKU 재고를 직접 쓰는 경로는 없다**("재고(quantity)는 API를 통해 직접 등록/수정할 수 없습니다"). 몰 송신 구간이 여전히 클라이언트+팝업인지 API 로 열렸는지는 미확인.
15. **스케줄러 `공급중 → 공급중` 송신 가능 표기**가 자동화서비스Ⅱ 의 "[일시중지, 완전품절 → 공급중]은 자동화로 송신 불가" 와 모순. 어느 쪽이 현행인지 문서만으로는 판정 불가.
16. **등록송신에도 '팝업 닫힘 무음 실패'가 적용되는지.** 원문 경고 4회는 전부 수정송신 절에만 있다. 예약 큐의 송신구분 '대기' 가 이 케이스일 가능성이 높으나 미확인.
17. 표준카테고리 전체 트리·깊이(4단계는 스크린샷 드롭다운 기준 추정), 1회 송신 최대 건수, 부가정보코드 개수 상한.

### 6-5. KidItem 내부 미결

18. **KC·상품정보고시 데이터를 어디서 채우는가.** 현재 DB 에 필드가 없으므로 소싱 단계 입력, 공급사 문서 파싱, 쿠팡 기존 리스팅 역수집 중 무엇이 원천인지 정해야 Phase 0 이 끝난다.
19. **`ChannelAccount` 승격 시 `order_collection` config 와의 이중 관리.** 자격증명은 한 곳(원천)에만 둔다는 원칙은 정했으나, 몰 활성/비활성 토글이 어느 쪽을 진실로 볼지 미정.
20. **`CategoryMapping`(`prisma/models/core.prisma:409`) 재사용 가능 여부.** 실제 필드가 표준↔몰 매핑에 맞는지 미확인 — 확인 후 재사용/확장 결정.
21. **`ProductRegistrationExecution` 흡수 시점.** Phase 5 로 잡았으나, 그 전에 쿠팡 등록 화면 요구가 들어오면 앞당겨야 한다.
---

## 7. Phase 0 구현 기록 (2026-09-02)

구현하면서 §4 설계와 달라진 곳과 그 근거.

### 7-1. 몰 계정 "승격"을 하지 않기로 했다

설계는 `order_collection` config JSON 안의 27개 몰을 `ChannelAccount(channel='<mallKey>')`
row 로 승격하자고 했다. **전제가 틀렸다.** 실제 코드는 이미 몰 하나당 `ChannelAccount`
한 row 다 — `channel='order_collection'`, `externalAccountId=<mallKey>`
(`order-collection-mall-account.service.ts`). 리스팅 FK 를 걸 앵커가 이미 있다.

그래서 승격 대신 **앵커 두 모양을 하나로 읽는다**:

| 앵커 모양 | 예 | mallKey |
|---|---|---|
| `channel='order_collection'` + `externalAccountId` | 27개 몰 | `externalAccountId` |
| `channel=<mallKey>` | `coupang`(Wing) · `rocket` | `channel` |

`listMallAccountAnchors()` 가 이 둘을 합쳐서 낸다. 자격증명을 복제하지 않으므로
설계의 미결 #19(이중 관리) 가 생기지 않는다.

### 7-2. `rocket` 매니페스트를 추가했다 (27 → 29)

실측: `channel_accounts` 는 `coupang` 1 · `rocket` 1 · `order_collection` 27,
리스팅은 `coupang` 1,230 · `rocket` 459. 품절 후보 387건이 전부 `rocket` 인데
매니페스트가 없어 "매니페스트가 없습니다"로만 보였다. `applicable: false` 로
선언해 **"쿠팡 로켓은 상품 판매 채널이 아닙니다"** 라는 정확한 사유가 나오게 했다.

### 7-3. 고시·KC 는 Channels 소유로 뒀다

`ProductNoticeAttribute` 는 몰별 override(`channel` 컬럼)를 갖고, 존재 이유가 몰 송신
게이트다. `MasterProduct` 에는 back-relation 2줄만 추가했다.

### 7-4. 카테고리 매핑은 프로필의 `categoryCode` 로만 판정한다

`MallCategoryLink` 는 Phase 0 범위 밖이라 상품×몰 매핑이 없다. 지금은 프로필이 몰
카테고리를 직접 지정한 경우(설계의 "우선순위 1")만 매핑된 것으로 센다. 그래서 현재
모든 상품이 `mall_category_mapped` 에서 막힌다 — **그게 실제 상태다.**

### 7-5. 라우트 배치

`(channels)` route group 을 새로 만들고 `/mall-listings`·`/mall-availability`·
`/mall-tasks` 를 넣었다. `/mall-settings` 는 `(orders)` 에 남겼다 — 그 화면이 편집하는
건 주문수집이 소유한 `order_collection` 자격증명이고, 옮기면 API 표면 전체가
크로스그룹 import 가 된다. 사이드바 '쇼핑몰 관리' 섹션에서만 네 화면이 합쳐 보인다.

### 7-6. Phase 0 실측 결과

| 지표 | 값 |
|---|---|
| 선언된 몰 매니페스트 | 29 (송신 경로 확인 13 · 미확인 14 · 판매채널 아님 2) |
| MasterProduct | 2,955 |
| 어떤 몰에든 올릴 수 있는 상품 | **0** |
| 공통 차단 사유 | 카테고리 매핑 · 상품정보고시 · KC 인증 · 송신 프로필 (전부 데이터 0건) |
| 품절 후보(`sellableStock=0`) | 387 (전부 `rocket` → 송신 대상 아님) |

**"어떤 몰에도 못 올린다"가 Phase 0 의 산출물이다.** 고시·KC·카테고리·프로필이 DB 에
아예 없다는 걸 숫자로 확인했고, 다음 단계는 그걸 채우는 입력 화면이다.

### 7-7. 남은 것 (Phase 0 완료 조건 중 미완)

- 고시·KC·프로필 **입력 화면**. 지금은 API 만 있고 편집 UI 가 없다(§6-5 #18: 원천을
  소싱 입력 / 공급사 문서 파싱 / 쿠팡 리스팅 역수집 중 무엇으로 할지 미정).
- `MallCategoryLink` 또는 `CategoryMapping` 재사용 판정(§6-5 #20).
- 쿠팡 OpenAPI 키 점유 여부(§6-1 #1) — Phase 1 대상 몰이 여기서 갈린다.
