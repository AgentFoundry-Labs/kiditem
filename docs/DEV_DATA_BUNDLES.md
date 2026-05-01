# Dev Data Profiles and Bundles

KidItem 개발 데이터 공유의 표준 경로는 **Google Drive profile sync + bundle replay**다. DB 볼륨, `init.sql.gz`, one-off seed 파일로 팀원 간 화면 상태를 맞추지 않는다.

Canonical Google Drive folder:

<https://drive.google.com/drive/folders/1sIuAiZAX6wAFOoEmmJGe6p0b5xwey1AO?usp=drive_link>

## 목적

- 모든 주요 화면은 profile 로 같은 기준 상태를 재현한다.
- 각 도메인 데이터는 표준 zip bundle 로 만든다.
- Google Drive 에는 profile JSON, zip archive, `latest.json` 만 기준 artifact 로 올린다.
- 각 개발자는 profile 을 sync 해서 필요한 bundle 을 내려받고 로컬 DB/스토리지에 replay 한다.
- 앱은 계속 로컬 PostgreSQL + MinIO/S3 를 기준으로 동작한다.
- Google Drive 는 런타임 저장소가 아니라 개발 데이터 입력 artifact 저장소다.

## 파일명 규칙

공유 zip 파일명은 고정 포맷을 사용한다.

```text
kiditem-{domain}-{lane}-{datasetId}.zip
```

예:

```text
kiditem-core-demo-2026-04-28-demo-v1.zip
kiditem-sourcing-demo-2026-04-28-demo-v1.zip
kiditem-listing-demo-2026-04-28-demo-v1.zip
kiditem-coupang-real-2026-04-28-real-v1.zip
kiditem-coupang-demo-2026-04-28-demo-v1.zip
```

권장 `datasetId` 는 `YYYY-MM-DD-{lane}-vN` 이다. 같은 날 같은 도메인의 payload 를 다시 만들면 `v2`, `v3` 로 올리고, 기존 파일을 덮어쓰지 않는다.

## Google Drive 구조

```text
KidItem Dev Data/
├── profiles/
│   ├── workspace-demo.json
│   ├── coupang-real.json
│   └── e2e-demo.json
├── core-demo/
│   ├── latest.json
│   ├── latest.txt
│   └── bundles/
│       └── kiditem-core-demo-2026-04-28-demo-v1.zip
├── coupang-real/
│   ├── latest.json
│   ├── latest.txt
│   └── bundles/
│       ├── kiditem-coupang-real-2026-04-28-real-v1.zip
│       ├── kiditem-coupang-real-2026-04-28-real-v1.zip.sha256
│       └── kiditem-coupang-real-2026-04-28-real-v1.zip.json
└── coupang-demo/
    ├── latest.json
    ├── latest.txt
    └── bundles/
        └── kiditem-coupang-demo-2026-04-28-demo-v1.zip
```

Profile sync 로컬 사본은 `.data/dev/<domain>/<datasetId>/` 로 압축이 풀리고, pack 결과물은 `.data/dev/packages/<domain>/` 아래에 생긴다. 기존 쿠팡 전용 명령은 하위 호환을 위해 `.data/coupang/<datasetId>/` 도 계속 지원한다. `.data/` 는 Git 에 커밋하지 않는다.

## Profile

Profile 은 여러 domain bundle 의 조합, 실행 순서, replay mode 를 정의하는 recipe 다. 기본 팀 플로우는 profile 단위로 맞춘다.

```json
{
  "schemaVersion": "kiditem.dev-data.profile.v1",
  "profileId": "workspace-demo",
  "description": "All primary screens with safe demo data",
  "steps": [
    { "domain": "core", "lane": "demo", "dataset": "latest", "mode": "upsert" },
    { "domain": "sourcing", "lane": "demo", "dataset": "latest", "mode": "scoped-replace" },
    { "domain": "listing", "lane": "demo", "dataset": "latest", "mode": "scoped-replace" },
    { "domain": "coupang", "lane": "demo", "dataset": "latest", "mode": "scoped-replace" }
  ]
}
```

현재 replay adapter 는 `coupang` 부터 연결되어 있다. 다른 도메인은 bundle 포맷과 profile 순서를 먼저 표준화하고, 각 도메인 ingest/replay adapter 가 추가되는 순서대로 `workspace-demo` 에 편입한다.

## Manifest

zip 내부의 `manifest.json` 은 replay scope 를 반드시 포함한다. `scoped-replace` 가 이 범위만 지우고 다시 주입한다.

