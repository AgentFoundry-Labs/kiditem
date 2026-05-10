# Runbook — Coupang Wing Extension Image Sync / Registration

`/thumbnails` 페이지의 **이미지 동기화** 버튼은 쿠팡 Wing 인벤토리
페이지에서 이미지 row 를 수집해 `MasterProductImage` 대표 이미지 URL
메타데이터를 채운다. 쿠팡 원본 이미지를 로컬 MinIO/S3/Supabase Storage 로
복사하지 않는다.

기본 경로는 Chrome extension 이다. 같은 Chrome 프로필 안에 KidItem 탭과
쿠팡 Wing 로그인 탭이 있으면 `/thumbnails` 가 extension 에 수집을 요청하고,
브라우저가 수집한 rows 를 backend `POST /api/coupang-image-sync/from-rows` 로
전달한다. Extension 이 감지되지 않는 **local 개발 환경**에서는 backend
Playwriter fallback 이 managed Chrome/CDP session 을 만든다. 배포 환경에서는
기본적으로 extension 경로만 허용하고, staging 실험 때만
`COUPANG_IMAGE_SYNC_SERVER_SCRAPER_ENABLED=true` 로 server scraper capability 를
열 수 있다. Production 에서는 이 flag 를 켜지 않는다.

썸네일 **쿠팡 등록**도 staging/production 에서는 같은 extension-first 원칙을
따른다. Backend 는 `wing-register/prepare` 에서 조직 스코프 검증과 이미지
payload 준비, attempt 생성을 담당하고, 현재 사용자의 Chrome extension 이 Wing
상품 수정 화면을 열어 대표이미지를 업로드한 뒤 `wing-register/complete` 로
결과를 기록한다. 따라서 staging 서버의 공유 Playwriter session 이 여러 사용자의
브라우저 화면을 함께 움직이는 경로를 타지 않는다. Server-side Playwriter 등록은
local development fallback 으로만 둔다.

## 사람만 할 수 있는 prerequisites

1. 쿠팡 Wing 계정 접근 권한.
2. 로컬 Chrome 또는 Chromium 설치.
3. KIDITEM 쿠팡 extension 설치/리로드.
4. 쿠팡 Wing 로그인/OTP. Extension 경로는 현재 Chrome profile 의 로그인
   쿠키를 사용한다. Playwriter fallback 은 managed Chrome 을 열 수 있지만
   계정 인증은 사람이 열린 브라우저에서 직접 처리한다.

비밀번호, OTP, 계정 정보는 runbook 또는 로그에 기록하지 않는다.

## 에이전트가 자동 실행할 액션

```bash
# 1. repo dependency 설치
npm install

# 2. Playwriter CLI 존재 확인
node_modules/.bin/playwriter --help

# 3. relay/server 및 연결 가능 브라우저 확인
node_modules/.bin/playwriter browser list

# 4. 활성 session 확인
node_modules/.bin/playwriter session list
```

활성 session 이 없어도 사용자가 터미널에서 `session new` 를 실행하지 않는다.
Extension 이 없거나 감지되지 않아 `POST /api/coupang-image-sync` fallback 이
실행되면 backend adapter 가 다음을 자동 처리한다.

- `PLAYWRITER_DIRECT_PORT` 포트의 CDP endpoint 확인 (기본 `9222`).
- 없으면 managed Chrome 실행:
  - browser: `PLAYWRITER_BROWSER_PATH` 또는 OS 기본 후보.
  - profile: `PLAYWRITER_BROWSER_PROFILE_DIR` 또는 `~/.kiditem/wing-cdp-profile`.
  - flags: `--remote-debugging-port`, `--user-data-dir`, `--no-first-run`.
- CDP endpoint 가 열리면 `playwriter session new --direct <ws-endpoint>` 실행.

Extension 경로에서 로그인이 필요하면 현재 Chrome 창에 Wing 로그인 탭이
남는다. 사람이 로그인한 뒤 `/thumbnails` 에서 **이미지 동기화** 를 다시 누른다.

Staging 검증은 실제 staging origin 을 허용한 로컬 전용 extension 복사본을
사용한다. 기본 `extensions/coupang-ads-scraper/manifest.json` 은 repo 에 실제
staging 주소를 기록하지 않고 localhost 만 허용한다. Staging 에서 테스트할 때는
다음 명령으로 `.secrets/` 아래에 load-unpacked 전용 복사본을 만든다.

