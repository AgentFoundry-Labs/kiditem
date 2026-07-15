# Sellpia 재고 최신성·자동 동기화·운영 화면 통합 설계

## 상태와 권위

핵심 방향은 2026-07-15 사용자 대화에서 승인되었다. 이 written spec은
동시성·Rocket 안전 경계를 자체 검토해 구체화한 버전이며 구현 계획 전
사용자 문서 검토를 기다린다. 현재 `develop`의
Sellpia 재고 소유권은 유지하면서, 중앙 최신성 상태, Chrome 기반 자동
동기화, 모든 발주 경로의 공통 차단 규칙, 주문·발주·재고 화면 소유권을
한 계약으로 정리한다.

기존 문서와의 권위 관계는 다음과 같다.

- [`2026-07-12-sellpia-authoritative-inventory-cutover-design.md`](./2026-07-12-sellpia-authoritative-inventory-cutover-design.md)의
  데이터 소유권과 `MasterProduct.currentStock` 불변식은 그대로 유지한다.
- [`2026-07-13-develop-ui-contract-adoption-design.md`](./2026-07-13-develop-ui-contract-adoption-design.md)의
  8개 재고 탭과 `/stock-ops` 분리 결정은 이 문서의 운영 화면 정보구조가
  대체한다. 기존 기능과 데이터는 삭제하지 않고 새 기준 화면으로 옮긴다.
- [`2026-07-14-background-browser-collection-session-design.md`](./2026-07-14-background-browser-collection-session-design.md)의
  비활성 탭, 중복 실행 합류, `attention_required`, 명시적 탭 열기 계약을
  Sellpia 재고 수집에도 적용한다.
- [`2026-07-14-extension-supabase-auth-continuity-design.md`](./2026-07-14-extension-supabase-auth-continuity-design.md)의
  웹 세션 소유 인증 갱신을 유지한다. `order-collector`에 장기 서비스
  토큰이나 Supabase refresh token을 추가하지 않는다.
- [`2026-07-14-normalized-registered-name-matching-design.md`](./2026-07-14-normalized-registered-name-matching-design.md)의
  등록상품명 정규화 일치는 검토 후보일 뿐 자동 구성 저장이 아니라는
  계약을 유지한다.
- 이미 폐기된 2026-06-28 Rocket 재고 조정, 예약재고, Rocket 전용 원장,
  `ProductOption.legacyCode` 방식은 재도입하지 않는다.
- 2026-07-12 문서에서 보류했던 Rocket PO 수량 판단은 이 문서의
  read-time capacity 기반 preview 범위에서 다시 연다. 이 결정은 Rocket
  전용 재고원장이나 KidItem 재고 차감을 다시 여는 것이 아니다.

이 작업은 Inventory 최신성이라는 하나의 플랫폼 경계를 Orders, Supply,
Channels, Web, Chrome extension 소비자에게 연결하는 같은 목적의
cross-layer reconstruction이다. 관련 화면 소유권 변경도 이 최신성 계약을
일관되게 노출하기 위한 범위에 한정한다.

중앙 상태와 import provenance가 재시작 뒤에도 유지되어야 하므로 persisted
schema와 data behavior가 바뀐다. 구현 시 현재 `VERSION` `0.1.18`을
`0.1.19`로 올리고 기존 완료 import를 초기 최신성으로 승격하는 버전형
data migration을 포함한다.

## 문제 정의

Sellpia는 KidItem의 물리 재고 기준 시스템이지만 현재 KidItem은 다음을
일관되게 답하지 못한다.

- 마지막으로 유효한 Sellpia 전체 파일을 언제 검증했는가;
- 그 검증 뒤 주문 전송처럼 재고가 달라질 수 있는 사건이 있었는가;
- 지금 자동 동기화가 진행 중인지, 실패했다면 무엇을 해야 하는가;
- 실제 발주를 진행해도 되는가;
- 수동 파일 가져오기와 자동 동기화가 같은 재고 이력인지;
- 재고, 발주, 주문, 매칭 중 어디에서 상태와 복구 동작을 확인해야 하는가.

화면도 동일한 기능을 여러 위치에서 반복한다. `/inventory-hub`는 8개
탭을 가지고 `/stock-ops`와 데이터를 중복 표시하며, 일반 발주는 재고
허브 안에 있지만 Rocket 발주는 별도 라우트에 있다. `/order-hub`는
비활성 탭을 CSS로만 숨겨 보이지 않는 주문수집 화면의 API 요청, 타이머,
토스트까지 실행한다.

## 승인된 결정

1. Sellpia `MasterProduct`가 물리 현재고의 유일한 기준이다.
2. 주문, 발주, 반품, 매칭, Rocket 흐름은 `currentStock`을 추측하거나
   직접 증감하지 않는다.
3. 주문을 Sellpia로 전송한 뒤에도 기존 수량은 유지한다. 다만 그 수량의
   신뢰 상태를 `갱신 필요`로 바꾸고 자동 동기화를 예약한다.
4. 전사 공통 최신성 표현은 `최신`, `갱신 필요`, `갱신 중`, `실패` 네
   가지다.
5. 마지막 유효 검증 후 10분이 지나면 최신하지 않다.
6. 초안 작성과 발주 대기는 허용하지만 실제 발주·외부 checkout은
   `최신`일 때만 허용한다. 운영자 우회는 제공하지 않는다.
7. 수동 파일 가져오기와 자동 Sellpia 동기화는 하나의
   `SourceImportRun` 이력으로 표시한다.
8. 같은 파일 해시는 새 이력 행이나 재고 쓰기를 만들지 않고 최신 검증
   시각과 검증 횟수를 갱신한다.
9. 기존 `extensions/order-collector`에 Sellpia 재고 수집 capability를
   추가한다. 새 확장 프로그램과 서버 저장 Sellpia 비밀번호·쿠키는
   추가하지 않는다.
10. Chrome 프로필의 Sellpia 로그인 세션을 사용한다. 자동 실행은
    Chrome과 로그인된 KidItem 탭이 열려 있을 때 보장하며, KidItem 탭이
    없으면 서버의 갱신 요청을 보존했다가 다음 탭 진입 시 시작한다.
11. 운영 화면은 재고, 발주, 주문, 상품, 상품 매칭의 다섯 기준
    작업공간으로 정리한다.

