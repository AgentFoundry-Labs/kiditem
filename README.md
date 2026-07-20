# KidItem

이커머스 셀러 운영 자동화 플랫폼. 소싱 → 상품/채널 카탈로그 → AI 이미지·콘텐츠 처리 → 리스팅 운영 → 재고·주문·정산·광고 자동화.

## 사전 요구사항

- **Node.js** v20+ (npm 포함)
- **Python** 3.11+
- **Docker Desktop** (PostgreSQL 실행용)

## Chrome 익스텐션

staging용 Chrome 익스텐션은 GitHub Releases에서 내려받는다.

| 익스텐션 | 버전 | 링크 |
|---|---:|---|
| 상품 소싱 스크래퍼 | 2.2.2 | [Release](https://github.com/AgentFoundry-Labs/kiditem/releases/tag/extension-product-scraper-v2.2.2-staging) · [ZIP](https://github.com/AgentFoundry-Labs/kiditem/releases/download/extension-product-scraper-v2.2.2-staging/kiditem-product-scraper-v2.2.2-staging.zip) · [SHA256](https://github.com/AgentFoundry-Labs/kiditem/releases/download/extension-product-scraper-v2.2.2-staging/kiditem-product-scraper-v2.2.2-staging.zip.sha256) |
| 쿠팡 셀러 도우미 | 1.2.65 | [Release](https://github.com/AgentFoundry-Labs/kiditem/releases/tag/extension-coupang-ads-scraper-v1.2.65-staging) · [ZIP](https://github.com/AgentFoundry-Labs/kiditem/releases/download/extension-coupang-ads-scraper-v1.2.65-staging/kiditem-coupang-ads-scraper-v1.2.65-staging.zip) · [SHA256](https://github.com/AgentFoundry-Labs/kiditem/releases/download/extension-coupang-ads-scraper-v1.2.65-staging/kiditem-coupang-ads-scraper-v1.2.65-staging.zip.sha256) |
| 주문수집 도우미 | 0.1.78 | [Release](https://github.com/AgentFoundry-Labs/kiditem/releases/tag/extension-order-collector-v0.1.78-staging) · [ZIP](https://github.com/AgentFoundry-Labs/kiditem/releases/download/extension-order-collector-v0.1.78-staging/kiditem-order-collector-v0.1.78-staging.zip) · [SHA256](https://github.com/AgentFoundry-Labs/kiditem/releases/download/extension-order-collector-v0.1.78-staging/kiditem-order-collector-v0.1.78-staging.zip.sha256) |

ZIP 압축을 푼 뒤 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**를 선택한다. 버전 게시·검증·업데이트 방법은 [Chrome Extension Releases runbook](docs/runbooks/extension-releases.md)을 따른다.

## 셋업

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
npm install --legacy-peer-deps

# 환경 변수
cp .env.example .env                           # Root tooling — Prisma/dev bootstrap/dev data
cp apps/server/.env.example apps/server/.env   # NestJS — DB, Supabase, Gemini/Agent OS, storage
cp agents/.env.example agents/.env             # Python sourcing agents — DB, TMAPI, Langfuse

# Python 가상환경 (sourcing agents 실행 시 필요)
cd agents && python -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..

# DB 실행 + 스키마 적용
docker compose up -d                           # PostgreSQL만 (Docker)
npm run db:push                                # 스키마 적용

# 전체 실행 (한번에)
npm run dev:all                                # Next.js + NestJS + Python sourcing agents 동시 실행

# 공유 개발 데이터 (선택, 서버 실행 후 다른 터미널에서 주요 화면 상태 맞추기)
# Canonical Drive: https://drive.google.com/drive/folders/1sIuAiZAX6wAFOoEmmJGe6p0b5xwey1AO?usp=drive_link
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/.../KidItem Dev Data" # Google Drive Desktop 로컬 동기화 경로
export KIDITEM_DEV_ORGANIZATION_ID="<local organization uuid>"
# 기준 파일: profiles/workspace.json -> coupang/latest.json -> bundles/kiditem-coupang-{datasetId}.zip
# 프로젝트 reference: references/kiditem_list.xlsx, references/wing-inventory-matched.xlsx
# 셋업 runbook: docs/runbooks/google-drive-dev-data.md
# 재고/상품 재구성: docs/runbooks/sellpia-rocket-inventory-sync.md
# 쿠팡 Wing 수집: docs/runbooks/coupang-wing-catalog-collection.md
npm run data:dev:setup -- --drive-root "$KIDITEM_DEV_DATA_DRIVE_DIR"
npm run data:dev:sync -- --profile workspace --yes
```

Google Drive 번들은 광고/스크래프 공유 데이터를 복원한다. Sellpia 재고와
쿠팡 Wing 등록 상품은 각각 전용 import 흐름으로 재구성하며, 업로드한 Sellpia
스냅샷의 `MasterProduct.currentStock`이 KidItem 재고 기준이다.

### 개별 실행

```bash
npm run dev                          # Next.js 프론트엔드만 (localhost:3000)
npm run dev:server                   # NestJS 백엔드만 (localhost:4000)
npm run dev:agents                   # Python sourcing agents만
npm run db:studio                    # Prisma Studio (DB GUI, localhost:5555)
```

### 상세페이지 생성 테스트

1. `apps/server/.env`에 `GEMINI_API_KEY`와 필요한 `AGENT_*_MODEL` 설정
2. `npm run dev:all`
3. `localhost:3000/product-pipeline/collected-products` → 상품 선택 → 에디터 → AI 생성 버튼

## 포트

| 서비스 | URL | 실행 방식 |
|---|---|---|
| Next.js | http://localhost:3000 | 로컬 (`npm run dev`) |
| NestJS API | http://localhost:4000/api | 로컬 (`npm run dev:server`) |
| Python Agents | http://localhost:8001 | 로컬 sourcing/scraping FastAPI (`npm run dev:agents`) |
| PostgreSQL | localhost:5433 | Docker |

## 구조

```
apps/web/            — Next.js 16 프론트엔드
apps/server/         — NestJS 11 백엔드 API
agents/              — Python 3.11+ sourcing/scraping 에이전트
packages/shared/     — @kiditem/shared (Zod 스키마 + TypeScript 타입 + 에러 코드)
packages/templates/  — 상세페이지 React 템플릿
prisma/              — Prisma multi-file DB 스키마 (source of truth)
extensions/          — Chrome 익스텐션 (1688/Alibaba 스크래퍼)
```

프론트엔드 라우트는 Next.js App Router route group으로 도메인별 배치한다. 예: `/agents`는 `apps/web/src/app/(automation)/agents/page.tsx`, `/product-hub`는 `apps/web/src/app/(catalog)/product-hub/page.tsx`에 있다.

백엔드는 owner-domain 기준으로 정리한다. 재구성된 도메인은 `adapter/application/domain/mapper` 구조와 선택적 hexagonal ports를 사용하고, 단순 CRUD는 전환기 flat module로 남을 수 있다. 현재 계약은 [AGENTS.md](AGENTS.md), [apps/server/AGENTS.md](apps/server/AGENTS.md), [apps/web/AGENTS.md](apps/web/AGENTS.md)를 기준으로 한다.

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | Next.js 16, React 19, Tailwind CSS, TanStack React Query, Zustand, Sonner |
| 백엔드 | NestJS 11, TypeScript, class-validator DTO |
| DB | PostgreSQL 17, Prisma v7 |
| 공유 | Zod 스키마 (@kiditem/shared), ESM + CJS dual format |
| AI | NestJS Gemini direct calls, Claude CLI Agent OS, Python sourcing/scraping agents |
| 인프라 | Docker Compose |

## 환경 변수

각 런타임의 `.env`는 같은 위치의 `.env.example`을 기준으로 관리한다.

| 파일 | 용도 |
|---|---|
| `.env` | 루트 도구용: Prisma CLI, dev bootstrap, dev data sync |
| `apps/server/.env` | NestJS API 런타임: DB, Supabase, storage, Gemini/Agent OS, Playwriter |
| `apps/web/.env.local` | Next.js public env: API URL, Supabase publishable key |
| `agents/.env` | Python sourcing agents: DB, VectorEngine/OpenAI/Gemini, TMAPI, Langfuse |

앱 런타임용 AI/provider/marketplace 시크릿은 루트 `.env`에 두지 않는다.

## 테스트

```bash
npm exec --workspace=apps/server -- vitest run   # 백엔드
npm exec --workspace=apps/web -- vitest run      # 프론트엔드
npm run check:idor
npm run check:tenant-scope
```

## License

Private. AgentFoundry Labs.
