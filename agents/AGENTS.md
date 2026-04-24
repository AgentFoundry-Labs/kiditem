# agents — Python Agent Server

FastAPI HTTP 서버. NestJS python_http adapter가 호출. content, image_edit 에이전트 실행.

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
NestJS HeartbeatService → python_http adapter
  → POST http://localhost:8001/run { agent_type, input, run_id }
    → FastAPI server → Agent.execute(pool, input)
    → JSON response { output: {...} }
  → HeartbeatRun 기록 (Safety Pipeline 적용)
```

## Adding an Agent

1. Create `BaseAgent` subclass in `src/agents/{name}.py` (or `{name}/`)
2. Define `agent_type` class variable
3. Implement `async execute(pool, task_input) -> dict`
4. Register in `AGENTS` dict in `src/server.py`
5. DB에 AgentDefinition 등록 (`adapterType: 'python_http'`)

## DB Access

asyncpg raw SQL only (no ORM):

```python
row = await pool.fetchrow("SELECT * FROM products WHERE id = $1", product_id)
await pool.execute("UPDATE products SET status = $1 WHERE id = $2", 'listed', product_id)
```

Table/column names: snake_case (Prisma `@@map` mapped DB names).

## Rules

- No SQLAlchemy — asyncpg raw SQL only
- No direct imports between agents — communicate via DB state only
- No `app.` imports — all imports use `src.`
- Use Langfuse `@observe` — integrated with content pipeline (SDK v4, `from langfuse import observe`)