```bash
STAGING_URL="$(gh variable get STAGING_URL --env staging)" \
  node scripts/prepare-coupang-extension.mjs
```

Chrome `chrome://extensions` 에서 출력된
`.secrets/extensions/coupang-ads-scraper-staging` 폴더를 Load unpacked 한 뒤
staging `/thumbnails` 를 새로고침해야 page -> extension handshake 가 갱신된다.
이때 extension 이 감지되지 않으면 frontend 는
`GET /api/coupang-image-sync/capabilities` 의 `serverScraper.enabled` 값을 확인한다.
기본 staging 값은 `false` 이므로 server fallback 을 호출하지 않고 extension
리로드 안내 오류를 표시한다. Phase 3 server Playwriter 실험에서만 staging API env 에
`COUPANG_IMAGE_SYNC_SERVER_SCRAPER_ENABLED=true` 를 추가하고, 같은 endpoint 가
`preferredSource: "server_scraper"` 를 반환하는지 먼저 확인한다.

Playwriter fallback 에서 로그인이 필요하다고 감지되면 backend 는 managed
Chrome 에 Wing 탭을 남겨둔다. 일반 Chrome 에 이미 로그인되어 있어도 remote
debugging 없이 열린 창에는 Playwriter 가 사후 연결할 수 없으므로, fallback
경로에서는 이 managed Chrome profile 에서 한 번 인증해야 한다.

## 환경 변수 / 파일 / 디렉토리

- `package.json` / `package-lock.json` — `playwriter` dev dependency.
- `extensions/coupang-ads-scraper/manifest.json` — committed local/dev KidItem web origin allowlist.
- `scripts/prepare-coupang-extension.mjs` — staging origin 을 `.secrets/`
  아래의 로컬 전용 extension copy 에 주입한다. Staging URL/DNS 를 바꿔도
  committed manifest 는 수정하지 않는다.
- `node_modules/.bin/playwriter` — 기본 CLI 경로.
- `PLAYWRITER_BIN` — 선택. 별도 설치한 Playwriter binary 를 강제로 사용할 때만 지정.
- `PLAYWRITER_BROWSER_PATH` — 선택. Chrome/Chromium binary 경로 override.
- `PLAYWRITER_BROWSER_PROFILE_DIR` — 선택. Wing 로그인 쿠키를 보존할 managed Chrome profile.
- `PLAYWRITER_DIRECT_PORT` — 선택. managed Chrome CDP port (기본 `9222`).
- `COUPANG_IMAGE_SYNC_SERVER_SCRAPER_ENABLED` — 선택. `true` 일 때 production
  Node 환경에서도 `/api/coupang-image-sync` server scraper capability 를 연다.
  Staging 실험 전용이며 production 기본값은 unset/false.
- `apps/server/src/ai/adapter/out/wing/playwriter-cli.ts` — backend 가 PATH 대신 local CLI 를 찾는 resolver.
- `apps/server/src/ai/adapter/out/coupang/coupang-inventory-scrape.adapter.ts` — 이미지 동기화 scrape adapter.
- `extensions/coupang-ads-scraper/background/service-worker.js` — extension-first 이미지 row 수집.
- `extensions/coupang-ads-scraper/content/wing-inventory-scraper.js` — Wing inventory page row parser.
- `extensions/coupang-ads-scraper/content/wing-thumbnail-register.js` — Wing 상품 수정 화면 진입 + 대표이미지 업로드.
- `apps/web/src/app/(media-ai)/_shared/lib/wing-registration.ts` — prepare → extension → complete browser flow.
- `apps/server/src/ai/adapter/out/wing/wing-automation-runner.ts` — Wing 등록/상태 확인 adapter.

## 검증

```bash
# helper unit test
cd apps/server
npx vitest run src/ai/adapter/out/wing/playwriter-cli.spec.ts
npx vitest run src/ai/__tests__/thumbnail-wing.service.spec.ts

# frontend extension bridge unit test
cd ../web
npx vitest run "src/app/(media-ai)/_shared/lib/wing-registration.spec.ts"

# backend boot gate
cd ../..
npm run dev:server

# frontend build gate
npm run build --workspace=apps/web
```

