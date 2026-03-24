# agents — Python Background Workers

백그라운드 에이전트. HTTP 서버 없음. DB 폴링으로 작업 감지.

## 실행

```bash
cd agents
python -m venv .venv && source .venv/bin/activate
pip install asyncpg python-dotenv httpx openai pydantic websockets structlog
DATABASE_URL="..." python -m src.runner
```

환경변수: `.env` (`.env.example` 참조)

## 아키텍처

```
NestJS POST /api/agent-tasks → agent_tasks 테이블 INSERT
                                     ↓
Python runner (폴링) → claim task (FOR UPDATE SKIP LOCKED)
                                     ↓
Agent.execute() → DB 읽기/쓰기 → 결과 기록
                                     ↓
agent_tasks.status = completed/failed
```

## 디렉토리

```
src/
├── runner.py              # 메인 루프 — 폴링 + 태스크 분배
├── db.py                  # asyncpg 커넥션 풀
├── config.py              # 환경변수 로드
├── core/
│   ├── ai_client.py       # AIClient (OpenAI/Gemini 통합)
│   ├── ai_cost.py         # 비용 추적
│   └── providers.py       # AI 프로바이더 설정
└── agents/
    ├── base.py            # BaseAgent ABC (execute + log)
    ├── inventory.py       # 재고 부족 감지 → alerts 생성
    ├── sourcing/          # 1688 스크래핑, Douyin, 매칭
    └── content/           # AI 상세페이지 생성 (oneshot + template)
```

## Agent 추가 방법

1. `src/agents/{name}.py`에 `BaseAgent` 상속 클래스 생성
2. `agent_type` 클래스 변수 정의
3. `async execute(pool, task_input) -> dict` 구현
4. `src/runner.py`의 `AGENTS` 딕셔너리에 등록

## DB 접근

asyncpg raw SQL만 사용 (ORM 없음):

```python
row = await pool.fetchrow("SELECT * FROM products WHERE id = $1", product_id)
await pool.execute("UPDATE products SET status = $1 WHERE id = $2", 'listed', product_id)
```

테이블명/컬럼명: snake_case (Prisma `@@map` 매핑된 DB 이름 사용).

## 규칙

- SQLAlchemy 금지 — asyncpg raw SQL만
- HTTP 서버 금지 — 순수 백그라운드 워커
- Agent 간 직접 import 금지 — DB 상태 관찰로만 소통
- `app.` import 금지 — 모든 import는 `src.`
- Langfuse `@observe` 금지 — 제거됨
