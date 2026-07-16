# Dev Data Profiles and Bundles

KidItem 개발 데이터 공유의 표준 경로는 **Google Drive profile sync + Coupang scraper bundle replay**다. DB 볼륨, `init.sql.gz`, one-off seed 파일로 팀원 간 화면 상태를 맞추지 않는다.

Canonical Google Drive folder:

<https://drive.google.com/drive/folders/1sIuAiZAX6wAFOoEmmJGe6p0b5xwey1AO?usp=drive_link>

## 목적

- Google Drive 에는 쿠팡 스크래퍼 payload bundle, profile JSON, 프로젝트 reference Excel 만 올린다.
- 각 개발자는 profile 을 sync 해서 bundle 을 내려받고 로컬 DB 에 replay 한다.
- 앱은 계속 로컬 PostgreSQL + MinIO/S3 를 기준으로 동작한다.
- Google Drive 는 런타임 저장소나 DB 전체 백업이 아니라 개발 데이터 입력 artifact 저장소다.

## Google Drive 구조

현재 실사용 구조는 쿠팡 스크래퍼 결과 공유/재현에 맞춘 단일 도메인 구조다.

```text
KidItem Dev Data/
├── profiles/
│   ├── workspace.json
│   └── coupang.json
├── references/
│   ├── kiditem_list.xlsx
│   └── wing-inventory-matched.xlsx
└── coupang/
    ├── latest.json
    ├── latest.txt
    └── bundles/
        ├── kiditem-coupang-2026-05-01-v1.zip
        ├── kiditem-coupang-2026-05-01-v1.zip.sha256
        └── kiditem-coupang-2026-05-01-v1.zip.json
```

Profile sync 로컬 사본은 `.data/dev/<domain>/<datasetId>/` 로 압축이 풀리고, pack 결과물은 `.data/dev/packages/<domain>/` 아래에 생긴다. `.data/` 는 Git 에 커밋하지 않는다.

`references/` 는 KidItem 프로젝트 전체의 기준 파일을 관리하는 위치다. 특정 도메인의 하위 폴더가 아니다.

zip 내부에는 replay payload 와 프로젝트 reference 파일의 snapshot 을 함께 넣는다. 그래야 나중에 `latest` 가 바뀌어도 특정 dataset 을 pull 한 사람은 그 dataset 이 만들어질 때의 기준 파일을 그대로 볼 수 있다.

```text
manifest.json
payloads/
  wing-traffic.json
  itemwinner.json
  coupang-ads-daily.json
references/
  kiditem_list.xlsx
  wing-inventory-matched.xlsx
```

## Setup Runbook

AI 가 새 머신에서 Google Drive dev data 를 세팅해야 하면
[Google Drive Dev Data Runbook](runbooks/google-drive-dev-data.md) 만 읽고
따른다. 이 문서는 데이터 포맷, 운영 규칙, publish/replay/검증 절차의
source of truth 로 남긴다.

## Profile

Profile 은 어떤 bundle 을 어떤 mode 로 replay 할지 정의하는 recipe 다. `workspace` 와 `coupang` 은 현재 같은 쿠팡 bundle 을 가리킨다.

```json
{
  "schemaVersion": "kiditem.dev-data.profile.v1",
  "profileId": "workspace",
  "description": "Default local workspace data from real Coupang scraper payloads",
  "steps": [
    { "domain": "coupang", "dataset": "latest", "mode": "scoped-replace" }
  ]
}
```

현재 replay adapter 는 `coupang` 만 연결되어 있다. `core`, `sourcing`, `listing`, `e2e` 디렉터리는 만들지 않는다.

## 팀 운영 룰

이 Drive 는 "스크래퍼를 실행할 수 있는 사람"이 실제 쿠팡 payload 를 공유하고, "스크래퍼를 실행할 수 없는 사람"이 같은 payload 를 로컬에서 replay 한 뒤 기능을 검증하기 위한 협업 표면이다.

역할은 두 가지다.