## 검토한 방식

### 시간 기준만 사용하는 방식

마지막 동기화가 10분 이내면 언제나 최신으로 보는 방식이다. 구현은
작지만 동기화 직후 주문을 전송하면, 10분 동안 주문 전 재고로 실제
발주가 통과할 수 있다. 알려진 변경 가능 사건을 무시하므로 채택하지
않는다.

### 주문 전송 시 KidItem 재고를 직접 차감하는 방식

발주 전 재고가 즉시 줄어 보이지만 Sellpia 접수 성공과 차감 규칙을
KidItem이 추측하게 된다. Sellpia 단일 진실 원본과 충돌하고 이중 차감
위험이 있어 채택하지 않는다.

### 수량과 최신성을 분리하는 중앙 상태 — 채택

Sellpia에서 새 전체 파일을 검증하기 전까지 재고 숫자는 바꾸지 않는다.
대신 마지막 검증 뒤 발생한 사건과 유효시간을 중앙 최신성 상태가
추적한다. 모든 화면은 같은 상태를 읽되, 실제 발주만 강하게 차단한다.

## 핵심 불변식

1. 완료된 유효 Sellpia 전체 스냅샷만 `MasterProduct.currentStock`을 쓴다.
2. 최신성 변경은 재고 수량 변경이 아니다.
3. `갱신 필요`와 `실패`에서도 마지막 완료 재고는 참고값으로 남는다.
4. 검증되지 않은 파일, 부분 파일, 로그인 HTML은 마지막 완료 재고를
   덮지 않는다.
5. 최신성은 조직별이다. 클라이언트가 보낸 `organizationId`를 신뢰하지
   않는다.
6. 한 조직의 Sellpia 재고 수집은 한 번에 하나만 실행한다. 같은 범위의
   요청은 실행을 새로 만들지 않고 기존 실행에 합류한다.
7. 오래된 다운로드는 더 최신 generation을 덮을 수 없다.
8. 수동과 자동은 동일한 parser, 품질 검사, publication transaction을
   사용한다.
9. 주문 전송 성공 응답은 Sellpia 접수 완료 증명이 아니다.
10. 최신성 통과만으로 발주 품목이 유효하다고 가정하지 않는다. 실제
    발주 직전에 모든 `MasterProduct`가 현재 조직에서 active인지 다시
    검사한다.

## 전체 구조

```text
Mall order collection
  -> Sellpia 전송 요청 성공
  -> currentStock 유지
  -> 중앙 상태 refreshRequestedAt 기록
  -> 짧은 Sellpia 반영 대기 후 자동 수집 예약

Inventory-sensitive action
  -> SellpiaInventoryFreshnessService
       -> 최신: 정책에 따라 계속
       -> 갱신 필요/실패: 동기화 요청
       -> 갱신 중: 기존 실행 합류

Logged-in KidItem web tab
  -> order-collector collectSellpiaInventory
       -> Chrome Sellpia session
       -> 전체상품 / 옵션상품 Excel 다운로드
  -> authenticated web upload
  -> Sellpia parser + quality policy
  -> SourceImportRun publication or same-hash verification
  -> MasterProduct snapshot + central freshness update
```

확장 프로그램은 Sellpia 브라우저 세션만 사용하고 파일 bytes를 웹으로
돌려준다. 인증된 웹 탭이 서버 import API를 호출하므로 order collector가
KidItem API token을 직접 보관하거나 서버 queue를 polling하지 않는다.

## 중앙 최신성 모델

### `SellpiaInventoryState`

조직당 하나의 현재 상태 행을 둔다. 이것은 실행 이력이 아니라 현재
신뢰 상태와 실행 lease의 materialized owner다.

```text
organizationId             UUID, primary key
sourceOrigin               String       // https://kiditem.sellpia.com
sourceAccountKey           String?      // non-secret tenant key: kiditem
lastVerifiedAt             Timestamptz?
lastCompletedImportRunId   UUID?
refreshRequestedAt         Timestamptz?
refreshReason              String?
syncNotBefore              Timestamptz?
activeSyncToken            UUID?
activeSyncStartedAt        Timestamptz?
activeSyncLeaseExpiresAt   Timestamptz?
requestedGeneration        BigInt
activeGeneration           BigInt?
verifiedGeneration         BigInt
failedGeneration           BigInt?
lastAttemptAt              Timestamptz?
lastAttemptStatus          String?       // completed | failed
lastErrorCode              String?
lastErrorMessage           String?
createdAt                  Timestamptz
updatedAt                  Timestamptz
```

문자열 필드는 shared Zod와 domain validation으로 제한하며 Prisma native
enum을 추가하지 않는다. `lastCompletedImportRunId`는 같은 조직의 완료된
Sellpia `SourceImportRun`만 참조한다.

`refreshReason`은 최소 다음 값을 지원한다.

- `initial_snapshot`
- `ttl_expired`
- `order_transmission_requested`
- `same_hash_confirmation`
- `purchase_preflight`
- `manual_request`
- `retry`
- `legacy_manual_import`

새 조직은 최초 freshness 조회에서 이 행을 lazy upsert하고
`requestedGeneration = 1`, `verifiedGeneration = 0`,
`refreshReason = initial_snapshot`으로 시작한다. 기존 조직은 아래 data
migration으로 초기화한다. 모든 BigInt API 필드는 JSON number가 아니라
10진 문자열로 직렬화한다.

`sourceOrigin`과 `sourceAccountKey`는 Sellpia credential이 아니라 source
binding이다. `kiditem.sellpia.com`의 tenant key는 `kiditem`이며, extension이
반환한 실제 origin/key가 조직에 바인딩된 값과 다르면 publication을
차단한다. 기존 운영 조직은 migration에서 `kiditem`으로 바인딩한다. 새
조직은 조직 관리자만 공통 최신성 drawer에서 현재 로그인한 Sellpia
tenant key를 한 번 확인할 수 있으며 별도 계정 설정 페이지를 만들지
않는다.

### 상태 파생 우선순위

UI와 정책 서비스는 다음 순서로 하나의 상태를 계산한다.

1. 유효한 active lease가 있으면 `syncing` (`갱신 중`). 실행 중 더 새
   generation이 요청됐으면 `후속 갱신 대기`를 보조 문구로 표시한다.
