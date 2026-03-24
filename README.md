# KidItem

이커머스 셀러 관리 자동화 플랫폼. 소싱 → AI 가공 → 리스팅 → 운영까지의 전 과정을 자동화합니다.

## 무엇을 하는 시스템인가

중국(1688/알리바바)에서 상품을 소싱하여 쿠팡/네이버에 판매하는 셀러를 위한 운영 자동화 시스템입니다.

**소싱 파이프라인**: 1688 상품 수집 → AI로 한국어 콘텐츠 생성 → 상세페이지 제작 → 쿠팡 리스팅

**운영 자동화**: 주문 관리, 손익 분석, ABC 분류, 재고/발주, 광고 효율, 리뷰 관리, 썸네일 CTR 추적

**워크플로우 엔진**: 셀러 관리 특화 n8n. 데이터 수집 → 조건 판단 → AI 분석 → 액션 추천까지 자동화.

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | Next.js 14, Tailwind CSS, ReactFlow |
| 백엔드 API | NestJS 11, TypeScript |
| DB | PostgreSQL 17, Prisma v7 |
| AI Agent | Python 3.11+, asyncpg, OpenAI/Gemini |
| 워크플로우 AI | Gemini (structured output via responseSchema) |
| 인프라 | Docker Compose, Langfuse (관측) |

## 빠른 시작

### 요구사항

- Node.js 20+
- Docker & Docker Compose
- Python 3.11+ (에이전트 실행 시)

### 설치

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
npm install
```

### 환경 설정

```bash
cp apps/server/.env.example apps/server/.env
```

`apps/server/.env`에서 필요한 키 설정:
- `DATABASE_URL` — PostgreSQL 접속 (기본값 사용 가능)
- `GEMINI_API_KEY` — 워크플로우 AI 분석용
- `COUPANG_*` — 쿠팡 Wing API (선택)

### 실행

```bash
docker compose up -d          # PostgreSQL + NestJS + Langfuse
npm run db:push               # 스키마 적용
npm run db:seed               # 시드 데이터
npm run dev                   # Next.js (localhost:3000)
```

| 서비스 | URL |
|---|---|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:4000/api |
| Langfuse | http://localhost:3100 |

## 프로젝트 구조

```
kiditem/
├── apps/
│   ├── web/                 Next.js 프론트엔드
│   └── server/              NestJS 백엔드 API
├── agents/                  Python AI 에이전트
├── packages/templates/      상세페이지 React 템플릿
├── extensions/              Chrome 익스텐션 (1688 스크래퍼)
├── prisma/                  DB 스키마 (source of truth)
├── CLAUDE.md                AI 에이전트 협업 규칙
└── docker-compose.yml
```

## 아키텍처

```
[Next.js]  ← 사용자
    ↓ fetch
[NestJS API]  ← CRUD + 워크플로우 실행 + AI 분석
    ↓ Prisma              ↓ agent_tasks
[PostgreSQL]          [Python Agents]  ← AI 가공, 스크래핑
```

### 핵심 시스템

**워크플로우 엔진** — 셀러 운영 자동화를 위한 DAG 기반 실행 엔진.
- 30개 노드 타입 (DB 조회, 필터, 조건 분기, 알림, AI 분석 등)
- 실행 완료 후 Gemini AI가 결과를 분석하고 구체적 액션을 추천
- 액션 카탈로그에서 타입이 지정된 실행 가능한 액션 반환

**Object View** — 팔란티어 스타일 상품 상세 페이지.
- 상품별 메트릭 (판매가, 이익률, 재고, 광고비)
- 워크플로우 실행 → AI 분석 결과가 세션 카드로 표시
- 추천 액션 버튼 클릭으로 즉시 실행

**ActivityEvent** — 워크플로우 결과의 객체 단위 기록.
- 워크플로우 완료 시 자동 생성
- AI 분석 요약 + 추천 액션 포함
- 상품/회사 단위로 이력 조회

## 운영 기능 (11개)

| 기능 | 페이지 | 상태 |
|---|---|---|
| 상품 등록/관리 | `/products` | 시드 데이터 기반 |
| 상품별 손익표 | `/profit-loss` | 시드 데이터 기반 |
| ABC 상품 분류 | `/products` (필터) | 시드 데이터 기반 |
| 재고 관리 + 발주 | `/inventory` | 시드 데이터 기반 |
| 썸네일 관리 | `/thumbnails` | 시드 데이터 기반 |
| 광고 관리 | `/ads` | 시드 데이터 기반 |
| 핵심상품 관리 | `/core-products` | 시드 데이터 기반 |
| 순이익 3% 이하 정리 | `/cleanup` | 시드 데이터 기반 |
| 리뷰 관리 | `/reviews` | 시드 데이터 기반 |
| 리포트/엑셀 출력 | `/reports` | 엑셀 다운로드 동작 |
| 상품 상세 (Object View) | `/products/[id]` | 워크플로우 + AI 분석 동작 |

> Core Service (#1) 구현 시 시드 데이터 → 실제 계산 데이터로 전환.

## 개발 로드맵

- [#1 Core Service 레이어](https://github.com/AgentFoundry-Labs/kiditem/issues/1) — 손익 계산, ABC 분류, 재고 판단 등 비즈니스 로직
- [#2 워크플로우 정의](https://github.com/AgentFoundry-Labs/kiditem/issues/2) — 단일/전체 상품 워크플로우, 액션 표시 방식

## 팀 협업

AI 코딩 에이전트 (Claude Code, OpenCode) 기반 개발. 규칙은 `CLAUDE.md`에 정의.

- `main` 직접 push 금지. `feat/{issue번호}-{설명}` 브랜치 → PR → merge.
- 한 세션에서 한 도메인만 작업.
- `prisma/schema.prisma` 수정 후 `npm run db:push` 필수.
- 디렉토리별 `CLAUDE.md`에 해당 모듈의 규칙 정의.

## License

Private. AgentFoundry Labs.
