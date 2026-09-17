# KidItem

소싱부터 상품·채널 카탈로그, 콘텐츠 생성, 리스팅, 재고·주문·정산·광고까지
이커머스 운영을 한곳에서 관리하는 자동화 플랫폼입니다. 일반 AI 대화와 업무별
Agent는 호스트의 Codex/Claude CLI를 사용하고, 실제 업무 변경은 KidItem의
도메인 capability와 승인/idempotency 경계를 거칩니다.

## macOS 빠른 시작

현재 개발 표준은 macOS입니다. Python은 기본 실행에 필요하지 않습니다.

사전 요구사항:

- Git
- Docker Desktop
- Node 버전 관리자(`nvm`, `fnm`, `mise` 등)
- Codex Agent OS를 사용할 경우 유효한 OpenAI 구독/로그인

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
nvm install
nvm use

# env 예제, Git hooks, locked npm 의존성, 격리된 Gateway 상태를 준비합니다.
npm run setup:macos

# PostgreSQL + MinIO를 시작하고 현재 Prisma schema와 데이터 migration을 적용합니다.
# pull로 prisma/나 scripts/data-migrations/가 바뀌었을 때도 같은 명령을 실행합니다.
docker compose up -d --wait
npm run db:sync:local

# 새 DB에 로컬 로그인 사용자/조직을 만들고 비밀번호를 안전하게 입력합니다.
npm run dev:bootstrap-user -- --email you@example.com

# setup을 재확인하고, 필요할 때만 격리된 Codex 인증을 연 뒤,
# Web + API/Operation worker + native Agent Gateway를 시작합니다.
npm run dev:all
```

브라우저에서 [http://localhost:3000/login](http://localhost:3000/login)을 열고
방금 만든 계정으로 로그인합니다. 기본 Dashboard만 필요하면 Gateway/provider
로그인 없이 `npm run dev:core`를 실행해도 됩니다.

전체 설치 절차, 재실행, 초기화, provider history 격리, 문제 해결은
[Local Development runbook](docs/runbooks/local-development.md)에 있습니다.
변수별 소유 런타임과 local/Office 차이는
[Environment Variables runbook](docs/runbooks/environment-variables.md)을
기준으로 합니다.

## 개발 명령

| 명령 | 내용 |
|---|---|
| `npm run setup:macos` | 누락된 local env와 보호된 Gateway config/token/home을 만들고, 의존성이 없으면 `npm ci` 실행 |
| `npm run dev:core` | Next.js + NestJS API/Operation worker |
| `npm run dev:gateway` | 인증 상태를 비대화형으로 확인한 뒤 Gateway를 빌드하고 실행 |
| `npm run dev:all` | setup → 필요시 Codex 인증 → Core + Gateway를 순서대로 실행 |
| `npm run dev` | Next.js만 실행 |
| `npm run dev:server` | NestJS API만 실행 |
| `npm run dev:agents` | 선택적 Python Agent 서버만 실행(별도 Python 3.11+ venv 필요) |
| `npm run gateway:auth:codex` | 격리된 Codex 인증을 확인하고 필요할 때만 로그인 실행 |
| `npm run gateway:login:codex` | 문제 복구를 위해 bundled Codex 로그인 흐름을 강제로 실행 |
| `npm run gateway:login:claude` | 격리된 KidItem provider home에 bundled Claude 로그인(선택) |
| `npm run dev:bootstrap-user` | loopback 개발 DB에 로그인 사용자/조직/membership 생성 또는 갱신 |
| `npm run db:studio` | Prisma Studio |

`dev:bootstrap-user`는 비밀번호를 stdin으로만 받고 기존 세션을 폐기합니다. Office
사용자나 원격 DB에는 사용할 수 없습니다. 기존 사용자 비밀번호만 바꿀 때는
`npm run auth:password`를 사용합니다.

## 환경 파일

`npm run setup:macos`는 기존 파일을 덮어쓰지 않고 다음 예제만 복사합니다.

| 로컬 파일 | 소비자 | 내용 |
|---|---|---|
| `.env` | Prisma/root scripts | local DB URL, dev-data 경로와 scope |
| `apps/server/.env` | NestJS | DB/MinIO, server-side provider keys, sourcing, Gateway token **경로** |
| `apps/web/.env.local` | Next.js | 공개 API URL과 개발 UI flag만 |
| `agents/.env` | optional Python runtime | `setup:macos -- --with-python-agents`일 때만 생성 |

Gateway bearer, config, provider login/history는 `.env`나 PostgreSQL이 아니라
`~/Library/Application Support/KidItem/AgentGateway` 아래에 0700/0600 권한으로
보관됩니다. 실제 token, password, provider credential은 Git에 커밋하지 않습니다.

## 로컬 포트

| 서비스 | 주소 | 기본 여부 |
|---|---|---|
| Next.js | http://localhost:3000 | 기본 |
| NestJS API | http://localhost:4000/api | 기본 |
| PostgreSQL | localhost:5433 | 기본 Docker |
| MinIO S3 | http://localhost:9000 | 기본 Docker |
| MinIO Console | http://localhost:9001 | 기본 Docker |
| Python Agents | http://localhost:8001 | 선택 |

Native Agent Gateway는 HTTP listener를 열지 않습니다. Gateway가
`127.0.0.1:4000`의 보호된 Nest runtime route로 outbound 연결합니다.

## 선택적 Python Agents

Python helper runtime이 필요한 작업에서만 준비합니다. macOS 기본 `python3`이
3.11 미만일 수 있으므로 실행 파일 버전을 직접 확인합니다.

```bash
npm run setup:macos -- --with-python-agents
python3.11 -m venv agents/.venv
agents/.venv/bin/pip install -r agents/requirements.txt
npm run dev:agents
```

기본 1688 URL scrape는 Python이 아니라 NestJS Sourcing 도메인의 TypeScript
Playwright 구현이 소유합니다.

## 공유 개발 데이터

Google Drive bundle은 화면/수집 데이터 baseline을 맞추기 위한 선택 단계입니다.
먼저 로컬 조직을 만든 뒤 해당 organization ID를 사용합니다.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/.../KidItem Dev Data"
export KIDITEM_DEV_ORGANIZATION_ID="<local organization uuid>"
npm run data:dev:setup -- --drive-root "$KIDITEM_DEV_DATA_DRIVE_DIR"
npm run data:dev:sync -- --profile workspace --yes
```