2. `failedGeneration = requestedGeneration`이고
   `failedGeneration > verifiedGeneration`이면 `failed` (`실패`).
3. `requestedGeneration > verifiedGeneration`, `lastVerifiedAt` 없음, 또는
   10분 TTL 만료 중 하나라도 참이면 `refresh_required` (`갱신 필요`).
4. 그 외에는 `fresh` (`최신`).

`now - lastVerifiedAt < 10분`일 때만 유효하며 정확히 10분이 되는 순간부터
`refresh_required`다. `activeSyncToken`은 browser collection session의
logical `runId`와 같은 실행 identity를 사용한다.

### Generation 전이

- 주문 전송처럼 새로운 잠재 변경 사건은 transaction에서
  `requestedGeneration`을 1 증가시킨다.
- 이미 pending인 단순 화면 새로고침·중복 클릭은 generation을 늘리지
  않고 현재 요청에 합류한다.
- claim은 그 순간의 `requestedGeneration`을 `activeGeneration`으로
  캡처한다.
- 성공 파일은 `activeGeneration`까지만 검증하며
  `verifiedGeneration = activeGeneration`으로 올린다.
- 실행 중 새 주문이 들어와 `requestedGeneration > activeGeneration`이
  되면 현재 파일 완료가 그 새 요청을 지우지 못한다. 완료 직후 후속
  실행이 pending으로 남는다.
- 실패는 `failedGeneration = activeGeneration`을 기록한다. 그보다 새
  retry generation이 생기면 상태는 다시 `갱신 필요`가 된다.

따라서 다운로드 뒤 새 주문 전송이 발생해도 이전 파일의 늦은 import가
중앙 상태를 `최신`으로 잘못 되돌릴 수 없다.

만료된 active lease는 성공으로 간주하지 않는다. 실행 복구가 가능하면
기존 browser collection session에 재결합하고, 실행이 사라졌으면
`갱신 필요` 또는 명시적 `실패`로 되돌린다.

### 화면별 정책

| 소비 화면/동작 | 최신성 정책 |
|---|---|
| 주문 수집·파일 생성·Sellpia 전송 | 상태를 표시하지만 계속 허용 |
| 재고 조회 | 마지막 재고와 검증 시각을 표시하고 계속 허용 |
| 상품 매칭 편집 | 계속 허용하며 재고 값이 참고값임을 표시 |
| 발주 초안·대기 | 계속 허용 |
| 실제 `pending -> ordered` | `fresh`가 아니면 차단 |
| 외부 checkout 제출 | provider 호출 전에 `fresh`가 아니면 차단 |
| Rocket PO preview | `fresh`와 수집 완전성을 통과해야 추천수량 계산 |
| Rocket 실제 확정·제출 | `0.1.19`에서는 계속 비활성 |

## `SourceImportRun` 통합 이력 확장

수동 파일과 자동 수집 실행을 같은 테이블과 같은 화면에 남긴다.
`SourceImportRun.status`는 실행 결과인 `running`, `completed`, `failed`를
유지하며 중앙 최신성 상태로 재사용하지 않는다.

다음 provenance를 추가한다.

```text
fileName           String?       // 다운로드 전 실패 가능
fileHash           String?       // 다운로드 전 실패 가능
lastVerifiedAt     Timestamptz?
verificationCount Int            // completed 파일 최초 반영은 1
lastTrigger        String?
freshnessGeneration BigInt?
manualFreshExportConfirmedAt Timestamptz?
manualFreshExportConfirmedBy UUID?
qualityReport      Json?
errorCode          String?
errorMessage       String?
```

기존 hash unique constraint는 `fileHash IS NOT NULL`인 행에만 적용하는
partial unique로 바꾼다. 다운로드 전 실패 행은 여러 개 존재할 수 있지만,
같은 실제 파일 hash는 조직·source에서 하나의 completed provenance만
가진다. shared schema도 nullable file provenance와 새 검증 필드를 함께
검증한다.

nullable file provenance는 `sourceType = sellpia_inventory`,
`status = failed`, 다운로드 전 오류일 때만 허용한다. 모든 completed run과
Wing catalog run은 계속 `fileName`과 `fileHash`가 필수다.
`verificationCount` 기본값은 0이며 Sellpia completed run은 1 이상이다.
한 requested generation에서 발생한 동일 pre-download 실패는 같은 failed
run을 갱신하고 행을 무한히 추가하지 않는다.

새 파일이 유효하면 기존 publication 계약대로 재고를 원자적으로 교체하고
`importedAt`과 `lastVerifiedAt`을 기록한다. 이미 완료된 동일 hash라면:

- 새 `SourceImportRun`을 만들지 않는다;
- `MasterProduct`를 다시 쓰지 않는다;
- `lastVerifiedAt`, `verificationCount`, `lastTrigger`, 최신 quality report를
  갱신한다;
- `freshnessGeneration`을 이번 `activeGeneration`까지 올린다;
- 중앙 `SellpiaInventoryState.lastVerifiedAt`도 같은 시각으로 갱신한다;
- UI는 `이미 가져온 파일`이 아니라 `내용 변화 없음 · 최신 확인 완료`로
  표시한다.

로그인 만료처럼 파일을 받기 전 실패한 자동 실행은 nullable 파일
provenance를 가진 failed run으로 기록할 수 있다. 이 행도 수동/자동이
섞인 하나의 최신화 이력에 나타난다. 브라우저 제어용 `OperationAlert`는
주의 알림이지 별도 재고 import 이력이 아니므로 그대로 유지한다.

## 자동 Sellpia 수집

### Extension capability

기존 `extensions/order-collector`에 `collectSellpiaInventory` capability를
추가한다. 실행 classification은 `background_preferred`다.

수집 대상은 다음으로 고정한다.

```text
https://kiditem.sellpia.com/product_list_total.html
  -> 상품 전체 다운로드
  -> 옵션상품 선택
  -> Excel 다운로드
```

현재 관찰된 요청 계약은 다음과 같다.

```text
POST /product_search.down.html
downopt=2
downtype=excel
```

DOM 또는 요청 계약이 바뀌면 임의의 다른 다운로드를 성공 처리하지 않고
selector/contract drift 오류로 실패한다. 자동 실행은 탭을 활성화하거나
창을 포커스하지 않는다. 로그인 또는 사람 확인이 필요하면
`attention_required` 알림에서 사용자가 `확인 탭 열기`를 눌러야 한다.

