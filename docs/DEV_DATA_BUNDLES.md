# Dev Data Bundles

KidItem 개발 데이터 공유의 표준 경로는 **Google Drive bundle replay**다. DB 볼륨, `init.sql.gz`, one-off seed 파일로 팀원 간 화면 상태를 맞추지 않는다.

Canonical Google Drive folder:

<https://drive.google.com/drive/folders/1sIuAiZAX6wAFOoEmmJGe6p0b5xwey1AO?usp=drive_link>

## 목적

- 한 사람이 쿠팡 Wing/광고센터에서 수집한 payload 를 Google Drive 에 올린다.
- 각 개발자는 같은 bundle 을 내려받아 로컬 DB 에 replay 한다.
- 앱은 계속 로컬 PostgreSQL + MinIO/S3 를 기준으로 동작한다.
- Google Drive 는 런타임 저장소가 아니라 개발 데이터 입력 artifact 저장소다.

## Google Drive 구조

```text
KidItem Dev Data/
├── coupang-real/
│   ├── latest.txt
│   └── 2026-04-real-v1/
│       ├── manifest.json
│       └── payloads/
│           ├── wing-traffic.json
│           ├── wing-itemwinner.json
│           ├── ads-campaign.json
│           └── ads-daily.json
└── coupang-demo/
    ├── latest.txt
    └── 2026-04-demo-v1/
        ├── manifest.json
        └── payloads/
```

로컬에는 `.data/coupang/<datasetId>/` 로 복사된다. `.data/` 는 Git 에 커밋하지 않는다.

## Manifest

`manifest.json` 은 replay scope 를 반드시 포함한다. `scoped-replace` 가 이 범위만 지우고 다시 주입한다.

```json
{
  "schemaVersion": "kiditem.dev-data.coupang.v1",
  "datasetId": "2026-04-real-v1",
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

## 사용법

위 Drive folder 를 Google Drive for Desktop 으로 로컬에 동기화하고, 각자 머신의 동기화 경로를 env 로 지정한다. CLI 는 Drive URL 을 직접 다운로드하지 않고 로컬 동기화 폴더를 읽는다.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/Library/CloudStorage/GoogleDrive-.../My Drive/KidItem Dev Data"
export DEV_DEFAULT_USER_ID="<local dev user uuid>"

npm run data:coupang:pull -- --lane real
npm run data:coupang:replay -- --mode scoped-replace --yes
npm run data:coupang:status
```

서버는 별도로 떠 있어야 한다.

```bash
npm run dev:server
```

`scoped-replace` 는 manifest 의 `scope.businessDateFrom`/`businessDateTo` 범위에 있는 쿠팡 daily fact 와 raw scrape row 를 지운 뒤 같은 payload 를 `/api/ads/extension/sync` 로 다시 넣는다. 따라서 UI 에 보이는 데이터는 실제 서버 ingest 경로와 동일하다.

## 모드

| 모드 | 의미 | 기본 사용처 |
|---|---|---|
| `upsert` | 기존 데이터를 지우지 않고 같은 key 는 갱신 | 빠른 smoke |
| `scoped-replace` | 회사/company + channel + date range 범위만 교체 | 표준 개발 데이터 세팅 |
| `full-reset` | Docker volume 을 직접 초기화한 뒤 replay | 온보딩/E2E 전용, CLI 자동화 없음 |

## 기존 방식과의 차이

- `scripts/seed-channel-market-data.ts` 는 제거됐다. synthetic daily fact seed 는 실제 scrape replay 를 가려서 표준 경로로 쓰지 않는다.
- `prisma/init.sql.gz` 는 개발 데이터 공유 수단이 아니다. Fresh Docker volume snapshot 이 꼭 필요할 때만 예외적으로 쓴다.
- `prisma/backfill-*.sql` 은 스키마/데이터 마이그레이션용이다. 팀원이 같은 화면 데이터를 보게 만드는 용도로 쓰지 않는다.
- 실제 서비스/개발 화면은 Google Drive 를 직접 읽지 않는다. Drive bundle 은 로컬 DB/MinIO/S3 에 주입되는 입력 데이터일 뿐이다.

## Real/Demo 정책

- `coupang-real`: 내부 개발자만 접근. 실제 payload 이므로 Git, PR, 이슈, 로그에 첨부하지 않는다.
- `coupang-demo`: 외부 공유 가능하도록 이름/URL 등 표시 필드를 마스킹한 bundle.
- 식별자(`externalId`, `vendorItemId`)는 replay 매칭에 필요하므로 demo bundle 에서도 별도 identity seed 전략이 정해지기 전까지 보존한다.
