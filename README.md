# KidItem

이커머스 셀러 운영 자동화 플랫폼. 소싱 → 상품/채널 카탈로그 → AI 이미지·콘텐츠 처리 → 리스팅 운영 → 재고·주문·정산·광고 자동화.

## 사전 요구사항

- **Node.js** v20+ (npm 포함)
- **Python** 3.11+
- **Docker Desktop** (PostgreSQL 실행용)

## 셋업

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
npm install

# 환경 변수
cp apps/server/.env.example apps/server/.env   # NestJS — DB, Coupang, Gemini 키
cp agents/.env.example agents/.env             # Python agents — AI 모델 키 (OpenAI, Gemini, fal, Langfuse)

# Python 가상환경 (agents 실행 시 필요)
cd agents && python -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..

# DB 실행 + 스키마 적용
docker compose up -d                           # PostgreSQL만 (Docker)
npm run db:push                                # 스키마 적용

# 전체 실행 (한번에)
npm run dev:all                                # Next.js + NestJS + Python Agents 동시 실행

# 공유 개발 데이터 (선택, 서버 실행 후 다른 터미널에서 주요 화면 상태 맞추기)
# Canonical Drive: https://drive.google.com/drive/folders/1sIuAiZAX6wAFOoEmmJGe6p0b5xwey1AO?usp=drive_link
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/.../KidItem Dev Data" # Google Drive Desktop 로컬 동기화 경로
# 기준 파일: profiles/workspace-demo.json -> {domain}-{lane}/latest.json -> bundles/kiditem-{domain}-{lane}-{datasetId}.zip
npm run data:dev:sync -- --profile workspace-demo --yes
```

### 개별 실행

```bash
npm run dev                          # Next.js 프론트엔드만 (localhost:3000)
npm run dev:server                   # NestJS 백엔드만 (localhost:4000)
npm run dev:agents                   # Python Agents만
npm run db:studio                    # Prisma Studio (DB GUI, localhost:5555)
```

### 상세페이지 생성 테스트

1. `agents/.env`에 AI 키 설정: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `FAL_KEY`
2. `npm run dev:all`
3. `localhost:3000/sourcing` → 상품 선택 → 에디터 → AI 생성 버튼

## 포트

| 서비스 | URL | 실행 방식 |
|---|---|---|
| Next.js | http://localhost:3000 | 로컬 (`npm run dev`) |
| NestJS API | http://localhost:4000/api | 로컬 (`npm run dev:server`) |
| Python Agents | — (워커) | 로컬 (`npm run dev:agents`) |
| PostgreSQL | localhost:5433 | Docker |

## 구조

```
apps/web/            — Next.js 16 프론트엔드
apps/server/         — NestJS 11 백엔드 API
agents/              — Python 3.11+ AI 에이전트 (백그라운드 워커)
packages/shared/     — @kiditem/shared (Zod 스키마 + TypeScript 타입 + 에러 코드)
packages/templates/  — 상세페이지 React 템플릿
prisma/              — Prisma multi-file DB 스키마 (source of truth)
extensions/          — Chrome 익스텐션 (1688/Alibaba 스크래퍼)
```

프론트엔드 라우트는 Next.js App Router route group으로 도메인별 배치한다. 예: `/agents`는 `apps/web/src/app/(automation)/agents/page.tsx`, `/products`는 `apps/web/src/app/(catalog)/products/page.tsx`에 있다.

백엔드는 owner-domain 기준으로 정리한다. 재구성된 도메인은 `adapter/application/domain/mapper` 구조와 선택적 hexagonal ports를 사용하고, 단순 CRUD는 전환기 flat module로 남을 수 있다. 현재 계약은 [AGENTS.md](AGENTS.md), [apps/server/AGENTS.md](apps/server/AGENTS.md), [apps/web/AGENTS.md](apps/web/AGENTS.md)를 기준으로 한다.

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | Next.js 16, React 19, Tailwind CSS, TanStack React Query, Zustand, Sonner |
| 백엔드 | NestJS 11, TypeScript, class-validator DTO |
| DB | PostgreSQL 17, Prisma v7 |
| 공유 | Zod 스키마 (@kiditem/shared), ESM + CJS dual format |
| AI | NestJS Gemini direct calls, Claude CLI Agent OS, Python agents (OpenAI/Gemini/fal) |
| 인프라 | Docker Compose |

## 환경 변수

### apps/server/.env

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem

# Coupang Wing API
COUPANG_ACCESS_KEY=
COUPANG_SECRET_KEY=
COUPANG_VENDOR_ID=

# AI (워크플로우 분석)
GEMINI_API_KEY=
AI_TEXT_MODEL=gemini-2.5-flash
```

### agents/.env

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem

# AI API 키
AI_MODE=proxy                        # proxy (VectorEngine) or direct
AI_BASE_URL=https://api.vectorengine.ai/v1
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
VECTORENGINE_API_KEY=sk-...
FAL_KEY=...

# AI 모델
AI_TEXT_MODEL=gemini-2.5-flash
AI_IMAGE_ANALYSIS_MODEL=gemini-3.1-flash-lite-preview
AI_IMAGE_MODEL=gemini-3.1-flash-image-preview
AI_IMAGE_EDIT_MODEL=fal-ai/flux-2-pro/edit
AI_IMAGE_DETAIL_MODEL=fal-ai/flux-pro/kontext/max
AI_IMAGE_EDIT_SIZE_MODEL=gemini-3.1-flash-image-preview

# Langfuse (선택)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

## 테스트

```bash
npm exec --workspace=apps/server -- vitest run   # 백엔드
npm exec --workspace=apps/web -- vitest run      # 프론트엔드
npm run check:idor
npm run check:tenant-scope
```

## License

Private. AgentFoundry Labs.