### Web coordinator

로그인된 KidItem 탭의 공통 coordinator가 다음을 담당한다.

- 서버의 조직별 freshness 상태와 대기 요청을 조회한다;
- `syncNotBefore`가 지난 요청 하나를 claim한다;
- 설치 여부와 capability version을 확인한다;
- 확장 프로그램에 수집 명령을 보낸다;
- 받은 파일을 인증된 multipart import 요청으로 서버에 전달한다;
- 완료 후 관련 React Query family를 무효화한다;
- 중복 탭·사용자 요청은 같은 active token에 합류시킨다.

Chrome은 열려 있지만 로그인된 KidItem 탭이 없으면 실행을 성공으로
가장하지 않는다. `갱신 필요` 요청은 서버에 남고 다음 KidItem 탭이
열리면 coordinator가 이어서 시작한다. Sellpia 로그인 세션은 Chrome
프로필이 소유하며 서버에 비밀번호나 Sellpia cookie를 전달하지 않는다.

첫 claim을 얻은 로그인 사용자가 browser execution owner가 되고 personal
`OperationAlert`도 그 사용자에게 속한다. 같은 조직의 다른 사용자는
공유 freshness 상태와 진행률을 보고 active 실행에 합류하지만, 다른
사용자의 Chrome 탭을 열거나 실행을 중단할 수 없다. owner 탭과 실행이
사라지면 lease 만료 뒤 다른 사용자가 새 attempt를 claim할 수 있다.
조직 관리자는 만료된 claim만 정리할 수 있으며 살아 있는 다른 사용자의
lease를 강제로 탈취하지 않는다. 서로 다른 Chrome 세션도 동일한
sourceAccountKey 검사를 통과해야 한다.

수동 fallback으로 `갱신 필요`를 해제할 때는 운영자가
`갱신 요청 이후 Sellpia에서 새로 내려받은 전체 옵션상품 파일`임을
명시적으로 확인해야 한다. 확인하지 않으면 제출 버튼을 활성화하지 않으며,
이전에 보관한 파일은 새 `lastVerifiedAt`을 만들 수 없다. 서버가 file
bytes만으로 다운로드 시점을 증명할 수는 없으므로 이 fallback은 명시적
운영자 attestation을 신뢰한다. `manualFreshExportConfirmedAt`과 확인자,
당시 requested generation을 provenance에 남긴다.

### 실행 트리거

- 첫 유효 스냅샷이 없음;
- 재고 관련 화면 진입 시 10분 TTL 만료;
- 주문 파일의 Sellpia 전송 요청 성공;
- 실제 발주 preflight;
- 사용자의 `지금 동기화`;
- 실패 후 명시적 재시도.

10분 TTL은 실제 발주의 최대 허용 나이이지, 사용자가 아무 업무도 하지
않는 동안 무조건 10분마다 Excel을 내려받으라는 의미가 아니다. coordinator는
대기 요청이나 재고 민감 화면이 있을 때만 다운로드를 만든다.

## 주문수집과 Sellpia 반영

쇼핑몰별 raw 주문 수집만으로는 Sellpia 동기화를 만들지 않는다. Sellpia
양식 파일이 생성되고 전송 버튼 클릭이 성공한 뒤에만 재고 최신화를
요청한다.

```text
쇼핑몰별 주문 수집
  -> Sellpia 양식 생성
  -> Sellpia 전송 요청
  -> currentStock 유지
  -> freshness = 갱신 필요
  -> syncNotBefore = 마지막 전송 시각 + 반영 대기시간
  -> 여러 몰/파일 전송을 한 요청으로 debounce
  -> 자동 Sellpia 전체파일 수집
  -> 최신 또는 실패
```

현재 확장은 submit button click 직후 성공을 반환하므로 기존 `sentAt`을
접수 완료로 해석하지 않는다. local history와 view model의 의미를
`transmissionRequestedAt`으로 바꾸고 화면 문구는 `전송 요청됨`으로
표시한다. 실제 접수 검증이 추가돼도 최신성 모델과 분리한다.

Sellpia의 주문 처리 지연을 고려해 `0.1.19`의 주문 settle delay는 2분으로
고정한다. 여러 전송이 이어지면 `syncNotBefore`를 마지막 성공 클릭 시각
+ 2분으로 뒤로 미루되, 첫 pending 전송으로부터 최대 5분을 넘기지 않는다.

주문 트리거의 첫 다운로드 hash가 직전 completed hash와 다르면 정상
publication 후 해당 active generation을 검증한다. 같으면 Sellpia 반영
지연 가능성이 있으므로 아직 최신으로 인정하지 않고
`same_hash_confirmation` generation을 만들어 3분 뒤 한 번 더 수집한다.
두 번째 새 다운로드도 같은 hash면 두 시점의 Sellpia 전체 응답이 같았던
것으로 보고 그 generation을 검증한다. 두 번째 hash가 달라지면 정상
publication한다. 이 bounded confirmation 뒤에는 반복 수집 loop를 만들지
않는다.

동일 파일 재전송은 확인 대화상자를 거치고 중복 클릭·동시 전송을 막는다.

## 파일 수신과 품질 정책

서버는 파일명이나 HTTP 200만으로 Excel을 신뢰하지 않는다.

### Hard block

- HTML 또는 Sellpia 로그인 화면 응답;
- 허용되지 않은 MIME/magic bytes;
- 필수 workbook schema 누락;
- 유효 행 0개;
- 중복 Sellpia 상품코드;
- 직전 완료 스냅샷 대비 총 유효 행 30% 이상 감소;
- 직전 active 상품코드의 30% 이상이 한 번에 사라지는 snapshot;
- extension이 보고한 Sellpia origin/account key와 조직의 source binding 불일치;
- 음수 재고 또는 publication 불변식 위반.

Hard block은 이전 완료 snapshot과 최신성 기준을 그대로 유지한다.
운영자 override는 제공하지 않고 올바른 전체 파일로 재시도하게 한다.

### Warning

- 상품명 누락으로 코드가 표시명에 사용됨;
- 직전 active 집합 대비 신규+비활성 전환이 10% 이상 30% 미만;
- 바코드 중복 또는 누락;
- 가격 누락;
- 저장된 구성 레시피가 비활성 상품을 참조함.

