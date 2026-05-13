"""
FastAPI server for Python sourcing agents.
Replaces runner.py DB polling with HTTP interface.
Called by NestJS python_http adapter.
"""
import asyncio
from typing import Optional, Dict, Any

import structlog
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from pydantic import BaseModel

from src.db import get_pool, close_pool
from src.agents.sourcing import SourcingAgent

logger = structlog.get_logger()


class RunRequest(BaseModel):
    agent_type: str
    input: Optional[Dict[str, Any]] = None


AGENTS = {
    "sourcing": SourcingAgent(),
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    logger.info("server_started", agents=list(AGENTS.keys()))
    yield
    await close_pool()
    logger.info("server_stopped")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health():
    return {"ok": True, "agents": list(AGENTS.keys())}


@app.post("/run")
async def run(body: RunRequest):
    agent_type = body.agent_type
    if agent_type not in AGENTS:
        raise HTTPException(400, f"Unknown agent_type: {agent_type}")

    agent = AGENTS[agent_type]
    task_input = body.input or {}

    pool = await get_pool()

    try:
        result = await asyncio.wait_for(
            agent.execute(pool, task_input),
            timeout=agent.timeout_seconds,
        )
        return {"output": result}
    except asyncio.TimeoutError:
        raise HTTPException(504, f"Agent {agent_type} timed out after {agent.timeout_seconds}s")
    except Exception as e:
        logger.error("agent_error", agent_type=agent_type, error=str(e))
        raise HTTPException(500, "Agent execution failed")
