# agents — Python Sourcing Agent Server

`agents/` owns optional FastAPI Python workers/tools for sourcing helper work
such as matching, analysis, and ML-heavy pipelines. The default 1688 URL scrape
runtime is owned by the NestJS sourcing domain through TS Playwright. Image edit
(`image_edit`) is not owned here; it runs in the NestJS AI domain through Agent
OS runtime handlers. NestJS reaches optional Python helpers through the
`python_http` runtime and its bounded request/response contract.

## Agent Rules

- Create a `BaseAgent` subclass in `src/agents/{name}.py` or
  `src/agents/{name}/`.
- Define `agent_type`.
- Implement `async execute(pool, task_input) -> dict`.
- Register in the `AGENTS` dict in `src/server.py`.
- Register through the `python_http` runtime only when DB/Agent OS needs a
  Python execution path.

## DB Boundary

- Use asyncpg with bound raw SQL for Python-owned database access.
- Bind organization predicates in every organization-owned query.
- Table and column names use mapped snake_case DB names.
- Agents communicate through DB state or explicit runtime input/output, not
  direct imports between agents.

## Boundary Rules

- Import Python application modules through the `src.` package.
- Use Langfuse `@observe` for LLM/agent observability.
- Keep image edit and generated-media runtime handlers in the NestJS AI domain.

## Verification

For Python agent changes, run the narrow Python test suite and start the dev
server when runtime wiring changes:

```bash
cd agents && .venv/bin/python -m pytest
npm run dev:agents
```

DB query, agent registration, or runtime input/output changes need a focused
test for organization scope and response shape.