Warning은 import를 막지 않되 `qualityReport`에 건수와 대표 행을 남기고
`fileHash + warningCode`가 같은 반복 경고를 중복 알림하지 않는다.

### Publication fencing

조직·source별 단일 lease를 claim하고 파일을 받은 시각과
publication generation을 함께 검사한다. 오래된 실행이 나중에 끝나도
새 generation을 덮지 못한다. 검증과 `MasterProduct` 교체, run 완료,
freshness 갱신은 같은 publication transaction에서 끝난다.

## 모든 발주 경로의 공통 게이트

Inventory가 `SellpiaInventoryFreshnessGate` incoming port를 제공한다.
Supply와 Rocket Orders는 구체 repository가 아니라 이 port를 호출한다.

실제 발주 직전 검사는 다음을 모두 확인한다.

1. 중앙 상태가 `fresh`이고 `lastVerifiedAt`이 10분 이내다.
2. `refreshRequestedAt`이 null이거나 `refreshRequestedAt <= lastVerifiedAt`이다.
3. 발주 품목의 모든 `MasterProduct`가 현재 조직에서 active다.
4. 수량과 참조 identity가 여전히 유효하다.
5. Rocket은 상세 수집 누락, 페이지 truncation, 계정/vendor 불일치가 없다.

조건별 오류는 복구 방식이 다르므로 다음처럼 분리한다.

- `SELLPIA_SYNC_REQUIRED`: 최신성 문제. 동기화 후 1회 재시도 가능;
- `PURCHASE_ITEM_INACTIVE`: Sellpia 비활성 품목. 발주 행 수정 필요;
- `PURCHASE_REFERENCE_INVALID`: 조직 또는 품목 identity 오류;
- `ROCKET_COLLECTION_INCOMPLETE`: Rocket 수집 누락·truncation·계정 오류.

Web은 `SELLPIA_SYNC_REQUIRED`에만 기존 active sync 합류 또는 새 sync를
시작하고 성공 뒤 원래 동작을 정확히 한 번 재시도한다. 로그인 만료,
품질 차단, 다른 오류 코드, 두 번째 실패에는 자동 재시도하지 않는다.

적용 위치는 다음과 같다.

- 일반 `PurchaseOrder`의 `pending -> ordered`;
- supplier/manual 발주;
- 추천 또는 Agent OS가 deterministic 발주 capability를 호출하는 경로;
- 외부 checkout provider 호출 직전;
- 미래에 추가되는 모든 실제 구매 경로. 이 문서 범위 밖에서 Rocket
  actual 제출이 별도 승인되는 경우에도 이 port가 선행 조건이다.

외부 side effect가 있는 경로는 durable `PurchaseOrderSubmissionAttempt`를
사용한다.

```text
id
organizationId
purchaseOrderId
idempotencyKey
freshnessGeneration
status              // prepared | provider_succeeded | provider_failed |
                    // provider_unknown | reconciled
providerReference?
errorCode?
createdAt / updatedAt
```

`(organizationId, purchaseOrderId, idempotencyKey)`는 unique다. transaction
안에서 freshness generation과 active 품목을 검사하고 `prepared` intent를
get-or-create한 뒤 commit한다. 그 다음에만 provider를 호출한다. provider가
idempotency key를 지원하면 같은 내부 key를 전달하고, 지원하지 않더라도
내부 intent key는 필수다.

응답이 명확한 성공·실패면 attempt와 PurchaseOrder 상태를 확정한다.
timeout이나 불명확 응답은 `provider_unknown`으로 남기고 자동 재호출하지
않는다. 외부 주문이 생겼지만 KidItem 반영이 끝나지 않은 경우
`외부 주문 생성됨 · 반영 확인 필요`를 표시하고 provider 조회 또는
운영자 확인으로 `reconciled`한다.

claim 뒤 들어온 새 freshness generation은 이미 시작한 provider call을
소급 취소하지 않는다. 대신 같은 PO의 두 번째 submission은 기존 intent
결과를 먼저 reconcile해야 하며 새 호출을 만들지 않는다. provider가 없는
단순 `pending -> ordered`는 freshness row와 PO row를 같은 transaction에서
잠그고 검사·전환한다.

재고에 영향을 줄 수 있는 제출이 성공하면 attempt를 완료하기 전에
`refreshRequestedAt`을 기록한다. 따라서 동시에 기다리던 두 번째 제출은
기존 snapshot으로 통과하지 못하고 최신화 뒤 다시 판단한다. 일반 입고
구매처럼 주문 자체가 Sellpia 현재고를 바꾸지 않는 경로는 성공 직후
갱신 요청을 만들지 않는다.

## Rocket PO 판단

현재 전용 Rocket 화면의 달력·PO 선택·확정 파일 preview 흐름은 발주
작업공간의 `쿠팡 로켓` 보기로 옮겨 유지한다. 판단 데이터는 폐기된
`ProductOption.barcode -> Inventory`가 아니라 Rocket `ChannelAccount`의
`ChannelListingOption -> ChannelSkuComponent -> MasterProduct`를 사용한다.

```text
Rocket PO 상세 수집
  -> Rocket account/vendor와 SKU identity 확인
  -> confirmed component recipe 조회
  -> read-time sellableCapacity 계산
  -> 한 preview 안에서 공유 구성품을 순서대로 임시 배분
  -> 추천 확정수량 표시
  -> 운영자 편집
  -> freshness와 수집 완전성 재검사
  -> 검토용 preview
```

preview의 임시 배분은 같은 preview 행끼리 과다 추천하지 않기 위한 순수
계산이며 DB 예약재고를 만들지 않는다. 배분 순서는 납품 예정일, PO 번호,
PO line ID의 오름차순으로 고정한다. 운영자 편집값은 preview를 다시
검증할 때 계산한 잔여 component capacity를 넘을 수 없다. `0.1.19`에는
submit 동작 자체를 열지 않는다. 재실행은 최신 Sellpia snapshot으로 처음부터
다시 계산한다. 상세 파싱 실패, 목록 20페이지 또는 상세
40페이지 상한 도달, 누락 PO, Rocket account/vendor 불일치는 불완전
preview로 표시한다.