브라우저:

1. Local: `http://localhost:3000/thumbnails` 또는 staging:
   `<STAGING_URL>/thumbnails` 접속.
2. 로그인 상태 확인.
3. **이미지 동기화** 클릭.
4. 결과 확인.
5. 생성 결과를 선택하고 **쿠팡 등록** 클릭.
6. 현재 Chrome profile 의 Wing 상품 수정 화면이 열리고 대표이미지가 업로드되는지 확인.

## Google Drive dev-data 공유

이미지 URL 동기화가 로컬 DB 에 성공적으로 반영되면 같은 결과를 팀원이 재현할 수
있도록 Drive dev-data bundle 로 publish 한다. 이 bundle 은 로컬 MinIO/S3 의
이미지 바이너리를 복사하지 않고, replay 가능한 Wing row 와 쿠팡 CDN URL 을
저장한다.

```bash
export DATASET_ID="coupang-image-sync-YYYY-MM-DD-v1"

npm run data:dev:export -- \
  --domain coupang \
  --dataset "$DATASET_ID" \
  --image-sync-from-db \
  --from YYYY-MM-DD \
  --to YYYY-MM-DD \
  --data-root .data/dev

npm run data:dev:publish -- \
  --domain coupang \
  --dataset "$DATASET_ID" \
  --data-root .data/dev
```

Consumer 는 `npm run data:dev:sync -- --profile workspace --yes` 를 실행하면
`payloads/coupang-image-sync-from-db.json` 이 `/api/coupang-image-sync/from-rows`
로 replay 되고, 각자 DB 의 `MasterProductImage.url` 에 외부 이미지 URL 이
연결된다. Object storage 에 저장되는 것은 사용자가 업로드하거나 AI 가 생성한
asset 뿐이다.

## 성공 기준

- `node_modules/.bin/playwriter --help` exit 0.
- `playwriter session list` 가 ENOENT 없이 실행된다.
- 같은 Chrome profile 에 KidItem + Wing 로그인 탭이 있으면 extension 경로로 rows 를 수집한다.
- staging/production 의 쿠팡 등록은 extension 경로만 사용하며 서버 Playwriter 세션을 움직이지 않는다.
- 활성 Playwriter 세션이 없어도 fallback backend 가 managed Chrome/CDP direct session 을 자동 생성한다.
- Staging 에서는 extension 감지 성공 시 `/api/coupang-image-sync/from-rows`
  로 진행하고, 감지 실패 시 server fallback 을 호출하지 않는다.
- Wing 로그인이 필요하면 UI 오류는 `쿠팡 Wing 로그인 필요...` 로 끝나고,
  터미널 세션 생성 안내를 표시하지 않으며 로그인 탭이 남는다.
- Wing 로그인 완료 후에는 동기화 job 이 `scraping` → `linking` → `done` 으로 진행한다.
- 쿠팡 등록 성공 시 attempt 는 `running` → `uploaded`, 실패 시 `running` → `failed` 로 기록된다.

## Blocker 기준

다음 중 하나라도 발생하면 중단 후 사용자에게 보고:

- `playwriter --help` 자체가 실행되지 않음.
- Chrome/Chromium binary 를 찾지 못하고 `PLAYWRITER_BROWSER_PATH` 도 없음.
- managed Chrome CDP endpoint 가 제한 시간 안에 열리지 않음.
- 쿠팡 Wing 로그인, OTP, 권한 확인이 필요함.
- `POST /api/coupang-image-sync` 가 `auth_required` 또는 `no_organization_context` 를 반환함.
- 활성 session 이 있는데도 `spawn ... ENOENT` 가 재발함.

## 최종 보고 포맷

```text
Playwriter Wing 이미지 동기화 셋업 완료.
- CLI: node_modules/.bin/playwriter --help OK
- Session: <active|auto-created|blocked>, error=<message-if-any>
- Managed Chrome: profile=<path>, port=<port>
- Backend: dev:server boot OK
- Frontend: /thumbnails button verified
- Result: <done|blocked: human Wing login required|blocked: managed Chrome/session failed>
```