- **Scraper runner / publisher**: 쿠팡 Wing/광고센터에 접근 가능한 사람이 익스텐션으로 payload 를 수집하고 Drive 에 publish 한다.
- **Consumer / verifier**: Drive bundle 을 sync/replay 하고 DB 저장, UI 표시, 재고 불일치, 주요 기능 회귀를 확인한다.

기준 규칙:

- 기준 데이터는 실제 쿠팡 스크래퍼 payload 다. 마스킹/샘플/synthetic seed 는 기준 데이터로 쓰지 않는다.
- Drive 에 올라가는 기준 artifact 는 `profiles/*.json`, `references/*.xlsx`, `coupang/latest.json`, `coupang/latest.txt`, `coupang/bundles/*.zip`, checksum 파일이다.
- 같은 날짜 payload 를 다시 공유할 때는 기존 zip 을 덮어쓰지 않고 `datasetId` 를 `v2`, `v3` 로 올린다.
- `latest.json` 은 팀의 현재 기준 bundle 을 가리킨다. 새 bundle 을 publish 하면 publisher 가 어떤 날짜 범위/row count 를 기준으로 바꿨는지 공유한다.
- 실제 payload 는 내부 개발자만 접근한다. Git, PR, 이슈, 채팅 로그, 실패 로그에 원본 payload 나 zip 내용을 첨부하지 않는다.
- DB 전체 dump 를 공유하지 않는다. 스키마 동기화는 Prisma, 쿠팡 스크래퍼 결과 재현은 Drive bundle 이 담당한다.

재고 비교 기준 파일은 DB replay payload 가 아니라 **KidItem 프로젝트 reference** 다. Drive 루트의 `references/` 에서 관리하고, bundle 을 만들 때 `.data/dev/coupang/<datasetId>/references/` 로 snapshot 이 들어간다. 스크래퍼를 실행할 수 없는 사람도 Drive bundle 을 sync 하면 같은 파일을 보고 DB/UI 결과와 비교할 수 있다.

- `kiditem_list.xlsx`: 과거 KidItem 상품/옵션/재고 비교 snapshot.
- `wing-inventory-matched.xlsx`: 과거 Coupang Wing 매칭 결과 비교 snapshot.

이 두 파일은 `data:dev:replay` 또는 DB import 대상이 아니다. 오늘의
재고 권한은 Sellpia 스냅샷으로 가져온 `SellpiaInventorySku.currentStock`이고,
Wing 상품/옵션은 계정 범위 catalog import로 재구성한다. Reference Excel은
과거 결과를 비교하는 증거일 뿐 재고나 매칭을 자동 수정하지 않는다.

## `0.1.19` Sellpia 최신성과 발주 시도 데이터

표준 Drive profile은 계속 쿠팡 scraper payload만 replay한다. 인증된 Sellpia
세션을 package하거나 fresh claim을 재현하지 않는다. 아래 persisted row는
source payload가 아니라 runtime/검증 상태다.

- `SellpiaInventoryState`는 organization당 하나인 신뢰 상태다. 로컬 schema
  migration이 생성/backfill할 수 있지만, 같은 DB에 연결된 completed Sellpia
  snapshot 없이 bundle이 상태를 fresh로 만들면 안 된다. 고정 origin/account
  외 generation, lease owner/token, timestamp, opaque fence는 개발자 사이에서
  이식하지 않는다.
- completed `SourceImportRun`은 internally consistent한 synthetic test
  fixture에서만 non-null artifact metadata, import/verification timestamp,
  verification count, generation, quality report와 대응 SellpiaInventorySku
  publication을 함께 표현할 수 있다. 공유 runtime bundle에는 raw workbook
  byte나 workbook base64를 넣지 않는다.
- 다운로드 전 failed `SourceImportRun`은 file name/hash가 null이고 row가 0이며
  typed Sellpia collection failure code와 sanitize된 제한 길이 message만 가진다.
  실패를 없애기 위해 가짜 completed artifact를 삽입하지 않는다.
- `PurchaseOrderSubmissionAttempt`는 Supply가 소유하는 idempotency/reconcile
  상태다. 테스트는 synthetic key/reference를 사용할 수 있지만 Drive
  bundle에는 실제 idempotency key, provider reference, raw provider error 또는
  재시도 허가로 오해될 수 있는 ambiguous attempt를 넣지 않는다.