Rocket 확정이 Sellpia 재고에 반영되는 시점과 경로가 현재 증명되지
않았고, persistent commitment를 두면 금지된 예약재고를 다른 이름으로
재도입하게 된다. 따라서 이 릴리스는 read-time 추천과 운영자 검토까지만
제공하며 실제 확정 workbook 생성·provider 제출은 계속 차단한다. 이
제한은 숨은 후속 작업이 아니라 현재 재고 소유권에서 의도적으로 제외한
안전 경계다.

## 비활성 구성품과 가용재고

전체 snapshot에서 사라진 Sellpia 상품은 기존 계약대로 삭제하지 않고
`currentStock = 0`, `isActive = false`가 된다. 저장된
`ChannelSkuComponent`도 자동 삭제하지 않는다.

confirmed component 조회는 inactive `MasterProduct` identity도 반환해야
한다. availability는 해당 component를 재고 0과
`component_inactive` warning으로 표시한다. confirmed component가 남아
있는 동안 persisted `mappingStatus = matched` 불변식은 바꾸지 않는다.
UI의 `매칭 확인 필요` 작업 큐가 이 availability warning을 파생 조건으로
포함할 뿐이다. 비활성 구성품 하나가 전체 availability 요청을 500으로
실패시키면 안 된다.

실제 발주에서는 비활성 구성품을 행 단위 차단 사유로 표시한다.

## 화면 정보구조

### 기준 작업공간

| 기준 라우트 | 상위 보기 | 흡수하는 현재 화면 |
|---|---|---|
| `/inventory-hub` | 개요, 재고 현황, 주의 필요, 이력·자산 | `/stock-ops`, 수불부, 재고 실사, 중복 이관·반품·자산 보기 |
| `/purchase-orders` | 일반 발주, 쿠팡 로켓 | 재고 허브 발주 탭, `/rocket-orders`, 거래처별 발주 목록 |
| `/order-hub` | 수집·접수, 주문 처리, 출고, 예외 | `/order-collection`, `/order-status-hub`, 중복 outbound 보기 |
| `/product-hub` | 상품 목록, 옵션형 보기 preset | `/product-hub/options` |
| `/product-hub/matching` | 매칭 작업 전용 | `/stock-ops`의 중복 매핑 확인 목록 |

상품 옵션 작업공간의 검색, 필터, 표, 페이지네이션은 삭제하지 않고
`/product-hub?view=options`로 옮긴다. 상품 매칭은 후보 탐색과 레시피
편집 밀도가 높으므로 독립 작업공간을 유지한다.

### 호환 라우트

기존 주소는 쿼리를 보존해 다음으로 redirect한다.

```text
/inventory                  -> /inventory-hub?tab=inventory
/stock-ops                 -> /inventory-hub?tab=attention&view=sellpia-zero
/order-collection           -> /order-hub?tab=collection
/unshipped-items            -> /order-hub?tab=exceptions&view=unshipped
/outbound                   -> /order-hub?tab=shipping
/order-status-hub           -> /order-hub?tab=exceptions&view=order-inventory
/rocket-orders              -> /purchase-orders?tab=rocket
/product-hub/options        -> /product-hub?view=options
/stock-ops?tab=sellpia-zero -> /inventory-hub?tab=attention&view=sellpia-zero
/stock-ops?tab=channel-zero -> /inventory-hub?tab=attention&view=channel-zero
/stock-ops?tab=bottlenecks  -> /inventory-hub?tab=attention&view=bottlenecks
/stock-ops?tab=mapping-attention
                            -> /product-hub/matching?status=needs_review
/stock-ops?tab=inventory-value
                            -> /inventory-hub?tab=history&view=assets
/stock-ops?tab=transfer     -> /inventory-hub?tab=history&view=transfer
/stock-ops?tab=return       -> /inventory-hub?tab=history&view=return
/stock-ops?tab=freshness    -> /inventory-hub?tab=overview

/order-status-hub?tab=inventory
                            -> /order-hub?tab=exceptions&view=order-inventory
/order-status-hub?tab=delivery
                            -> /order-hub?tab=shipping&view=delivery-search
/order-status-hub?tab=compare
                            -> /order-hub?tab=exceptions&view=order-compare
/order-status-hub?tab=sync  -> /order-hub?tab=exceptions&view=sync-check
```

`/purchase-orders?orderId=...`는 query를 읽어 실제 발주를 선택·강조한다.
거래처 상세의 발주 목록은 `/purchase-orders?supplierId=...`로 이동한다.
대시보드, action seed, 서버 생성 href, runbook, 테스트를 새 주소로 먼저
바꾼 뒤 사이드바 중복 항목을 숨긴다.

### 공통 최신성 패널

Sellpia 동기화는 독립 상위 탭이 아니라 재고, 발주, 주문접수, 상품 매칭
상단의 같은 compact status component로 표시한다.

```text
최신          마지막 검증 7분 전
갱신 필요     주문 전송 후 최신화 대기
갱신 중       옵션상품 Excel 다운로드 중
실패          Sellpia 로그인 필요
```

상태를 누르면 하나의 drawer/panel에서 다음을 제공한다.

- 현재 기준과 10분 유효시간;
- 최근 실행 단계와 실패 원인;
- `지금 동기화`;
- `확인 탭 열기`, 재시도, 취소;
- 수동 Excel 가져오기 fallback;
- 수동·자동이 섞인 하나의 `SourceImportRun` 이력;
- quality report와 복구 동작.

패널은 `현재 기준`과 `최근 실행`을 구분해 같은 화면에 표시한다. 최근
자동 실행이 실패했더라도 마지막 완료 snapshot과 그 시각을 숨기지 않으며,
primary 네 상태는 위의 파생 규칙 하나만 사용한다.

재고 toolbar, 표, 이력 정렬, CSV 내보내기의 기존 `최종 가져오기` 문구와
값은 최신성 용도에서는 `마지막 검증`/`lastVerifiedAt`으로 바꾼다.
`importedAt`은 해당 hash가 처음 실제 재고를 publication한 시각으로만
남으며 현재 최신성 판단에 사용하지 않는다.

별도 Sellpia 계정·비밀번호 설정 화면은 추가하지 않는다.

### 화면 동작과 접근성

- URL이 탭 상태의 source of truth다.
- 비활성 탭은 CSS로 숨기지 않고 lazy render/unmount한다.
- `page.tsx`를 다른 `page.tsx`에서 직접 임베딩하지 않고 작업공간
  component를 추출한다.
