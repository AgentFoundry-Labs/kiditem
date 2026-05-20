# agents — Python Sourcing Agent Server

`agents/` owns optional FastAPI Python workers/tools for sourcing helper work
such as matching, analysis, and ML-heavy pipelines. The default 1688 URL scrape
runtime is owned by the NestJS sourcing domain through TS Playwright. Image edit
(`image_edit`) is not owned here; it runs in the NestJS AI domain through Agent
OS runtime handlers.

## Folder Map

```text
agents/
├── src/
│   ├── server.py          # FastAPI server and AGENTS registry
│   └── agents/            # BaseAgent subclasses
├── requirements.txt
└── .env.example
```

## Owned Surfaces

- FastAPI server on port 8001
- `POST /run` with `{ agent_type, input, run_id }`
- Python sourcing helper agents for optional worker/tool paths

## Runtime Flow

```text
NestJS python_http runtime adapter
  -> POST http://localhost:8001/run
  -> FastAPI server
  -> Agent.execute(pool, input)
  -> JSON response { output: {...} }
```

## Agent Rules

- Create a `BaseAgent` subclass in `src/agents/{name}.py` or
  `src/agents/{name}/`.
- Define `agent_type`.
- Implement `async execute(pool, task_input) -> dict`.
- Register in the `AGENTS` dict in `src/server.py`.
- Register through the `python_http` runtime only when DB/Agent OS needs a
  Python execution path.

## DB Boundary

- Use asyncpg raw SQL only; no SQLAlchemy.
- Bind organization predicates in every organization-owned query.
- Table and column names use mapped snake_case DB names.
- Agents communicate through DB state or explicit runtime input/output, not
  direct imports between agents.

## Boundary Rules

- No `app.` imports; use `src.` imports.
- Use Langfuse `@observe` for LLM/agent observability.
- Do not add image edit or generated media ownership here; Nest AI owns those
  runtime handlers.
