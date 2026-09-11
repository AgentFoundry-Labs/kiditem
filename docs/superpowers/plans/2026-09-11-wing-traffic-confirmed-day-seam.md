# Wing 트래픽 확정일 seam — 마지막 하루가 범위 전체를 버리지 않게

KID-52 + KID-36(확정일 절반). PR #493 `Remaining / Resume` 4번.

## 문제

Wing 트래픽 수집이 요청 범위의 **마지막 날짜 하나**가 안 찼으면 범위 전체를 거절한다.

```js
// extensions/kiditem-os/content/coupang/wing-read-api.js:275
if (salesLatest < range.endDate || trafficLatest < range.endDate) {
  return failure("WING_TRAFFIC_DATA_NOT_READY", …);
}
```

쿠팡은 트래픽과 매출을 **서로 다른 시점에** 낸다(화면이 "트래픽 및 전환율 (9월 9일 오후 11:59 업데이트)" / "매출 (오늘 오전 11:25 업데이트)"로 따로 표기한다). 트래픽이 늘 D-1까지이므로 "어제까지" 범위는 거의 항상 거절된다. 결과: `channel_listing_daily_snapshots` 492,428행 전부 `traffic_coverage_status`가 NULL.

승인된 amendment(`2026-09-03-operation-automation-hard-cutover-design.md`, *valid historical evidence and source units*)가 정반대를 요구한다:

> A independently verifiable complete date may be confirmed inside the source owner's transaction and exposed through its published read interface **even when other dates in the collection fail.**

## KID-52가 적어둔 수정안은 불충분하다

KID-52의 *할 일*은 "`range.endDate`를 `min(salesLatest, trafficLatest, endDate)`로 좁혀서 진행"이다. 확장만 고치면 거절 지점이 옮겨갈 뿐이다:

```ts
// ad-traffic-source.repository.ts:2372  finalizeAttempt → validateCoverage
if (period.input.endDate !== plan.endDate || period.input.period !== plan.periodDays)
  return 'SOURCE_RECEIPT_SCOPE_CONFLICT';
for (const businessDate of plan.expectedDates) {
  if (!pages.length) return 'INCOMPLETE_TRAFFIC_COVERAGE';
```

계획은 서버가 만들고(`expectedDates`는 `request.startDate~endDate`에서 파생, `closedEnd`로만 clip), **서버는 Wing의 `dataFreshness`를 읽을 수 없다** — 그건 확장만 볼 수 있는 provider 응답이다. 그래서 실제 seam은 `validateCoverage`와 커버리지 manifest 쪽이다.

## 결정

**확정일은 계획의 부분집합이다.** 계획은 그대로 "요청한 N일"을 유지하고, 확장은 provider가 확정한 날짜만 수집하고, owner는 **수집돼 올라온 날짜 집합**을 확정 창으로 받아 manifest에 기록한다.

왜 prefix가 아니라 부분집합인가: 이 버그는 freshness cutoff라 prefix지만, amendment 문장은 *"other dates in the collection fail"* 까지 포함한다. 중간 하루가 provider 오류로 빠지는 경우도 같은 규칙으로 덮는 게 계약에 충실하다. 부분집합이 prefix의 상위집합이므로 추가 비용도 거의 없다.

**시퀀스 번호는 계획의 전체 `dates`를 기준으로 유지한다.** 현재 receipt 시퀀스는

```js
receipt.sequence === dates.indexOf(receipt.businessDate) * TRAFFIC_SEQUENCE_PAGE_BASE + receipt.pageIndex - 1
```

이다. 확장이 `dates` 자체를 좁히면 남은 날짜의 `indexOf`가 바뀌어 **이미 수락된 receipt와 시퀀스가 어긋난다**(재시도·이어받기가 깨진다). 그래서 `dates`는 계획 그대로 두고 "어느 날짜를 시도할지"만 좁힌다. 다음 시도에서 날짜가 더 차면 같은 시퀀스 공간을 그대로 이어 쓴다.