- 페이지당 실제 `h1`은 하나만 둔다.
- 탭은 `tablist`, `tab`, `tabpanel` 의미와 키보드 이동을 제공한다.
- 날짜 입력, combobox, 첫/마지막 페이지 버튼에 접근 가능한 이름을 준다.
- floating quick/AI button이 표의 상태·작업 열을 가리지 않게 배치한다.
- 주문수집은 큰 통계 차트보다 `Sellpia 전송 필요`, `전송 요청됨`,
  `재고 반영 대기`, 오류 복구 같은 다음 행동을 위에 둔다.
- 몰 계정은 `조치 필요`, `수집 가능`, `설정 필요`로 묶는다.

### 용어

일반적인 `확인 필요`를 여러 의미로 재사용하지 않는다.

| 영역 | 문구 |
|---|---|
| 최신성 | `갱신 필요` |
| 파일 품질 | `품질 경고`, `형식 오류` |
| SKU 구성 | `연결 없음`, `매칭 확인 필요`, `연결 완료` |
| 주문 전송 | `전송 요청됨` |
| 실제 발주 차단 | `재고 최신화 후 발주 가능` |

정규화 등록상품명과 AI 후보는 advisory다. 운영자가 구성품과 수량을
저장하기 전에는 `ChannelSkuComponent`를 만들지 않는다.

## 오류와 복구

| 원인 | 상태와 복구 |
|---|---|
| 확장 프로그램 없음 | `실패`; 설치 안내, 자동 탭 열기 없음 |
| capability 구버전 | `실패`; 확장 reload/update 안내 |
| Sellpia 로그인 만료 | `실패`; `확인 탭 열기` |
| 로그인 HTML 또는 비 Excel | `형식 오류`; 이전 snapshot 유지 |
| DOM/download 계약 변경 | 명시적 selector drift; 재시도 loop 금지 |
| 네트워크/429/일시 5xx | bounded backoff 후 실패 |
| 품질 hard block | `실패`; quality report와 올바른 전체파일 재시도 |
| active 실행 중 추가 요청 | 기존 실행 합류, 새 실행 생성 금지 |
| Chrome/KidItem 탭 종료 | 요청 보존, 다음 로그인 탭에서 재개 |
| external checkout 부분 성공 | idempotent reconcile, 중복 provider 주문 금지 |

실패 메시지에는 raw workbook, cookie, token, marketplace 응답 전체를
포함하지 않는다.

## API 계약 방향

기존 `/api/inventory/sellpia-sync/import`는 manual/browser 공통 multipart
publication endpoint로 유지한다. 새 HTTP capability는 다음 소유권으로
분리한다.

- `GET /api/inventory/sellpia-freshness`: 현재 상태와 최근 실행 요약;
- `POST /api/inventory/sellpia-freshness/requests`: 갱신 요청 또는 기존
  요청 합류;
- `POST /api/inventory/sellpia-freshness/claims`: due 요청 lease claim;
- `POST /api/inventory/sellpia-freshness/claims/:token/heartbeat`: 실행
  heartbeat;
- `POST /api/inventory/sellpia-freshness/claims/:token/fail`: sanitized 실패;
- `POST /api/inventory/sellpia-freshness/claims/:token/cancel`: owner의
  cooperative 중단과 lease 해제. freshness는 `갱신 필요`로 남음;
- 기존 `GET /api/inventory/sellpia-sync/import-runs`: 통합 run과 quality
  report를 포함하도록 응답 확장.

import 성공이 claim complete를 원자적으로 처리하므로 별도의 클라이언트
`complete` endpoint는 만들지 않는다. 실제 발주용 freshness/assert-active
gate는 Inventory incoming port이며 public 우회 API로 노출하지 않는다.

browser claim을 완료하는 multipart import는 `claimToken`, 10진 문자열
`activeGeneration`, `trigger`, source origin/account key를 함께 보낸다.
수동 fallback은 이들 대신 `manualFreshExportConfirmed = true`와 서버가
기록할 attestation actor를 사용한다. actor와 organization은 인증
context에서 파생하며 multipart 값을 신뢰하지 않는다.

mutation service는 `@CurrentOrganization()`에서 받은 `organizationId`를
받으며 DTO에 조직 ID를 노출하지 않는다. 상태 조회와 단일 resource
접근도 조직 범위를 포함한다.

## 마이그레이션과 릴리스

`0.1.19` data migration은 기존 데이터를 다음처럼 초기화한다.

1. 각 조직의 최신 completed `sellpia_inventory` run을 찾는다.
2. completed run은 `lastVerifiedAt = importedAt`,
   `verificationCount = 1`, `lastTrigger = legacy_manual_import`로 채운다.
   기존 failed/running run은 `verificationCount = 0`이며 nullable field를
   억지로 바꾸지 않는다.
3. 조직별 `SellpiaInventoryState`를 만들고 기존 운영 조직을
   `https://kiditem.sellpia.com` / `kiditem` source에 바인딩한다.
4. 완료 run이 있으면 그 `importedAt`과 run ID를 마지막 검증 기준으로
   사용하며 `requestedGeneration = verifiedGeneration = 1`로 둔다.
5. 완료 run이 없으면 `requestedGeneration = 1`,
   `verifiedGeneration = 0`, `initial_snapshot` 갱신 요청 상태로 시작한다.
6. 기존 `MasterProduct.currentStock` 값은 migration에서 변경하지 않는다.

data migration은
`scripts/data-migrations/v0.1.19/001_sellpia_inventory_freshness.ts`에 두고
재실행 가능하게 작성한다.

`docs/ARCHITECTURE.md`,
`docs/runbooks/sellpia-rocket-inventory-sync.md`,
`docs/runbooks/channel-sellpia-matching.md`를 갱신하고 Chrome·KidItem 탭
전제, source binding, 실패 복구, 수동 attestation을 설명하는
`docs/runbooks/sellpia-inventory-freshness.md`를 추가한다.

이 설계는 기존 scoped instruction의 route/owned-surface 계약도 바꾼다.
구현 PR에서 최소 다음 파일을 코드와 함께 갱신하고 팀에 공유한다.