Sellpia/Coupang password, cookie, browser storage, access/refresh token,
workbook data가 든 extension message, raw provider response, claim token, 실제
workbook 내용은 `.data/`, Drive bundle, Git, PR, issue, screenshot, log에 넣지
않는다. 인증된 Chrome session은 운영자 로컬에만 남긴다. 공유하는 것은
sanitize된 count/status와 provider에 replay할 수 없는 deterministic test
fixture로 제한한다.

## 공유/검증 한 사이클

한 번의 데이터 공유는 다음 순서로 끝난다.

1. Publisher 가 쿠팡 스크래퍼를 실행한다.
2. Publisher 가 payload JSON 을 `data:dev:export` 로 bundle 디렉터리에 넣는다.
3. Publisher 가 Drive 루트 `references/` 의 `kiditem_list.xlsx`, `wing-inventory-matched.xlsx` 를 같은 bundle 에 snapshot 으로 포함한다.
4. Publisher 가 `data:dev:publish` 로 Drive 의 `coupang/latest.json` 과 zip 을 갱신한다.
5. Publisher 가 dataset id, 날짜 범위, payload 종류, row count, reference 파일명을 팀에 공유한다.
6. Consumer 가 `data:dev:sync -- --profile workspace --yes` 로 Drive bundle 을 내려받고 로컬 DB 에 replay 한다.
7. Consumer 가 Drive 에 저장된 reference 파일로 DB 저장, UI 표시, 재고 불일치, 핵심 기능을 확인한다.
8. 문제가 있으면 payload 문제, ingest 문제, 스키마 문제, UI 문제 중 어디인지 분류해서 보고한다.

공유 메시지 템플릿:

```text
Coupang dev data published
- dataset: 2026-05-01-v1
- date range: 2026-05-01..2026-05-01
- payloads: wing traffic N rows, itemwinner N rows, ad daily N rows
- project references: references/kiditem_list.xlsx N rows, references/wing-inventory-matched.xlsx N rows (DB replay 대상 아님)
- expected focus: inventory mismatch / ad dashboard / item winner / DB schema change check
- known gaps: ...
```

## 스크래퍼 없이 내가 검증하는 플로우

스크래퍼를 직접 실행할 수 없는 사람은 Google Drive 에 저장된 최신 bundle 만으로 아래 작업을 할 수 있어야 한다.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/Library/CloudStorage/GoogleDrive-.../My Drive/KidItem Dev Data"
export DEV_DEFAULT_USER_ID="<local dev user uuid>"

npm run data:dev:status
npm run data:dev:setup -- --drive-root "$KIDITEM_DEV_DATA_DRIVE_DIR"
npm run data:dev:pull -- --domain coupang
```

`pull` 후 로컬에 다음 구조가 생긴다.

```text
.data/dev/coupang/<datasetId>/
├── manifest.json
├── payloads/
└── references/
    ├── kiditem_list.xlsx
    └── wing-inventory-matched.xlsx