자세한 절차는 [Google Drive Dev Data](docs/runbooks/google-drive-dev-data.md)를
따릅니다. Sellpia 물리 재고의 source of truth는 `SellpiaInventorySku`이며,
`MasterProduct`에 물리 수량을 복제하지 않습니다. Sellpia/Coupang 재구성은
[Sellpia Inventory And Rocket](docs/runbooks/sellpia-rocket-inventory-sync.md)과
[Coupang Wing Catalog](docs/runbooks/coupang-wing-catalog-collection.md)를
각각 따릅니다.

## 구조

```text
apps/web/             Next.js 16 Web
apps/server/          NestJS 11 API and Operation runtime
apps/agent-gateway/   host-native Codex/Claude conversation process boundary
agents/               optional Python 3.11+ helper runtime
packages/shared/      focused Zod schemas and TypeScript contracts
packages/templates/   detail-page React templates
prisma/               multi-file Prisma schema source of truth
extensions/           universal KidItem Chrome extension
```

상위 소유권은 [Architecture](docs/ARCHITECTURE.md), 코드 변경 규칙은
[CLAUDE.md](CLAUDE.md), 테스트 선택은 [Testing](docs/TESTING.md)을 기준으로
합니다.

## Chrome 익스텐션

개발 중에는 `extensions/kiditem-os`를 `chrome://extensions`에서 unpacked로
로드합니다. Office 배포본은 GitHub Release의 `office-v<VERSION>` 통합 ZIP을
사용하며 [Extension Releases](docs/runbooks/extension-releases.md)를 따릅니다.

## 검증

```bash
npm run test:scripts
npm run check:conventions
npm run build --workspace=packages/shared
npm run build --workspace=apps/agent-gateway
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

## License

Private. AgentFoundry Labs.
