# KidItem

이커머스 셀러 관리 자동화 플랫폼. 중국(1688) 소싱 → AI 콘텐츠 생성 → 쿠팡/네이버 리스팅 → 운영 자동화.

## 셋업

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
npm install
cp apps/server/.env.example apps/server/.env   # GEMINI_API_KEY 등 설정
docker compose up -d                           # PostgreSQL + NestJS + Langfuse
npm run db:push                                # 스키마 적용
npm run db:seed                                # 시드 데이터
npm run dev                                    # Next.js (localhost:3000)
```

NestJS 코드 변경 시: `docker compose up -d --build server`

Python 에이전트: `cd agents && .venv/bin/python -m src.runner`

## 포트

| 서비스 | URL |
|---|---|
| Next.js | http://localhost:3000 |
| NestJS API | http://localhost:4000/api |
| PostgreSQL | localhost:5433 |
| Langfuse | http://localhost:3100 |

## 구조

```
apps/web/            — Next.js 14 프론트엔드
apps/server/         — NestJS 11 백엔드 API
agents/              — Python 3.11+ AI 에이전트
packages/templates/  — 상세페이지 React 템플릿
extensions/          — Chrome 익스텐션 (1688 스크래퍼)
prisma/              — DB 스키마 (source of truth)
```

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | Next.js 14, Tailwind CSS, ReactFlow |
| 백엔드 | NestJS 11, TypeScript |
| DB | PostgreSQL 17, Prisma v7 |
| AI | Python (OpenAI/Gemini), Gemini structured output |
| 인프라 | Docker Compose, Langfuse |

## 환경 변수

`apps/server/.env`:

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem
GEMINI_API_KEY=          # 워크플로우 AI 분석
AI_TEXT_MODEL=gemini-2.5-flash
COUPANG_ACCESS_KEY=      # 선택
COUPANG_SECRET_KEY=      # 선택
COUPANG_VENDOR_ID=       # 선택
```

`agents/.env`:

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem
OPENAI_API_KEY=          # AI 콘텐츠 생성
GEMINI_API_KEY=          # AI 분석
AI_TEXT_MODEL=gemini-2.5-flash
```

## License

Private. AgentFoundry Labs.
