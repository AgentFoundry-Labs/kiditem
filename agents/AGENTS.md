# agents — Python Sourcing Agent Server

FastAPI HTTP 서버. 현재 Python 런타임은 sourcing/scraping 보조 작업만
소유한다. 이미지 편집(`image_edit`)은 NestJS AI 도메인의 Agent OS runtime
handler가 직접 실행한다.

## Run

```bash
cd agents
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # or: pip install -e .
uvicorn src.server:app --host 0.0.0.0 --port 8001 --reload
```

Env: `.env` (see `.env.example`)

## Architecture

```
NestJS caller → python_http adapter
  → POST http://localhost:8001/run { agent_type, input, run_id }
    → FastAPI server → Agent.execute(pool, input)
    → JSON response { output: {...} }
```

## Adding an Agent

1. Create `BaseAgent` subclass in `src/agents/{name}.py` (or `{name}/`)
2. Define `agent_type` class variable
3. Implement `async execute(pool, task_input) -> dict`
4. Register in `AGENTS` dict in `src/server.py`
5. DB/Agent OS 에서 호출 경로가 필요한 경우에만 `python_http` 런타임으로 등록

## DB Access

asyncpg raw SQL only (no ORM):

```python
row = await pool.fetchrow(
    "SELECT id, name FROM master_products WHERE id = $1 AND organization_id = $2",
    master_id,
    organization_id,
)
await pool.execute(
    "UPDATE master_products SET pipeline_step = $1 WHERE id = $2 AND organization_id = $3",
    "listed",
    master_id,
    organization_id,
)
```

Table/column names: snake_case (Prisma `@@map` mapped DB names).

## Rules

- No SQLAlchemy — asyncpg raw SQL only
- No direct imports between agents — communicate via DB state only
- No `app.` imports — all imports use `src.`
- Use Langfuse `@observe` for LLM/agent observability (SDK v4, `from langfuse import observe`)