```

이 상태에서 할 수 있는 일:

- `manifest.json` 으로 dataset id, 날짜 범위, payload 종류, reference 파일을 확인한다.
- `payloads/*.json` 으로 실제 replay 대상 원본 payload 를 확인한다.
- `references/kiditem_list.xlsx` 와 `references/wing-inventory-matched.xlsx` 로 KidItem 기준 재고, 쿠팡 표시 재고, 로컬 DB 재고를 비교한다.
- 서버를 띄운 뒤 `npm run data:dev:replay -- --domain coupang --mode scoped-replace --yes` 로 같은 payload 를 로컬 DB 에 넣는다.
- replay 후 DB/API/UI 검증을 수행한다.

한 번에 replay 까지 하려면 다음을 실행한다.

```bash
npm run dev:server
npm run data:dev:sync -- --profile workspace --yes
```

이 플로우의 목표는 "팀원이 스크래퍼를 실행했다"가 아니라 "Drive 에 저장된 동일 dataset 으로 나도 같은 DB/UI 상태를 재현하고 검증할 수 있다"다.

## 파일명 규칙

공유 zip 파일명은 고정 포맷을 사용한다.

```text
kiditem-{domain}-{datasetId}.zip
```

예:

```text
kiditem-coupang-2026-05-01-v1.zip
```

권장 `datasetId` 는 `YYYY-MM-DD-vN` 이다. 같은 날 payload 를 다시 만들면 `v2`, `v3` 로 올리고, 기존 파일을 덮어쓰지 않는다.

## Manifest

zip 내부의 `manifest.json` 은 replay scope 를 반드시 포함한다. `scoped-replace` 가 이 범위만 지우고 다시 주입한다.

```json
{
  "schemaVersion": "kiditem.dev-data.coupang.v1",
  "datasetId": "2026-05-01-v1",
  "lane": "real",
  "createdAt": "2026-05-01T00:00:00.000Z",
  "defaultImportMode": "scoped-replace",
  "scope": {
    "channel": "coupang",
    "businessDateFrom": "2026-05-01",
    "businessDateTo": "2026-05-01",
    "sources": ["wing", "advertising", "coupang_ads"]
  },
  "payloads": [
    {
      "path": "payloads/wing-traffic.json",
      "type": "traffic",
      "source": "wing",
      "sha256": "..."
    }
  ],
  "references": [
    {
      "path": "references/kiditem_list.xlsx",
      "type": "kiditem_list",
      "sha256": "..."
    },
    {
      "path": "references/wing-inventory-matched.xlsx",
      "type": "wing_inventory_matched",
      "sha256": "..."
    }
  ],
  "checksums": {
    "payloads/wing-traffic.json": "...",
    "references/kiditem_list.xlsx": "...",
    "references/wing-inventory-matched.xlsx": "..."
  }
}
```

`lane` 은 기존 bundle manifest 호환을 위한 메타데이터다. Drive 디렉터리 구조를 나누는 데 사용하지 않는다.

Payload 파일은 기존 `POST /api/ads/extension/sync` body 와 같은 JSON object 를 권장한다. JSON array 만 있으면 manifest 의 `type`/`source` 로 `{ type, source, data }` 형태를 만들어 replay 한다.

Wing 등록상품 이미지는 이 bundle로 replay하지 않는다. 인증된 브라우저
catalog collection이 provider URL을 listing `ContentWorkspace`의 `ContentAsset`로
게시하며, 원본 바이트는 필요한 콘텐츠 작업에서만 가져온다.

## Latest JSON

Drive 의 `coupang/latest.json` 이 현재 기준 bundle 을 가리킨다.

```json
{
  "schemaVersion": "kiditem.dev-data.package.v1",
  "domain": "coupang",
  "datasetId": "2026-05-01-v1",
  "lane": "real",
  "archiveFileName": "kiditem-coupang-2026-05-01-v1.zip",
  "archivePath": "bundles/kiditem-coupang-2026-05-01-v1.zip",
  "sha256": "...",
  "bytes": 123456,
  "manifestSha256": "...",
  "createdAt": "2026-05-01T00:00:00.000Z",
  "publishedAt": "2026-05-01T00:00:00.000Z"
}
```

`pull` 은 `latest.json` 의 checksum 을 확인한 뒤 zip 을 `.data/dev/coupang/<datasetId>/` 로 푼다. `latest.txt` 는 사람이 빠르게 확인하기 위한 호환 파일이다.

## Producer 플로우

스크래핑을 수행한 사람이 payload JSON 을 bundle 로 만들고 Drive 동기화 폴더에 publish 한다. AI 에게 publish 를 맡길 때는
[Coupang Scraper Publish Runbook](runbooks/coupang-scraper-publish.md) 을
따른다. 이 payload 는 내부 개발 검증용 실제 쿠팡 스크래퍼 결과여야 하며,
synthetic seed 나 마스킹 샘플을 기준 데이터로 쓰지 않는다.

Publisher 체크리스트:

1. `npm run dev:server` 가 떠 있고 익스텐션 팝업에서 서버 연결이 `연결됨` 인지 확인한다.
2. Wing/광고센터에서 필요한 페이지를 열고 익스텐션의 동기화 버튼을 실행한다.
3. 월별/일별 수집을 했다면 완료 메시지의 완료 일수와 row count 를 기록한다.
4. Drive 루트 `references/kiditem_list.xlsx`, `references/wing-inventory-matched.xlsx` 의 row count 를 기록한다. 이 파일들은 scraper replay나 DB import 대상이 아니다.
5. scraper output JSON 을 준비한 뒤 아래 `export`/`publish` 를 실행한다. `KIDITEM_DEV_DATA_DRIVE_DIR` 이 설정되어 있으면 export 가 Drive 루트 `references/` 의 두 엑셀을 자동으로 bundle snapshot 에 포함한다.
6. publish 후 `coupang/latest.json` 이 새 dataset 을 가리키는지 확인한다.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/Library/CloudStorage/GoogleDrive-.../My Drive/KidItem Dev Data"

npm run data:dev:export -- \
  --domain coupang \
  --dataset 2026-05-01-v1 \
  --payload-dir ./scraper-output/coupang \
  --from 2026-05-01 \
  --to 2026-05-01 \
  --data-root .data/dev

npm run data:dev:pack -- --domain coupang --dataset 2026-05-01-v1
npm run data:dev:publish -- --domain coupang --dataset 2026-05-01-v1
```

`publish` 는 다음 파일을 Google Drive 동기화 폴더에 쓴다.

```text
coupang/latest.json
coupang/latest.txt
coupang/bundles/kiditem-coupang-2026-05-01-v1.zip
coupang/bundles/kiditem-coupang-2026-05-01-v1.zip.sha256
```

`zip`/`unzip` CLI 가 로컬에 필요하다. macOS 기본 환경에는 포함되어 있다.

Drive 루트 reference 와 다른 파일을 명시해야 하는 예외 상황에서는 `--kiditem-list`, `--wing-inventory-matched` 로 직접 지정할 수 있다. 추가 비교 파일을 한 번에 넣으려면 `--reference-dir ./somewhere/references` 를 사용한다. reference 파일은 scraper replay 에서 직접 저장되지 않지만 zip checksum 검증 대상이며, consumer 의 `.data/dev/coupang/<datasetId>/references/` 에 풀린다.

Wing catalog 등록상품과 provider 미디어는 Drive bundle이 아닌
[Coupang Wing Catalog Collection](runbooks/coupang-wing-catalog-collection.md)으로
재구성한다.

## Consumer 플로우

위 Drive folder 를 Google Drive for Desktop 으로 로컬에 동기화하고, 각자 머신의 동기화 경로를 env 로 지정한다. CLI 는 Drive URL 을 직접 다운로드하지 않고 로컬 동기화 폴더의 profile, `latest.json`, zip archive 를 읽는다.

Consumer 는 스크래퍼를 직접 실행하지 않아도 된다. Drive 의 최신 bundle 을 replay 해서 publisher 가 본 쿠팡 payload 와 같은 ingest 결과를 로컬 DB 에 재현한다.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/Library/CloudStorage/GoogleDrive-.../My Drive/KidItem Dev Data"
export DEV_DEFAULT_USER_ID="<local dev user uuid>"

npm run data:dev:status
npm run data:dev:sync -- --profile workspace --yes
```

서버는 별도로 떠 있어야 한다.

```bash
npm run dev:server
```

`scoped-replace` 는 manifest 의 `scope.businessDateFrom`/`businessDateTo` 범위에 있는 쿠팡 daily fact 와 raw scrape row 를 지운 뒤 같은 payload 를 `/api/ads/extension/sync` 로 다시 넣는다. 따라서 UI 에 보이는 데이터는 실제 서버 ingest 경로와 동일하다.

특정 도메인만 직접 확인할 수도 있다.

```bash
npm run data:dev:pull -- --domain coupang
npm run data:dev:replay -- --domain coupang --mode scoped-replace --yes
```

Replay 성공 기준:

- `sync-report-workspace.json` 이 `.data/dev/` 아래 생성된다.
- `steps[0].domain` 이 `coupang` 이고 `replay.results[*].ok` 가 모두 `true` 다.
- `channel_scrape_runs` 에 새 run 이 생기고 `error_count = 0` 이다.
- raw row 는 `channel_scrape_snapshots`, 정규화 daily fact 는 payload 종류에 따라 `channel_listing_daily_snapshots`, `channel_listing_option_daily_snapshots`, `channel_ad_target_daily_snapshots`, `channel_account_daily_kpi_snapshots` 에 저장된다.

## 검증 매뉴얼

Consumer 는 replay 직후 다음을 확인한다. 이 검증은 "데이터가 Drive 에 있다"가 아니라 "현재 DB 스키마와 앱 기능이 실제 쿠팡 payload 를 받아도 살아 있다"를 증명하기 위한 것이다.

### 1. DB 저장 확인

최근 scrape run 을 확인한다.

```bash
docker exec kiditem-postgres psql -U kiditem -d kiditem -c "
select source, page_type, business_date, status, row_count, matched_count,
       unmatched_count, error_count, started_at, finished_at
from channel_scrape_runs
where channel = 'coupang'
order by started_at desc
limit 20;
"
```

저장된 row 수를 확인한다.

```bash
docker exec kiditem-postgres psql -U kiditem -d kiditem -c "
select 'raw_snapshots' as table_name, count(*) from channel_scrape_snapshots where channel = 'coupang'
union all
select 'listing_daily', count(*) from channel_listing_daily_snapshots where channel = 'coupang'
union all
select 'option_daily', count(*) from channel_listing_option_daily_snapshots where channel = 'coupang'
union all
select 'ad_target_daily', count(*) from channel_ad_target_daily_snapshots where channel = 'coupang'
union all
select 'account_kpi', count(*) from channel_account_daily_kpi_snapshots where channel = 'coupang';
"
```

확인 기준:

- `row_count` 가 publisher 가 공유한 payload row count 와 크게 다르면 payload 누락 또는 export 범위를 의심한다.
- `error_count > 0` 이면 ingest 오류다. replay report 와 서버 로그를 같이 본다.
- `unmatched_count` 가 높으면 스키마 오류라기보다 `ChannelListing` / `ChannelListingOption` 매칭 데이터가 부족하거나 쿠팡 payload 식별자가 기존 DB 와 안 맞는 상태일 수 있다.

### 2. 재고 불일치 확인

현재 재고 권한과 채널 매칭은 다음 두 층으로 검증한다.

- Sellpia 권한 재고: `sellpia_inventory_skus.current_stock`
- 상품/옵션 연결: `channel_listings.master_product_id`와
  `channel_listing_options.product_variant_id`
- 중앙 레시피: `product_variant_components`의
  `product_variant_id` → `sellpia_inventory_sku_id` + `quantity`
- Drive reference Excel: 과거 비교 증거일 뿐 DB 재고나 매칭 권한이
  아니다.

DB 에서 내부 재고와 채널 옵션 매칭 상태를 먼저 본다.

```bash
docker exec kiditem-postgres psql -U kiditem -d kiditem -c "
select
  ca.name as channel_account,
  cl.external_id as seller_product_id,
  clo.external_option_id as vendor_item_id,
  clo.item_name,
  case
    when cl.master_product_id is null or clo.product_variant_id is null then 'unmatched'
    when pvc.id is null or sisku.is_active = false then 'needs_review'
    else 'matched'
  end as mapping_status,
  mp.code as operating_product_code,
  mp.name as operating_product_name,
  pv.code as variant_code,
  sisku.code as sellpia_code,
  sisku.name as sellpia_name,
  sisku.option_name,
  sisku.current_stock,
  pvc.quantity as units_per_sale
from channel_listing_options clo
join channel_listings cl on cl.id = clo.listing_id
join channel_accounts ca on ca.id = cl.channel_account_id
left join master_products mp on mp.id = cl.master_product_id
left join product_variants pv on pv.id = clo.product_variant_id
left join product_variant_components pvc on pvc.product_variant_id = pv.id
left join sellpia_inventory_skus sisku on sisku.id = pvc.sellpia_inventory_sku_id
where ca.channel = 'coupang'
order by cl.external_id, clo.external_option_id
limit 100;
"
```

비교 방법:

- `.data/dev/coupang/<datasetId>/references/wing-inventory-matched.xlsx` 의
  등록상품 ID / vendor item ID / 옵션명을 위 SQL의 채널 식별자와
  비교한다.
- `.data/dev/coupang/<datasetId>/references/kiditem_list.xlsx`의 과거
  상품코드/옵션/재고는 현재 Sellpia import 결과와의 차이를 설명하는
  증거로만 사용한다.
- 쿠팡에는 있는데 DB 에 `vendor_item_id` 매칭이 없으면 `ChannelListingOption.externalOptionId` 매칭 문제다.
- `mapping_status = matched`인데 component가 없거나, 확정된 component
  수량이 의도와 다르면 운영자가 `/product-hub/matching`에서 전체
  레시피를 다시 확인한다. 상품명에서 수량을 자동 추론하지 않는다.
- 재고 차이는 scraper replay 실패와 구분한다. replay는
  광고/트래픽/아이템위너 daily fact를 저장하는 경로이고, reference
  Excel은 자동 수정 근거가 아니다.

보고 형식:

```text
Inventory mismatch check
- kiditem reference: kiditem_list.xlsx, N rows
- wing matched reference: wing-inventory-matched.xlsx, N rows
- DB mapped options checked: N
- missing vendorItemId matches: N
- stock mismatches: N
- examples:
  - sellerProductId=..., vendorItemId=..., Coupang stock=..., DB currentStock=...
```

### 3. UI smoke 확인

서버와 웹을 띄운다.

```bash
rtk npm run dev:server
rtk npm run dev
```

다음 화면을 확인한다.

| 화면 | 확인 내용 |
|---|---|
| `/ad-ops` | 광고/스크래퍼 데이터가 비어 있지 않고, 캠페인/전략/추천 영역이 에러 없이 렌더링되는지 |
| `/inventory-hub?tab=status` | 보존된 재고 현황 목록/필터/검색/상세 진입이 깨지지 않는지 |
| `/inventory-hub?tab=sellpia-sync` | freshness/current basis/history drawer가 현재 조직 상태로 렌더링되는지 |
| `/stock-ops` | 보존된 재고 분석 탭과 추가된 freshness/mapping 경고가 함께 렌더링되는지 |
| `/product-hub` | 기존 상품 운영 센터의 명령 카드·카테고리·필터·지표형 상품 행과 상세 진입이 유지되고, 현재 Sellpia 스냅샷 데이터가 표시되는지 |
| `/product-hub/options` | `c9e7caf8` 기준 Sellpia 읽기 전용 옵션 표가 검색/필터/페이징과 함께 렌더링되는지 |
| `/product-hub/matching` | `c9e7caf8` 기준 account 범위 matching queue와 confirmed recipe가 렌더링되는지 |
| `/rocket-orders` / `/purchase-orders?tab=rocket` | 기존 Rocket 화면의 판단 placeholder와 발주 화면에 동일한 Sellpia capacity preview 계약이 배치 변경 없이 연결되고, 확정은 비활성인지 |

확인 기준:

- 화면이 빈 상태여도 API 에러, React error overlay, 무한 로딩이 없어야 한다.
- 스키마 변경 직후라면 숫자가 맞는지보다 "실제 payload replay 후 화면과 API가 깨지지 않는지"를 먼저 본다.
- 광고/아이템위너/트래픽 수치가 publisher row count 와 완전히 같지 않을 수 있다. 매칭 실패 row 는 raw snapshot 에 저장되고 daily fact 로는 올라가지 않을 수 있기 때문이다.

### 4. 기능 회귀 확인

최소 API smoke:

```bash
rtk curl -s "http://localhost:4000/api/ads/extension/status" | jq
rtk curl -s "http://localhost:4000/api/inventory/sellpia-skus?limit=5" | jq
```

테스트를 돌릴 수 있는 환경이면 최소한 script 계약 테스트를 실행한다.

```bash
rtk npx vitest run --config scripts/vitest.config.ts
```

스키마/ingest 변경을 같이 작업했다면 관련 서버 테스트도 실행한다.

```bash
rtk npm exec --workspace=apps/server -- vitest run src/advertising src/channels src/inventory
```

### 5. 검증 결과 공유

Consumer 는 검증 후 아래 형식으로 공유한다.

```text
Coupang replay verification
- dataset: 2026-05-01-v1
- replay: pass/fail
- DB: runs N, raw N, listing_daily N, option_daily N, ad_target_daily N, account_kpi N
- unmatched: N
- inventory mismatch: N checked, N missing matches, N stock mismatches
- UI smoke: /ad-ops pass, /inventory-hub inventory/overview/attention pass, /product-hub list/options pass, /product-hub/matching pass
- failures:
  - ...
- suspected owner: payload / ingest / schema / UI / local setup
```

## 모드

| 모드 | 의미 | 기본 사용처 |
|---|---|---|
| `upsert` | 기존 데이터를 지우지 않고 같은 key 는 갱신 | 빠른 smoke |
| `scoped-replace` | 회사/organization + channel + date range 범위만 교체 | 표준 개발 데이터 세팅 |
| `pull-only` | bundle 을 내려받지만 replay adapter 를 호출하지 않음 | adapter 추가 전 도메인/objects 준비 |
| `full-reset` | Docker volume 을 직접 초기화한 뒤 replay | 온보딩/E2E 전용, CLI 자동화 없음 |

## 기존 방식과의 차이

- `scripts/seed-channel-market-data.ts` 는 제거됐다. synthetic daily fact seed 는 실제 scrape replay 를 가려서 표준 경로로 쓰지 않는다.
- `data:coupang:*` npm script 와 직접 실행용 `scripts/coupang-dev-data.ts` 는 제거됐다. 쿠팡도 `data:dev:* --domain coupang` 만 사용한다.
- `prisma/init.sql.gz` 는 개발 데이터 공유 수단이 아니다. Fresh Docker volume snapshot 이 꼭 필요할 때만 예외적으로 쓴다.
- One-off backfill / migration / seed scripts are not retained in git after rollout. Durable schema objects must live in Prisma schema; reusable screen data uses `data:dev:*`.
- 실제 서비스/개발 화면은 Google Drive 를 직접 읽지 않는다. Drive bundle 은 로컬 DB/MinIO/S3 에 주입되는 입력 데이터일 뿐이다.

## 데이터 취급

- 기준 bundle 은 실제 쿠팡 스크래퍼 payload 를 사용한다.
- 마스킹/샘플 데이터는 기본 개발 검증용으로 쓰지 않는다.
- 실제 payload 는 내부 개발자만 접근하며 Git, PR, 이슈, 로그에 첨부하지 않는다.

## `0.1.19` Local Inventory Migration And Reconstruction

`develop`을 pull하거나 Prisma schema를 generate하는 것만으로 durable data
migration이 적용되지는 않는다. 폐기 가능한 로컬 DB인지 확인한 뒤
`npm run data:migrate -- status`, guarded local `up`, 같은 `up` 재실행, final
`status` 순서로 `v0.1.19:001_sellpia_inventory_freshness`의 적용과 멱등성을
확인한다. Migration은 기존 completed Sellpia run의 verification provenance와
organization freshness row를 backfill하지만 raw workbook이나 credential을
만들지 않는다.

실제 재고 기준이 필요하면
[Sellpia Inventory Freshness Operations](runbooks/sellpia-inventory-freshness.md)
에 따라 인증된 Chrome 자동 수집 또는 최신-export 수동 attestation으로 full
snapshot을 publish한다. 그 다음 Wing/Rocket channel identity와 confirmed
recipe를 재구성한다. Staging/production 변경은 보호된 GitHub Actions 경로만
사용한다.