```json
{
  "schemaVersion": "kiditem.dev-data.coupang.v1",
  "datasetId": "2026-04-28-real-v1",
  "lane": "real",
  "createdAt": "2026-04-28T00:00:00.000Z",
  "defaultImportMode": "scoped-replace",
  "scope": {
    "channel": "coupang",
    "businessDateFrom": "2026-04-01",
    "businessDateTo": "2026-04-28",
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
  "checksums": {
    "payloads/wing-traffic.json": "..."
  }
}
```

Payload 파일은 기존 `POST /api/ads/extension/sync` body 와 같은 JSON object 를 권장한다. JSON array 만 있으면 manifest 의 `type`/`source` 로 `{ type, source, data }` 형태를 만들어 replay 한다.

## Latest JSON

Drive 의 `{domain}-{lane}/latest.json` 이 해당 도메인/lane 의 현재 기준 bundle 을 가리킨다.

```json
{
  "schemaVersion": "kiditem.dev-data.package.v1",
  "domain": "coupang",
  "datasetId": "2026-04-28-real-v1",
  "lane": "real",
  "archiveFileName": "kiditem-coupang-real-2026-04-28-real-v1.zip",
  "archivePath": "bundles/kiditem-coupang-real-2026-04-28-real-v1.zip",
  "sha256": "...",
  "bytes": 123456,
  "manifestSha256": "...",
  "createdAt": "2026-04-28T00:00:00.000Z",
  "publishedAt": "2026-04-28T00:00:00.000Z"
}
```

`pull` 은 `latest.json` 의 checksum 을 확인한 뒤 zip 을 `.data/dev/<domain>/<datasetId>/` 로 푼다. `latest.txt` 는 사람이 빠르게 확인하기 위한 호환 파일이다.

## Producer 플로우

스크래핑을 수행한 사람이 payload JSON 을 bundle 로 만들고 Drive 동기화 폴더에 publish 한다. 쿠팡도 공개 워크플로우는 `data:dev:* --domain coupang` 으로 통일한다.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/Library/CloudStorage/GoogleDrive-.../My Drive/KidItem Dev Data"

npm run data:dev:export -- \
  --domain coupang \
  --dataset 2026-04-28-real-v1 \
  --lane real \
  --payload-dir ./scraper-output/coupang \
  --from 2026-04-01 \
  --to 2026-04-28 \
  --data-root .data/dev

npm run data:dev:pack -- --domain coupang --dataset 2026-04-28-real-v1
npm run data:dev:publish -- --domain coupang --dataset 2026-04-28-real-v1
```

`publish` 는 다음 파일을 Google Drive 동기화 폴더에 쓴다.

```text
coupang-real/latest.json
coupang-real/latest.txt
coupang-real/bundles/kiditem-coupang-real-2026-04-28-real-v1.zip
coupang-real/bundles/kiditem-coupang-real-2026-04-28-real-v1.zip.sha256
```

`zip`/`unzip` CLI 가 로컬에 필요하다. macOS 기본 환경에는 포함되어 있다.

## Consumer 플로우

위 Drive folder 를 Google Drive for Desktop 으로 로컬에 동기화하고, 각자 머신의 동기화 경로를 env 로 지정한다. CLI 는 Drive URL 을 직접 다운로드하지 않고 로컬 동기화 폴더의 profile, `latest.json`, zip archive 를 읽는다.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/Library/CloudStorage/GoogleDrive-.../My Drive/KidItem Dev Data"
export DEV_DEFAULT_USER_ID="<local dev user uuid>"

npm run data:dev:sync -- --profile workspace-demo --yes
npm run data:dev:status
```

서버는 별도로 떠 있어야 한다.

```bash
npm run dev:server
```

`scoped-replace` 는 manifest 의 `scope.businessDateFrom`/`businessDateTo` 범위에 있는 쿠팡 daily fact 와 raw scrape row 를 지운 뒤 같은 payload 를 `/api/ads/extension/sync` 로 다시 넣는다. 따라서 UI 에 보이는 데이터는 실제 서버 ingest 경로와 동일하다.

특정 도메인만 직접 확인할 수도 있다.

```bash
npm run data:dev:pull -- --domain coupang --lane real
npm run data:dev:replay -- --domain coupang --mode scoped-replace --yes
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

## Real/Demo 정책

- `coupang-real`: 내부 개발자만 접근. 실제 payload 이므로 Git, PR, 이슈, 로그에 첨부하지 않는다.
- `coupang-demo`: 외부 공유 가능하도록 이름/URL 등 표시 필드를 마스킹한 bundle.
- 식별자(`externalId`, `vendorItemId`)는 replay 매칭에 필요하므로 demo bundle 에서도 별도 identity seed 전략이 정해지기 전까지 보존한다.
