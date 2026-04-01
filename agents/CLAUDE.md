# agents — Python Background Workers

Background agents. No HTTP server. Task detection via DB polling.
For generation/processing tasks only (images, content, sourcing). Judgment/analysis runs on Claude CLI → `apps/server/src/agent-registry/`.

## Run

```bash
cd agents
python -m venv .venv && source .venv/bin/activate
pip install asyncpg python-dotenv httpx openai pydantic websockets structlog
DATABASE_URL="..." python -m src.runner
```

Env: `.env` (see `.env.example`)

## Architecture

```
NestJS POST /api/agent-tasks → agent_tasks table INSERT
                                     ↓
Python runner (polling) → claim task (FOR UPDATE SKIP LOCKED)
                                     ↓
Agent.execute() → DB read/write → record result
                                     ↓
agent_tasks.status = completed/failed
```

## Adding an Agent

1. Create `BaseAgent` subclass in `src/agents/{name}.py` (or `{name}/`)
2. Define `agent_type` class variable
3. Implement `async execute(pool, task_input) -> dict`
4. Register in `AGENTS` dict in `src/runner.py`

## DB Access

asyncpg raw SQL only (no ORM):

```python
row = await pool.fetchrow("SELECT * FROM products WHERE id = $1", product_id)
await pool.execute("UPDATE products SET status = $1 WHERE id = $2", 'listed', product_id)
```

Table/column names: snake_case (Prisma `@@map` mapped DB names).

## Rules

- No SQLAlchemy — asyncpg raw SQL only
- No HTTP server — pure background worker
- No direct imports between agents — communicate via DB state only
- No `app.` imports — all imports use `src.`
- Use Langfuse `@observe` — integrated with content pipeline (SDK v4, `from langfuse import observe`)