**스키마 변경 없음.** `SourceImportRun.coverageStartDate` / `coverageEndDate`가 이미 있고 지금은 `plan.startDate/endDate`를 그대로 쓰고 있다(`:601`, `:1108`). 확정 창을 여기에 쓰면 된다.

## 변경

### 1. 확장 — 거절하지 말고 좁힌다

`wing-read-api.js`

* `validateMetadata`: `salesLatest < range.endDate || trafficLatest < range.endDate`를 실패로 만들지 않는다. `confirmedEnd = min(salesLatest, trafficLatest, range.endDate)`를 계산해 돌려준다.
* `confirmedEnd < range.startDate`일 때만 실패한다 — 그때가 진짜로 확정된 날짜가 하나도 없는 경우다.
* 메시지를 한국어로 발행한다. 코드(`WING_TRAFFIC_DATA_NOT_READY`)는 로그·상관용으로 남기고 `error` 필드에는 싣지 않는다. PRODUCT.md Brand Commitments: *영문 사유 코드가 화면에 노출되지 않는다.*
* `collectTrafficDailyV2`: `dates`는 그대로 두고, `businessDate <= confirmedEnd`인 날짜만 시도한다. 기간 summary receipt도 확정 창(`startDate ~ confirmedEnd`)으로 올린다.
* 제출 payload에 확정 창을 싣는다 — owner가 manifest에 적을 근거.

### 2. 서버 — 확정된 날짜 집합을 받는다

`ad-traffic-source.repository.ts`

* `validateCoverage`: `plan.expectedDates` 전체 순회를 **receipt가 올라온 날짜 집합** 순회로 바꾼다. 각 확정일은 지금과 똑같이 완전해야 한다(페이지 연속성·terminal·explicitEmpty 증명 전부 유지). 확정일이 0개면 `INCOMPLETE_TRAFFIC_COVERAGE`.
* 기간 receipt는 `plan`이 아니라 **확정 창**과 일치해야 한다. 계획 창 밖이면 여전히 `SOURCE_RECEIPT_SCOPE_CONFLICT`.
* `finalizeAttempt`: `coverageStartDate`/`coverageEndDate`를 확정일 집합의 최소·최대로 쓴다. 이게 `readPublished`와 커버리지 표시가 읽는 값이다.

### 3. 유지되는 것

* 불완전한 하루를 COMPLETE로 라벨하지 않는다 — 확정일의 완전성 검사는 그대로다.
* attempt fence, idempotency, manifest checksum, 계정 identity 검사 전부 그대로다.
* 부분 커버리지 표시는 이미 있다. 대시보드가 `N/M일 · 누락 N일`을 이미 그린다.

## 회귀 테스트

| 케이스 | 기대 |
| -- | -- |
| 10일 요청, provider가 9일까지 확정 | 9일 발행, `coverageEndDate` = 9일차, 10일차는 누락으로 표시 |
| 트래픽 9/9 · 매출 9/11 | 확정 창은 9/9까지(둘의 최소) |
| provider가 시작일보다 이전까지만 확정 | 거절 — 확정일 0개 |
| 중간 하루가 빠진 제출 | 남은 날짜는 확정, 빠진 날짜는 누락 |
| 확정일 중 하나가 페이지 불완전 | `INCOMPLETE_TRAFFIC_COVERAGE` — 기존 규칙 그대로 |
| 이어받기: 수락된 receipt가 있는 상태에서 날짜가 더 차서 재시도 | 시퀀스 충돌 없음 |
| 실패 메시지 | 영문 사유 코드가 `error` 필드에 없다 |

## 범위 밖

KID-36의 **backfill 절반**(`v0.1.31/005`·`006` 재구현). 검증된 백업과 DB 컷오버 윈도가 필요한 데이터 결정이므로 분리한다(KID-36 추천안 (a)). 이 문서의 seam은 코드라서 지금 병합할 수 있고, 새로 들어오는 수집부터 확정일을 발행한다.