- `apps/server/src/inventory/AGENTS.md`;
- `apps/web/src/app/(inventory)/AGENTS.md`;
- `apps/web/src/app/(orders)/AGENTS.md`와 더 구체적인 관련 route guide;
- `apps/web/src/app/(supply)/AGENTS.md`;
- `apps/web/src/app/(catalog)/product-hub/AGENTS.md`;
- `extensions/order-collector/AGENTS.md`.

## 테스트 전략

### Domain과 repository

- 네 상태 파생 우선순위와 10분 경계;
- 실행 중 새 주문이 requested generation을 올리고 후속 실행을 남김;
- 주문 전송 뒤 수량 불변·최신성만 변경;
- 같은 hash 검증 시 재고 미쓰기, 검증 시각/횟수 갱신;
- 주문 후 첫 same-hash는 검증하지 않고 bounded confirmation 뒤 검증;
- manual과 browser import의 동일 parser/publication 경로;
- 30% 행 감소와 상품코드 이탈 hard block;
- warning quality report와 반복 알림 억제;
- 동시 요청 합류, lease 만료, generation 역전 방지;
- source origin/account binding과 cross-organization publication 차단;
- 이전 완료 snapshot을 실패가 덮지 않음;
- inactive component를 행 단위 경고로 반환하고 전체 availability 유지.

### Orders와 Supply

- raw mall 수집은 freshness를 바꾸지 않음;
- Sellpia 전송 요청은 수량을 바꾸지 않고 debounce된 갱신을 만듦;
- UI가 `접수 완료`가 아니라 `전송 요청됨`을 표시;
- draft/pending은 stale에서도 허용;
- 모든 actual order 경로가 같은 gate를 호출;
- stale/syncing/failed에서 외부 side effect 전에 차단;
- sync 성공 뒤 정확히 한 번 재시도;
- 오류 코드별 복구 분리와 sync 불가능 오류의 무재시도;
- 비활성 발주 품목 차단;
- durable submission attempt, provider unknown 무재호출, reconciliation;
- Rocket incomplete, skipped, truncated, vendor mismatch 차단.

### Extension과 Web

- exact Sellpia URL과 옵션상품 download request;
- background 실행이 tab/window를 focus하지 않음;
- HTML/login/selector drift/capability 오류 분리;
- service-worker restart와 active run 재결합;
- 한 KidItem 탭이 없어도 요청이 사라지지 않음;
- owner-only cancel/open-tab과 lease 만료 뒤 새 사용자 claim;
- status panel, 수동 fallback, 통합 이력;
- old route query-preserving redirect;
- inactive 탭 unmount로 숨은 timer/fetch/toast가 실행되지 않음;
- URL tab deep link와 `orderId` 선택;
- 접근성 tab/label/pagination 계약.

### 필수 검증

- focused shared/server/web/extension 테스트;
- `npm run db:push`;
- `npx prisma generate`;
- `cd packages/shared && npm run build`;
- `npm run dev:server`와 NestJS 정상 boot 확인;
- `npm run build --workspace=apps/web`;
- Chrome에서 Sellpia 로그인 상태, 로그인 만료, 같은 hash, 새 hash, 주문 후
  예약 실행, pre-purchase 차단과 재시도를 실제로 확인;
- 기존 URL과 새 기준 작업공간의 browser QA.

## 구현 순서

1. shared 최신성·오류·extension capability 계약과 schema/data migration을
   먼저 추가한다.
2. `SourceImportRun` 통합 provenance, 동일 hash 재검증, 품질 guard,
   publication fencing을 구현한다.
3. 중앙 `SellpiaInventoryState`와 freshness coordinator API를 구현한다.
4. order collector의 background-preferred Sellpia 전체 옵션상품 수집을
   구현한다.
5. Web coordinator와 공통 최신성 panel, 수동 fallback을 연결한다.
6. 주문 Sellpia 전송 후 debounce된 갱신 요청을 연결한다.
7. 모든 일반·외부·Rocket 실제 발주 경로에 공통 freshness/active-item
   gate와 idempotent retry/reconcile을 연결한다.
8. inactive component availability를 행 단위 경고로 복구한다.
9. 다섯 기준 작업공간으로 component와 URL 소유권을 옮기고 호환
   redirect 후 사이드바 중복을 제거한다.
10. 문서, runbook, 정적 회귀 gate, 자동 테스트와 실제 Chrome 검증을
    완료하고 scoped `AGENTS.md`의 route/capability 계약을 갱신해 팀에
    공유한다.

이 순서는 하나의 릴리스 범위다. 중간 단계가 사용자에게 노출될 때는
기존 수동 import와 기존 라우트를 호환 경로로 유지하고, 대체 기능이
검증된 뒤 중복 진입점을 제거한다.

## 완료 기준

1. 어떤 화면에서도 주문이나 발주가 Sellpia 재고를 직접 변경하지 않는다.
2. 모든 관련 화면이 같은 네 가지 최신성 상태와 마지막 검증 시각을
   표시한다.
3. 주문 전송 후 수량은 유지되고 최신성만 `갱신 필요`가 되며, 여러
   전송이 하나의 자동 수집으로 합쳐진다. 실행 중 들어온 새 전송은
   후속 generation으로 남아 이전 파일이 지우지 못한다.
4. 수동과 자동 실행이 한 이력에 보이고 같은 hash는 새 행 없이 최신
   검증을 갱신한다.
5. 최신하지 않은 상태에서는 모든 실제 발주 경로가 외부 side effect
   전에 차단되고 우회할 수 없다.
6. Chrome Sellpia 세션으로 옵션상품 전체 Excel을 자동 수집하며 로그인
   만료, source account 불일치, 계약 변경을 성공으로 가장하지 않는다.
7. 잘못된 전체파일은 이전 snapshot을 보존하고 품질 사유를 제시한다.
8. 비활성 구성품 하나가 전체 availability 화면을 깨뜨리지 않는다.
9. 운영 진입점은 다섯 기준 작업공간으로 정리되고 기존 링크는 호환
   redirect로 보존된다.
10. 비활성 화면의 timer, fetch, toast가 실행되지 않고 핵심 조작이
    접근성 계약을 만족한다.
11. Rocket은 component capacity 기반 preview만 제공하고 재고 반영 계약이
    없는 실제 확정·제출은 활성화하지 않는다.
12. `0.1.19` schema, migration, server, shared, web, extension, live Chrome
    검증이 모두 통과한다.
